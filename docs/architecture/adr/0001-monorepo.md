# ADR-0001: Use a Monorepo

**Date:** 2026-07-15
**Status:** Accepted

## Context

The Dayjoy AI Platform will eventually have multiple deployable services (backend API, frontend, agent runtime, RAG engine, voice gateway) plus shared libraries (contracts, SDK, UI components). We need to decide: one repository (monorepo) or many (polyrepo)?

## Decision

We will use a **monorepo** — a single Git repository containing all code.

## Rationale

### Why Monorepo?

1. **Shared types and contracts**: Our OpenAPI schemas, Pydantic models, and TypeScript types are referenced across services. A monorepo allows atomic refactors — change a type once, update all consumers in the same PR.

2. **Simpler onboarding**: A new engineer clones one repo, runs `make setup`, and has the full stack running. No need to discover, clone, and configure multiple repositories.

3. **Unified CI/CD**: One pipeline, one set of standards, one place to look when something breaks. Path-based triggers ensure only affected services are tested.

4. **Atomic commits**: A change that touches backend + frontend + database migration is one PR, not three coordinated PRs across three repos. This makes review easier and reduces integration bugs.

5. **Code sharing**: Shared utilities (logging, error handling, test fixtures) are available to all services without publishing internal packages.

### Why NOT Polyrepo?

1. **Service independence**: Polyrepo allows each service to be deployed, versioned, and owned independently. This is valuable for large teams (50+ engineers) but overkill for our current team size (10-15 engineers).

2. **Smaller repos**: Each repo is smaller and faster to clone. However, with Git LFS and shallow clones, monorepo size is manageable.

3. **Technology isolation**: Each repo could use a different language/framework. We don't need this — we've standardized on Python + TypeScript.

### Industry Examples

- **Google, Meta, Twitter**: Use monorepos at extreme scale (millions of files).
- **Vercel**: Monorepo for Next.js + docs + examples.
- **Stripe**: Monorepo for backend services.

## Consequences

### Positive

- ✅ Faster development (no cross-repo coordination)
- ✅ Easier onboarding
- ✅ Atomic refactors
- ✅ Shared tooling and standards

### Negative

- ⚠️ Repo grows over time (mitigated by path-based CI, shallow clones)
- ⚠️ All engineers have access to all code (acceptable for our stage)
- ⚠️ Need tooling (pnpm workspaces, uv workspaces) to manage multiple packages

### Mitigations

- **Path-based CI**: GitHub Actions triggers only run for affected paths.
- **CODEOWNERS**: Per-folder ownership for auto-review routing.
- **Workspace tooling**: pnpm-workspace.yaml for JS, uv workspace for Python.
- **Selective builds**: Docker BuildKit only rebuilds changed layers.

## Implementation

```
dayjoyai-platform/           ← Single Git repo
├── apps/                    ← Deployable applications
│   ├── backend/
│   ├── frontend/
│   ├── agent-runtime/       (Phase 6)
│   └── voice-gateway/       (Phase 7)
├── packages/                ← Shared libraries
│   ├── database/
│   ├── contracts/           (Phase 2)
│   └── ui-components/       (Phase 4)
├── db/                      ← Shared migrations
├── docker/                  ← Docker configs
├── infra/                   ← Terraform, K8s
├── scripts/                 ← Dev tooling
├── tests/                   ← Cross-cutting tests
└── docs/                    ← Documentation
```

## Reversibility

If we outgrow the monorepo (e.g., team exceeds 50 engineers, or we need strict service isolation), we can split into polyrepo. The monorepo structure makes this easy — each `apps/*` folder can be extracted into its own repo with `git filter-repo`.
