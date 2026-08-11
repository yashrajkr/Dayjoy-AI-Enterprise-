# Contributing to Dayjoy Enterprise AI Platform

> **Engineering Contribution Guidelines**
>
> This document describes how to contribute to the Dayjoy Enterprise AI Platform monorepo.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Code Review Guidelines](#code-review-guidelines)
- [Testing Requirements](#testing-requirements)
- [Documentation Standards](#documentation-standards)
- [Commit Message Convention](#commit-message-convention)
- [Engineering Standards](#engineering-standards)

## 🤝 Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Collaborate openly
- Maintain professionalism

## 🚀 Getting Started

### Prerequisites

Before contributing, ensure you have:

1. **Access**: Repository access granted
2. **Setup**: Development environment configured
3. **Onboarding**: Completed [Developer Onboarding](./docs/getting-started/onboarding.md)
4. **Standards**: Read [Engineering Standards](./docs/standards/README.md)

### Development Setup

```bash
# Clone repository
git clone https://github.com/dayjoy/dayjoy-ai-platform.git
cd dayjoy-ai-platform

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env.local

# Verify setup
pnpm lint
pnpm test
```

## 📊 Development Workflow

### 1. Find or Create Issue

- Check existing issues in [GitHub Issues](https://github.com/dayjoy/dayjoy-ai-platform/issues)
- Create new issue if needed
- Wait for issue assignment or approval

### 2. Create Branch

```bash
# Update develop branch
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b feature/your-feature-name
```

**Branch Naming:**
- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation
- `refactor/description` - Refactoring
- `test/description` - Tests
- `chore/description` - Maintenance

### 3. Develop

- Follow [Engineering Standards](./docs/standards/README.md)
- Write tests for new functionality
- Update documentation as needed
- Commit frequently with clear messages

### 4. Test Locally

```bash
# Run linting
pnpm lint

# Run tests
pnpm test

# Run type checking
pnpm typecheck

# Build applications
pnpm build
```

### 5. Submit Pull Request

```bash
# Push branch
git push origin feature/your-feature-name

# Create PR via GitHub UI
# Select base branch: develop
# Fill out PR template completely
```

## 🔀 Pull Request Process

### PR Requirements

Before submitting a PR:

- [ ] Code follows [Engineering Standards](./docs/standards/README.md)
- [ ] Tests are written and passing
- [ ] Documentation is updated
- [ ] Commit messages follow convention
- [ ] No console errors or warnings
- [ ] Security considerations addressed
- [ ] Performance impact considered

### PR Template

All PRs must include:

1. **Description**: What and why
2. **Type**: Feature, fix, docs, etc.
3. **Testing**: How tested
4. **Screenshots**: If UI changes
5. **Checklist**: All requirements met
6. **Related Issues**: Link to issues

### PR Review Process

1. **Submit PR**: Complete PR template
2. **CI/CD**: Automated checks run
3. **Review**: Team members review
4. **Changes**: Address feedback
5. **Approval**: Required approvals obtained
6. **Merge**: Merge to `develop`

## 👀 Code Review Guidelines

### Reviewer Responsibilities

- Review code quality and standards
- Check test coverage
- Verify documentation
- Ensure security considerations
- Provide constructive feedback
- Approve or request changes

### Review Turnaround

- **Standard PRs**: 24-48 hours
- **Urgent PRs**: Same day (marked as urgent)
- **Complex PRs**: May require additional time

### Review Focus Areas

1. **Correctness**: Does it work?
2. **Quality**: Is it well-written?
3. **Tests**: Is it tested?
4. **Security**: Any vulnerabilities?
5. **Performance**: Any issues?
6. **Documentation**: Is it documented?

## ✅ Testing Requirements

### Test Coverage

All code must be tested:

- **New Features**: Unit + integration tests
- **Bug Fixes**: Regression tests
- **Critical Paths**: E2E tests
- **Performance**: Performance tests if applicable

### Test Standards

- Tests must be deterministic
- Tests must be maintainable
- Tests must be fast
- Tests must cover edge cases

### Running Tests

```bash
# All tests
pnpm test

# Unit tests
pnpm test:unit

# Integration tests
pnpm test:integration

# E2E tests
pnpm test:e2e

# Performance tests
pnpm test:performance
```

## 📚 Documentation Standards

### Documentation Requirements

- **Public APIs**: Must be documented
- **Complex Logic**: Must explain why
- **Configuration**: Must be documented
- **Architecture**: Must have diagrams
- **Operations**: Must have runbooks

### Documentation Locations

- **Code**: JSDoc/Docstrings
- **Features**: `docs/features/`
- **Architecture**: `docs/architecture/`
- **Operations**: `docs/runbooks/`
- **APIs**: OpenAPI/Swagger

### Documentation Review

- Documentation is reviewed in PRs
- Outdated docs are technical debt
- Docs must be updated with code

## 📝 Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style (formatting)
- `refactor`: Code refactoring
- `test`: Tests
- `chore`: Maintenance

### Examples

```
feat(voice-ai): add speech recognition support

Implemented Web Speech API integration for voice input.

Closes #123

feat(api): add user authentication endpoint
fix(whatsapp-ai): resolve message parsing error
docs(readme): update installation instructions
refactor(database): optimize query performance
test(integration): add API integration tests
chore(deps): update dependencies
```

## 🏛️ Engineering Standards

All contributors must follow [Engineering Standards](./docs/standards/README.md):

### Code Quality

- TypeScript strict mode
- ESLint rules enforced
- Prettier formatting
- No `any` types
- Proper error handling

### Security

- Input validation required
- Authentication/authorization
- Secrets in environment
- No hardcoded credentials
- Security scanning in CI

### Performance

- Performance budgets
- Lazy loading where appropriate
- Caching strategies
- Database query optimization
- Bundle size monitoring

### Accessibility

- WCAG 2.1 AA compliance
- Semantic HTML
- Keyboard navigation
- Screen reader support
- Color contrast

## 🔧 Repository Conventions

### Folder Structure

- `apps/` - Deployable applications
- `services/` - Backend services
- `packages/` - Shared libraries
- `agents/` - AI agents
- `knowledge/` - RAG knowledge
- `database/` - Database layer
- `infrastructure/` - Infrastructure
- `automation/` - Automation workflows
- `tests/` - Test suites
- `scripts/` - Development scripts
- `tools/` - Development tools
- `docs/` - Documentation

### File Naming

- **Lowercase**: All files lowercase
- **Hyphens**: Use hyphens for spaces
- **Extensions**: Proper file extensions
- **Index files**: `index.ts` for exports

### Package Naming

- **Scope**: `@dayjoy/package-name`
- **Prefix**: `dayjoy-` for standalone
- **Descriptive**: Clear purpose
- **Consistent**: Follow existing patterns

## 📞 Support

### Getting Help

- **Team Chat**: Engineering Slack/Teams
- **Documentation**: [docs/](./docs/)
- **Issues**: [GitHub Issues](https://github.com/dayjoy/dayjoy-ai-platform/issues)
- **Email**: engineering@dayjoy.com

### Escalation

- **Technical Issues**: Tech lead
- **Process Issues**: Engineering manager
- **Security Issues**: Security team
- **Urgent**: On-call engineer

## 🎓 Learning Resources

- [Developer Onboarding](./docs/getting-started/onboarding.md)
- [Engineering Standards](./docs/standards/README.md)
- [Architecture Overview](./docs/architecture/README.md)
- [Testing Guide](./docs/standards/testing.md)
- [Git Workflow](./docs/standards/git-workflow.md)

---

**Thank you for contributing to Dayjoy Enterprise AI Platform!**