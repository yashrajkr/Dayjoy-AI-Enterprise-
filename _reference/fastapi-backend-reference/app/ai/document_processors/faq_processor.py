"""FAQ processor — structured Q&A pairs (manual entry).

Supports two input formats:
1. JSON array of {"question": "...", "answer": "..."} objects
2. Plain text with "Q: ...\\nA: ..." pattern (one per pair, blank line between)

Each Q&A pair becomes one chunk with metadata `faq_question` and `faq_answer`.
The chunk text is "Q: {question}\nA: {answer}".
"""

import json
import re
from typing import Any

from app.ai.document_processors.base import (
    DocumentProcessor,
    ProcessedChunk,
    ProcessedDocument,
    ProcessorError,
)


class FAQProcessor(DocumentProcessor):
    """Process FAQ entries (Q&A pairs)."""

    @property
    def supported_formats(self) -> list[str]:
        return ["faq"]

    async def process_text(
        self,
        text: str,
        filename: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ProcessedDocument:
        meta = dict(metadata or {})
        # Try JSON first
        faq_pairs: list[dict[str, str]] = []
        stripped = text.strip()
        if stripped.startswith("[") or stripped.startswith("{"):
            try:
                data = json.loads(stripped)
                if isinstance(data, dict) and "faq" in data:
                    data = data["faq"]
                if isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict) and "question" in item and "answer" in item:
                            faq_pairs.append(
                                {"question": str(item["question"]), "answer": str(item["answer"])}
                            )
                else:
                    raise ProcessorError("FAQ JSON must be an array of {question, answer} objects")
            except json.JSONDecodeError:
                # Fall through to text parsing
                faq_pairs = self._parse_text_faq(stripped)
        else:
            faq_pairs = self._parse_text_faq(stripped)

        if not faq_pairs:
            raise ProcessorError("No FAQ pairs could be parsed from input")

        chunks: list[ProcessedChunk] = []
        full_text_parts: list[str] = []
        for i, pair in enumerate(faq_pairs):
            chunk_text = f"Q: {pair['question']}\nA: {pair['answer']}"
            chunks.append(
                ProcessedChunk(
                    text=chunk_text,
                    position=i,
                    heading_path=["FAQ"],
                    metadata={
                        "faq_question": pair["question"],
                        "faq_answer": pair["answer"],
                        "faq_index": i,
                    },
                )
            )
            full_text_parts.append(chunk_text)

        return ProcessedDocument(
            text="\n\n".join(full_text_parts),
            chunks=chunks,
            title=meta.get("title") or "FAQ",
            language=meta.get("language", "en"),
            metadata={**meta, "faq_count": len(faq_pairs)},
        )

    async def process_bytes(
        self,
        data: bytes,
        filename: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ProcessedDocument:
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            text = data.decode("latin-1")
        return await self.process_text(text, filename=filename, metadata=metadata)

    @staticmethod
    def _parse_text_faq(text: str) -> list[dict[str, str]]:
        """Parse plain-text FAQ: 'Q: question\nA: answer' blocks."""
        pairs: list[dict[str, str]] = []
        # Match Q: ... A: ... until next Q: or end
        pattern = re.compile(
            r"Q:\s*(.+?)\s*\n+A:\s*(.+?)(?=\n+\s*Q:|\Z)",
            re.DOTALL,
        )
        for match in pattern.finditer(text):
            question = match.group(1).strip()
            answer = match.group(2).strip()
            if question and answer:
                pairs.append({"question": question, "answer": answer})
        return pairs
