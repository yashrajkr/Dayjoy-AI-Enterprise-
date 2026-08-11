"""Plain text processor — .txt files and raw text input."""

from app.ai.document_processors.base import ProcessedDocument


class TextProcessor:
    """Process plain text files."""

    @property
    def supported_formats(self) -> list[str]:
        return ["txt", "text"]

    async def process_bytes(
        self,
        data: bytes,
        filename: str | None = None,
        metadata: dict | None = None,
    ) -> ProcessedDocument:
        # Try UTF-8, fall back to latin-1
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            text = data.decode("latin-1")
        return await self.process_text(text, filename=filename, metadata=metadata)

    async def process_text(
        self,
        text: str,
        filename: str | None = None,
        metadata: dict | None = None,
    ) -> ProcessedDocument:
        meta = dict(metadata or {})
        chunks = self._split_into_chunks(text)
        return ProcessedDocument(
            text=text,
            chunks=chunks,
            title=meta.get("title") or filename or "Untitled",
            language=meta.get("language", "en"),
            metadata=meta,
        )

    @staticmethod
    def _split_into_chunks(
        text: str,
        max_chars: int = 1000,
        overlap: int = 200,
    ) -> list:
        from app.ai.document_processors.base import ProcessedChunk

        if not text:
            return []
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        chunks = []
        current = ""
        position = 0
        for para in paragraphs:
            if len(current) + len(para) + 2 > max_chars and current:
                chunks.append(
                    ProcessedChunk(
                        text=current.strip(),
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
                    position=position,
                )
            )
        return chunks
