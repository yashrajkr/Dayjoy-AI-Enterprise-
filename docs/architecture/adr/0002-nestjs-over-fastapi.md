# ADR-0002: Choose NestJS (TypeScript) over FastAPI (Python)

**Status:** Accepted
**Date:** 2026-08-07

## Context

The Dayjoy AI Enterprise platform requires a backend. Two implementations exist:
- NestJS scaffold (TypeScript, 135 files, 0 tests)
- FastAPI reference (Python, 311 files, 834 tests)

The FastAPI implementation is significantly more complete but uses Python.

## Decision

Standardize on **NestJS + TypeScript** as the canonical backend.

## Rationale

- Team expertise is TypeScript (frontend uses Next.js + React)
- Single language across full stack reduces context switching
- Prisma ORM provides type-safe database access
- NestJS modular architecture matches the enterprise requirements
- n8n automation integrates well with TypeScript

## Consequences

- FastAPI code is kept in `_reference/` as implementation reference
- Port RAG pipeline, voice/telephony/WhatsApp providers, and auth flows from FastAPI to NestJS
- ~3-4 months of implementation work to reach parity with FastAPI reference

## Implementation note

When porting, reference these FastAPI files for patterns:
- `_reference/fastapi-backend-reference/app/ai/rag_pipeline/` → port to `backend/rag/`
- `_reference/fastapi-backend-reference/app/voice/providers/vapi_provider.py` → port to `vapi/`
- `_reference/fastapi-backend-reference/app/services/auth.py` → port to `backend/auth/`
- `_reference/fastapi-backend-reference/app/middleware/` → port to `backend/_shared/middleware/`
