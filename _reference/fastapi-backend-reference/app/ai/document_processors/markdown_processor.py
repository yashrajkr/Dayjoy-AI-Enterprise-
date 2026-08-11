"""Markdown processor — .md files with heading-aware chunking."""

import re
from typing import Any

from app.ai.document_processors.base import (
    DocumentProcessor,
    ProcessedChunk,
    ProcessedDocument,
    ProcessorError,
)


class MarkdownProcessor(DocumentProcessor):
    """Process Markdown files with heading-aware chunking.

    Each chunk carries a `heading_path` list representing the heading hierarchy
    leading to it (e.g., ["Installation", "Docker", "Prerequisites"]).
    """

    @property
    def supported_formats(self) -> list[str]:
        return ["md", "markdown"]

    async def process_text(
        self,
        text: str,
        filename: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ProcessedDocument:
        meta = dict(metadata or {})
        # Extract title from first H1 if present
        title = meta.get("title")
        if not title:
            h1_match = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
            if h1_match:
                title = h1_match.group(1).strip()
        if not title:
            title = filename or "Untitled"

        chunks = self._chunk_markdown(text)
        return ProcessedDocument(
            text=text,
            chunks=chunks,
            title=title,
            language=meta.get("language", "en"),
            metadata=meta,
        )

    def _chunk_markdown(
        self,
        text: str,
        max_chars: int = 1000,
        overlap: int = 200,
    ) -> list[ProcessedChunk]:
        """Split markdown by headings, respecting max chunk size."""
        lines = text.split("\n")
        chunks: list[ProcessedChunk] = []
        current_heading_path: list[str] = []
        current_section_lines: list[str] = []
        position = 0

        heading_re = re.compile(r"^(#{1,6})\s+(.+)$")

        def flush() -> None:
            nonlocal position
            if not current_section_lines:
                return
            section_text = "\n".join(current_section_lines).strip()
            if not section_text:
                return
            # If the section is larger than max_chars, split further
            if len(section_text) > max_chars:
                sub_chunks = self._split_long_section(
                    section_text, max_chars, overlap, current_heading_path
                )
                for sc in sub_chunks:
                    sc.position = position
                    chunks.append(sc)
                    position += 1
            else:
                chunks.append(
                    ProcessedChunk(
                        text=section_text,
                        heading_path=list(current_heading_path),
                        position=position,
                    )
                )
                position += 1

        for line in lines:
            m = heading_re.match(line)
            if m:
                # Flush previous section
                flush()
                # Update heading path
                level = len(m.group(1))
                heading_text = m.group(2).strip()
                # Truncate path to level-1, then append
                current_heading_path = current_heading_path[: level - 1]
                current_heading_path.append(heading_text)
                # Start new section WITH the heading line (so chunks include their heading)
                current_section_lines = [line]
            else:
                current_section_lines.append(line)

        flush()
        return chunks

    @staticmethod
    def _split_long_section(
        text: str,
        max_chars: int,
        overlap: int,
        heading_path: list[str],
    ) -> list[ProcessedChunk]:
        """Split an oversized section by paragraphs with overlap."""
        paragraphs = [p for p in text.split("\n\n") if p.strip()]
        chunks: list[ProcessedChunk] = []
        current = ""
        for para in paragraphs:
            if len(current) + len(para) + 2 > max_chars and current:
                chunks.append(
                    ProcessedChunk(
                        text=current.strip(),
                        heading_path=list(heading_path),
                    )
                )
                if overlap > 0 and len(current) > overlap:
                    current = current[-overlap:] + "\n\n" + para
                else:
                    current = para
            else:
                current = current + "\n\n" + para if current else para
        if current.strip():
            chunks.append(
                ProcessedChunk(
                    text=current.strip(),
                    heading_path=list(heading_path),
                )
            )
        return chunks

    async def process_bytes(
        self,
        data: bytes,
        filename: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ProcessedDocument:
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError as e:
            raise ProcessorError(f"Cannot decode markdown as UTF-8: {e}") from e
        return await self.process_text(text, filename=filename, metadata=metadata)
