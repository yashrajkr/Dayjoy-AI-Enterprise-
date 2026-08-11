# ADR-0003: Choose Prisma over TypeORM

**Status:** Accepted
**Date:** 2026-08-07

## Context

Need an ORM for NestJS backend. Options: Prisma, TypeORM, MikroORM, Sequelize.

## Decision

Use **Prisma 6**.

## Rationale

- Type-safe schema → generated client → end-to-end TS safety
- Excellent migration tooling (`prisma migrate`)
- Supports pgvector via `postgresqlExtensions` preview feature
- Clean schema definition file (single source of truth)
- Auto-generated client eliminates boilerplate

## Consequences

- All field accessors are camelCase (TS convention) even though DB columns are snake_case
- Use `@@map` and `@map` to map camelCase models to snake_case tables
- Migrations are SQL-first (can be hand-edited for complex cases)
