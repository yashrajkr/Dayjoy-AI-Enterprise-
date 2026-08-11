"""Document processor package — multi-format ingestion.

Each processor extracts plain text + structural metadata from a single format:
- TextProcessor    → .txt
- MarkdownProcessor → .md
- CSVProcessor     → .csv
- JSONProcessor    → .json
- HTMLProcessor    → .html (single page; for crawling see WebProcessor)
- PDFProcessor     → .pdf (requires pypdf)
- DOCXProcessor    → .docx (requires python-docx)
- DOCProcessor     → .doc (legacy Word — requires OCR / textract; placeholder)
- WebProcessor     → URL → fetch HTML → parse → follow links (bounded crawl)
- FAQProcessor     → structured Q&A pairs (manual entry)

Every processor returns a `ProcessedDocument` containing:
- text: the extracted plain text
- chunks: pre-split chunks (with heading_path, page, position)
- metadata: title, language, page_count, source-specific info

To add a new processor:
1. Create `xxx_processor.py` implementing `DocumentProcessor`
2. Register it in PROCESSOR_REGISTRY in `__init__.py`
3. Add the format to ALLOWED_UPLOAD_EXTENSIONS / MIME types in config
"""

from app.ai.document_processors.base import (
    DocumentProcessor,
    ProcessedChunk,
    ProcessedDocument,
    ProcessorError,
)
from app.ai.document_processors.csv_processor import CSVProcessor
from app.ai.document_processors.docx_processor import DOCXProcessor
from app.ai.document_processors.faq_processor import FAQProcessor
from app.ai.document_processors.html_processor import HTMLProcessor
from app.ai.document_processors.json_processor import JSONProcessor
from app.ai.document_processors.markdown_processor import MarkdownProcessor
from app.ai.document_processors.pdf_processor import PDFProcessor
from app.ai.document_processors.text_processor import TextProcessor
from app.ai.document_processors.web_processor import WebProcessor

# ===== Registry =====
# Maps format string (lowercase) → processor class
PROCESSOR_REGISTRY: dict[str, type[DocumentProcessor]] = {
    "txt": TextProcessor,
    "text": TextProcessor,
    "md": MarkdownProcessor,
    "markdown": MarkdownProcessor,
    "csv": CSVProcessor,
    "json": JSONProcessor,
    "html": HTMLProcessor,
    "htm": HTMLProcessor,
    "pdf": PDFProcessor,
    "docx": DOCXProcessor,
    "web": WebProcessor,
    "faq": FAQProcessor,
}


def get_processor(format: str) -> DocumentProcessor:
    """Get a processor instance for the given format.

    Args:
        format: Lowercase format string (e.g., 'pdf', 'docx', 'txt', 'web').

    Returns:
        A DocumentProcessor instance.

    Raises:
        ProcessorError: If the format is not supported.
    """
    fmt = format.lower().strip()
    if fmt not in PROCESSOR_REGISTRY:
        supported = sorted(PROCESSOR_REGISTRY.keys())
        raise ProcessorError(
            f"Unsupported document format: {format!r}. Supported: {supported}"
        )
    return PROCESSOR_REGISTRY[fmt]()


def detect_format(filename: str | None, mime_type: str | None = None) -> str:
    """Detect document format from filename and/or MIME type.

    Returns the canonical format string (e.g., 'pdf', 'docx', 'txt').
    Raises ProcessorError if format cannot be determined.
    """
    # Try filename extension first
    if filename:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext in PROCESSOR_REGISTRY:
            return ext
    # Fall back to MIME type
    if mime_type:
        mime_map = {
            "application/pdf": "pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
            "text/plain": "txt",
            "text/markdown": "md",
            "text/csv": "csv",
            "application/json": "json",
            "text/html": "html",
            "application/msword": "docx",  # we'll handle .doc as docx attempt
        }
        if mime_type in mime_map:
            return mime_map[mime_type]
    raise ProcessorError(
        f"Cannot detect document format from filename={filename!r} mime={mime_type!r}"
    )


__all__ = [
    "PROCESSOR_REGISTRY",
    "DocumentProcessor",
    "ProcessedChunk",
    "ProcessedDocument",
    "ProcessorError",
    "detect_format",
    "get_processor",
]
