"""Smart chunker — converts ProcessedDocument chunks into final indexed chunks.

Responsibilities:
- Apply configurable chunk size / overlap (settings.MAX_CHUNK_SIZE, CHUNK_OVERLAP)
- Detect language per chunk (simple heuristic)
- Detect and remove duplicate chunks (hash + similarity)
- Compute token count (heuristic: 1 token ≈ 4 chars)
- Generate stable content hashes for dedup
- Respect MIN_CHUNK_SIZE (merge undersized chunks with neighbors)
"""

import hashlib
import re
from dataclasses import dataclass, field

from app.ai.document_processors.base import ProcessedChunk
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class FinalChunk:
    """A final chunk ready for embedding + indexing."""

    text: str
    heading_path: list[str] = field(default_factory=list)
    page: int | None = None
    position: int | None = None
    char_count: int = 0
    token_count: int = 0
    language: str = "en"
    content_sha256: str = ""
    metadata: dict = field(default_factory=dict)


class SmartChunker:
    """Convert processor-emitted chunks into final indexed chunks."""

    def __init__(
        self,
        max_chunk_size: int | None = None,
        min_chunk_size: int | None = None,
        chunk_overlap: int | None = None,
        strategy: str | None = None,
        dedup_threshold: float | None = None,
    ) -> None:
        self.max_chunk_size = max_chunk_size or settings.MAX_CHUNK_SIZE
        self.min_chunk_size = min_chunk_size or settings.MIN_CHUNK_SIZE
        self.chunk_overlap = chunk_overlap or settings.CHUNK_OVERLAP
        self.strategy = strategy or settings.CHUNKING_STRATEGY
        self.dedup_threshold = dedup_threshold or settings.DUPLICATE_SIMILARITY_THRESHOLD

    def chunk(self, raw_chunks: list[ProcessedChunk], default_language: str = "en") -> list[FinalChunk]:
        """Convert raw chunks into final chunks.

        Steps:
        1. Refine each raw chunk (split oversized, merge undersized)
        2. Detect language per chunk
        3. Compute content hashes
        4. Remove duplicates (exact hash + near-duplicate similarity)
        """
        # Step 1: Refine
        refined: list[FinalChunk] = []
        for raw in raw_chunks:
            refined.extend(self._refine_chunk(raw, default_language))

        # Step 2: Merge undersized chunks with neighbors
        refined = self._merge_undersized(refined)

        # Step 3: Compute hashes + language (already done in _refine_chunk)
        # Step 4: Dedup
        refined = self._dedup(refined)

        return refined

    def _refine_chunk(
        self,
        raw: ProcessedChunk,
        default_language: str,
    ) -> list[FinalChunk]:
        """Split oversized chunks; pass through appropriately-sized ones."""
        text = raw.text.strip()
        if not text:
            return []
        if len(text) <= self.max_chunk_size:
            return [self._to_final(raw, text, default_language)]
        # Split oversized by paragraphs
        return self._split_long(raw, text, default_language)

    def _split_long(
        self,
        raw: ProcessedChunk,
        text: str,
        default_language: str,
    ) -> list[FinalChunk]:
        """Split a long chunk by paragraphs with overlap."""
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        chunks: list[FinalChunk] = []
        current = ""
        position = raw.position or 0
        sub_index = 0
        for para in paragraphs:
            # If a single paragraph exceeds max size, hard-split it
            if len(para) > self.max_chunk_size:
                # Flush current
                if current.strip():
                    chunks.append(
                        self._to_final_with_text(
                            raw,
                            current.strip(),
                            default_language,
                            position + sub_index,
                        )
                    )
                    sub_index += 1
                    current = ""
                # Hard-split the long paragraph
                for i in range(0, len(para), self.max_chunk_size - self.chunk_overlap):
                    piece = para[i : i + self.max_chunk_size]
                    if piece.strip():
                        chunks.append(
                            self._to_final_with_text(
                                raw,
                                piece.strip(),
                                default_language,
                                position + sub_index,
                            )
                        )
                        sub_index += 1
                continue
            # Normal case
            if len(current) + len(para) + 2 > self.max_chunk_size and current:
                chunks.append(
                    self._to_final_with_text(
                        raw,
                        current.strip(),
                        default_language,
                        position + sub_index,
                    )
                )
                sub_index += 1
                if self.chunk_overlap > 0 and len(current) > self.chunk_overlap:
                    current = current[-self.chunk_overlap :] + "\n\n" + para
                else:
                    current = para
            else:
                current = current + "\n\n" + para if current else para
        if current.strip():
            chunks.append(
                self._to_final_with_text(
                    raw,
                    current.strip(),
                    default_language,
                    position + sub_index,
                )
            )
        return chunks

    def _merge_undersized(self, chunks: list[FinalChunk]) -> list[FinalChunk]:
        """Merge consecutive chunks that are below MIN_CHUNK_SIZE."""
        if not chunks:
            return []
        merged: list[FinalChunk] = [chunks[0]]
        for chunk in chunks[1:]:
            prev = merged[-1]
            if (
                len(prev.text) < self.min_chunk_size
                and len(prev.text) + len(chunk.text) + 2 <= self.max_chunk_size
            ):
                # Merge
                merged[-1] = FinalChunk(
                    text=prev.text + "\n\n" + chunk.text,
                    heading_path=prev.heading_path or chunk.heading_path,
                    page=prev.page or chunk.page,
                    position=prev.position,
                    char_count=len(prev.text) + 2 + len(chunk.text),
                    token_count=(len(prev.text) + 2 + len(chunk.text)) // 4,
                    language=prev.language,
                    content_sha256="",  # recompute below
                    metadata={**prev.metadata, **chunk.metadata},
                )
                merged[-1].content_sha256 = self._hash(merged[-1].text)
            else:
                merged.append(chunk)
        return merged

    def _dedup(self, chunks: list[FinalChunk]) -> list[FinalChunk]:
        """Remove exact duplicates (by hash) and near-duplicates (by similarity)."""
        # Exact dedup by hash
        seen_hashes: set[str] = set()
        no_exact: list[FinalChunk] = []
        for chunk in chunks:
            if chunk.content_sha256 in seen_hashes:
                logger.debug("chunk_dedup_exact", hash=chunk.content_sha256[:16])
                continue
            seen_hashes.add(chunk.content_sha256)
            no_exact.append(chunk)
        # Near-duplicate dedup (only if enabled)
        if not settings.ENABLE_DUPLICATE_CHUNK_REMOVAL:
            return no_exact
        return self._near_dedup(no_exact)

    def _near_dedup(self, chunks: list[FinalChunk]) -> list[FinalChunk]:
        """Remove near-duplicates using Jaccard similarity on word sets."""
        if len(chunks) < 2:
            return chunks
        result: list[FinalChunk] = []
        word_sets: list[set[str]] = []
        for chunk in chunks:
            words = set(re.findall(r"\w+", chunk.text.lower()))
            word_sets.append(words)
        kept_indices: list[int] = []
        for i, chunk in enumerate(chunks):
            is_dup = False
            for j in kept_indices:
                # Only compare against kept chunks
                sim = self._jaccard(word_sets[i], word_sets[j])
                if sim >= self.dedup_threshold:
                    logger.debug(
                        "chunk_dedup_near",
                        similarity=sim,
                        kept_idx=j,
                        dup_idx=i,
                    )
                    is_dup = True
                    break
            if not is_dup:
                kept_indices.append(i)
                result.append(chunk)
        return result

    @staticmethod
    def _jaccard(a: set[str], b: set[str]) -> float:
        if not a and not b:
            return 1.0
        if not a or not b:
            return 0.0
        intersection = a & b
        union = a | b
        return len(intersection) / len(union)

    def _to_final(
        self,
        raw: ProcessedChunk,
        text: str,
        default_language: str,
    ) -> FinalChunk:
        return self._to_final_with_text(raw, text, default_language, raw.position or 0)

    def _to_final_with_text(
        self,
        raw: ProcessedChunk,
        text: str,
        default_language: str,
        position: int,
    ) -> FinalChunk:
        language = self._detect_language(text) or default_language
        return FinalChunk(
            text=text,
            heading_path=list(raw.heading_path),
            page=raw.page,
            position=position,
            char_count=len(text),
            token_count=max(1, len(text) // 4),
            language=language,
            content_sha256=self._hash(text),
            metadata=dict(raw.metadata),
        )

    @staticmethod
    def _hash(text: str) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    @staticmethod
    def _detect_language(text: str) -> str:
        """Simple language detection based on Unicode script ranges.

        For production, integrate `langdetect` or `fasttext-langid`.
        This heuristic handles the most common cases (en, hi, bn, ta, zh, ja, ar).
        """
        if not text:
            return "en"
        # Count chars in different scripts
        devanagari = sum(1 for c in text if "\u0900" <= c <= "\u097F")  # Hindi, Marathi
        bengali = sum(1 for c in text if "\u0980" <= c <= "\u09FF")
        tamil = sum(1 for c in text if "\u0B80" <= c <= "\u0BFF")
        cjk = sum(1 for c in text if "\u4E00" <= c <= "\u9FFF")
        hiragana = sum(1 for c in text if "\u3040" <= c <= "\u309F")
        arabic = sum(1 for c in text if "\u0600" <= c <= "\u06FF")
        # Latin is the default fallback
        latin = sum(1 for c in text if c.isalpha() and ord(c) < 0x0250)
        total = devanagari + bengali + tamil + cjk + hiragana + arabic + latin
        if total == 0:
            return "en"
        if devanagari / total > 0.3:
            return "hi"
        if bengali / total > 0.3:
            return "bn"
        if tamil / total > 0.3:
            return "ta"
        if cjk / total > 0.3:
            return "zh"
        if hiragana / total > 0.1:
            return "ja"
        if arabic / total > 0.3:
            return "ar"
        return "en"
