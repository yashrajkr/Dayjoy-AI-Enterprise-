"""Custom exception classes and global exception handlers.

These integrate with FastAPI's exception handling to return
consistent RFC 7807 Problem Details responses.
"""

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

# ===== Exception Classes =====


class AppError(Exception):
    """Base exception for all application errors.

    All custom exceptions should inherit from this.
    """

    def __init__(
        self,
        message: str = "An application error occurred",
        *,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        error_type: str = "app_error",
        details: dict[str, Any] | None = None,
    ) -> None:
        self.message = message
        self.status_code = status_code
        self.error_type = error_type
        self.details = details or {}
        super().__init__(self.message)


class AuthenticationError(AppError):
    """Raised when authentication fails (invalid credentials, expired token, etc.)."""

    def __init__(self, message: str = "Authentication failed") -> None:
        super().__init__(
            message,
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_type="authentication_error",
        )


class AuthorizationError(AppError):
    """Raised when a user lacks permission for an action."""

    def __init__(self, message: str = "Insufficient permissions") -> None:
        super().__init__(
            message,
            status_code=status.HTTP_403_FORBIDDEN,
            error_type="authorization_error",
        )


class NotFoundError(AppError):
    """Raised when a requested resource does not exist."""

    def __init__(self, resource: str = "Resource", resource_id: str = "") -> None:
        message = f"{resource} not found"
        if resource_id:
            message = f"{resource} '{resource_id}' not found"
        super().__init__(
            message,
            status_code=status.HTTP_404_NOT_FOUND,
            error_type="not_found",
        )


class ValidationError(AppError):
    """Raised when business validation fails (beyond Pydantic schema validation)."""

    def __init__(self, message: str = "Validation failed", details: dict | None = None) -> None:
        super().__init__(
            message,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error_type="validation_error",
            details=details,
        )


class ConflictError(AppError):
    """Raised when a request conflicts with current state (e.g., duplicate)."""

    def __init__(self, message: str = "Conflict with current state") -> None:
        super().__init__(
            message,
            status_code=status.HTTP_409_CONFLICT,
            error_type="conflict",
        )


class RateLimitError(AppError):
    """Raised when rate limit is exceeded."""

    def __init__(self, message: str = "Rate limit exceeded") -> None:
        super().__init__(
            message,
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            error_type="rate_limited",
        )


# ===== FastAPI Exception Handlers =====


def _problem_details(
    request: Request,
    status_code: int,
    title: str,
    detail: str,
    error_type: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build an RFC 7807 Problem Details response body."""
    body: dict[str, Any] = {
        "type": f"https://docs.dayjoyai.com/errors/{error_type}",
        "title": title,
        "status": status_code,
        "detail": detail,
        "instance": str(request.url.path),
        "request_id": getattr(request.state, "request_id", None),
    }
    if details:
        body["errors"] = details
    return body


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Handle AppError and its subclasses."""
    return JSONResponse(
        status_code=exc.status_code,
        content=_problem_details(
            request=request,
            status_code=exc.status_code,
            title=exc.__class__.__name__,
            detail=exc.message,
            error_type=exc.error_type,
            details=exc.details,
        ),
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all handler for unhandled exceptions.

    Returns a generic 500 to avoid leaking internal details.
    The actual exception is logged separately.
    """
    from app.core.logging import get_logger

    logger = get_logger(__name__)
    logger.error(
        "unhandled_exception",
        error=str(exc),
        error_type=type(exc).__name__,
        path=str(request.url.path),
    )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=_problem_details(
            request=request,
            status_code=500,
            title="Internal Server Error",
            detail="An unexpected error occurred. Please try again.",
            error_type="internal_error",
        ),
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Register all exception handlers on the FastAPI app.

    Call this during app initialization.
    """
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
