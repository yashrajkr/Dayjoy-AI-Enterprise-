"""AI Provider exceptions."""


class ProviderError(Exception):
    """Base exception for all AI provider errors."""

    def __init__(self, message: str, provider: str = "", status_code: int = 500) -> None:
        self.provider = provider
        self.status_code = status_code
        super().__init__(message)


class ProviderAuthenticationError(ProviderError):
    """Raised when API key is invalid or missing."""

    def __init__(self, provider: str, message: str = "Invalid or missing API key") -> None:
        super().__init__(f"[{provider}] {message}", provider=provider, status_code=401)


class ProviderRateLimitError(ProviderError):
    """Raised when the provider rate-limits the request."""

    def __init__(self, provider: str, retry_after: float | None = None) -> None:
        msg = f"[{provider}] Rate limit exceeded"
        if retry_after:
            msg += f", retry after {retry_after}s"
        self.retry_after = retry_after
        super().__init__(msg, provider=provider, status_code=429)


class ProviderTimeoutError(ProviderError):
    """Raised when the provider request times out."""

    def __init__(self, provider: str, timeout: float) -> None:
        super().__init__(
            f"[{provider}] Request timed out after {timeout}s",
            provider=provider,
            status_code=504,
        )


class ProviderModelNotAvailableError(ProviderError):
    """Raised when the requested model is not available on the provider."""

    def __init__(self, provider: str, model: str) -> None:
        super().__init__(
            f"[{provider}] Model '{model}' is not available",
            provider=provider,
            status_code=400,
        )


class ProviderConnectionError(ProviderError):
    """Raised when the provider cannot be reached."""

    def __init__(self, provider: str, detail: str = "") -> None:
        super().__init__(
            f"[{provider}] Connection error: {detail}"
            if detail
            else f"[{provider}] Connection error",
            provider=provider,
            status_code=503,
        )


class NoProviderAvailableError(ProviderError):
    """Raised when no provider is configured or all providers have failed."""

    def __init__(self, message: str = "No AI provider is available") -> None:
        super().__init__(message, provider="none", status_code=503)
