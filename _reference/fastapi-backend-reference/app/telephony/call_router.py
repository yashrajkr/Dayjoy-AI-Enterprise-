"""Call router — decides how to route inbound calls based on tenant rules.

The call router evaluates RoutingRule rows in priority order (lower priority
= evaluated first). First match wins. If no rules match, the phone number's
default routing_strategy is used.

Routing decisions:
- ai:        connect to Voice AI (create VoiceSession, stream to AI)
- forward:   dial another number (transfer)
- voicemail: record a voicemail message
- reject:    reject the call (busy signal)

Conditions evaluated:
- caller_phone_in:       caller is in a specific list
- caller_phone_prefix:   caller's number starts with a prefix
- time_of_day:           current time (HH:MM-HH:MM) in the schedule's timezone
- day_of_week:           current weekday
- business_hours_open:   True if currently within business hours
- caller_customer_tier:  resolved customer's tier (vip, regular, etc.)
- caller_id_blocked:     True if caller ID is "anonymous" / empty
"""

import uuid
from datetime import datetime, UTC
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.telephony import (
    BusinessHoursSchedule,
    PhoneNumber,
    RoutingRule,
)

logger = get_logger(__name__)


class RoutingDecision:
    """The result of evaluating routing rules for a call."""

    def __init__(
        self,
        *,
        action: str,
        action_config: dict[str, Any] | None = None,
        rule_id: str | None = None,
        reason: str,
    ) -> None:
        self.action = action
        # ai, forward, voicemail, reject
        self.action_config = action_config or {}
        self.rule_id = rule_id
        self.reason = reason

    def to_dict(self) -> dict[str, Any]:
        return {
            "action": self.action,
            "action_config": self.action_config,
            "rule_id": self.rule_id,
            "reason": self.reason,
        }


class CallRouter:
    """Evaluates routing rules for inbound calls."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def route_call(
        self,
        *,
        organization_id: uuid.UUID,
        phone_number: PhoneNumber,
        caller_phone: str,
        caller_name: str | None = None,
        customer_tier: str | None = None,
        now: datetime | None = None,
    ) -> RoutingDecision:
        """Evaluate routing rules and return the decision.

        Args:
            organization_id: Tenant ID.
            phone_number: The PhoneNumber row that received the call.
            caller_phone: Caller's E.164 number.
            caller_name: Caller's display name (from caller ID).
            customer_tier: Resolved customer's tier (vip, regular, etc.).
            now: Override current time (for testing).

        Returns:
            RoutingDecision with action + config + reason.
        """
        now = now or datetime.now(UTC)

        # Load routing rules (sorted by priority ascending)
        result = await self.db.execute(
            select(RoutingRule)
            .where(
                RoutingRule.organization_id == str(organization_id),
                RoutingRule.is_active == True,  # noqa: E712
                # Rules with phone_number_id = this number OR phone_number_id IS NULL
                (RoutingRule.phone_number_id == str(phone_number.id))
                | (RoutingRule.phone_number_id.is_(None)),
            )
            .order_by(RoutingRule.priority.asc())
        )
        rules = list(result.scalars().all())

        # Load business hours (if linked)
        business_hours = await self._load_business_hours(
            organization_id=organization_id,
            schedule_id=phone_number.business_hours_id,
        )
        is_business_hours = self._is_within_business_hours(business_hours, now)

        # Build evaluation context
        context = {
            "caller_phone": caller_phone,
            "caller_name": caller_name,
            "caller_customer_tier": customer_tier,
            "caller_id_blocked": not caller_phone or caller_phone in ("anonymous", "restricted"),
            "business_hours_open": is_business_hours,
            "now": now,
            "business_hours_timezone": business_hours.timezone if business_hours else "UTC",
        }

        # Evaluate each rule
        for rule in rules:
            if self._matches_conditions(rule.conditions, context):
                logger.info(
                    "call_routing_rule_matched",
                    organization_id=str(organization_id),
                    rule_id=str(rule.id),
                    rule_name=rule.name,
                    action=rule.action,
                )
                return RoutingDecision(
                    action=rule.action,
                    action_config=rule.action_config,
                    rule_id=str(rule.id),
                    reason=f"rule_matched: {rule.name}",
                )

        # No rules matched — fall back to phone number's default strategy
        default_strategy = phone_number.routing_strategy or settings.DEFAULT_ROUTING_STRATEGY
        logger.info(
            "call_routing_default",
            organization_id=str(organization_id),
            phone_number_id=str(phone_number.id),
            strategy=default_strategy,
        )
        return RoutingDecision(
            action=default_strategy,
            action_config=self._build_default_config(default_strategy, phone_number),
            reason="default_strategy",
        )

    def _matches_conditions(
        self,
        conditions: dict[str, Any],
        context: dict[str, Any],
    ) -> bool:
        """Check whether all conditions match the context (AND logic).

        Condition keys map to context values as follows:
        - caller_phone_in      → context["caller_phone"] (must be in expected list)
        - caller_phone_prefix  → context["caller_phone"] (must start with expected)
        - caller_customer_tier → context["caller_customer_tier"]
        - caller_id_blocked    → context["caller_id_blocked"]
        - business_hours_open  → context["business_hours_open"]
        - day_of_week          → derived from context["now"] + timezone
        - time_of_day          → derived from context["now"] + timezone
        """
        if not conditions:
            # Empty conditions = always match
            return True

        for key, expected in conditions.items():
            # For caller_phone_* conditions, look up the caller's phone number
            if key in ("caller_phone_in", "caller_phone_prefix"):
                actual = context.get("caller_phone")
            else:
                actual = context.get(key)

            if key == "caller_phone_in":
                if actual not in (expected or []):
                    return False
            elif key == "caller_phone_prefix":
                if not (actual or "").startswith(expected):
                    return False
            elif key == "caller_customer_tier":
                if actual != expected:
                    return False
            elif key == "caller_id_blocked":
                if bool(actual) != bool(expected):
                    return False
            elif key == "business_hours_open":
                if bool(actual) != bool(expected):
                    return False
            elif key == "day_of_week":
                # expected: ["monday", "tuesday", ...]
                now: datetime = context["now"]
                tz = ZoneInfo(context.get("business_hours_timezone", "UTC"))
                local_day = now.astimezone(tz).strftime("%A").lower()
                if local_day not in [d.lower() for d in (expected or [])]:
                    return False
            elif key == "time_of_day":
                # expected: {"start": "09:00", "end": "17:00"}
                now: datetime = context["now"]
                tz = ZoneInfo(context.get("business_hours_timezone", "UTC"))
                local_time = now.astimezone(tz)
                current_minutes = local_time.hour * 60 + local_time.minute
                start = self._parse_time_to_minutes(expected.get("start", "00:00"))
                end = self._parse_time_to_minutes(expected.get("end", "23:59"))
                if not (start <= current_minutes <= end):
                    return False
            else:
                # Unknown condition key — be conservative and fail the match
                logger.warning(
                    "unknown_routing_condition",
                    key=key,
                    expected=expected,
                )
                return False

        return True

    @staticmethod
    def _parse_time_to_minutes(time_str: str) -> int:
        """Parse 'HH:MM' to minutes since midnight."""
        try:
            hours, minutes = time_str.split(":")
            return int(hours) * 60 + int(minutes)
        except (ValueError, AttributeError):
            return 0

    async def _load_business_hours(
        self,
        *,
        organization_id: uuid.UUID,
        schedule_id: str | None,
    ) -> BusinessHoursSchedule | None:
        if not schedule_id:
            return None
        # Ensure schedule_id is a proper UUID
        try:
            schedule_uuid = uuid.UUID(str(schedule_id)) if not hasattr(schedule_id, 'hex') else schedule_id
        except (ValueError, AttributeError):
            return None
        result = await self.db.execute(
            select(BusinessHoursSchedule).where(
                BusinessHoursSchedule.id == schedule_uuid,
                BusinessHoursSchedule.organization_id == str(organization_id),
                BusinessHoursSchedule.is_active == True,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    def _is_within_business_hours(
        self,
        schedule: BusinessHoursSchedule | None,
        now: datetime,
    ) -> bool:
        """Check whether `now` is within the business hours schedule."""
        if not schedule:
            # No schedule = always "open" (let AI handle 24/7)
            return True

        tz = ZoneInfo(schedule.timezone or "UTC")
        local_now = now.astimezone(tz)

        # Check holidays first
        for holiday in (schedule.holidays or []):
            if isinstance(holiday, dict):
                holiday_date = holiday.get("date")
                if holiday_date:
                    try:
                        holiday_dt = datetime.strptime(holiday_date, "%Y-%m-%d").date()
                        if local_now.date() == holiday_dt:
                            return False
                    except ValueError:
                        pass

        # Check weekly schedule
        weekday = local_now.strftime("%A").lower()
        day_schedule = (schedule.weekly_schedule or {}).get(weekday, {})
        if not day_schedule.get("enabled", False):
            return False

        start_str = day_schedule.get("start", "00:00")
        end_str = day_schedule.get("end", "23:59")
        start_min = self._parse_time_to_minutes(start_str)
        end_min = self._parse_time_to_minutes(end_str)
        current_min = local_now.hour * 60 + local_now.minute

        return start_min <= current_min <= end_min

    @staticmethod
    def _build_default_config(
        strategy: str,
        phone_number: PhoneNumber,
    ) -> dict[str, Any]:
        """Build action config for the phone number's default strategy."""
        if strategy == "ai":
            return {
                "voice_assistant_id": phone_number.voice_assistant_id,
                "phone_number_id": str(phone_number.id),
            }
        if strategy == "forward":
            return {
                "forward_to": phone_number.forward_to_number or "",
                "timeout": 30,
            }
        if strategy == "voicemail":
            return {
                "max_duration": settings.VOICEMAIL_MAX_DURATION,
                "phone_number_id": str(phone_number.id),
            }
        if strategy == "reject":
            return {"reason": "rejected_by_default"}
        return {}
