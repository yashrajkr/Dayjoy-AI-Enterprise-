"""Telephony provider exceptions."""


class TelephonyProviderError(Exception):
    """Base exception for all telephony provider errors."""

    def __init__(self, message: str = "Telephony provider error") -> None:
        super().__init__(message)
        self.message = message


class TelephonyProviderAuthenticationError(TelephonyProviderError):
    """Raised when API credentials are invalid or missing."""

    def __init__(self, message: str = "Telephony provider authentication failed") -> None:
        super().__init__(message)


class TelephonyProviderRateLimitError(TelephonyProviderError):
    """Raised when the provider returns a rate-limit error."""

    def __init__(self, message: str = "Telephony provider rate limit exceeded") -> None:
        super().__init__(message)


class TelephonyProviderTimeoutError(TelephonyProviderError):
    """Raised when a provider request times out."""

    def __init__(self, message: str = "Telephony provider request timed out") -> None:
        super().__init__(message)


class TelephonyProviderConnectionError(TelephonyProviderError):
    """Raised when we cannot connect to the provider."""

    def __init__(self, message: str = "Cannot connect to telephony provider") -> None:
        super().__init__(message)


class TelephonyProviderNotImplementedError(TelephonyProviderError):
    """Raised when a provider method is not yet implemented (stub provider)."""

    def __init__(self, provider: str, method: str) -> None:
        super().__init__(
            f"Provider {provider!r} does not implement {method!r} — "
            f"this provider is a stub. Use 'twilio' for the full implementation."
        )
