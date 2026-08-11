"""PDF processor — .pdf files (requires pypdf)."""

import io
from typing import Any

from app.ai.document_processors.base import (
    DocumentProcessor,
    ProcessedChunk,
    ProcessedDocument,
    ProcessorError,
)


class PDFProcessor(DocumentProcessor):
    """Process PDF files using pypdf.

    Extracts text page-by-page. Each page becomes a chunk (with page number).
    Pages larger than max_chars are split further by paragraphs.

    OCR support: if a page has no extractable text (likely scanned PDF),
    the processor emits an empty chunk with metadata flag `needs_ocr=True`.
    The RAG pipeline can route such chunks to an OCR backend when configured
    (settings.ENABLE_OCR). For now, OCR is a documented future enhancement.
    """

    @property
    def supported_formats(self) -> list[str]:
        return ["pdf"]

    async def process_bytes(
        self,
        data: bytes,
        filename: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ProcessedDocument:
        meta = dict(metadata or {})
        try:
            from pypdf import PdfReader
        except ImportError as e:  # pragma: no cover — optional dep
            raise ProcessorError(
                "pypdf not installed. Run: pip install pypdf"
            ) from e

        try:
            reader = PdfReader(io.BytesIO(data))
        except Exception as e:
            raise ProcessorError(f"Cannot read PDF: {e}") from e

        chunks: list[ProcessedChunk] = []
        full_text_parts: list[str] = []
        needs_ocr = False

        for page_num, page in enumerate(reader.pages, start=1):
            try:
                page_text = page.extract_text() or ""
            except Exception:
                page_text = ""
            if not page_text.strip():
                # Possibly a scanned page — flag for OCR
                needs_ocr = True
                continue
            full_text_parts.append(page_text)
            # Chunk within the page if too large
            page_chunks = self._split_page(page_text, page_num)
            chunks.extend(page_chunks)

        full_text = "\n\n".join(full_text_parts)
        title = meta.get("title") or filename or "Untitled PDF"

        return ProcessedDocument(
            text=full_text,
            chunks=chunks,
            title=title,
            language=meta.get("language", "en"),
            page_count=len(reader.pages),
            metadata={
                **meta,
                "needs_ocr": needs_ocr,
                "page_count": len(reader.pages),
            },
        )

    def _split_page(
        self,
        text: str,
        page_num: int,
        max_chars: int = 1000,
        overlap: int = 200,
    ) -> list[ProcessedChunk]:
        """Split a single page's text into chunks."""
        if not text.strip():
            return []
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        chunks: list[ProcessedChunk] = []
        current = ""
        position = 0
        for para in paragraphs:
            if len(current) + len(para) + 2 > max_chars and current:
                chunks.append(
                    ProcessedChunk(
                        text=current.strip(),
                        page=page_num,
                        position=position,
                    )
                )
                position += 1
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
                    page=page_num,
                    position=position,
                )
            )
        return chunks

    async def process_text(
        self,
        text: str,
        filename: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ProcessedDocument:
        raise ProcessorError(
            "PDFProcessor cannot process plain text — use process_bytes() with raw PDF data"
        )
