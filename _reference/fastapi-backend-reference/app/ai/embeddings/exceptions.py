"""Exception classes for embedding providers."""

from app.core.exceptions import AppError


class EmbeddingProviderError(AppError):
    """Base exception for all embedding provider errors."""

    def __init__(self, message: str = "Embedding provider error") -> None:
        super().__init__(
            message,
            status_code=502,
            error_type="embedding_provider_error",
        )


class EmbeddingAuthenticationError(EmbeddingProviderError):
    """Raised when API key is invalid or missing."""

    def __init__(self, message: str = "Embedding provider authentication failed") -> None:
        super().__init__(message)
        self.error_type = "embedding_auth_error"


class EmbeddingRateLimitError(EmbeddingProviderError):
    """Raised when the embedding provider returns a rate-limit error."""

    def __init__(self, message: str = "Embedding provider rate limit exceeded") -> None:
        super().__init__(message)
        self.error_type = "embedding_rate_limit"


class EmbeddingTimeoutError(EmbeddingProviderError):
    """Raised when an embedding request times out."""

    def __init__(self, message: str = "Embedding provider request timed out") -> None:
        super().__init__(message)
        self.error_type = "embedding_timeout"


class EmbeddingConnectionError(EmbeddingProviderError):
    """Raised when we cannot connect to the embedding provider."""

    def __init__(self, message: str = "Cannot connect to embedding provider") -> None:
        super().__init__(message)
        self.error_type = "embedding_connection_error"


class EmbeddingModelNotAvailableError(EmbeddingProviderError):
    """Raised when the requested embedding model is not available on the provider."""

    def __init__(self, model: str, provider: str) -> None:
        super().__init__(
            f"Embedding model {model!r} is not available on provider {provider!r}"
        )
        self.error_type = "embedding_model_not_available"
