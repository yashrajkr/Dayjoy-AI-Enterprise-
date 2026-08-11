"""Confidence scoring + hallucination prevention.

Computes a confidence score for a retrieval result based on:
- Average similarity score of top-K chunks
- Score stability (variance across top-K)
- Chunk overlap with query (keyword coverage)
- Number of distinct documents contributing

If confidence is below CONFIDENCE_THRESHOLD, the pipeline returns a fallback
"I don't know" response instead of letting the LLM hallucinate.
"""

from typing import Any

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def compute_confidence(scored_results: list[dict[str, Any]], query: str) -> float:
    """Compute a confidence score (0.0-1.0) for a set of retrieval results.

    Args:
        scored_results: List of result dicts, each with a "score" key.
        query: The original query string (for keyword coverage check).

    Returns:
        Confidence score in [0.0, 1.0].
    """
    if not scored_results:
        return 0.0

    # 1. Average of top-K scores (weighted: top result counts more)
    scores = [r.get("score", 0.0) for r in scored_results[: settings.RERANK_TOP_K]]
    if not scores:
        return 0.0
    # Weighted average: exponentially decay
    weights = [1.0 / (i + 1) for i in range(len(scores))]
    total_weight = sum(weights)
    weighted_score = sum(s * w for s, w in zip(scores, weights)) / total_weight

    # 2. Score stability (penalize high variance)
    if len(scores) > 1:
        avg = sum(scores) / len(scores)
        variance = sum((s - avg) ** 2 for s in scores) / len(scores)
        # If variance is high, drop confidence slightly
        stability_factor = max(0.5, 1.0 - variance * 2)
    else:
        stability_factor = 1.0

    # 3. Keyword coverage (how many query words appear in top results)
    query_words = {w.lower() for w in query.split() if len(w) > 2}
    if query_words:
        top_texts = " ".join(r.get("text", "") for r in scored_results[:3]).lower()
        covered = sum(1 for w in query_words if w in top_texts)
        coverage = covered / len(query_words)
    else:
        coverage = 1.0

    # 4. Distinct documents contributing
    distinct_docs = len({r.get("document_id") for r in scored_results[: settings.RERANK_TOP_K]})
    diversity_bonus = min(0.05, distinct_docs * 0.02)  # cap at +5%

    # Combine
    confidence = weighted_score * stability_factor * (0.7 + 0.3 * coverage) + diversity_bonus

    # Clamp
    return max(0.0, min(1.0, confidence))


def should_fallback(confidence: float, top_score: float | None = None) -> tuple[bool, str]:
    """Decide whether to fall back to "I don't know".

    Returns (should_fallback, reason).
    """
    threshold = settings.CONFIDENCE_THRESHOLD
    if confidence < threshold:
        return True, f"confidence_below_threshold ({confidence:.3f} < {threshold})"
    if top_score is not None and top_score < settings.MIN_SIMILARITY_THRESHOLD:
        return True, f"top_score_below_threshold ({top_score:.3f} < {settings.MIN_SIMILARITY_THRESHOLD})"
    return False, ""


FALLBACK_RESPONSE = (
    "I don't have enough information in the knowledge base to answer that "
    "confidently. Would you like me to escalate this to a human agent, or "
    "would you like to rephrase your question?"
)


def build_fallback_response(
    confidence: float,
    reason: str,
    query: str,
) -> dict[str, Any]:
    """Build a fallback response payload."""
    return {
        "answer": FALLBACK_RESPONSE,
        "citations": [],
        "confidence": round(confidence, 4),
        "was_fallback": True,
        "fallback_reason": reason,
        "query": query,
    }
