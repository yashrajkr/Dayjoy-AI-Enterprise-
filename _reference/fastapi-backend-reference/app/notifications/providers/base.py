"""Abstract base classes for notification providers."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class EmailResult:
    """Result of sending an email."""

    success: bool
    message_id: str | None = None
    provider: str = ""
    error: str | None = None
    latency_ms: int = 0
    raw_response: dict[str, Any] | None = None


@dataclass
class SMSResult:
    """Result of sending an SMS."""

    success: bool
    message_id: str | None = None
    provider: str = ""
    error: str | None = None
    latency_ms: int = 0
    raw_response: dict[str, Any] | None = None


@dataclass
class PushResult:
    """Result of sending a push notification."""

    success: bool
    message_id: str | None = None
    provider: str = ""
    error: str | None = None
    latency_ms: int = 0
    raw_response: dict[str, Any] | None = None


class EmailProvider(ABC):
    """Abstract base for email providers."""

    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    async def send(
        self,
        *,
        to: str,
        subject: str,
        html: str | None = None,
        text: str | None = None,
        from_email: str = "",
        from_name: str = "",
        reply_to: str | None = None,
        attachments: list[dict[str, Any]] | None = None,
        headers: dict[str, str] | None = None,
    ) -> EmailResult: ...

    @abstractmethod
    def is_available(self) -> bool: ...


class SMSProvider(ABC):
    """Abstract base for SMS providers."""

    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    async def send(
        self,
        *,
        to: str,
        body: str,
        from_number: str = "",
        sender_id: str = "",
    ) -> SMSResult: ...

    @abstractmethod
    def is_available(self) -> bool: ...


class PushProvider(ABC):
    """Abstract base for push notification providers."""

    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    async def send(
        self,
        *,
        token: str,
        title: str,
        body: str,
        data: dict[str, Any] | None = None,
        icon: str | None = None,
        click_action: str | None = None,
    ) -> PushResult: ...

    @abstractmethod
    def is_available(self) -> bool: ...
