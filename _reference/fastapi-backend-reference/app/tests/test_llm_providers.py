"""Tests for the Multi-LLM Provider Gateway."""

from unittest.mock import AsyncMock, patch

import pytest

from app.ai.llm_gateway import LLMGateway
from app.ai.providers import (
    PROVIDER_REGISTRY,
    GenerateRequest,
    GenerateResponse,
    Message,
    MessageRole,
    NoProviderAvailableError,
    ProviderError,
    ProviderRateLimitError,
    ProviderTimeoutError,
    UsageInfo,
    clear_cache,
    get_provider,
)
from app.ai.providers.anthropic_provider import AnthropicProvider
from app.ai.providers.gemini_provider import GeminiProvider
from app.ai.providers.groq_provider import GroqProvider
from app.ai.providers.openai_provider import OpenAIProvider
from app.core.config import settings


@pytest.mark.unit
class TestProviderConfiguration:
    def test_provider_registry_has_all_providers(self):
        assert "openai" in PROVIDER_REGISTRY
        assert "anthropic" in PROVIDER_REGISTRY
        assert "groq" in PROVIDER_REGISTRY
        assert "gemini" in PROVIDER_REGISTRY

    def test_default_ai_provider_config(self):
        assert hasattr(settings, "DEFAULT_AI_PROVIDER")
        assert settings.DEFAULT_AI_PROVIDER in ("openai", "anthropic", "groq", "gemini")

    def test_llm_settings_exist(self):
        assert hasattr(settings, "LLM_TEMPERATURE")
        assert hasattr(settings, "LLM_MAX_TOKENS")
        assert hasattr(settings, "LLM_TIMEOUT")
        assert hasattr(settings, "LLM_MAX_RETRIES")
        assert settings.LLM_TEMPERATURE > 0

    def test_provider_api_key_config_keys_exist(self):
        assert hasattr(settings, "OPENAI_API_KEY")
        assert hasattr(settings, "ANTHROPIC_API_KEY")
        assert hasattr(settings, "GROQ_API_KEY")
        assert hasattr(settings, "GEMINI_API_KEY")


@pytest.mark.unit
class TestProviderInfo:
    def test_openai_provider_info(self):
        provider = OpenAIProvider(api_key="test-key")
        info = provider.get_info()
        assert info.name == "openai"
        assert info.available is True
        assert "gpt-4o-mini" in info.supported_models

    def test_anthropic_provider_info(self):
        provider = AnthropicProvider(api_key="test-key")
        info = provider.get_info()
        assert info.name == "anthropic"
        assert info.available is True

    def test_groq_provider_info(self):
        provider = GroqProvider(api_key="test-key")
        info = provider.get_info()
        assert info.name == "groq"
        assert info.available is True

    def test_gemini_provider_info(self):
        provider = GeminiProvider(api_key="test-key")
        info = provider.get_info()
        assert info.name == "gemini"
        assert info.available is True

    def test_provider_unavailable_without_key(self):
        provider = OpenAIProvider(api_key="")
        assert provider.is_available() is False


@pytest.mark.unit
class TestProviderFactory:
    def setup_method(self):
        clear_cache()

    def teardown_method(self):
        clear_cache()

    def test_get_provider_unknown_raises(self):
        with pytest.raises(NoProviderAvailableError):
            get_provider("unknown_provider")

    def test_get_provider_no_key_raises(self):
        original = settings.OPENAI_API_KEY
        settings.OPENAI_API_KEY = ""
        clear_cache()
        try:
            with pytest.raises(NoProviderAvailableError):
                get_provider("openai")
        finally:
            settings.OPENAI_API_KEY = original

    def test_get_provider_returns_correct_type(self):
        import app.core.config as cfg

        original = cfg.settings.OPENAI_API_KEY
        cfg.settings.OPENAI_API_KEY = "test-key"
        clear_cache()
        try:
            provider = get_provider("openai")
            assert isinstance(provider, OpenAIProvider)
        finally:
            cfg.settings.OPENAI_API_KEY = original
            clear_cache()

    def test_get_provider_caches_instances(self):
        import app.core.config as cfg

        original = cfg.settings.OPENAI_API_KEY
        cfg.settings.OPENAI_API_KEY = "test-key"
        clear_cache()
        try:
            p1 = get_provider("openai")
            p2 = get_provider("openai")
            assert p1 is p2
        finally:
            cfg.settings.OPENAI_API_KEY = original
            clear_cache()


@pytest.mark.unit
class TestLLMGateway:
    @pytest.mark.asyncio
    async def test_generate_calls_provider(self):
        gateway = LLMGateway()
        mock_response = GenerateResponse(
            content="Hello!",
            model="gpt-4o-mini",
            provider="openai",
            usage=UsageInfo(prompt_tokens=5, completion_tokens=2, total_tokens=7),
            latency_ms=100,
        )
        with patch("app.ai.llm_gateway.get_provider") as mock_get:
            mock_provider = AsyncMock()
            mock_provider.generate = AsyncMock(return_value=mock_response)
            mock_provider.default_model = "gpt-4o-mini"
            mock_provider.max_retries = 3
            mock_get.return_value = mock_provider
            response = await gateway.generate(
                messages=[Message(role=MessageRole.USER, content="Hi")],
            )
            assert response.content == "Hello!"
            assert response.provider == "openai"
            mock_provider.generate.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_retries_on_rate_limit(self):
        gateway = LLMGateway()
        mock_response = GenerateResponse(
            content="Success",
            model="gpt-4o-mini",
            provider="openai",
            latency_ms=100,
        )
        with patch("app.ai.llm_gateway.get_provider") as mock_get:
            mock_provider = AsyncMock()
            mock_provider.generate = AsyncMock(
                side_effect=[
                    ProviderRateLimitError("openai", retry_after=0.01),
                    mock_response,
                ]
            )
            mock_provider.default_model = "gpt-4o-mini"
            mock_provider.max_retries = 3
            mock_get.return_value = mock_provider
            response = await gateway.generate(
                messages=[Message(role=MessageRole.USER, content="Hi")],
            )
            assert response.content == "Success"
            assert mock_provider.generate.call_count == 2

    @pytest.mark.asyncio
    async def test_generate_falls_back_to_secondary(self):
        gateway = LLMGateway()
        gateway.default_provider = "openai"
        gateway.fallback_provider = "anthropic"
        mock_response = GenerateResponse(
            content="Fallback success",
            model="claude-3-5-sonnet-20241022",
            provider="anthropic",
            latency_ms=200,
        )
        with patch("app.ai.llm_gateway.get_provider") as mock_get:

            def side_effect(name):
                if name == "openai":
                    m = AsyncMock()
                    m.generate = AsyncMock(side_effect=ProviderTimeoutError("openai", 30.0))
                    m.default_model = "gpt-4o-mini"
                    m.max_retries = 1
                    return m
                m = AsyncMock()
                m.generate = AsyncMock(return_value=mock_response)
                m.default_model = "claude-3-5-sonnet-20241022"
                m.max_retries = 1
                return m

            mock_get.side_effect = side_effect
            response = await gateway.generate(
                messages=[Message(role=MessageRole.USER, content="Hi")],
            )
            assert response.content == "Fallback success"
            assert response.provider == "anthropic"

    @pytest.mark.asyncio
    async def test_summarize_returns_string(self):
        gateway = LLMGateway()
        mock_response = GenerateResponse(
            content="This is a summary.",
            model="gpt-4o-mini",
            provider="openai",
            latency_ms=100,
        )
        with patch("app.ai.llm_gateway.get_provider") as mock_get:
            mock_provider = AsyncMock()
            mock_provider.generate = AsyncMock(return_value=mock_response)
            mock_provider.default_model = "gpt-4o-mini"
            mock_provider.max_retries = 3
            mock_get.return_value = mock_provider
            result = await gateway.summarize("Long text...")
            assert result == "This is a summary."

    @pytest.mark.asyncio
    async def test_classify_returns_category(self):
        gateway = LLMGateway()
        mock_response = GenerateResponse(
            content="support",
            model="gpt-4o-mini",
            provider="openai",
            latency_ms=50,
        )
        with patch("app.ai.llm_gateway.get_provider") as mock_get:
            mock_provider = AsyncMock()
            mock_provider.generate = AsyncMock(return_value=mock_response)
            mock_provider.default_model = "gpt-4o-mini"
            mock_provider.max_retries = 3
            mock_get.return_value = mock_provider
            result = await gateway.classify(
                "I need help",
                categories=["support", "sales", "billing"],
            )
            assert result == "support"

    def test_list_providers_returns_all(self):
        gateway = LLMGateway()
        providers = gateway.list_providers()
        names = [p["name"] for p in providers]
        assert "openai" in names
        assert "anthropic" in names
        assert "groq" in names
        assert "gemini" in names


@pytest.mark.unit
class TestMessageModels:
    def test_message_creation(self):
        msg = Message(role=MessageRole.USER, content="Hello")
        assert msg.role == MessageRole.USER
        assert msg.content == "Hello"

    def test_generate_request_defaults(self):
        req = GenerateRequest(messages=[Message(role=MessageRole.USER, content="Hi")])
        assert req.temperature == 0.7
        assert req.max_tokens == 2000
        assert req.json_mode is False

    def test_usage_info_addition(self):
        u1 = UsageInfo(prompt_tokens=10, completion_tokens=5, total_tokens=15)
        u2 = UsageInfo(prompt_tokens=20, completion_tokens=10, total_tokens=30)
        combined = u1 + u2
        assert combined.prompt_tokens == 30
        assert combined.total_tokens == 45


@pytest.mark.unit
class TestProviderErrors:
    def test_provider_error_includes_provider_name(self):
        err = ProviderError("[openai] test error", provider="openai")
        assert err.provider == "openai"
        assert "openai" in str(err)

    def test_rate_limit_error_has_retry_after(self):
        err = ProviderRateLimitError("openai", retry_after=30)
        assert err.retry_after == 30

    def test_handle_error_maps_auth(self):
        provider = OpenAIProvider(api_key="test")
        err = provider._handle_error(Exception("401 Unauthorized"))
        assert err.status_code == 401

    def test_handle_error_maps_rate_limit(self):
        provider = OpenAIProvider(api_key="test")
        err = provider._handle_error(Exception("429 Rate limit exceeded"))
        assert err.status_code == 429

    def test_handle_error_maps_timeout(self):
        provider = OpenAIProvider(api_key="test")
        err = provider._handle_error(Exception("Request timed out"))
        assert err.status_code == 504
