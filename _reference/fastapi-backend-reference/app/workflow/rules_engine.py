"""Business Rules Engine — configurable rules without code changes.

Supports:
- IF / ELSE conditions
- AND / OR logical operators
- Field comparisons (eq, ne, gt, lt, contains, in, not_empty, is_empty)
- Variables (workflow context data)
- Role-based execution
- Time-based rules (time of day, day of week)
- Reusable rule sets
- Dynamic configuration (stored in DB, evaluated at runtime)
"""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.models.workflow import RuleSet

logger = get_logger(__name__)


class RulesEngine:
    """Evaluates business rules against provided context data.

    Rules are stored as JSON in RuleSet.rules:
    [
        {
            "id": "rule_1",
            "name": "High Priority Customer",
            "condition": {
                "field": "customer.tier",
                "operator": "eq",
                "value": "platinum"
            },
            "action": {
                "type": "set_variable",
                "config": {"variable": "priority", "value": "high"}
            }
        },
        {
            "id": "rule_2",
            "name": "Business Hours Check",
            "condition": {
                "type": "time",
                "config": {"start": "09:00", "end": "18:00", "timezone": "Asia/Kolkata"}
            },
            "action": {
                "type": "set_variable",
                "config": {"variable": "is_business_hours", "value": True}
            }
        }
    ]

    RuleSet.evaluation_mode: "all" (AND — all rules must pass) or "any" (OR — any rule passes).
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_rule_set(
        self,
        *,
        organization_id: uuid.UUID,
        name: str,
        rules: list[dict],
        description: str | None = None,
        evaluation_mode: str = "all",
    ) -> RuleSet:
        """Create a new rule set."""
        rs = RuleSet(
            organization_id=str(organization_id),
            name=name,
            description=description,
            rules=rules,
            evaluation_mode=evaluation_mode,
            is_active=True,
        )
        self.db.add(rs)
        await self.db.flush()
        return rs

    async def evaluate(
        self,
        rule_set_id: uuid.UUID,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        """Evaluate a rule set against the provided context.

        Args:
            rule_set_id: The rule set to evaluate.
            context: Data to evaluate rules against (e.g., {"customer": {"tier": "platinum"}}).

        Returns:
            {
                "passed": True/False,
                "matched_rules": ["rule_1", "rule_2"],
                "actions": [{type, config}, ...],
                "variables_set": {variable: value, ...}
            }
        """
        rs = await self.db.get(RuleSet, rule_set_id)
        if rs is None:
            raise NotFoundError("RuleSet", str(rule_set_id))

        if not rs.is_active:
            return {"passed": False, "matched_rules": [], "actions": [], "variables_set": {}}

        rules = rs.rules or []
        matched = []
        actions = []
        variables_set: dict[str, Any] = {}

        for rule in rules:
            rule_id = rule.get("id", "unknown")
            rule_name = rule.get("name", "Unnamed Rule")
            condition = rule.get("condition", {})
            action = rule.get("action", {})

            is_met = self._evaluate_condition(condition, context)

            if is_met:
                matched.append(rule_id)
                if action:
                    actions.append(action)
                    # Execute set_variable actions
                    if action.get("type") == "set_variable":
                        config = action.get("config", {})
                        var_name = config.get("variable")
                        var_value = config.get("value")
                        if var_name:
                            variables_set[var_name] = var_value
                            context[var_name] = var_value  # Update context for subsequent rules

            logger.debug(
                "rule_evaluated",
                rule_id=rule_id,
                rule_name=rule_name,
                passed=is_met,
            )

        # Determine overall result based on evaluation mode
        if rs.evaluation_mode == "all":
            passed = len(matched) == len(rules)
        else:  # "any"
            passed = len(matched) > 0

        return {
            "passed": passed,
            "matched_rules": matched,
            "total_rules": len(rules),
            "actions": actions,
            "variables_set": variables_set,
            "evaluation_mode": rs.evaluation_mode,
        }

    async def list_rule_sets(self, organization_id: uuid.UUID) -> list[RuleSet]:
        """List all rule sets for an organization."""
        result = await self.db.execute(
            select(RuleSet)
            .where(
                RuleSet.organization_id == str(organization_id),
                RuleSet.is_active == True,  # noqa: E712
            )
            .order_by(RuleSet.created_at.desc())
        )
        return list(result.scalars().all())

    def _evaluate_condition(self, condition: dict, context: dict[str, Any]) -> bool:
        """Evaluate a single condition against context data.

        Supports:
        - Field conditions: {field, operator, value}
        - Logical conditions: {type: "and"/"or", conditions: [...]}
        - Time conditions: {type: "time", config: {start, end, timezone}}
        - Nested field access: "customer.tier" → context["customer"]["tier"]
        """
        cond_type = condition.get("type", "field")

        if cond_type == "and":
            # All sub-conditions must be true
            sub_conditions = condition.get("conditions", [])
            return all(self._evaluate_condition(c, context) for c in sub_conditions)

        if cond_type == "or":
            # Any sub-condition must be true
            sub_conditions = condition.get("conditions", [])
            return any(self._evaluate_condition(c, context) for c in sub_conditions)

        if cond_type == "not":
            # Negate the sub-condition
            sub_condition = condition.get("condition", {})
            return not self._evaluate_condition(sub_condition, context)

        if cond_type == "time":
            # Time-based condition
            return self._evaluate_time_condition(condition.get("config", {}))

        # Field comparison condition
        field = condition.get("field", "")
        operator = condition.get("operator", "eq")
        expected = condition.get("value")

        # Navigate nested fields (e.g., "customer.tier")
        actual = context
        for part in field.split("."):
            if isinstance(actual, dict):
                actual = actual.get(part)
            else:
                actual = None
                break

        return self._compare(actual, operator, expected)

    def _compare(self, actual: Any, operator: str, expected: Any) -> bool:
        """Compare actual value against expected using the given operator."""
        if operator == "eq":
            return actual == expected
        if operator == "ne":
            return actual != expected
        if operator == "gt":
            try:
                return float(actual) > float(expected)
            except (TypeError, ValueError):
                return False
        elif operator == "lt":
            try:
                return float(actual) < float(expected)
            except (TypeError, ValueError):
                return False
        elif operator == "gte":
            try:
                return float(actual) >= float(expected)
            except (TypeError, ValueError):
                return False
        elif operator == "lte":
            try:
                return float(actual) <= float(expected)
            except (TypeError, ValueError):
                return False
        elif operator == "contains":
            return str(expected) in str(actual) if actual is not None else False
        elif operator == "not_contains":
            return str(expected) not in str(actual) if actual is not None else True
        elif operator == "in":
            return actual in (expected or [])
        elif operator == "not_in":
            return actual not in (expected or [])
        elif operator == "is_empty":
            return not bool(actual)
        elif operator == "not_empty":
            return bool(actual)
        elif operator == "starts_with":
            return str(actual).startswith(str(expected)) if actual else False
        elif operator == "ends_with":
            return str(actual).endswith(str(expected)) if actual else False
        else:
            logger.warning("unknown_operator", operator=operator)
            return False

    def _evaluate_time_condition(self, config: dict) -> bool:
        """Evaluate a time-based condition."""
        from datetime import datetime
        from datetime import timezone as tz_module

        start = config.get("start", "00:00")
        end = config.get("end", "23:59")
        tz_name = config.get("timezone", "UTC")

        try:
            import zoneinfo

            tz = zoneinfo.ZoneInfo(tz_name)
        except Exception:
            tz = tz_module.UTC

        now = datetime.now(tz)
        current_time = now.strftime("%H:%M")

        return start <= current_time <= end
