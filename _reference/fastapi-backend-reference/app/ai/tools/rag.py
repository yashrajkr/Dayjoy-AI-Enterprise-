"""RAG Tool — knowledge search via the RAG pipeline.

This is the tool that AI agents call to search the knowledge base.
The actual RAG pipeline (ingestion, embeddings, vector search) is in app/ai/rag.py.
"""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.rag import RAGService


async def knowledge_search(input_data: dict[str, Any], db: AsyncSession) -> dict:
    """Search the knowledge base using RAG.

    Input: {"query": "...", "top_k": 5}
    Output: {"results": [...], "total": N, "confidence": 0.85}
    """
    query = input_data.get("query", "")
    org_id = input_data.get("organization_id")
    top_k = input_data.get("top_k", 5)

    rag = RAGService(db)

    if org_id:
        results = await rag.search(
            query=query,
            organization_id=org_id,
            top_k=top_k,
        )
    else:
        results = {"results": [], "total": 0, "confidence": 0.0}

    return results
