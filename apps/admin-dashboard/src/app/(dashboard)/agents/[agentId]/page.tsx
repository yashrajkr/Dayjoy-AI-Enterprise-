"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Bot, Play, Save, Loader2, History, Settings, BookOpen, Wrench, Activity, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface Agent {
  id: string; name: string; agent_type: string; description: string | null;
  system_prompt: string | null; instructions: string | null; model: string;
  llm_provider: string; temperature: number; max_tokens: number;
  enable_rag: boolean; enable_memory: boolean; enable_tool_calling: boolean;
  enable_safety_filter: boolean; version: number; is_active: boolean;
}

interface Execution {
  id: string; status: string; input_message: string; output_message: string;
  input_tokens: number; output_tokens: number; cost_cents: number;
  latency_ms: number; confidence: number | null; created_at: string;
}

export default function AgentDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const agentId = params.agentId as string;
  const shouldRun = searchParams.get("action") === "run";

  const [agent, setAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"config" | "executions" | "knowledge" | "tools" | "versions">(
    shouldRun ? "executions" : "config");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [name, setName] = useState(""); const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(""); const [instructions, setInstructions] = useState("");
  const [model, setModel] = useState("gpt-4o-mini"); const [temperature, setTemperature] = useState(0.3);
  const [maxTokens, setMaxTokens] = useState(2000);
  const [enableRag, setEnableRag] = useState(true); const [enableMemory, setEnableMemory] = useState(true);
  const [enableTools, setEnableTools] = useState(true); const [enableSafety, setEnableSafety] = useState(true);

  const [executions, setExecutions] = useState<Execution[]>([]);
  const [runMessage, setRunMessage] = useState(""); const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ output: string; citations: unknown[]; confidence: number; latency_ms: number; cost_cents: number } | null>(null);
  const [knowledgeBindings, setKnowledgeBindings] = useState<Array<{ collection_name: string; is_primary: boolean }>>([]);
  const [toolBindings, setToolBindings] = useState<Array<{ tool_name: string; display_name: string; is_enabled: boolean }>>([]);
  const [versions, setVersions] = useState<Array<{ id: string; version: number; change_summary: string | null; created_at: string }>>([]);

  async function loadAgent() {
    setIsLoading(true);
    try {
      const resp = await api.get<{ data: Agent }>(`/agents-platform/agents/${agentId}`);
      setAgent(resp.data);
      setName(resp.data.name); setDescription(resp.data.description || "");
      setSystemPrompt(resp.data.system_prompt || ""); setInstructions(resp.data.instructions || "");
      setModel(resp.data.model); setTemperature(resp.data.temperature);
      setMaxTokens(resp.data.max_tokens); setEnableRag(resp.data.enable_rag);
      setEnableMemory(resp.data.enable_memory); setEnableTools(resp.data.enable_tool_calling);
      setEnableSafety(resp.data.enable_safety_filter);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Could not load agent."); }
    finally { setIsLoading(false); }
  }

  async function loadExecutions() {
    try { const resp = await api.get<{ data: Execution[] }>(`/agents-platform/agents/${agentId}/executions?limit=20`); setExecutions(resp.data); }
    catch { /* best-effort */ }
  }
  async function loadKnowledge() {
    try { const resp = await api.get<{ data: Array<{ collection_name: string; is_primary: boolean }> }>(`/agents-platform/agents/${agentId}/knowledge`); setKnowledgeBindings(resp.data); }
    catch { /* best-effort */ }
  }
  async function loadTools() {
    try { const resp = await api.get<{ data: Array<{ tool_name: string; display_name: string; is_enabled: boolean }> }>(`/agents-platform/agents/${agentId}/tools`); setToolBindings(resp.data); }
    catch { /* best-effort */ }
  }
  async function loadVersions() {
    try { const resp = await api.get<{ data: Array<{ id: string; version: number; change_summary: string | null; created_at: string }> }>(`/agents-platform/agents/${agentId}/versions`); setVersions(resp.data); }
    catch { /* best-effort */ }
  }

  useEffect(() => { loadAgent(); }, [agentId]);
  useEffect(() => {
    if (agent) {
      if (activeTab === "executions") loadExecutions();
      if (activeTab === "knowledge") loadKnowledge();
      if (activeTab === "tools") loadTools();
      if (activeTab === "versions") loadVersions();
    }
  }, [agent, activeTab]);

  async function handleSave(e: FormEvent) {
    e.preventDefault(); setIsSaving(true); setError(null); setSuccess(null);
    try {
      await api.patch(`/agents-platform/agents/${agentId}`, {
        name, description: description || null, system_prompt: systemPrompt || null,
        instructions: instructions || null, model, temperature, max_tokens: maxTokens,
        enable_rag: enableRag, enable_memory: enableMemory, enable_tool_calling: enableTools, enable_safety_filter: enableSafety,
      });
      setSuccess("Agent updated. New version created."); await loadAgent();
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Could not save."); }
    finally { setIsSaving(false); }
  }

  async function handleRun(e: FormEvent) {
    e.preventDefault(); if (!runMessage.trim()) return;
    setIsRunning(true); setError(null); setRunResult(null);
    try {
      const resp = await api.post<{ data: { output: string; citations: Array<{ document_title: string; score: number; page: number | null }>; confidence: number; latency_ms: number; cost_cents: number } }>(
        `/agents-platform/agents/${agentId}/execute`, { message: runMessage });
      setRunResult(resp.data); await loadExecutions();
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Execution failed."); }
    finally { setIsRunning(false); }
  }

  async function handleRollback(version: number) {
    if (!confirm(`Rollback to version ${version}?`)) return;
    try { await api.post(`/agents-platform/agents/${agentId}/rollback/${version}`, {}); await loadAgent(); setSuccess(`Rolled back to v${version}`); }
    catch (err: unknown) { setError((err as { message?: string })?.message || "Rollback failed."); }
  }

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!agent) return <div className="text-center text-muted-foreground">Agent not found.</div>;

  const tabs = [
    { id: "config" as const, label: "Configuration", icon: Settings },
    { id: "executions" as const, label: "Run + History", icon: Play },
    { id: "knowledge" as const, label: "Knowledge", icon: BookOpen },
    { id: "tools" as const, label: "Tools", icon: Wrench },
    { id: "versions" as const, label: "Versions", icon: History },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Bot className="h-5 w-5 text-primary" /></div>
        <div>
          <h1 className="text-2xl font-bold">{agent.name}</h1>
          <p className="text-sm text-muted-foreground">{agent.agent_type} · {agent.llm_provider}/{agent.model} · v{agent.version}</p>
        </div>
      </div>
      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {success && <div className="rounded-md bg-success/10 p-3 text-sm text-success">{success}</div>}
      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}>
            <tab.icon className="h-4 w-4" /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "config" && (
        <Card><CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="name">Name</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="desc">Description</Label><Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="model">Model</Label>
                <select id="model" value={model} onChange={(e) => setModel(e.target.value)} className="w-full rounded-md border border-border p-2">
                  <option value="gpt-4o-mini">GPT-4o Mini</option><option value="gpt-4o">GPT-4o</option>
                  <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option><option value="claude-3-haiku">Claude 3 Haiku</option>
                </select>
              </div>
              <div className="space-y-2"><Label htmlFor="temp">Temperature: {temperature.toFixed(1)}</Label>
                <input id="temp" type="range" min="0" max="2" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full" />
              </div>
            </div>
            <div className="space-y-2"><Label htmlFor="prompt">System prompt</Label>
              <textarea id="prompt" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className="min-h-[120px] w-full rounded-md border border-border p-2 text-sm font-mono" placeholder="You are a helpful assistant..." />
            </div>
            <div className="space-y-2"><Label htmlFor="instructions">Instructions</Label>
              <textarea id="instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} className="min-h-[60px] w-full rounded-md border border-border p-2 text-sm" placeholder="Always cite sources..." />
            </div>
            <div className="space-y-2"><Label htmlFor="maxTokens">Max tokens: {maxTokens}</Label>
              <input id="maxTokens" type="range" min="100" max="8000" step="100" value={maxTokens} onChange={(e) => setMaxTokens(parseInt(e.target.value))} className="w-full" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enableRag} onChange={(e) => setEnableRag(e.target.checked)} /> Knowledge (RAG)</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enableMemory} onChange={(e) => setEnableMemory(e.target.checked)} /> Memory</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enableTools} onChange={(e) => setEnableTools(e.target.checked)} /> Tool calling</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enableSafety} onChange={(e) => setEnableSafety(e.target.checked)} /> Safety filter</label>
            </div>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save changes
            </Button>
          </form>
        </CardContent></Card>
      )}

      {activeTab === "executions" && (
        <div className="space-y-4">
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Play className="h-4 w-4" /> Test agent</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleRun} className="space-y-3">
                <textarea value={runMessage} onChange={(e) => setRunMessage(e.target.value)} placeholder="Type a message to test this agent..." className="min-h-[80px] w-full rounded-md border border-border p-2 text-sm" disabled={isRunning} />
                <Button type="submit" disabled={isRunning || !runMessage.trim()}>
                  {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} {isRunning ? "Running..." : "Run agent"}
                </Button>
              </form>
              {runResult && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-md bg-white/[0.02] p-3"><p className="text-sm whitespace-pre-wrap">{runResult.output}</p></div>
                  {runResult.citations.length > 0 && (
                    <div><p className="mb-1 text-xs font-medium text-muted-foreground">Citations:</p>
                      <div className="space-y-1">{runResult.citations.map((c: { document_title: string; score: number; page: number | null }, i: number) => (
                        <div key={i} className="rounded bg-white p-1.5 text-xs">[{i + 1}] {c.document_title}{c.page && ` (page ${c.page})`} — score: {(c.score * 100).toFixed(0)}%</div>
                      ))}</div>
                    </div>
                  )}
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>⏱ {runResult.latency_ms}ms</span><span>📊 {(runResult.confidence * 100).toFixed(0)}% confidence</span><span>💰 ${runResult.cost_cents / 100}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4" /> Execution history</CardTitle></CardHeader>
            <CardContent>
              {executions.length === 0 ? <p className="text-sm text-muted-foreground">No executions yet.</p> : (
                <div className="space-y-2">{executions.map((exec) => (
                  <div key={exec.id} className="flex items-center justify-between rounded border p-2 text-sm">
                    <div className="flex-1 truncate">
                      <span className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] ${exec.status === "completed" ? "bg-success/15 text-success" : exec.status === "failed" ? "bg-destructive/15 text-destructive" : "bg-white/[0.04] text-foreground/80"}`}>{exec.status}</span>
                      <span className="text-muted-foreground">{exec.input_message.substring(0, 80)}</span>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground"><span>{exec.latency_ms}ms</span><span>{exec.input_tokens + exec.output_tokens} tok</span><span>${(exec.cost_cents / 100).toFixed(4)}</span></div>
                  </div>
                ))}</div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "knowledge" && (
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><BookOpen className="h-4 w-4" /> Knowledge collections</CardTitle></CardHeader>
          <CardContent>
            {knowledgeBindings.length === 0 ? <p className="text-sm text-muted-foreground">No knowledge collections bound.</p> : (
              <div className="space-y-2">{knowledgeBindings.map((b, i) => (
                <div key={i} className="flex items-center justify-between rounded border p-2 text-sm">
                  <span>{b.collection_name}</span>{b.is_primary && <span className="text-xs text-primary">Primary</span>}
                </div>
              ))}</div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "tools" && (
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wrench className="h-4 w-4" /> Allowed tools</CardTitle></CardHeader>
          <CardContent>
            {toolBindings.length === 0 ? <p className="text-sm text-muted-foreground">No tools bound to this agent.</p> : (
              <div className="space-y-2">{toolBindings.map((t, i) => (
                <div key={i} className="flex items-center justify-between rounded border p-2 text-sm">
                  <div><span className="font-medium">{t.display_name}</span><span className="ml-2 text-xs text-muted-foreground">{t.tool_name}</span></div>
                  <span className={`text-xs ${t.is_enabled ? "text-success" : "text-muted-foreground"}`}>{t.is_enabled ? "Enabled" : "Disabled"}</span>
                </div>
              ))}</div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "versions" && (
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" /> Version history</CardTitle></CardHeader>
          <CardContent>
            {versions.length === 0 ? <p className="text-sm text-muted-foreground">No versions recorded.</p> : (
              <div className="space-y-2">{versions.map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded border p-2 text-sm">
                  <div><span className="font-medium">v{v.version}</span>{v.change_summary && <span className="ml-2 text-muted-foreground">{v.change_summary}</span>}<p className="text-xs text-muted-foreground">{new Date(v.created_at).toLocaleString()}</p></div>
                  {v.version !== agent.version && <Button size="sm" variant="outline" onClick={() => handleRollback(v.version)} className="h-7 text-xs">Rollback</Button>}
                </div>
              ))}</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
