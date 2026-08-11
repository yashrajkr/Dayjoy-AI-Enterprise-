"""Notification provider abstractions + implementations.

Email providers:
- ResendProvider (fully implemented)
- SendGridProvider (fully implemented)
- LogEmailProvider (dev — logs instead of sending)

SMS providers:
- TwilioSMSProvider (fully implemented)
- LogSMSProvider (dev)

Push providers:
- FCMProvider (fully implemented)
- LogPushProvider (dev)
"""

from app.notifications.providers.base import (
    EmailProvider,
    EmailResult,
    PushProvider,
    PushResult,
    SMSProvider,
    SMSResult,
)
from app.notifications.providers.email_providers import (
    LogEmailProvider,
    ResendProvider,
    SendGridProvider,
    get_email_provider,
)
from app.notifications.providers.push_providers import (
    FCMProvider,
    LogPushProvider,
    get_push_provider,
)
from app.notifications.providers.sms_providers import (
    LogSMSProvider,
    TwilioSMSProvider,
    get_sms_provider,
)

__all__ = [
    "EmailProvider",
    "EmailResult",
    "FCMProvider",
    "LogEmailProvider",
    "LogPushProvider",
    "LogSMSProvider",
    "PushProvider",
    "PushResult",
    "ResendProvider",
    "SMSProvider",
    "SMSResult",
    "SendGridProvider",
    "TwilioSMSProvider",
    "get_email_provider",
    "get_push_provider",
    "get_sms_provider",
]
