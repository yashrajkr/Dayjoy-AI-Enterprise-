"""Voice provider exceptions."""


class VoiceProviderError(Exception):
    """Base exception for all voice provider errors."""

    def __init__(self, message: str = "Voice provider error") -> None:
        super().__init__(message)
        self.message = message


class VoiceProviderAuthenticationError(VoiceProviderError):
    """Raised when API key is invalid or missing."""

    def __init__(self, message: str = "Voice provider authentication failed") -> None:
        super().__init__(message)


class VoiceProviderRateLimitError(VoiceProviderError):
    """Raised when the provider returns a rate-limit error."""

    def __init__(self, message: str = "Voice provider rate limit exceeded") -> None:
        super().__init__(message)


class VoiceProviderTimeoutError(VoiceProviderError):
    """Raised when a provider request times out."""

    def __init__(self, message: str = "Voice provider request timed out") -> None:
        super().__init__(message)


class VoiceProviderConnectionError(VoiceProviderError):
    """Raised when we cannot connect to the provider."""

    def __init__(self, message: str = "Cannot connect to voice provider") -> None:
        super().__init__(message)


class VoiceProviderNotImplementedError(VoiceProviderError):
    """Raised when a provider method is not yet implemented (stub provider)."""

    def __init__(self, provider: str, method: str) -> None:
        super().__init__(
            f"Provider {provider!r} does not implement {method!r} — "
            f"this provider is a stub. Use 'vapi' for the full implementation."
        )
