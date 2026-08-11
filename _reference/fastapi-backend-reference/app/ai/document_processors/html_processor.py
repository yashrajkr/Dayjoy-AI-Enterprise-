"""HTML processor — .html files (single-page parsing, not crawling)."""

import re
from typing import Any

from app.ai.document_processors.base import (
    DocumentProcessor,
    ProcessedChunk,
    ProcessedDocument,
    ProcessorError,
)


class HTMLProcessor(DocumentProcessor):
    """Process HTML files.

    Strips tags, extracts text, and detects headings (h1-h6) for structural
    chunking. For crawling multiple pages, use WebProcessor instead.
    """

    @property
    def supported_formats(self) -> list[str]:
        return ["html", "htm"]

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

    async def process_text(
        self,
        text: str,
        filename: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ProcessedDocument:
        meta = dict(metadata or {})
        # Extract title
        title = meta.get("title")
        if not title:
            title_match = re.search(r"<title[^>]*>(.+?)</title>", text, re.IGNORECASE | re.DOTALL)
            if title_match:
                title = re.sub(r"\s+", " ", title_match.group(1)).strip()
        if not title:
            title = filename or "Untitled HTML"

        # Parse HTML structure into chunks
        chunks = self._parse_html(text)
        # Reconstruct plain text from chunks
        plain_text = "\n\n".join(c.text for c in chunks) if chunks else self._strip_tags(text)
        return ProcessedDocument(
            text=plain_text,
            chunks=chunks,
            title=title,
            language=meta.get("language", "en"),
            metadata=meta,
        )

    def _parse_html(self, html: str) -> list[ProcessedChunk]:
        """Parse HTML into chunks based on heading tags."""
        # Remove script and style content
        html_clean = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.IGNORECASE | re.DOTALL)
        html_clean = re.sub(r"<style[^>]*>.*?</style>", "", html_clean, flags=re.IGNORECASE | re.DOTALL)

        # Split by heading tags (h1-h6), keeping the headings
        parts = re.split(r"(<h[1-6][^>]*>.*?</h[1-6]>)", html_clean, flags=re.IGNORECASE | re.DOTALL)

        chunks: list[ProcessedChunk] = []
        current_heading_path: list[str] = []
        current_text_parts: list[str] = []
        position = 0

        heading_re = re.compile(r"<h([1-6])[^>]*>(.*?)</h\1>", re.IGNORECASE | re.DOTALL)

        def flush() -> None:
            nonlocal position
            joined = "\n".join(current_text_parts)
            plain = self._strip_tags(joined).strip()
            if plain:
                chunks.append(
                    ProcessedChunk(
                        text=plain,
                        heading_path=list(current_heading_path),
                        position=position,
                    )
                )
                position += 1
            current_text_parts.clear()

        for part in parts:
            heading_match = heading_re.search(part)
            if heading_match:
                # Flush previous
                flush()
                level = int(heading_match.group(1))
                heading_text = self._strip_tags(heading_match.group(2)).strip()
                current_heading_path = current_heading_path[: level - 1]
                current_heading_path.append(heading_text)
                current_text_parts.append(heading_text)
            else:
                current_text_parts.append(part)

        flush()
        return chunks

    @staticmethod
    def _strip_tags(html: str) -> str:
        """Strip HTML tags and decode common entities."""
        # Remove tags
        text = re.sub(r"<[^>]+>", " ", html)
        # Decode common entities
        entities = {
            "&nbsp;": " ",
            "&amp;": "&",
            "&lt;": "<",
            "&gt;": ">",
            "&quot;": '"',
            "&#39;": "'",
            "&apos;": "'",
        }
        for entity, char in entities.items():
            text = text.replace(entity, char)
        # Collapse whitespace
        text = re.sub(r"\s+", " ", text)
        return text.strip()
