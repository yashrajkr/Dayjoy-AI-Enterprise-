"""JSON processor — .json files (objects and arrays of objects)."""

import json
from typing import Any

from app.ai.document_processors.base import (
    DocumentProcessor,
    ProcessedChunk,
    ProcessedDocument,
    ProcessorError,
)


class JSONProcessor(DocumentProcessor):
    """Process JSON files.

    Each top-level object (or array element) becomes a chunk. Nested objects
    are flattened into "key.path: value" lines for better retrieval.
    """

    @property
    def supported_formats(self) -> list[str]:
        return ["json"]

    async def process_bytes(
        self,
        data: bytes,
        filename: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ProcessedDocument:
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError as e:
            raise ProcessorError(f"Cannot decode JSON as UTF-8: {e}") from e
        return await self.process_text(text, filename=filename, metadata=metadata)

    async def process_text(
        self,
        text: str,
        filename: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ProcessedDocument:
        meta = dict(metadata or {})
        try:
            data = json.loads(text)
        except json.JSONDecodeError as e:
            raise ProcessorError(f"Invalid JSON: {e}") from e

        chunks: list[ProcessedChunk] = []
        if isinstance(data, list):
            for i, item in enumerate(data):
                chunk_text = self._render_item(item)
                chunks.append(
                    ProcessedChunk(
                        text=chunk_text,
                        position=i,
                        metadata={"array_index": i},
                    )
                )
        elif isinstance(data, dict):
            # If dict has a natural "items" list, chunk each item
            if "items" in data and isinstance(data["items"], list):
                # Top-level metadata as first chunk
                meta_text = self._render_item({k: v for k, v in data.items() if k != "items"})
                if meta_text.strip():
                    chunks.append(
                        ProcessedChunk(
                            text=meta_text,
                            position=0,
                            metadata={"section": "metadata"},
                        )
                    )
                for i, item in enumerate(data["items"]):
                    chunk_text = self._render_item(item)
                    chunks.append(
                        ProcessedChunk(
                            text=chunk_text,
                            position=i + 1,
                            metadata={"array_index": i, "section": "items"},
                        )
                    )
            else:
                # Treat the whole dict as one chunk (or split by top-level keys)
                for i, (key, value) in enumerate(data.items()):
                    chunk_text = f"{key}:\n{self._render_item(value)}"
                    chunks.append(
                        ProcessedChunk(
                            text=chunk_text,
                            position=i,
                            metadata={"top_key": key},
                        )
                    )
        else:
            # Scalar — single chunk
            chunks.append(ProcessedChunk(text=str(data), position=0))

        return ProcessedDocument(
            text=json.dumps(data, indent=2, ensure_ascii=False),
            chunks=chunks,
            title=meta.get("title") or filename or "Untitled JSON",
            language=meta.get("language", "en"),
            metadata=meta,
        )

    @staticmethod
    def _render_item(item: Any, prefix: str = "") -> str:
        """Flatten a JSON object into 'key.path: value' lines."""
        lines: list[str] = []
        if isinstance(item, dict):
            for k, v in item.items():
                key = f"{prefix}.{k}" if prefix else k
                if isinstance(v, (dict, list)):
                    lines.append(JSONProcessor._render_item(v, key))
                else:
                    lines.append(f"{key}: {v}")
        elif isinstance(item, list):
            for i, v in enumerate(item):
                key = f"{prefix}[{i}]"
                if isinstance(v, (dict, list)):
                    lines.append(JSONProcessor._render_item(v, key))
                else:
                    lines.append(f"{key}: {v}")
        else:
            lines.append(f"{prefix or 'value'}: {item}")
        return "\n".join(lines)
