"""Standardized API response envelope helpers."""

from __future__ import annotations

from typing import Any

from fastapi import Response
from fastapi.responses import JSONResponse


def success(data: Any, meta: dict | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"success": True, "data": data}
    if meta:
        body["meta"] = meta
    return body


def created(data: Any, *, response: Response | None = None, meta: dict | None = None) -> dict[str, Any]:
    if response is not None:
        response.status_code = 201
    body: dict[str, Any] = {"success": True, "data": data}
    if meta:
        body["meta"] = meta
    return body


def no_content(response: Response) -> None:
    response.status_code = 204
    return None


def paginated(items: list[Any], *, total: int, skip: int = 0, limit: int = 50) -> dict[str, Any]:
    page = (skip // limit) + 1 if limit else 1
    pages = (total + limit - 1) // limit if limit else 0
    return {
        "success": True,
        "data": items,
        "meta": {"pagination": {"total": total, "skip": skip, "limit": limit, "page": page, "pages": pages,
                                 "has_next": (skip + limit) < total, "has_prev": skip > 0}},
    }
