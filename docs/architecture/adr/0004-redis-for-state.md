# ADR-0004: Use Redis for Session State, JWT Blocklist, Rate Limiting

**Status:** Accepted
**Date:** 2026-08-07

## Context

Multi-replica K8s deployment requires shared state for:
- OAuth2 authorization codes (short TTL)
- JWT revocation blocklist (JTI with TTL)
- Per-user rate limiting (sliding window)
- Vapi session memory (during active calls)
- Conversation flow state

## Decision

Use **Redis 7** (AWS ElastiCache) for all ephemeral state.

## Rationale

- Sub-millisecond reads/writes
- Native TTL support
- Pub/sub for real-time updates
- Battle-tested in production
- NestJS integration via `ioredis`

## Consequences

- Redis is a hard dependency (no in-memory fallback in production)
- All state keys must have TTL (prevent memory leaks)
- Redis persistence enabled (AOF) for durability across restarts
- ElastiCache multi-AZ for HA
