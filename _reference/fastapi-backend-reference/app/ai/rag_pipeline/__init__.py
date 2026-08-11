"""RAG Pipeline package — orchestrates the full RAG workflow.

This package replaces the older `app/ai/rag.py` module with a production-grade
implementation that uses Qdrant (or memory) as the vector DB, configurable
embedding providers (OpenAI / BGE local / fake), and a multi-step retrieval
pipeline with hybrid search, re-ranking, citation generation, and
hallucination prevention.

Modules:
- chunker       → smart chunking with overlap, dedup, language detection
- pipeline      → KnowledgeRAGService — main orchestrator
- retrieval     → retrieval + hybrid search + re-ranking
- citations     → citation rendering
- confidence    → confidence scoring + hallucination prevention
- ingestion     → ingestion job execution (parse → chunk → embed → index)
- analytics     → per-search logging + aggregate metrics

Public entry point:
    from app.ai.rag_pipeline import KnowledgeRAGService
"""

from app.ai.rag_pipeline.pipeline import KnowledgeRAGService

__all__ = ["KnowledgeRAGService"]
