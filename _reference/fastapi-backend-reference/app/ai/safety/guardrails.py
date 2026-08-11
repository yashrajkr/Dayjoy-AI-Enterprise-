"""AI Safety — guardrails for prompt injection, PII redaction, output filtering.

Layer 1: Input safety — check user input for prompt injection, jailbreak attempts, PII
Layer 2: Output safety — check AI output for toxicity, PII leaks, prompt leaks
Layer 3: Tool safety — validate tool calls against allowed policies
"""

import re
from dataclasses import dataclass
from typing import Any

from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class SafetyResult:
    """Result of a safety check."""

    blocked: bool
    reason: str | None = None
    cleaned_text: str | None = None  # For PII redaction


# Known prompt injection patterns
INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"you\s+are\s+(now\s+)?a?",
    r"forget\s+(everything|all)",
    r"system\s+prompt\s*:",
    r"<\|im_start\|>",
    r"</?system>",
    r"reveal\s+your\s+(system\s+)?prompt",
    r"what\s+are\s+your\s+instructions",
    r"act\s+as\s+(if\s+)?you\s+are",
    r"pretend\s+(you\s+are|to\s+be)",
]

# PII patterns (basic — production would use Presidio)
PII_PATTERNS = {
    "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
    "phone": r"\b\d{10}\b|\b\d{3}[-.]?\d{3}[-.]?\d{4}\b",
    "credit_card": r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b",
    "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
    "aadhaar": r"\b\d{12}\b",
    "pan": r"\b[A-Z]{5}\d{4}[A-Z]\b",
}

# Toxicity keywords (basic — production would use Perspective API)
TOXICITY_KEYWORDS = {
    "hate",
    "kill",
    "suicide",
    "bomb",
    "terrorist",
    "drug",
}


class SafetyGuardrails:
    """AI safety guardrails — input and output filtering."""

    def check_input(self, text: str, ai_config: Any = None) -> SafetyResult:
        """Check user input for safety issues.

        Checks:
        1. Prompt injection detection (pattern + heuristic)
        2. PII detection and redaction
        3. Length limit
        """
        if not text:
            return SafetyResult(blocked=True, reason="Empty input")

        # 1. Length check
        if len(text) > 10000:
            return SafetyResult(blocked=True, reason="Input too long (max 10000 chars)")

        # 2. Prompt injection check (if enabled)
        if ai_config is None or ai_config.prompt_injection_filter:
            for pattern in INJECTION_PATTERNS:
                if re.search(pattern, text, re.IGNORECASE):
                    logger.warning(
                        "prompt_injection_detected",
                        pattern=pattern,
                        text_preview=text[:100],
                    )
                    return SafetyResult(
                        blocked=True,
                        reason=f"Prompt injection detected (pattern: {pattern})",
                    )

        # 3. PII redaction (if enabled)
        cleaned_text = text
        if ai_config is None or ai_config.pii_redaction:
            for pii_type, pattern in PII_PATTERNS.items():
                matches = re.findall(pattern, text)
                if matches:
                    cleaned_text = re.sub(pattern, f"[{pii_type.upper()}_REDACTED]", cleaned_text)

        return SafetyResult(blocked=False, cleaned_text=cleaned_text)

    def check_output(self, text: str, ai_config: Any = None) -> SafetyResult:
        """Check AI output for safety issues.

        Checks:
        1. Toxicity filter
        2. PII leak (AI should not expose PII in responses)
        3. Prompt leak (AI should not reveal its system prompt)
        """
        if not text:
            return SafetyResult(blocked=False)

        # 1. Toxicity check
        if ai_config is None or ai_config.safety_filter_enabled:
            text_lower = text.lower()
            for keyword in TOXICITY_KEYWORDS:
                if keyword in text_lower:
                    return SafetyResult(
                        blocked=True,
                        reason=f"Toxic content detected (keyword: {keyword})",
                    )

        # 2. PII leak check
        for pii_type, pattern in PII_PATTERNS.items():
            if re.search(pattern, text):
                # Redact the PII from the output
                text = re.sub(pattern, f"[{pii_type.upper()}_REDACTED]", text)
                logger.warning("pii_leak_detected_in_output", pii_type=pii_type)

        # 3. Prompt leak check
        prompt_leak_patterns = [
            r"my\s+system\s+prompt\s+is",
            r"my\s+instructions\s+are",
            r"I\s+was\s+told\s+to",
        ]
        for pattern in prompt_leak_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                return SafetyResult(
                    blocked=True,
                    reason="Prompt leak detected (AI revealing system prompt)",
                )

        return SafetyResult(blocked=False, cleaned_text=text)
