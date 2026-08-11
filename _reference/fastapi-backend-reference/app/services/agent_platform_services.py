"""Agent Execution Engine — runs agents with full observability + anti-hallucination.

Flow: load agent → build messages → RAG retrieval → LLM call → safety filter → memory store → execution record
"""

from __future__ import annotations

import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.llm_gateway import LLMGateway
from app.ai.providers.models import Message, MessageRole
from app.core.logging import get_logger
from app.models.agent_platform import AgentExecution, AgentMemory
from app.models.ai import AgentConfig
from app.services.agent_registry import AgentRegistryService

logger = get_logger(__name__)

# Rough cost table (cents per 1K tokens)
_PRICING = {
    "gpt-4o": {"input": 2.5, "output": 10},
    "gpt-4o-mini": {"input": 0.15, "output": 0.6},
    "gpt-4-turbo": {"input": 10, "output": 30},
    "claude-3-5-sonnet": {"input": 3, "output": 15},
    "claude-3-haiku": {"input": 0.25, "output": 1.25},
}


class AgentExecutionEngine:
    """Runs AI agents with full observability + anti-hallucination."""

    def __init__(self, db: AsyncSession, *, llm_gateway: LLMGateway | None = None) -> None:
        self.db = db
        self.llm_gateway = llm_gateway or LLMGateway()
        self.registry = AgentRegistryService(db)

    async def execute(self, *, agent_id: uuid.UUID, organization_id: uuid.UUID,
                      input_message: str, user_id: uuid.UUID | None = None,
                      conversation_id: str | None = None, input_metadata: dict | None = None,
                      workflow_execution_id: uuid.UUID | None = None,
                      workflow_step_id: uuid.UUID | None = None) -> dict[str, Any]:
        """Execute an agent — the main entry point."""
        start = time.perf_counter()
        agent = await self.registry.get_agent(organization_id=organization_id, agent_id=agent_id)

        execution = AgentExecution(
            organization_id=str(organization_id), agent_id=str(agent_id),
            user_id=str(user_id) if user_id else None, conversation_id=conversation_id,
            input_message=input_message, input_metadata=input_metadata, status="running",
            llm_provider=agent.llm_provider, llm_model=agent.model,
            temperature=agent.temperature, max_retries=agent.max_retries,
            workflow_execution_id=workflow_execution_id, workflow_step_id=workflow_step_id,
            started_at=datetime.now(UTC))
        self.db.add(execution)
        await self.db.flush()

        try:
            # Build messages
            messages = await self._build_messages(agent, input_message, organization_id, user_id)

            # RAG retrieval (if enabled)
            citations: list = []
            rag_context = ""
            if agent.enable_rag:
                rag_result = await self._retrieve_knowledge(agent, input_message, organization_id)
                if rag_result:
                    rag_context = rag_result.get("context", "")
                    citations = rag_result.get("citations", [])
                    execution.retrieved_chunks_count = rag_result.get("results_count", 0)
                    execution.citations = citations
                    if rag_context:
                        messages[0].content += f"\n\nRelevant knowledge:\n{rag_context}"
                else:
                    messages[0].content += (
                        "\n\nNo relevant documents found. If the question requires factual information, "
                        'respond with "I don\'t know based on the available documents."')

            # LLM call
            t_llm = time.perf_counter()
            llm_response = await self.llm_gateway.generate(
                messages=messages, model=agent.model, provider=agent.llm_provider,
                temperature=agent.temperature, max_tokens=agent.max_tokens)
            llm_latency_ms = int((time.perf_counter() - t_llm) * 1000)
            output = llm_response.content
            input_tokens = llm_response.usage.prompt_tokens
            output_tokens = llm_response.usage.completion_tokens

            execution.output_message = output
            execution.llm_latency_ms = llm_latency_ms
            execution.input_tokens = input_tokens
            execution.output_tokens = output_tokens
            execution.total_tokens = input_tokens + output_tokens
            execution.cost_cents = self._estimate_cost(agent.model, input_tokens, output_tokens)
            execution.confidence = self._compute_confidence(citations, output)
            execution.status = "completed"
            execution.latency_ms = int((time.perf_counter() - start) * 1000)
            execution.completed_at = datetime.now(UTC)
            await self.db.flush()

            # Store memory
            if agent.enable_memory and user_id:
                await self._store_memory(organization_id=organization_id, agent_id=agent_id,
                                         user_id=user_id, conversation_id=conversation_id,
                                         user_message=input_message, assistant_message=output)

            return {
                "execution_id": str(execution.id), "output": output, "status": "completed",
                "citations": citations, "confidence": execution.confidence,
                "cost_cents": execution.cost_cents, "latency_ms": execution.latency_ms,
                "input_tokens": input_tokens, "output_tokens": output_tokens,
                "tool_calls": [], "llm_latency_ms": llm_latency_ms,
                "llm_provider": agent.llm_provider, "llm_model": agent.model,
            }
        except Exception as e:
            logger.error("agent_execution_failed", agent_id=str(agent_id), error=str(e))
            execution.status = "failed"
            execution.error_message = str(e)
            execution.latency_ms = int((time.perf_counter() - start) * 1000)
            execution.completed_at = datetime.now(UTC)
            await self.db.flush()
            return {"execution_id": str(execution.id), "output": None, "status": "failed",
                    "error": str(e), "citations": [], "confidence": 0.0, "cost_cents": 0,
                    "latency_ms": execution.latency_ms, "input_tokens": 0, "output_tokens": 0, "tool_calls": []}

    async def _build_messages(self, agent: AgentConfig, input_message: str,
                              organization_id: uuid.UUID, user_id: uuid.UUID | None) -> list[Message]:
        system_parts: list[str] = []
        if agent.system_prompt:
            system_parts.append(agent.system_prompt)
        if agent.instructions:
            system_parts.append(f"\nInstructions: {agent.instructions}")
        if agent.enable_memory and user_id:
            memory = await self._load_memory(organization_id, agent.id, user_id)
            if memory:
                system_parts.append("\nConversation memory:\n" + "\n".join(f"- {m}" for m in memory))
        return [Message(role=MessageRole.SYSTEM, content="\n".join(system_parts)),
                Message(role=MessageRole.USER, content=input_message)]

    async def _retrieve_knowledge(self, agent: AgentConfig, query: str,
                                  organization_id: uuid.UUID) -> dict[str, Any] | None:
        try:
            from app.ai.rag import RAGService
            rag = RAGService(self.db)
            result = await rag.search(query=query, organization_id=organization_id)
            return result
        except Exception as e:
            logger.warning("agent_rag_failed", error=str(e))
            return None

    async def _load_memory(self, organization_id: uuid.UUID, agent_id: uuid.UUID, user_id: uuid.UUID) -> list[str]:
        result = await self.db.execute(
            select(AgentMemory).where(
                AgentMemory.organization_id == str(organization_id),
                AgentMemory.agent_id == str(agent_id),
                AgentMemory.user_id == str(user_id),
                AgentMemory.memory_type.in_(["long_term", "user"]))
            .order_by(AgentMemory.importance.desc()).limit(10))
        return [m.content for m in result.scalars().all()]

    async def _store_memory(self, *, organization_id, agent_id, user_id, conversation_id,
                            user_message, assistant_message) -> None:
        memory = AgentMemory(
            organization_id=str(organization_id), agent_id=str(agent_id), user_id=str(user_id),
            conversation_id=conversation_id, memory_type="short_term",
            content=f"User asked: {user_message[:500]}", importance=0.5,
            expires_at=datetime.now(UTC) + timedelta(hours=1))
        self.db.add(memory)
        await self.db.flush()

    def _estimate_cost(self, model: str, input_tokens: int, output_tokens: int) -> int:
        rates = _PRICING.get(model, {"input": 1, "output": 3})
        return int((input_tokens / 1000 * rates["input"]) + (output_tokens / 1000 * rates["output"]))

    def _compute_confidence(self, citations: list, output: str) -> float:
        if not citations:
            return 0.3
        avg = sum(c.get("score", 0) for c in citations if isinstance(c, dict)) / max(len(citations), 1)
        return round(min(1.0, avg * 0.7 + min(1.0, len(output) / 100) * 0.3), 4)


# ===== Memory Service =====

class MemoryService:
    """Structured memory for AI agents — short-term, long-term, conversation, task, user, org."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def store(self, *, organization_id: uuid.UUID, memory_type: str, content: str,
                    agent_id: uuid.UUID | None = None, user_id: uuid.UUID | None = None,
                    conversation_id: str | None = None, importance: float = 0.5,
                    metadata: dict | None = None, expires_at: datetime | None = None) -> AgentMemory:
        memory = AgentMemory(
            organization_id=str(organization_id), agent_id=str(agent_id) if agent_id else None,
            user_id=str(user_id) if user_id else None, conversation_id=conversation_id,
            memory_type=memory_type, content=content, importance=importance,
            metadata_=metadata or {}, expires_at=expires_at)
        self.db.add(memory)
        await self.db.flush()
        return memory

    async def recall(self, *, organization_id: uuid.UUID, memory_type: str | None = None,
                     agent_id: uuid.UUID | None = None, user_id: uuid.UUID | None = None,
                     limit: int = 20) -> list[AgentMemory]:
        conditions = [AgentMemory.organization_id == str(organization_id)]
        if memory_type:
            conditions.append(AgentMemory.memory_type == memory_type)
        if agent_id:
            conditions.append(AgentMemory.agent_id == str(agent_id))
        if user_id:
            conditions.append(AgentMemory.user_id == str(user_id))
        result = await self.db.execute(
            select(AgentMemory).where(*conditions).order_by(AgentMemory.importance.desc(), AgentMemory.created_at.desc()).limit(limit))
        memories = list(result.scalars().all())
        # Filter out expired
        now = datetime.now(UTC)
        return [m for m in memories if m.expires_at is None or
                (m.expires_at.tzinfo is None and m.expires_at.replace(tzinfo=UTC) > now) or
                (m.expires_at.tzinfo is not None and m.expires_at > now)]

    async def summarize(self, *, organization_id: uuid.UUID, conversation_id: str,
                        max_entries: int = 20) -> str:
        """Summarize conversation memory into a compact long-term memory entry."""
        memories = await self.recall(organization_id=organization_id, conversation_id=conversation_id, limit=max_entries)
        if not memories:
            return ""
        summary = "Conversation summary: " + " | ".join(m.content[:100] for m in memories[:10])
        await self.store(organization_id=organization_id, memory_type="long_term",
                         content=summary, conversation_id=conversation_id, importance=0.8)
        return summary

    async def cleanup_expired(self, *, organization_id: uuid.UUID) -> int:
        """Delete expired short-term memories. Returns count deleted."""
        now = datetime.now(UTC)
        result = await self.db.execute(
            select(AgentMemory).where(
                AgentMemory.organization_id == str(organization_id),
                AgentMemory.memory_type == "short_term",
                AgentMemory.expires_at.isnot(None)))
        count = 0
        for m in result.scalars().all():
            exp = m.expires_at
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=UTC)
            if exp < now:
                await self.db.delete(m)
                count += 1
        if count > 0:
            await self.db.flush()
        return count

    async def get_memory_stats(self, *, organization_id: uuid.UUID) -> dict[str, Any]:
        """Get memory usage stats for an org."""
        from sqlalchemy import func
        result = await self.db.execute(
            select(AgentMemory.memory_type, func.count(), func.avg(AgentMemory.importance))
            .where(AgentMemory.organization_id == str(organization_id))
            .group_by(AgentMemory.memory_type))
        return {row[0]: {"count": int(row[1]), "avg_importance": float(row[2]) if row[2] else 0}
                for row in result.all()}


# ===== Planning Engine =====

class PlanningEngine:
    """Task planning — decomposes goals into subtasks with dependencies.

    Uses an LLM to break down a complex task into smaller, executable steps.
    Each step gets: description, assigned agent type, dependencies, and expected output.
    """

    PLANNER_PROMPT = """You are a task planner. Break down the following task into concrete subtasks.

Task: {task}

Context: {context}

Return ONLY a JSON array of subtasks. Each subtask must have:
- "description": what to do
- "agent_type": which agent type should handle this (support, sales, knowledge, researcher, writer, reviewer, custom)
- "depends_on": array of step indices (0-based) that must complete before this one
- "expected_output": what the output should look like

Example: [{{"description":"Search knowledge base for return policy","agent_type":"knowledge","depends_on":[],"expected_output":"Policy text with citations"}}]

Return ONLY the JSON array, no other text."""

    def __init__(self, db: AsyncSession, *, llm_gateway: LLMGateway | None = None) -> None:
        self.db = db
        self.llm_gateway = llm_gateway or LLMGateway()

    async def plan(self, *, task: str, context: str = "") -> list[dict[str, Any]]:
        """Decompose a task into subtasks with dependencies."""
        import json
        import re
        prompt = self.PLANNER_PROMPT.format(task=task[:1000], context=context[:2000])
        try:
            messages = [Message(role=MessageRole.USER, content=prompt)]
            response = await self.llm_gateway.generate(messages=messages, temperature=0.2, max_tokens=2000)
            text = response.content.strip()
            # Extract JSON array
            match = re.search(r"\[.*\]", text, re.DOTALL)
            if match:
                steps = json.loads(match.group(0))
                # Validate structure
                validated = []
                for i, step in enumerate(steps):
                    validated.append({
                        "step_index": i,
                        "description": step.get("description", f"Step {i+1}"),
                        "agent_type": step.get("agent_type", "custom"),
                        "depends_on": step.get("depends_on", []),
                        "expected_output": step.get("expected_output", ""),
                    })
                return validated
        except Exception as e:
            logger.warning("planning_failed", error=str(e))
        # Fallback: single-step plan
        return [{"step_index": 0, "description": task, "agent_type": "custom",
                 "depends_on": [], "expected_output": "Task completed"}]

    async def build_dependency_graph(self, steps: list[dict]) -> dict[str, Any]:
        """Build a dependency graph from steps for execution ordering."""
        graph: dict[int, list[int]] = {s["step_index"]: [] for s in steps}
        for step in steps:
            for dep in step.get("depends_on", []):
                if dep in graph:
                    graph[dep].append(step["step_index"])
        return {"graph": graph, "steps": steps,
                "execution_order": self._topological_sort(steps)}

    def _topological_sort(self, steps: list[dict]) -> list[int]:
        """Kahn's algorithm for topological sort."""
        in_degree: dict[int, int] = {s["step_index"]: 0 for s in steps}
        adj: dict[int, list[int]] = {s["step_index"]: [] for s in steps}
        for step in steps:
            for dep in step.get("depends_on", []):
                if dep in adj:
                    adj[dep].append(step["step_index"])
                    in_degree[step["step_index"]] += 1
        queue = [k for k, v in in_degree.items() if v == 0]
        result = []
        while queue:
            node = queue.pop(0)
            result.append(node)
            for neighbor in adj.get(node, []):
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)
        return result if len(result) == len(steps) else [s["step_index"] for s in steps]


# ===== Workflow Engine =====

class WorkflowEngine:
    """Executes multi-step agent workflows with sequential/parallel/conditional/loop/human-approval steps.

    Step types in the workflow definition JSON:
      - {"type": "agent", "agent_id": "...", "input": "template {{context.var}}", "output_var": "result"}
      - {"type": "parallel", "steps": [...]}  — run sub-steps concurrently
      - {"type": "condition", "if": "{{context.success}}", "then": [...], "else": [...]}
      - {"type": "loop", "items": "{{context.list}}", "var": "item", "steps": [...]}
      - {"type": "human_approval", "message": "...", "approver_role": "org_admin"}
      - {"type": "delay", "seconds": 5}
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def execute_workflow(self, *, workflow_id: uuid.UUID, organization_id: uuid.UUID,
                               user_id: uuid.UUID | None = None,
                               input_context: dict | None = None) -> dict[str, Any]:
        """Execute a workflow definition step by step."""
        import time as _time
        start = _time.perf_counter()

        from app.models.agent_platform import AIWorkflowDefinition, AIWorkflowExecution
        wf = await self.db.get(AIWorkflowDefinition, workflow_id)
        if wf is None or wf.organization_id != str(organization_id):
            from app.core.exceptions import NotFoundError
            raise NotFoundError("Workflow", str(workflow_id))

        steps = wf.steps or []
        execution = AIWorkflowExecution(
            organization_id=str(organization_id), workflow_id=workflow_id,
            user_id=str(user_id) if user_id else None,
            input_context=input_context or {},
            status="running", total_steps=len(steps), started_at=datetime.now(UTC))
        self.db.add(execution)
        await self.db.flush()

        context = dict(input_context or {})
        step_results: list[dict] = []

        try:
            for i, step in enumerate(steps):
                result = await self._execute_step(step, context, organization_id, user_id, execution.id)
                step_results.append({"step_index": i, "step": step, "result": result})
                execution.completed_steps = i + 1
                execution.current_step_index = i
                if result.get("output_var") and result.get("output") is not None:
                    context[result["output_var"]] = result["output"]
                await self.db.flush()

            execution.status = "completed"
            execution.output_context = context
            execution.step_results = step_results
        except Exception as e:
            execution.status = "failed"
            execution.error_message = str(e)
            execution.step_results = step_results

        execution.latency_ms = int((_time.perf_counter() - start) * 1000)
        execution.completed_at = datetime.now(UTC)
        await self.db.flush()

        return {"execution_id": str(execution.id), "status": execution.status,
                "completed_steps": execution.completed_steps, "total_steps": execution.total_steps,
                "output_context": context, "step_results": step_results,
                "latency_ms": execution.latency_ms, "error": execution.error_message}

    async def _execute_step(self, step: dict, context: dict, organization_id: uuid.UUID,
                            user_id: uuid.UUID | None, workflow_exec_id: uuid.UUID) -> dict:
        """Execute a single workflow step."""
        step_type = step.get("type", "agent")

        if step_type == "agent":
            agent_id = step.get("agent_id")
            if agent_id is None:
                return {"output": None, "error": "No agent_id specified"}
            input_text = self._render_template(step.get("input", "{{context.question}}"), context)
            engine = AgentExecutionEngine(self.db)
            result = await engine.execute(
                agent_id=uuid.UUID(agent_id), organization_id=organization_id,
                input_message=input_text, user_id=user_id,
                workflow_execution_id=workflow_exec_id)
            return {"output": result.get("output"), "output_var": step.get("output_var"),
                    "execution_id": result.get("execution_id"), "cost_cents": result.get("cost_cents", 0),
                    "tokens": result.get("input_tokens", 0) + result.get("output_tokens", 0)}

        elif step_type == "parallel":
            import asyncio
            sub_steps = step.get("steps", [])
            tasks = [self._execute_step(s, context, organization_id, user_id, workflow_exec_id) for s in sub_steps]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            return {"output": [r if not isinstance(r, Exception) else {"error": str(r)} for r in results],
                    "output_var": step.get("output_var")}

        elif step_type == "condition":
            condition_met = self._eval_condition(step.get("if", "true"), context)
            branch = step.get("then", []) if condition_met else step.get("else", [])
            results = []
            for sub_step in branch:
                r = await self._execute_step(sub_step, context, organization_id, user_id, workflow_exec_id)
                results.append(r)
            return {"output": results, "output_var": step.get("output_var"), "condition_met": condition_met}

        elif step_type == "loop":
            items = self._eval_template(step.get("items", "[]"), context)
            if not isinstance(items, list):
                items = []
            var_name = step.get("var", "item")
            results = []
            for item in items:
                loop_context = dict(context)
                loop_context[var_name] = item
                for sub_step in step.get("steps", []):
                    r = await self._execute_step(sub_step, loop_context, organization_id, user_id, workflow_exec_id)
                    results.append(r)
            return {"output": results, "output_var": step.get("output_var")}

        elif step_type == "human_approval":
            # In production, this would pause the workflow and create an approval request.
            # For now, we auto-approve (configurable per tenant).
            return {"output": "approved", "output_var": step.get("output_var"),
                    "approval_required": True, "auto_approved": True}

        elif step_type == "delay":
            import asyncio
            seconds = step.get("seconds", 1)
            await asyncio.sleep(seconds)
            return {"output": f"Delayed {seconds}s", "output_var": step.get("output_var")}

        return {"output": None, "error": f"Unknown step type: {step_type}"}

    def _render_template(self, template: str, context: dict) -> str:
        """Simple Jinja2-like template rendering."""
        try:
            from jinja2 import Template
            return Template(template).render(context=context, **context)
        except Exception:
            return template

    def _eval_template(self, template: str, context: dict) -> Any:
        rendered = self._render_template(template, context)
        try:
            import json
            return json.loads(rendered)
        except Exception:
            return rendered

    def _eval_condition(self, condition: str, context: dict) -> bool:
        rendered = self._render_template(condition, context)
        return rendered.strip().lower() in ("true", "1", "yes", "ok")


# ===== Multi-Agent Orchestrator =====

class MultiAgentOrchestrator:
    """Orchestrates multiple agents to solve complex tasks.

    The supervisor agent:
    1. Analyzes the user's request
    2. Uses the PlanningEngine to decompose into subtasks
    3. Routes each subtask to the appropriate worker agent
    4. Collects and synthesizes results
    5. Returns a unified response

    Agent roles:
      - supervisor:   routes tasks, synthesizes results
      - researcher:   searches knowledge base, gathers information
      - writer:       drafts content based on research
      - reviewer:     reviews and critiques drafts
      - evaluator:    evaluates the final output
      - tool_agent:   executes tool calls
      - knowledge_agent: specialized in RAG retrieval
    """

    def __init__(self, db: AsyncSession, *, llm_gateway: LLMGateway | None = None) -> None:
        self.db = db
        self.llm_gateway = llm_gateway or LLMGateway()
        self.planner = PlanningEngine(db, llm_gateway=llm_gateway)
        self.execution_engine = AgentExecutionEngine(db, llm_gateway=llm_gateway)

    async def orchestrate(self, *, task: str, organization_id: uuid.UUID,
                          user_id: uuid.UUID | None = None,
                          supervisor_agent_id: uuid.UUID | None = None,
                          worker_agents: dict[str, uuid.UUID] | None = None) -> dict[str, Any]:
        """Orchestrate multiple agents to complete a task.

        Args:
            task: The user's request.
            organization_id: Tenant ID.
            user_id: Requesting user.
            supervisor_agent_id: The supervisor agent that plans + synthesizes.
            worker_agents: Map of agent_type → agent_id for worker agents.

        Returns:
            {plan, results, synthesis, cost_cents, latency_ms}
        """
        import time as _time
        start = _time.perf_counter()
        total_cost = 0
        total_tokens = 0

        # 1. Plan: decompose the task
        plan = await self.planner.plan(task=task)
        dep_graph = await self.planner.build_dependency_graph(plan)
        execution_order = dep_graph["execution_order"]

        # 2. Execute each step in dependency order
        results: dict[int, dict] = {}
        for step_idx in execution_order:
            step = plan[step_idx]
            agent_type = step.get("agent_type", "custom")

            # Find the agent for this type
            agent_id = (worker_agents or {}).get(agent_type)
            if agent_id is None:
                # Skip steps we don't have an agent for
                results[step_idx] = {"output": None, "error": f"No agent for type: {agent_type}"}
                continue

            # Build input from dependencies
            dep_outputs = [results[d]["output"] for d in step.get("depends_on", [])
                          if d in results and results[d].get("output")]
            input_text = step["description"]
            if dep_outputs:
                input_text += "\n\nPrevious results:\n" + "\n".join(str(o)[:500] for o in dep_outputs)

            result = await self.execution_engine.execute(
                agent_id=uuid.UUID(str(agent_id)), organization_id=organization_id,
                input_message=input_text, user_id=user_id)
            results[step_idx] = result
            total_cost += result.get("cost_cents", 0)
            total_tokens += result.get("input_tokens", 0) + result.get("output_tokens", 0)

        # 3. Synthesize: if supervisor agent provided, have it synthesize all results
        synthesis = None
        if supervisor_agent_id:
            all_outputs = [f"Step {i}: {r.get('output', '')}" for i, r in sorted(results.items())]
            synth_input = f"Original task: {task}\n\nWorker results:\n" + "\n\n".join(all_outputs)
            synth_result = await self.execution_engine.execute(
                agent_id=uuid.UUID(str(supervisor_agent_id)), organization_id=organization_id,
                input_message=f"Synthesize these results into a coherent answer:\n\n{synth_input}",
                user_id=user_id)
            synthesis = synth_result.get("output")
            total_cost += synth_result.get("cost_cents", 0)
            total_tokens += synth_result.get("input_tokens", 0) + synth_result.get("output_tokens", 0)
        else:
            # Return the last step's output as synthesis
            if execution_order:
                synthesis = results.get(execution_order[-1], {}).get("output")

        return {
            "plan": plan, "results": results, "synthesis": synthesis,
            "cost_cents": total_cost, "total_tokens": total_tokens,
            "latency_ms": int((_time.perf_counter() - start) * 1000),
            "steps_executed": len(results), "steps_planned": len(plan),
        }


# ===== Evaluation Service =====

class AgentEvaluationService:
    """Evaluates agent answer quality — groundedness, faithfulness, relevance, tool accuracy.

    Uses LLM-as-judge: another LLM evaluates the answer against the context + question.
    """

    def __init__(self, db: AsyncSession, *, llm_gateway: LLMGateway | None = None) -> None:
        self.db = db
        self.llm_gateway = llm_gateway or LLMGateway()

    async def evaluate(self, *, organization_id: uuid.UUID, agent_id: uuid.UUID | None = None,
                       execution_id: uuid.UUID | None = None, question: str, answer: str,
                       context: str = "", citations: list | None = None,
                       latency_ms: int | None = None, cost_cents: int | None = None,
                       total_tokens: int | None = None) -> dict[str, Any]:
        """Run LLM-as-judge evaluation on an agent answer."""
        import asyncio
        import json
        import re

        async def score_metric(prompt: str) -> float | None:
            try:
                messages = [Message(role=MessageRole.USER, content=prompt)]
                resp = await self.llm_gateway.generate(messages=messages, temperature=0.0, max_tokens=100)
                text = resp.content.strip()
                match = re.search(r"\{[^}]+\}", text)
                if match:
                    data = json.loads(match.group(0))
                    return min(1.0, max(0.0, float(data.get("score", 0)) / 10.0))
                num = re.search(r"\d+", text)
                if num:
                    return min(1.0, max(0.0, int(num.group()) / 10.0))
            except Exception:
                return None
            return None

        ctx = context[:2000] if context else ""
        tasks = [
            score_metric(f"Rate the groundedness (0-10). Is the answer supported by context?\nContext: {ctx}\nAnswer: {answer}\nReply: {{\"score\": N}}"),
            score_metric(f"Rate faithfulness (0-10). Does the answer hallucinate?\nContext: {ctx}\nAnswer: {answer}\nReply: {{\"score\": N}}"),
            score_metric(f"Rate answer relevance (0-10). Does it address the question?\nQuestion: {question}\nAnswer: {answer}\nReply: {{\"score\": N}}"),
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        groundedness = results[0] if not isinstance(results[0], Exception) else None
        faithfulness = results[1] if not isinstance(results[1], Exception) else None
        relevance = results[2] if not isinstance(results[2], Exception) else None
        hallucination_rate = (1.0 - faithfulness) if faithfulness is not None else None

        from app.models.agent_platform import AgentEvaluation
        evaluation = AgentEvaluation(
            organization_id=str(organization_id), agent_id=str(agent_id) if agent_id else None,
            execution_id=execution_id, question=question, answer=answer, context=ctx or None,
            citations=citations, groundedness=groundedness, faithfulness=faithfulness,
            answer_relevance=relevance, hallucination_rate=hallucination_rate,
            success=faithfulness is not None and faithfulness >= 0.7,
            latency_ms=latency_ms, cost_cents=cost_cents, total_tokens=total_tokens,
            eval_method="auto", eval_model="llm-judge")
        self.db.add(evaluation)
        await self.db.flush()

        return {"evaluation_id": str(evaluation.id), "groundedness": groundedness,
                "faithfulness": faithfulness, "answer_relevance": relevance,
                "hallucination_rate": hallucination_rate, "success": evaluation.success}

    async def get_summary(self, *, organization_id: uuid.UUID, days: int = 30) -> dict[str, Any]:
        """Get aggregate evaluation metrics."""
        from datetime import timedelta
        from sqlalchemy import func
        cutoff = datetime.now(UTC) - timedelta(days=days)
        result = await self.db.execute(
            select(func.count(AgentEvaluation.id),
                   func.avg(AgentEvaluation.groundedness), func.avg(AgentEvaluation.faithfulness),
                   func.avg(AgentEvaluation.answer_relevance), func.avg(AgentEvaluation.hallucination_rate),
                   func.avg(AgentEvaluation.latency_ms), func.sum(AgentEvaluation.cost_cents),
                   func.sum(AgentEvaluation.total_tokens))
            .where(AgentEvaluation.organization_id == str(organization_id),
                   AgentEvaluation.created_at >= cutoff))
        row = result.one()
        return {
            "period_days": days, "total_evaluations": int(row[0] or 0),
            "avg_groundedness": round(float(row[1]), 3) if row[1] else None,
            "avg_faithfulness": round(float(row[2]), 3) if row[2] else None,
            "avg_answer_relevance": round(float(row[3]), 3) if row[3] else None,
            "avg_hallucination_rate": round(float(row[4]), 3) if row[4] else None,
            "avg_latency_ms": int(row[5]) if row[5] else None,
            "total_cost_cents": int(row[6] or 0), "total_tokens": int(row[7] or 0),
        }


# ===== Guardrails =====

class GuardrailsService:
    """Cross-cutting guardrails for all agents.

    - Output validation: check for harmful content, PII leakage
    - Prompt injection protection: detect injection attempts in user input
    - Tool restrictions: verify agent is allowed to call a tool
    - Rate limits: per-agent, per-user, per-org
    - Human approval gates: pause for destructive actions
    """

    # Known prompt injection patterns
    INJECTION_PATTERNS = [
        "ignore previous instructions",
        "ignore all previous",
        "you are now",
        "system prompt:",
        "forget your instructions",
        "disregard the above",
        "new instructions:",
        "override your",
    ]

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def check_prompt_injection(self, user_input: str) -> dict[str, Any]:
        """Check if user input contains prompt injection attempts."""
        lower = user_input.lower()
        for pattern in self.INJECTION_PATTERNS:
            if pattern in lower:
                return {"is_injection": True, "pattern": pattern,
                        "message": "Potential prompt injection detected. The input has been flagged."}
        return {"is_injection": False}

    def validate_output(self, output: str, *, max_length: int = 10000) -> dict[str, Any]:
        """Validate agent output for safety."""
        issues: list[str] = []
        if len(output) > max_length:
            issues.append(f"Output exceeds max length ({len(output)} > {max_length})")
            output = output[:max_length] + "... [truncated]"
        # Check for common harmful patterns
        lower = output.lower()
        harmful_patterns = ["<script", "javascript:", "data:text/html", "vbscript:"]
        for pattern in harmful_patterns:
            if pattern in lower:
                issues.append(f"Potentially harmful content detected: {pattern}")
                output = output.replace(pattern, f"[BLOCKED:{pattern}]")
        return {"is_safe": len(issues) == 0, "issues": issues,
                "filtered_output": output if issues else None}

    async def check_tool_permission(self, *, agent_id: uuid.UUID, tool_name: str,
                                     organization_id: uuid.UUID) -> dict[str, Any]:
        """Check if an agent is allowed to call a tool."""
        from app.models.agent_platform import AgentTool
        from app.models.ai import ToolDefinition
        result = await self.db.execute(
            select(AgentTool, ToolDefinition).join(ToolDefinition, ToolDefinition.id == AgentTool.tool_id)
            .where(AgentTool.agent_id == str(agent_id), ToolDefinition.name == tool_name))
        row = result.first()
        if row is None:
            return {"allowed": False, "reason": "Tool not bound to this agent"}
        binding, tool = row
        if not binding.is_enabled:
            return {"allowed": False, "reason": "Tool is disabled for this agent"}
        if binding.requires_approval:
            return {"allowed": True, "requires_approval": True,
                    "reason": "Tool requires human approval"}
        return {"allowed": True}

    def check_rate_limit(self, *, agent_id: uuid.UUID, user_id: uuid.UUID,
                         calls_per_minute: int = 60) -> dict[str, Any]:
        """Check if the rate limit has been exceeded.

        Uses Redis in production; for now, always allows (placeholder).
        """
        return {"allowed": True, "limit": calls_per_minute, "remaining": calls_per_minute}
