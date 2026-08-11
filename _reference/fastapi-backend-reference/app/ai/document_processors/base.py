"""Document processor exceptions + shared data models."""

from dataclasses import dataclass, field
from typing import Any

from app.core.exceptions import AppError


class ProcessorError(AppError):
    """Base exception for all document processor errors."""

    def __init__(self, message: str = "Document processor error") -> None:
        super().__init__(message, status_code=400, error_type="processor_error")


@dataclass
class ProcessedChunk:
    """A pre-split chunk emitted by a processor.

    The RAG pipeline may further refine (merge small chunks, split large ones)
    before embedding.
    """

    text: str
    heading_path: list[str] = field(default_factory=list)
    page: int | None = None
    position: int | None = None  # 0-based offset within the document
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ProcessedDocument:
    """Result of processing a document.

    Contains the extracted plain text, structural chunks, and metadata.
    """

    text: str
    chunks: list[ProcessedChunk] = field(default_factory=list)
    title: str | None = None
    language: str = "en"
    page_count: int | None = None
    char_count: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.char_count == 0 and self.text:
            self.char_count = len(self.text)


class DocumentProcessor:
    """Abstract base for all document processors.

    Subclasses must implement:
        - process_bytes() → process raw file bytes
        - process_text()  → process plain text (some processors support this)
        - supported_formats → list of format strings this processor handles
    """

    @property
    def supported_formats(self) -> list[str]:
        """Formats this processor supports (e.g., ['pdf'])."""
        raise NotImplementedError

    async def process_bytes(
        self,
        data: bytes,
        filename: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ProcessedDocument:
        """Process raw file bytes.

        Default implementation decodes bytes as UTF-8 text and calls process_text.
        Subclasses for binary formats (PDF, DOCX) MUST override.
        """
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            # Try latin-1 as a fallback (never fails)
            text = data.decode("latin-1")
        return await self.process_text(text, filename=filename, metadata=metadata)

    async def process_text(
        self,
        text: str,
        filename: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ProcessedDocument:
        """Process plain text.

        Subclasses MAY override to add format-specific structural parsing
        (e.g., MarkdownProcessor detects headings).
        """
        meta = dict(metadata or {})
        chunks = self._split_into_chunks(text)
        return ProcessedDocument(
            text=text,
            chunks=chunks,
            title=meta.get("title") or filename,
            language=meta.get("language", "en"),
            metadata=meta,
        )

    # ===== Shared chunking helpers =====

    @staticmethod
    def _split_into_chunks(
        text: str,
        max_chars: int = 1000,
        overlap: int = 200,
    ) -> list[ProcessedChunk]:
        """Split text into character-bounded chunks with overlap.

        This is a simple paragraph-aware splitter used as the default.
        Format-specific processors (MarkdownProcessor, PDFProcessor) override
        with structural-aware chunking.
        """
        if not text:
            return []
        # Split on double newlines (paragraphs)
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        chunks: list[ProcessedChunk] = []
        current = ""
        position = 0
        for para in paragraphs:
            if len(current) + len(para) + 2 > max_chars and current:
                chunks.append(
                    ProcessedChunk(
                        text=current.strip(),
                        position=position,
                        char_count=len(current.strip()),
                    )
                )
                position += 1
                # Start new chunk with overlap from end of previous
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
                    position=position,
                    char_count=len(current.strip()),
                )
            )
        return chunks
