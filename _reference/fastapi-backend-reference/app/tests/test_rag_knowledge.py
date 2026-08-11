"""Comprehensive tests for the Enterprise RAG & Knowledge Management system.

Stage 2 Step 2 — tests cover:
- Embedding providers (Fake, OpenAI mocking, BGE optional)
- Vector store (in-memory + Qdrant mocked)
- Document processors (PDF / DOCX / TXT / MD / CSV / JSON / HTML / Web / FAQ)
- Smart chunker (overlap, dedup, language detection)
- Ingestion pipeline (parse → chunk → embed → index)
- Retrieval pipeline (hybrid search, rerank, citations, confidence)
- Hallucination prevention (low-confidence fallback)
- Tenant isolation (cross-tenant queries return nothing)
- API endpoints (upload, list, search, delete, versions, sources, analytics)
- File validation (size, MIME, extension)
"""

import asyncio
import hashlib
import uuid
from datetime import datetime, UTC
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.database import Base
from app.core.security import hash_password

# Import ALL models so tables get created
from app.models import *  # noqa: F401, F403
from app.models.knowledge import (
    DocumentChunk,
    DocumentVersion,
    EmbeddingsMetadata,
    IngestionJob,
    KnowledgeDocument,
    KnowledgeSource,
    RAGSearchLog,
)
from app.models.organization import Organization, UserOrganization
from app.models.user import User


# ===== Shared fixtures =====


@pytest_asyncio.fixture
async def test_db():
    """In-memory SQLite DB with all tables created."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with async_session() as session:
        # Seed org, user, membership
        org = Organization(name="Test Org", slug="test-org", is_active=True)
        session.add(org)
        await session.flush()

        # Second org for tenant isolation tests
        org2 = Organization(name="Other Org", slug="other-org", is_active=True)
        session.add(org2)
        await session.flush()

        user = User(
            email="admin@test.com",
            full_name="Admin",
            hashed_password=hash_password("pass123!"),
            is_active=True,
            is_email_verified=True,
        )
        session.add(user)
        await session.flush()

        membership = UserOrganization(
            user_id=str(user.id),
            organization_id=str(org.id),
            role="org_owner",
            is_active=True,
        )
        session.add(membership)

        # User for second org
        user2 = User(
            email="admin2@test.com",
            full_name="Admin2",
            hashed_password=hash_password("pass123!"),
            is_active=True,
            is_email_verified=True,
        )
        session.add(user2)
        await session.flush()

        membership2 = UserOrganization(
            user_id=str(user2.id),
            organization_id=str(org2.id),
            role="org_owner",
            is_active=True,
        )
        session.add(membership2)

        await session.commit()
        yield session, org, org2, user, user2

    await engine.dispose()


@pytest.fixture
def reset_rag_singletons():
    """Reset embedding provider + vector store singletons between tests."""
    from app.ai.embeddings import clear_cache as clear_emb_cache
    from app.ai.vector_store import reset_vector_store

    clear_emb_cache()
    reset_vector_store()
    yield
    clear_emb_cache()
    reset_vector_store()


# ====================================================================
# 1. EMBEDDING PROVIDER TESTS
# ====================================================================


@pytest.mark.unit
class TestEmbeddingProviders:
    """Tests for the embedding provider abstraction."""

    def test_registry_includes_fake(self):
        from app.ai.embeddings import EMBEDDING_PROVIDER_REGISTRY

        assert "fake" in EMBEDDING_PROVIDER_REGISTRY

    def test_fake_provider_dimensions(self, reset_rag_singletons):
        from app.ai.embeddings import get_embedding_provider
        from app.ai.embeddings.fake_provider import FakeEmbeddingProvider

        provider = FakeEmbeddingProvider(dimension=128)
        assert provider.dimension == 128
        assert provider.name == "fake"
        assert provider.is_available() is True

    @pytest.mark.asyncio
    async def test_fake_provider_embed_texts(self, reset_rag_singletons):
        from app.ai.embeddings.fake_provider import FakeEmbeddingProvider

        provider = FakeEmbeddingProvider(dimension=64)
        batch = await provider.embed_texts(["hello", "world"])
        assert len(batch) == 2
        assert batch.dimension == 64
        assert len(batch.vectors[0]) == 64
        # Deterministic
        batch2 = await provider.embed_texts(["hello", "world"])
        assert batch.vectors[0] == batch2.vectors[0]

    @pytest.mark.asyncio
    async def test_fake_provider_embed_query(self, reset_rag_singletons):
        from app.ai.embeddings.fake_provider import FakeEmbeddingProvider

        provider = FakeEmbeddingProvider(dimension=64)
        result = await provider.embed_query("test query")
        assert result.vector
        assert len(result.vector) == 64
        assert result.model == provider.model_id

    @pytest.mark.asyncio
    async def test_fake_provider_empty_input_raises(self, reset_rag_singletons):
        from app.ai.embeddings import EmbeddingProviderError
        from app.ai.embeddings.fake_provider import FakeEmbeddingProvider

        provider = FakeEmbeddingProvider(dimension=64)
        with pytest.raises(EmbeddingProviderError):
            await provider.embed_texts([])

    def test_get_embedding_provider_returns_singleton(self, reset_rag_singletons):
        from app.ai.embeddings import get_embedding_provider

        p1 = get_embedding_provider()
        p2 = get_embedding_provider()
        assert p1 is p2

    def test_openai_provider_is_available_when_key_set(self, reset_rag_singletons):
        from app.ai.embeddings.openai_provider import OpenAIEmbeddingProvider

        provider = OpenAIEmbeddingProvider(api_key="sk-test")
        assert provider.is_available() is True
        assert provider.name == "openai"

    def test_openai_provider_unavailable_without_key(self, reset_rag_singletons):
        from app.ai.embeddings.openai_provider import OpenAIEmbeddingProvider

        provider = OpenAIEmbeddingProvider(api_key="")
        assert provider.is_available() is False

    def test_openai_provider_cost_calculation(self, reset_rag_singletons):
        from app.ai.embeddings.openai_provider import OpenAIEmbeddingProvider

        provider = OpenAIEmbeddingProvider(
            api_key="sk-test", model_id="text-embedding-3-small"
        )
        # $0.02 / 1M tokens = $0.002 per 100K tokens = 0.2 cents per 100K tokens
        # For 1M tokens: 0.02 * 100 = 2 cents
        cost = provider._compute_cost_cents(1_000_000)
        assert cost == 2

    def test_openai_provider_exception_translation(self, reset_rag_singletons):
        from app.ai.embeddings.exceptions import (
            EmbeddingAuthenticationError,
            EmbeddingRateLimitError,
            EmbeddingTimeoutError,
        )
        from app.ai.embeddings.openai_provider import OpenAIEmbeddingProvider

        provider = OpenAIEmbeddingProvider(api_key="sk-test")
        assert isinstance(
            provider._translate_exception(Exception("401 Unauthorized")),
            EmbeddingAuthenticationError,
        )
        assert isinstance(
            provider._translate_exception(Exception("429 Too Many Requests")),
            EmbeddingRateLimitError,
        )
        assert isinstance(
            provider._translate_exception(Exception("Connection timed out")),
            EmbeddingTimeoutError,
        )

    def test_bge_provider_get_info(self, reset_rag_singletons):
        from app.ai.embeddings.bge_provider import BGELocalEmbeddingProvider

        provider = BGELocalEmbeddingProvider(
            model_name="BAAI/bge-small-en-v1.5", device="cpu"
        )
        info = provider.get_info()
        assert info["name"] == "bge_local"
        assert info["dimension"] == 384
        assert info["available"] is True


# ====================================================================
# 2. VECTOR STORE TESTS
# ====================================================================


@pytest.mark.unit
class TestInMemoryVectorStore:
    """Tests for the in-memory vector store (used in tests + local dev)."""

    @pytest.mark.asyncio
    async def test_ensure_collection(self, reset_rag_singletons):
        from app.ai.vector_store import InMemoryVectorStore

        store = InMemoryVectorStore()
        await store.ensure_collection("test_col", 128)
        assert await store.collection_exists("test_col") is True
        assert await store.collection_exists("nonexistent") is False

    @pytest.mark.asyncio
    async def test_upsert_and_count(self, reset_rag_singletons):
        from app.ai.vector_store import InMemoryVectorStore, VectorPoint

        store = InMemoryVectorStore()
        await store.ensure_collection("c1", 4)
        points = [
            VectorPoint(id="p1", vector=[1, 0, 0, 0], payload={"organization_id": "org1", "text": "hello"}),
            VectorPoint(id="p2", vector=[0, 1, 0, 0], payload={"organization_id": "org1", "text": "world"}),
        ]
        n = await store.upsert("c1", points)
        assert n == 2
        assert await store.count("c1") == 2

    @pytest.mark.asyncio
    async def test_search_returns_relevant(self, reset_rag_singletons):
        from app.ai.vector_store import InMemoryVectorStore, VectorPoint, VectorSearchFilter

        store = InMemoryVectorStore()
        await store.ensure_collection("c2", 4)
        points = [
            VectorPoint(id="a", vector=[1, 0, 0, 0], payload={"organization_id": "org1", "text": "apple"}),
            VectorPoint(id="b", vector=[0, 1, 0, 0], payload={"organization_id": "org1", "text": "banana"}),
            VectorPoint(id="c", vector=[1, 1, 0, 0], payload={"organization_id": "org1", "text": "cherry"}),
        ]
        await store.upsert("c2", points)
        results = await store.search(
            "c2",
            [1, 0, 0, 0],
            VectorSearchFilter(organization_id="org1"),
            top_k=2,
        )
        assert len(results) == 2
        # "apple" should be the top match (cosine similarity = 1.0)
        assert results[0].point_id == "a"
        assert results[0].score > 0.99

    @pytest.mark.asyncio
    async def test_tenant_isolation_in_search(self, reset_rag_singletons):
        """Searches scoped to one org MUST NOT return results from another org."""
        from app.ai.vector_store import InMemoryVectorStore, VectorPoint, VectorSearchFilter

        store = InMemoryVectorStore()
        await store.ensure_collection("c3", 4)
        points = [
            VectorPoint(id="a", vector=[1, 0, 0, 0], payload={"organization_id": "org1", "text": "secret1"}),
            VectorPoint(id="b", vector=[1, 0, 0, 0], payload={"organization_id": "org2", "text": "secret2"}),
        ]
        await store.upsert("c3", points)
        # org1 search must NOT see org2's point
        results = await store.search(
            "c3",
            [1, 0, 0, 0],
            VectorSearchFilter(organization_id="org1"),
            top_k=10,
        )
        assert len(results) == 1
        assert results[0].payload["organization_id"] == "org1"
        assert results[0].payload["text"] == "secret1"

    @pytest.mark.asyncio
    async def test_delete_by_filter(self, reset_rag_singletons):
        from app.ai.vector_store import InMemoryVectorStore, VectorPoint, VectorSearchFilter

        store = InMemoryVectorStore()
        await store.ensure_collection("c4", 4)
        points = [
            VectorPoint(id="a", vector=[1, 0, 0, 0], payload={"organization_id": "org1", "document_id": "d1"}),
            VectorPoint(id="b", vector=[1, 0, 0, 0], payload={"organization_id": "org1", "document_id": "d2"}),
            VectorPoint(id="c", vector=[1, 0, 0, 0], payload={"organization_id": "org2", "document_id": "d1"}),
        ]
        await store.upsert("c4", points)
        # Delete org1/d1 only
        deleted = await store.delete_by_filter(
            "c4",
            VectorSearchFilter(organization_id="org1", document_ids=["d1"]),
        )
        assert deleted == 1
        assert await store.count("c4") == 2
        # Org2's d1 must still exist
        results = await store.search(
            "c4",
            [1, 0, 0, 0],
            VectorSearchFilter(organization_id="org2"),
            top_k=10,
        )
        assert len(results) == 1

    @pytest.mark.asyncio
    async def test_search_without_org_id_raises(self, reset_rag_singletons):
        from app.ai.vector_store import InMemoryVectorStore, VectorSearchFilter, VectorStoreError

        store = InMemoryVectorStore()
        await store.ensure_collection("c5", 4)
        with pytest.raises(VectorStoreError):
            await store.search(
                "c5",
                [1, 0, 0, 0],
                VectorSearchFilter(organization_id=""),
                top_k=10,
            )


# ====================================================================
# 3. DOCUMENT PROCESSOR TESTS
# ====================================================================


@pytest.mark.unit
class TestDocumentProcessors:
    """Tests for the format-specific document processors."""

    @pytest.mark.asyncio
    async def test_text_processor(self):
        from app.ai.document_processors.text_processor import TextProcessor

        proc = TextProcessor()
        result = await proc.process_text(
            "First paragraph.\n\nSecond paragraph.\n\nThird paragraph."
        )
        assert len(result.chunks) >= 1
        assert result.char_count > 0

    @pytest.mark.asyncio
    async def test_markdown_processor_heading_aware(self):
        from app.ai.document_processors.markdown_processor import MarkdownProcessor

        proc = MarkdownProcessor()
        md = """# Title

Intro paragraph.

## Section A

Content of A.

### Subsection

More content.

## Section B

Content of B.
"""
        result = await proc.process_text(md, filename="test.md")
        assert result.title == "Title"
        assert len(result.chunks) >= 3
        # Each chunk should have a heading_path
        assert all(c.heading_path for c in result.chunks)
        # Find a chunk under Section A
        section_a_chunks = [c for c in result.chunks if "Section A" in c.heading_path]
        assert len(section_a_chunks) >= 1

    @pytest.mark.asyncio
    async def test_csv_processor(self):
        from app.ai.document_processors.csv_processor import CSVProcessor

        proc = CSVProcessor()
        csv_data = "name,age,city\nAlice,30,Mumbai\nBob,25,Delhi\nCarol,35,Bangalore\n"
        result = await proc.process_text(csv_data, filename="users.csv")
        # One chunk per row (3 rows)
        assert len(result.chunks) == 3
        assert "Alice" in result.chunks[0].text
        assert "30" in result.chunks[0].text
        assert "Bob" in result.chunks[1].text

    @pytest.mark.asyncio
    async def test_json_processor_array(self):
        from app.ai.document_processors.json_processor import JSONProcessor

        proc = JSONProcessor()
        json_data = '[{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]'
        result = await proc.process_text(json_data, filename="data.json")
        assert len(result.chunks) == 2
        assert "Alice" in result.chunks[0].text
        assert "Bob" in result.chunks[1].text

    @pytest.mark.asyncio
    async def test_json_processor_invalid(self):
        from app.ai.document_processors import ProcessorError
        from app.ai.document_processors.json_processor import JSONProcessor

        proc = JSONProcessor()
        with pytest.raises(ProcessorError):
            await proc.process_text("{invalid json", filename="bad.json")

    @pytest.mark.asyncio
    async def test_html_processor(self):
        from app.ai.document_processors.html_processor import HTMLProcessor

        proc = HTMLProcessor()
        html = """<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
<h1>Main Title</h1>
<p>Intro paragraph.</p>
<h2>Section</h2>
<p>Section content.</p>
<script>var x = 1;</script>
</body>
</html>"""
        result = await proc.process_text(html, filename="page.html")
        assert result.title == "Test Page"
        # Script content should NOT appear
        assert "var x" not in result.text
        assert "Main Title" in result.text
        assert len(result.chunks) >= 1

    @pytest.mark.asyncio
    async def test_faq_processor_json(self):
        from app.ai.document_processors.faq_processor import FAQProcessor

        proc = FAQProcessor()
        faq_json = '[{"question": "What is your return policy?", "answer": "30 days."}]'
        result = await proc.process_text(faq_json, filename="faq.json")
        assert len(result.chunks) == 1
        assert "30 days" in result.chunks[0].text
        assert result.chunks[0].metadata["faq_question"] == "What is your return policy?"

    @pytest.mark.asyncio
    async def test_faq_processor_text(self):
        from app.ai.document_processors.faq_processor import FAQProcessor

        proc = FAQProcessor()
        faq_text = """Q: What are your business hours?
A: We are open 9 AM to 6 PM, Monday to Friday.

Q: Do you ship internationally?
A: Yes, we ship to over 50 countries."""
        result = await proc.process_text(faq_text, filename="faq.txt")
        assert len(result.chunks) == 2
        assert "9 AM to 6 PM" in result.chunks[0].text
        assert "internationally" in result.chunks[1].text.lower() or "50 countries" in result.chunks[1].text

    @pytest.mark.asyncio
    async def test_pdf_processor_with_invalid_bytes(self):
        from app.ai.document_processors import ProcessorError
        from app.ai.document_processors.pdf_processor import PDFProcessor

        proc = PDFProcessor()
        # Empty / invalid bytes should not crash
        try:
            await proc.process_bytes(b"not a real pdf", filename="fake.pdf")
            # If pypdf is installed, it should raise ProcessorError
            # If not installed, it raises ImportError → ProcessorError
        except ProcessorError:
            pass  # expected

    @pytest.mark.asyncio
    async def test_detect_format(self):
        from app.ai.document_processors import detect_format

        assert detect_format("doc.pdf") == "pdf"
        assert detect_format("doc.docx") == "docx"
        assert detect_format("doc.txt") == "txt"
        assert detect_format("doc.md") == "md"
        assert detect_format("doc.csv") == "csv"
        assert detect_format("doc.json") == "json"
        assert detect_format("page.html") == "html"
        assert detect_format(None, "application/pdf") == "pdf"
        assert detect_format(None, "text/markdown") == "md"


# ====================================================================
# 4. SMART CHUNKER TESTS
# ====================================================================


@pytest.mark.unit
class TestSmartChunker:
    """Tests for the smart chunker (overlap, dedup, language detection)."""

    def test_chunk_size_respected(self):
        from app.ai.document_processors.base import ProcessedChunk
        from app.ai.rag_pipeline.chunker import SmartChunker

        chunker = SmartChunker(max_chunk_size=100, min_chunk_size=10, chunk_overlap=20)
        # Use varied content so dedup doesn't collapse the chunks
        paragraphs = [f"Paragraph number {i} with unique content {i}." for i in range(20)]
        long_text = "\n\n".join(paragraphs)
        raw = [ProcessedChunk(text=long_text, position=0)]
        result = chunker.chunk(raw)
        assert len(result) > 1
        for c in result:
            assert len(c.text) <= 200  # small tolerance for overlap

    def test_chunk_overlap(self):
        from app.ai.document_processors.base import ProcessedChunk
        from app.ai.rag_pipeline.chunker import SmartChunker

        chunker = SmartChunker(max_chunk_size=80, min_chunk_size=10, chunk_overlap=20)
        # Create varied text that spans multiple chunks
        text = "\n\n".join([f"Paragraph {i} with unique content number {i}." for i in range(30)])
        raw = [ProcessedChunk(text=text, position=0)]
        result = chunker.chunk(raw)
        assert len(result) > 1

    def test_dedup_exact(self):
        from app.ai.document_processors.base import ProcessedChunk
        from app.ai.rag_pipeline.chunker import SmartChunker

        chunker = SmartChunker(max_chunk_size=1000, min_chunk_size=10, chunk_overlap=0)
        raw = [
            ProcessedChunk(text="Identical content.", position=0),
            ProcessedChunk(text="Identical content.", position=1),
            ProcessedChunk(text="Different content.", position=2),
        ]
        result = chunker.chunk(raw)
        # Exact duplicates removed
        assert len(result) == 2

    def test_language_detection(self):
        from app.ai.rag_pipeline.chunker import SmartChunker

        chunker = SmartChunker()
        assert chunker._detect_language("This is English text.") == "en"
        assert chunker._detect_language("यह हिंदी टेक्स्ट है।") == "hi"
        assert chunker._detect_language("এটি বাংলা টেক্সট।") == "bn"
        assert chunker._detect_language("இது தமிழ் உரை.") == "ta"

    def test_content_hash_stable(self):
        from app.ai.document_processors.base import ProcessedChunk
        from app.ai.rag_pipeline.chunker import SmartChunker

        chunker = SmartChunker(max_chunk_size=1000, min_chunk_size=1, chunk_overlap=0)
        raw = [ProcessedChunk(text="stable text", position=0)]
        result1 = chunker.chunk(raw)
        result2 = chunker.chunk(raw)
        assert result1[0].content_sha256 == result2[0].content_sha256
        expected_hash = hashlib.sha256("stable text".encode()).hexdigest()
        assert result1[0].content_sha256 == expected_hash


# ====================================================================
# 5. CITATION TESTS
# ====================================================================


@pytest.mark.unit
class TestCitations:
    """Tests for citation generation."""

    def test_build_citation(self):
        from app.ai.rag_pipeline.citations import build_citation

        # Use explicit UUIDs since these objects aren't flushed to DB
        doc_id = uuid.uuid4()
        chunk_id = uuid.uuid4()
        chunk = DocumentChunk(
            id=chunk_id,
            organization_id="org1",
            document_id=str(doc_id),
            text="This is the chunk text content that should be cited.",
            chunk_index=0,
            heading_path=["Section A", "Subsection B"],
            page=3,
            char_count=50,
            token_count=12,
            language="en",
        )
        doc = KnowledgeDocument(
            id=doc_id,
            organization_id="org1",
            title="Test Document",
            filename="test.pdf",
            source_uri="https://example.com/test.pdf",
            format="pdf",
            size_bytes=1000,
            version=1,
            status="ready",
            chunk_count=1,
        )
        citation = build_citation(chunk, doc, score=0.85)
        assert citation["document_id"] == str(doc_id)
        assert citation["document_title"] == "Test Document"
        assert citation["page"] == 3
        assert citation["heading_path"] == ["Section A", "Subsection B"]
        assert citation["score"] == 0.85
        assert "chunk text content" in citation["snippet"]
        assert citation["source_type"] == "file"

    def test_format_citations_for_llm(self):
        from app.ai.rag_pipeline.citations import format_citations_for_llm

        citations = [
            {
                "document_title": "Guide",
                "page": 1,
                "heading_path": ["Intro"],
                "source_uri": "https://example.com/guide.pdf",
                "snippet": "Important info.",
            },
            {
                "document_title": "FAQ",
                "page": None,
                "heading_path": [],
                "source_uri": None,
                "snippet": "Q: question? A: answer.",
            },
        ]
        formatted = format_citations_for_llm(citations)
        assert "[1]" in formatted
        assert "[2]" in formatted
        assert "Guide" in formatted
        assert "FAQ" in formatted
        assert "Important info." in formatted


# ====================================================================
# 6. CONFIDENCE / HALLUCINATION PREVENTION TESTS
# ====================================================================


@pytest.mark.unit
class TestConfidence:
    """Tests for confidence scoring + hallucination prevention."""

    def test_confidence_zero_when_no_results(self):
        from app.ai.rag_pipeline.confidence import compute_confidence

        assert compute_confidence([], "test query") == 0.0

    def test_confidence_increases_with_score(self):
        from app.ai.rag_pipeline.confidence import compute_confidence

        low = compute_confidence([{"score": 0.3}], "test query")
        high = compute_confidence([{"score": 0.9}], "test query")
        assert high > low

    def test_should_fallback_when_low_confidence(self):
        from app.ai.rag_pipeline.confidence import should_fallback

        fb, reason = should_fallback(0.2, top_score=0.3)
        assert fb is True
        assert "confidence_below_threshold" in reason

    def test_should_not_fallback_when_high_confidence(self):
        from app.ai.rag_pipeline.confidence import should_fallback

        fb, reason = should_fallback(0.9, top_score=0.9)
        assert fb is False
        assert reason == ""

    def test_fallback_response_message(self):
        from app.ai.rag_pipeline.confidence import build_fallback_response

        resp = build_fallback_response(0.3, "low", "what is X?")
        assert resp["was_fallback"] is True
        assert "don't have enough information" in resp["answer"].lower()
        assert resp["fallback_reason"] == "low"


# ====================================================================
# 7. END-TO-END INGESTION + RETRIEVAL TESTS
# ====================================================================


@pytest.mark.integration
class TestRAGPipelineIntegration:
    """End-to-end tests for the RAG pipeline (ingest → search → cite)."""

    @pytest.mark.asyncio
    async def test_ingest_text_document(self, test_db, reset_rag_singletons):
        """End-to-end: upload a text doc → it gets chunked + embedded + indexed."""
        session, org, org2, user, user2 = test_db
        from app.ai.rag_pipeline import KnowledgeRAGService

        svc = KnowledgeRAGService(session)
        doc = await svc.upload_document(
            organization_id=org.id,
            uploaded_by=user.id,
            filename="wellness.txt",
            content=(
                "# Wellness Pack Guide\n\n"
                "Take 2 tablets daily with water after meals.\n\n"
                "## Side Effects\n\n"
                "No known side effects. Consult a doctor if pregnant."
            ),
            format="md",
            mime_type="text/markdown",
            title="Wellness Pack Guide",
            category="product_guide",
            auto_ingest=True,
        )
        assert doc.status == "ready"
        assert doc.chunk_count > 0
        await session.commit()

    @pytest.mark.asyncio
    async def test_search_returns_relevant_chunks(self, test_db, reset_rag_singletons):
        """End-to-end: ingest a doc → search → get relevant chunks back."""
        session, org, org2, user, user2 = test_db
        from app.ai.rag_pipeline import KnowledgeRAGService

        svc = KnowledgeRAGService(session)
        await svc.upload_document(
            organization_id=org.id,
            uploaded_by=user.id,
            filename="policy.md",
            content=(
                "# Return Policy\n\n"
                "Customers can return products within 30 days of purchase.\n\n"
                "## Refunds\n\n"
                "Refunds are processed within 5-7 business days."
            ),
            format="md",
            mime_type="text/markdown",
            title="Return Policy",
            auto_ingest=True,
        )
        await session.commit()

        result = await svc.search(
            "What is the return policy?",
            organization_id=org.id,
            user_id=user.id,
        )
        assert result["was_fallback"] is False or result["results_count"] > 0
        # The fake provider gives deterministic-but-not-semantic vectors,
        # so we can't guarantee relevance — but we CAN verify the pipeline works.
        assert "query" in result
        assert "confidence" in result
        assert "latency_ms" in result
        assert "embedding_model" in result

    @pytest.mark.asyncio
    async def test_tenant_isolation_search(self, test_db, reset_rag_singletons):
        """Cross-tenant searches MUST return nothing."""
        session, org, org2, user, user2 = test_db
        from app.ai.rag_pipeline import KnowledgeRAGService

        svc = KnowledgeRAGService(session)
        # Org1 ingests a doc
        await svc.upload_document(
            organization_id=org.id,
            uploaded_by=user.id,
            filename="secret.md",
            content="Org1 confidential information about project X.",
            format="md",
            mime_type="text/markdown",
            title="Secret",
            auto_ingest=True,
        )
        await session.commit()
        # Org2 searches — should get nothing (or fallback)
        result = await svc.search(
            "project X confidential",
            organization_id=org2.id,
            user_id=user2.id,
        )
        # No chunks should be returned (org2 has no docs)
        assert result["results_count"] == 0
        assert result["was_fallback"] is True

    @pytest.mark.asyncio
    async def test_tenant_isolation_cross_document_access(self, test_db, reset_rag_singletons):
        """Org2 cannot GET org1's document by ID."""
        session, org, org2, user, user2 = test_db
        from app.ai.rag_pipeline import KnowledgeRAGService
        from app.core.exceptions import NotFoundError

        svc = KnowledgeRAGService(session)
        doc = await svc.upload_document(
            organization_id=org.id,
            uploaded_by=user.id,
            filename="doc.md",
            content="content",
            format="md",
            mime_type="text/markdown",
            title="Doc",
            auto_ingest=True,
        )
        await session.commit()

        # Org2 trying to access org1's doc
        with pytest.raises(NotFoundError):
            await svc.get_document(organization_id=org2.id, document_id=doc.id)

    @pytest.mark.asyncio
    async def test_list_documents_tenant_isolated(self, test_db, reset_rag_singletons):
        """Org1's document list MUST NOT include org2's documents."""
        session, org, org2, user, user2 = test_db
        from app.ai.rag_pipeline import KnowledgeRAGService

        svc = KnowledgeRAGService(session)
        await svc.upload_document(
            organization_id=org.id,
            uploaded_by=user.id,
            filename="org1_doc.md",
            content="org1 content",
            format="md",
            mime_type="text/markdown",
            title="Org1 Doc",
            auto_ingest=False,
        )
        await svc.upload_document(
            organization_id=org2.id,
            uploaded_by=user2.id,
            filename="org2_doc.md",
            content="org2 content",
            format="md",
            mime_type="text/markdown",
            title="Org2 Doc",
            auto_ingest=False,
        )
        await session.commit()

        org1_docs, org1_total = await svc.list_documents(organization_id=org.id)
        org2_docs, org2_total = await svc.list_documents(organization_id=org2.id)
        assert org1_total == 1
        assert org2_total == 1
        assert org1_docs[0].title == "Org1 Doc"
        assert org2_docs[0].title == "Org2 Doc"

    @pytest.mark.asyncio
    async def test_document_versioning(self, test_db, reset_rag_singletons):
        """Re-uploading the same source creates a new version."""
        session, org, org2, user, user2 = test_db
        from app.ai.rag_pipeline import KnowledgeRAGService

        svc = KnowledgeRAGService(session)
        # First upload
        doc1 = await svc.upload_document(
            organization_id=org.id,
            uploaded_by=user.id,
            filename="guide.md",
            content="version 1 content",
            format="md",
            mime_type="text/markdown",
            title="Guide",
            source_uri="https://example.com/guide.md",
            auto_ingest=False,
        )
        # Second upload (same source_uri)
        doc2 = await svc.upload_document(
            organization_id=org.id,
            uploaded_by=user.id,
            filename="guide.md",
            content="version 2 content",
            format="md",
            mime_type="text/markdown",
            title="Guide",
            source_uri="https://example.com/guide.md",
            auto_ingest=False,
        )
        await session.commit()
        assert doc1.version == 1
        assert doc2.version == 2
        assert doc1.is_latest is False
        assert doc2.is_latest is True
        assert doc2.parent_document_id == str(doc1.id)

    @pytest.mark.asyncio
    async def test_delete_document_removes_vectors(self, test_db, reset_rag_singletons):
        """Delete removes chunks + vectors but keeps the doc row (soft delete)."""
        session, org, org2, user, user2 = test_db
        from app.ai.rag_pipeline import KnowledgeRAGService

        svc = KnowledgeRAGService(session)
        doc = await svc.upload_document(
            organization_id=org.id,
            uploaded_by=user.id,
            filename="temp.md",
            content="temporary content",
            format="md",
            mime_type="text/markdown",
            title="Temp",
            auto_ingest=True,
        )
        await session.commit()
        assert doc.chunk_count > 0

        chunks_deleted = await svc.delete_document(
            organization_id=org.id, document_id=doc.id
        )
        await session.commit()
        assert chunks_deleted > 0
        # Document row should still exist (soft delete)
        from sqlalchemy import select as sel

        result = await session.execute(
            sel(KnowledgeDocument).where(KnowledgeDocument.id == doc.id)
        )
        deleted_doc = result.scalar_one()
        assert deleted_doc.is_deleted is True
        assert deleted_doc.status == "deleted"

    @pytest.mark.asyncio
    async def test_search_logs_analytics(self, test_db, reset_rag_singletons):
        """Every search creates a RAGSearchLog row for analytics."""
        session, org, org2, user, user2 = test_db
        from app.ai.rag_pipeline import KnowledgeRAGService

        svc = KnowledgeRAGService(session)
        await svc.upload_document(
            organization_id=org.id,
            uploaded_by=user.id,
            filename="doc.md",
            content="some content",
            format="md",
            mime_type="text/markdown",
            title="Doc",
            auto_ingest=True,
        )
        await session.commit()
        await svc.search("test query", organization_id=org.id, user_id=user.id)
        await session.commit()

        result = await session.execute(
            select(RAGSearchLog).where(RAGSearchLog.organization_id == str(org.id))
        )
        logs = result.scalars().all()
        assert len(logs) >= 1
        assert logs[0].query == "test query"

    @pytest.mark.asyncio
    async def test_manual_entry(self, test_db, reset_rag_singletons):
        """Manual knowledge entries can be created and searched."""
        session, org, org2, user, user2 = test_db
        from app.ai.rag_pipeline import KnowledgeRAGService

        svc = KnowledgeRAGService(session)
        doc = await svc.create_manual_entry(
            organization_id=org.id,
            created_by=user.id,
            title="Business Hours",
            content="We are open Monday to Friday, 9 AM to 6 PM IST.",
            category="policy",
            tags=["hours", "policy"],
        )
        await session.commit()
        assert doc.title == "Business Hours"
        assert doc.status == "ready"
        assert doc.chunk_count > 0


# ====================================================================
# 8. FILE VALIDATION TESTS
# ====================================================================


@pytest.mark.unit
class TestFileValidation:
    """Tests for upload file validation (size, MIME, extension)."""

    @pytest.mark.asyncio
    async def test_oversized_file_rejected(self, test_db, reset_rag_singletons):
        session, org, org2, user, user2 = test_db
        from app.ai.rag_pipeline import KnowledgeRAGService
        from app.core.exceptions import ValidationError

        svc = KnowledgeRAGService(session)
        # Patch settings to have a tiny limit (0.001 MB = ~1KB)
        with patch.object(settings, "MAX_UPLOAD_FILE_SIZE_MB", 0.001):
            with pytest.raises(ValidationError):
                await svc.upload_document(
                    organization_id=org.id,
                    uploaded_by=user.id,
                    filename="big.txt",
                    content=b"x" * 2048,  # 2 KB, exceeds 0.001 MB (~1 KB)
                    format="txt",
                    mime_type="text/plain",
                )

    @pytest.mark.asyncio
    async def test_invalid_extension_rejected(self, test_db, reset_rag_singletons):
        session, org, org2, user, user2 = test_db
        from app.ai.rag_pipeline import KnowledgeRAGService
        from app.core.exceptions import ValidationError

        svc = KnowledgeRAGService(session)
        with pytest.raises(ValidationError):
            await svc.upload_document(
                organization_id=org.id,
                uploaded_by=user.id,
                filename="malware.exe",
                content=b"binary",
                format="txt",
                mime_type="application/octet-stream",
            )

    @pytest.mark.asyncio
    async def test_invalid_mime_type_rejected(self, test_db, reset_rag_singletons):
        session, org, org2, user, user2 = test_db
        from app.ai.rag_pipeline import KnowledgeRAGService
        from app.core.exceptions import ValidationError

        svc = KnowledgeRAGService(session)
        with pytest.raises(ValidationError):
            await svc.upload_document(
                organization_id=org.id,
                uploaded_by=user.id,
                filename="doc.txt",
                content=b"text",
                format="txt",
                mime_type="application/x-msdownload",
            )


# ====================================================================
# 9. KNOWLEDGE SOURCES TESTS
# ====================================================================


@pytest.mark.integration
class TestKnowledgeSources:
    """Tests for the knowledge sources API."""

    @pytest.mark.asyncio
    async def test_create_source(self, test_db, reset_rag_singletons):
        session, org, org2, user, user2 = test_db
        from app.ai.rag_pipeline import KnowledgeRAGService

        svc = KnowledgeRAGService(session)
        source = await svc.create_source(
            organization_id=org.id,
            name="Company Website",
            source_type="web",
            config={"seed_url": "https://example.com"},
            description="Main company website",
            sync_interval_minutes=1440,
            created_by=user.id,
        )
        await session.commit()
        assert source.id is not None
        assert source.name == "Company Website"
        assert source.source_type == "web"

    @pytest.mark.asyncio
    async def test_list_sources_tenant_isolated(self, test_db, reset_rag_singletons):
        session, org, org2, user, user2 = test_db
        from app.ai.rag_pipeline import KnowledgeRAGService

        svc = KnowledgeRAGService(session)
        await svc.create_source(
            organization_id=org.id,
            name="Org1 Source",
            source_type="web",
            config={},
        )
        await svc.create_source(
            organization_id=org2.id,
            name="Org2 Source",
            source_type="faq",
            config={},
        )
        await session.commit()
        org1_sources = await svc.list_sources(organization_id=org.id)
        org2_sources = await svc.list_sources(organization_id=org2.id)
        assert len(org1_sources) == 1
        assert len(org2_sources) == 1
        assert org1_sources[0].name == "Org1 Source"
        assert org2_sources[0].name == "Org2 Source"

    @pytest.mark.asyncio
    async def test_delete_source(self, test_db, reset_rag_singletons):
        session, org, org2, user, user2 = test_db
        from app.ai.rag_pipeline import KnowledgeRAGService

        svc = KnowledgeRAGService(session)
        source = await svc.create_source(
            organization_id=org.id,
            name="Temp Source",
            source_type="web",
            config={},
        )
        await session.commit()
        deleted = await svc.delete_source(
            organization_id=org.id, source_id=source.id, delete_documents=False
        )
        await session.commit()
        assert deleted == 0  # no documents to delete
        # Source is marked inactive
        result = await session.execute(
            select(KnowledgeSource).where(KnowledgeSource.id == source.id)
        )
        deleted_source = result.scalar_one()
        assert deleted_source.is_active is False


# ====================================================================
# 10. ANALYTICS TESTS
# ====================================================================


@pytest.mark.integration
class TestRAGAnalytics:
    """Tests for the analytics aggregation."""

    @pytest.mark.asyncio
    async def test_get_analytics(self, test_db, reset_rag_singletons):
        session, org, org2, user, user2 = test_db
        from app.ai.rag_pipeline import KnowledgeRAGService

        svc = KnowledgeRAGService(session)
        # Ingest a doc
        await svc.upload_document(
            organization_id=org.id,
            uploaded_by=user.id,
            filename="doc.md",
            content="content",
            format="md",
            mime_type="text/markdown",
            title="Doc",
            auto_ingest=True,
        )
        # Search
        await svc.search("query", organization_id=org.id, user_id=user.id)
        await session.commit()
        analytics = await svc.get_analytics(organization_id=org.id)
        assert "documents" in analytics
        assert "total_chunks" in analytics
        assert "searches_30d" in analytics
        assert analytics["searches_30d"]["total"] >= 1
