# Contributing to Dayjoy AI Enterprise

Thank you for your interest in contributing! This document covers the basics.

## Development Setup

See [README.md](README.md) for setup instructions.

## Workflow

1. **Fork & clone** the repo.
2. **Create a branch**: `git checkout -b feat/your-feature` (use `feat/`, `fix/`, `docs/`, `chore/` prefixes).
3. **Make changes** following the code style below.
4. **Run checks**:
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   ```
5. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat(voice): add call-ended handler
   fix(rag): correct embedding dimension check
   docs(api): update webhook signature verification
   ```
6. **Push** and open a PR against `main`.

## Code Style

- **TypeScript**: strict mode, no `any` (use `unknown` if needed).
- **Naming**: `camelCase` for variables/functions, `PascalCase` for classes/types, `SCREAMING_SNAKE_CASE` for constants.
- **Files**: `kebab-case.ts` for files, except `*.module.ts`, `*.controller.ts`, `*.service.ts` which match the class name.
- **Prisma models**: `PascalCase`, fields in `camelCase`. SQL tables in `snake_case` via `@@map`.
- **Tests**: colocated (`*.service.ts` → `*.service.spec.ts`).

## Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`.

## Pull Request Checklist

- [ ] Code follows style guide
- [ ] Self-review completed
- [ ] Tests added/updated and passing
- [ ] Documentation updated
- [ ] No new lint warnings
- [ ] Branch is up to date with `main`

## Reporting Issues

Use the GitHub issue templates in `.github/ISSUE_TEMPLATE/`.

## License

By contributing, you agree that your contributions are licensed under the project's proprietary license (see [LICENSE](LICENSE)).
