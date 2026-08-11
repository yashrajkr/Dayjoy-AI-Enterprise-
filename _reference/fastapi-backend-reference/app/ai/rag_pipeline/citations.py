"""Citation generation — converts retrieval results into structured citations.

Each citation includes:
- document_id, document_title
- source_uri (URL / filename)
- chunk_id, chunk_index
- page (if available)
- heading_path (section context)
- snippet (the retrieved text, possibly truncated)
- score (similarity score, 0-1)
- source_type (file, web, faq, manual)
"""

from typing import Any

from app.models.knowledge import DocumentChunk, KnowledgeDocument


def build_citation(
    chunk: DocumentChunk,
    document: KnowledgeDocument,
    score: float,
    snippet_max_chars: int = 400,
) -> dict[str, Any]:
    """Build a citation dict from a chunk + document + score.

    Args:
        chunk: The retrieved chunk row.
        document: The parent document row.
        score: Similarity score (0-1).
        snippet_max_chars: Max chars to include in the snippet.

    Returns:
        Citation dict suitable for JSON serialization.
    """
    snippet = chunk.text
    if len(snippet) > snippet_max_chars:
        # Truncate at the last space before the limit
        cut = snippet[:snippet_max_chars].rsplit(" ", 1)[0]
        snippet = cut + "…"
    # Determine source type from format
    source_type = _source_type_from_format(document.format)
    return {
        "document_id": str(document.id),
        "document_title": document.title,
        "source_uri": document.source_uri,
        "source_type": source_type,
        "format": document.format,
        "category": document.category,
        "chunk_id": str(chunk.id),
        "chunk_index": chunk.chunk_index,
        "page": chunk.page,
        "heading_path": list(chunk.heading_path or []),
        "snippet": snippet,
        "score": round(float(score), 4),
        "language": chunk.language,
    }


def _source_type_from_format(fmt: str) -> str:
    """Map a document format to a citation source_type."""
    fmt = (fmt or "").lower()
    if fmt in ("web", "html", "htm"):
        return "web"
    if fmt == "faq":
        return "faq"
    if fmt == "manual":
        return "manual"
    return "file"


def format_citations_for_llm(citations: list[dict[str, Any]]) -> str:
    """Render citations as a numbered text block for inclusion in the LLM context.

    Example output:
        [1] Wellness Pack Guide (page 3, section "Dosage")
            Source: https://example.com/guide.pdf
            "Take 2 tablets daily with water..."

        [2] FAQ — Shipping Policy
            Source: faq
            "We ship within 2-3 business days..."
    """
    if not citations:
        return ""
    lines: list[str] = []
    for i, c in enumerate(citations, start=1):
        title = c.get("document_title", "Untitled")
        page = c.get("page")
        section = " > ".join(c.get("heading_path") or []) if c.get("heading_path") else None
        # Build location suffix
        loc_parts: list[str] = []
        if page is not None:
            loc_parts.append(f"page {page}")
        if section:
            loc_parts.append(f'section "{section}"')
        loc_suffix = f" ({', '.join(loc_parts)})" if loc_parts else ""
        lines.append(f"[{i}] {title}{loc_suffix}")
        source = c.get("source_uri")
        if source:
            lines.append(f"    Source: {source}")
        snippet = c.get("snippet", "")
        if snippet:
            lines.append(f'    "{snippet}"')
        lines.append("")  # blank line between citations
    return "\n".join(lines).strip()
