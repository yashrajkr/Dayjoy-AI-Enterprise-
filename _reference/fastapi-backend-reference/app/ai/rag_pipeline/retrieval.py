"""Retrieval pipeline — hybrid search + re-ranking + context assembly.

Steps:
1. Receive query + filters (organization_id REQUIRED)
2. Generate query embedding via the configured embedding provider
3. Vector search in the vector store (semantic)
4. Keyword search via Postgres full-text search (BM25-style ranking)
5. Fuse semantic + keyword scores (hybrid)
6. Re-rank by combined score
7. Apply MAX_CONTEXT_CHUNKS / MAX_CONTEXT_TOKENS limits
8. Build LLM context (numbered citations + source attribution)
9. Log search analytics

The result includes the assembled context string, the citations, and the
confidence score (for hallucination prevention).
"""

import time
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embeddings import get_embedding_provider
from app.ai.rag_pipeline.citations import build_citation, format_citations_for_llm
from app.ai.rag_pipeline.confidence import (
    build_fallback_response,
    compute_confidence,
    should_fallback,
)
from app.ai.vector_store import VectorSearchFilter, VectorStore, get_vector_store
from app.core.config import settings
from app.core.logging import get_logger
from app.models.knowledge import DocumentChunk, KnowledgeDocument, RAGSearchLog

logger = get_logger(__name__)


class RetrievalPipeline:
    """Hybrid retrieval + re-ranking pipeline."""

    def __init__(
        self,
        db: AsyncSession,
        vector_store: VectorStore | None = None,
        embedding_provider: Any = None,
    ) -> None:
        self.db = db
        self.vector_store = vector_store or get_vector_store()
        self.embedding_provider = embedding_provider or get_embedding_provider()

    async def retrieve(
        self,
        query: str,
        organization_id: uuid.UUID,
        *,
        document_ids: list[str] | None = None,
        categories: list[str] | None = None,
        tags: list[str] | None = None,
        languages: list[str] | None = None,
        source_ids: list[str] | None = None,
        top_k: int | None = None,
        rerank_top_k: int | None = None,
        max_context_tokens: int | None = None,
        user_id: uuid.UUID | None = None,
        conversation_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        """Run the full retrieval pipeline.

        Returns:
            {
                "query": str,
                "results": [{chunk, document, score, citation}],
                "citations": [...],
                "context": str (formatted for LLM),
                "confidence": float,
                "was_fallback": bool,
                "fallback_reason": str | None,
                "answer": str | None,   # only set if fallback
                "latency_ms": int,
                "retrieval_latency_ms": int,
                "reranking_latency_ms": int,
            }
        """
        start = time.perf_counter()
        org_id_str = str(organization_id)

        # 1. Build filter
        filter_ = VectorSearchFilter(
            organization_id=org_id_str,
            document_ids=document_ids,
            categories=categories,
            tags=tags,
            languages=languages,
            source_ids=source_ids,
        )

        # 2. Generate query embedding
        t0 = time.perf_counter()
        query_embedding_result = await self.embedding_provider.embed_query(query)
        query_vector = query_embedding_result.vector
        embedding_latency_ms = int((time.perf_counter() - t0) * 1000)

        # 3. Vector search (semantic)
        t1 = time.perf_counter()
        vector_collection = self.vector_store.name  # type: ignore[attr-defined]
        # Use the shared collection name from the vector store
        collection = self._get_collection_name()
        try:
            vector_results = await self.vector_store.search(
                collection=collection,
                query_vector=query_vector,
                filter_=filter_,
                top_k=settings.RETRIEVAL_TOP_K,
            )
        except Exception as e:
            logger.error("vector_search_failed", error=str(e), collection=collection)
            vector_results = []
        retrieval_latency_ms = int((time.perf_counter() - t1) * 1000)

        # 4. Keyword search (Postgres ILIKE / full-text)
        t2 = time.perf_counter()
        keyword_results = await self._keyword_search(query, filter_)
        keyword_latency_ms = int((time.perf_counter() - t2) * 1000)

        # 5. Fuse + re-rank
        t3 = time.perf_counter()
        scored = self._fuse_and_rerank(vector_results, keyword_results, query)
        reranking_latency_ms = int((time.perf_counter() - t3) * 1000)

        # 6. Apply top-K limits
        final_k = rerank_top_k or settings.RERANK_TOP_K
        top_scored = scored[:final_k]

        # 7. Load chunk + document rows for citation rendering
        cited: list[dict[str, Any]] = []
        if top_scored:
            chunk_ids = [r["chunk_id"] for r in top_scored if r.get("chunk_id")]
            chunks_by_id, docs_by_id = await self._load_chunks_and_documents(
                chunk_ids, org_id_str
            )
            for r in top_scored:
                chunk = chunks_by_id.get(r["chunk_id"])
                if not chunk:
                    continue
                doc = docs_by_id.get(str(chunk.document_id))
                if not doc:
                    continue
                citation = build_citation(chunk, doc, r["hybrid_score"])
                cited.append(
                    {
                        "citation": citation,
                        "chunk": chunk,
                        "document": doc,
                        "score": r["hybrid_score"],
                        "semantic_score": r.get("semantic_score", 0.0),
                        "keyword_score": r.get("keyword_score", 0.0),
                    }
                )

        # 8. Confidence scoring + hallucination prevention
        confidence = (
            compute_confidence(cited, query) if settings.ENABLE_CONFIDENCE_SCORING else 1.0
        )
        top_score = top_scored[0]["hybrid_score"] if top_scored else 0.0
        should_fb, reason = should_fallback(confidence, top_score)

        # 9. Assemble context (respect max tokens)
        max_tokens = max_context_tokens or settings.MAX_CONTEXT_TOKENS
        context_str, used_citations = self._assemble_context(cited, max_tokens)

        total_latency_ms = int((time.perf_counter() - start) * 1000)

        result: dict[str, Any] = {
            "query": query,
            "results": [
                {
                    "chunk_id": str(c["chunk"].id),
                    "document_id": str(c["document"].id),
                    "document_title": c["document"].title,
                    "chunk_index": c["chunk"].chunk_index,
                    "page": c["chunk"].page,
                    "text": c["chunk"].text,
                    "heading_path": list(c["chunk"].heading_path or []),
                    "score": c["score"],
                    "semantic_score": c["semantic_score"],
                    "keyword_score": c["keyword_score"],
                    "citation": c["citation"],
                }
                for c in cited
            ],
            "citations": [c["citation"] for c in used_citations],
            "context": context_str,
            "confidence": round(confidence, 4),
            "top_score": round(top_score, 4),
            "was_fallback": should_fb,
            "fallback_reason": reason if should_fb else None,
            "latency_ms": total_latency_ms,
            "embedding_latency_ms": embedding_latency_ms,
            "retrieval_latency_ms": retrieval_latency_ms,
            "reranking_latency_ms": reranking_latency_ms,
            "vector_db": self.vector_store.name,
            "embedding_model": self.embedding_provider.model_id,
            "results_count": len(cited),
        }
        if should_fb:
            fallback = build_fallback_response(confidence, reason, query)
            result["answer"] = fallback["answer"]

        # 10. Log search analytics
        await self._log_search(
            query=query,
            organization_id=org_id_str,
            user_id=str(user_id) if user_id else None,
            conversation_id=str(conversation_id) if conversation_id else None,
            filter_=filter_,
            results_count=len(cited),
            top_score=top_score,
            confidence=confidence,
            citations=used_citations,
            retrieval_latency_ms=retrieval_latency_ms,
            reranking_latency_ms=reranking_latency_ms,
            total_latency_ms=total_latency_ms,
            was_fallback=should_fb,
            was_successful=not should_fb,
            fallback_reason=reason if should_fb else None,
        )

        return result

    # ===== Internal helpers =====

    def _get_collection_name(self) -> str:
        """Get the vector collection name.

        For QdrantVectorStore, we use the shared collection.
        For InMemoryVectorStore, we use a single shared name.
        """
        # Use a per-deployment shared collection name
        return f"{settings.QDRANT_COLLECTION_PREFIX}_shared"

    async def _keyword_search(
        self,
        query: str,
        filter_: VectorSearchFilter,
    ) -> dict[str, float]:
        """Run keyword search via Postgres ILIKE on document_chunks.text.

        Returns a dict mapping chunk_id → keyword_score (0.0-1.0).
        """
        query_words = [w.strip().lower() for w in query.split() if len(w.strip()) > 2]
        if not query_words:
            return {}
        # Build OR conditions for ILIKE on each word
        stmt = select(DocumentChunk).where(
            DocumentChunk.organization_id == filter_.organization_id,
            DocumentChunk.status == "ready",
        )
        if filter_.document_ids is not None:
            stmt = stmt.where(DocumentChunk.document_id.in_(filter_.document_ids))
        if filter_.languages is not None:
            stmt = stmt.where(DocumentChunk.language.in_(filter_.languages))
        try:
            result = await self.db.execute(stmt)
            chunks = result.scalars().all()
        except Exception as e:
            logger.warning("keyword_search_failed", error=str(e))
            return {}

        scores: dict[str, float] = {}
        for chunk in chunks:
            text_lower = chunk.text.lower()
            matches = sum(1 for w in query_words if w in text_lower)
            if matches == 0:
                continue
            # Simple BM25-style score: matched terms / total query terms
            score = matches / len(query_words)
            scores[str(chunk.id)] = score
        return scores

    def _fuse_and_rerank(
        self,
        vector_results: list,
        keyword_results: dict[str, float],
        query: str,
    ) -> list[dict[str, Any]]:
        """Fuse semantic + keyword scores with hybrid weighting.

        Returns a list of dicts sorted by hybrid_score (descending).
        """
        sem_w = settings.HYBRID_SEMANTIC_WEIGHT
        kw_w = settings.HYBRID_KEYWORD_WEIGHT

        # Map chunk_id → semantic score (from vector results)
        sem_scores: dict[str, float] = {}
        for r in vector_results:
            cid = r.payload.get("chunk_id")
            if cid:
                sem_scores[str(cid)] = r.score

        # Union of all chunk IDs
        all_ids = set(sem_scores.keys()) | set(keyword_results.keys())

        scored: list[dict[str, Any]] = []
        for cid in all_ids:
            sem = sem_scores.get(cid, 0.0)
            kw = keyword_results.get(cid, 0.0)
            hybrid = sem_w * sem + kw_w * kw
            scored.append(
                {
                    "chunk_id": cid,
                    "semantic_score": sem,
                    "keyword_score": kw,
                    "hybrid_score": hybrid,
                }
            )
        scored.sort(key=lambda x: x["hybrid_score"], reverse=True)
        return scored

    async def _load_chunks_and_documents(
        self,
        chunk_ids: list[str],
        org_id: str,
    ) -> tuple[dict[str, DocumentChunk], dict[str, KnowledgeDocument]]:
        """Load chunk rows + their parent document rows from Postgres."""
        if not chunk_ids:
            return {}, {}
        # Load chunks (scoped by org for safety)
        stmt = select(DocumentChunk).where(
            DocumentChunk.organization_id == org_id,
            DocumentChunk.id.in_([uuid.UUID(c) for c in chunk_ids]),
            DocumentChunk.status == "ready",
        )
        result = await self.db.execute(stmt)
        chunks = result.scalars().all()
        chunks_by_id: dict[str, DocumentChunk] = {str(c.id): c for c in chunks}

        # Load documents
        doc_ids = list({str(c.document_id) for c in chunks})
        docs_by_id: dict[str, KnowledgeDocument] = {}
        if doc_ids:
            doc_stmt = select(KnowledgeDocument).where(
                KnowledgeDocument.organization_id == org_id,
                KnowledgeDocument.id.in_([uuid.UUID(d) for d in doc_ids]),
                KnowledgeDocument.is_deleted == False,  # noqa: E712
            )
            doc_result = await self.db.execute(doc_stmt)
            for doc in doc_result.scalars().all():
                docs_by_id[str(doc.id)] = doc

        return chunks_by_id, docs_by_id

    def _assemble_context(
        self,
        cited: list[dict[str, Any]],
        max_tokens: int,
    ) -> tuple[str, list[dict[str, Any]]]:
        """Assemble the LLM context string from cited chunks.

        Respects MAX_CONTEXT_TOKENS (heuristic: 1 token ≈ 4 chars).
        Returns (context_string, used_citations).
        """
        if not cited:
            return "", []
        citations_for_llm: list[dict[str, Any]] = []
        total_chars = 0
        max_chars = max_tokens * 4
        for c in cited:
            chunk_text = c["chunk"].text
            citation_block_len = len(chunk_text) + 200  # overhead for citation header
            if total_chars + citation_block_len > max_chars:
                break
            citations_for_llm.append(c["citation"])
            total_chars += citation_block_len
        context_str = format_citations_for_llm(citations_for_llm)
        return context_str, cited[: len(citations_for_llm)]

    async def _log_search(
        self,
        *,
        query: str,
        organization_id: str,
        user_id: str | None,
        conversation_id: str | None,
        filter_: VectorSearchFilter,
        results_count: int,
        top_score: float,
        confidence: float,
        citations: list,
        retrieval_latency_ms: int,
        reranking_latency_ms: int,
        total_latency_ms: int,
        was_fallback: bool,
        was_successful: bool,
        fallback_reason: str | None,
    ) -> None:
        """Persist a RAGSearchLog row for analytics."""
        try:
            import hashlib

            query_hash = hashlib.sha256(query.encode()).hexdigest()
            log = RAGSearchLog(
                organization_id=organization_id,
                user_id=user_id,
                conversation_id=conversation_id,
                query=query,
                query_hash=query_hash,
                filters=filter_.to_dict(),
                results_count=results_count,
                top_score=top_score,
                avg_score=None,
                confidence=confidence,
                citations_count=len(citations),
                citations=[c["citation"] for c in citations[:10]],
                retrieval_latency_ms=retrieval_latency_ms,
                reranking_latency_ms=reranking_latency_ms,
                total_latency_ms=total_latency_ms,
                was_fallback=was_fallback,
                was_successful=was_successful,
                fallback_reason=fallback_reason,
                embedding_model=self.embedding_provider.model_id,
                vector_db=self.vector_store.name,
            )
            self.db.add(log)
            await self.db.flush()
        except Exception as e:
            # Logging failures should never break retrieval
            logger.warning("rag_search_log_failed", error=str(e))
