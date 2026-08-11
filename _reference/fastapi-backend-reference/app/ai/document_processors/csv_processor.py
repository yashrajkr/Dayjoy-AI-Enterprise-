"""CSV processor — .csv files with row-aware chunking."""

import csv
import io
from typing import Any

from app.ai.document_processors.base import (
    DocumentProcessor,
    ProcessedChunk,
    ProcessedDocument,
    ProcessorError,
)


class CSVProcessor(DocumentProcessor):
    """Process CSV files.

    Each row becomes a chunk with the row index as position. The chunk text
    is a human-readable rendering of the row (column: value pairs). The header
    row is included as context in each chunk.
    """

    @property
    def supported_formats(self) -> list[str]:
        return ["csv"]

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
        try:
            reader = csv.DictReader(io.StringIO(text))
            headers = reader.fieldnames or []
            rows = list(reader)
        except Exception as e:
            raise ProcessorError(f"Cannot parse CSV: {e}") from e

        chunks: list[ProcessedChunk] = []
        full_text_lines: list[str] = []
        if headers:
            full_text_lines.append(",".join(headers))

        for i, row in enumerate(rows):
            # Render row as "column: value" pairs
            lines = [f"{h}: {row.get(h, '')}" for h in headers]
            chunk_text = "\n".join(lines)
            chunks.append(
                ProcessedChunk(
                    text=chunk_text,
                    position=i,
                    metadata={"row_index": i, "headers": list(headers)},
                )
            )
            full_text_lines.append(",".join(row.get(h, "") for h in headers))

        full_text = "\n".join(full_text_lines)
        return ProcessedDocument(
            text=full_text,
            chunks=chunks,
            title=meta.get("title") or filename or "Untitled CSV",
            language=meta.get("language", "en"),
            metadata={**meta, "row_count": len(rows), "columns": list(headers)},
        )
