# Dayjoy Enterprise AI Platform

> **Production-Ready Enterprise AI Monorepo**
>
> Complete AI ecosystem including Voice AI, WhatsApp AI, Website AI, RAG Knowledge Base, CRM/ERP Integrations, and Enterprise Automation.

## 📋 Quick Links

- [Architecture Documentation](./docs/architecture/)
- [Getting Started](./docs/getting-started/)
- [Engineering Standards](./docs/standards/)
- [Contributing Guide](./CONTRIBUTING.md)
- [Change Log](./CHANGELOG.md)

## 🏗️ Repository Overview

This is the official monorepo for the Dayjoy Enterprise AI Platform. It contains all applications, services, libraries, and infrastructure required to build, deploy, and operate the complete AI ecosystem.

### Architecture Alignment

This repository implements the complete Dayjoy Enterprise AI Platform architecture:

- **Business Architecture** - Business model, customer journeys, distributor network
- **Data Architecture** - Enterprise data strategy, RAG knowledge platform
- **API Architecture** - API strategy, integration patterns, CRM/ERP connectivity
- **AI & Agent Architecture** - AI platform, agent orchestration, safety & governance
- **AI Capabilities** - Voice AI, WhatsApp AI, Website AI, RAG knowledge base
- **Frontend Architecture** - UX strategy, design system, accessibility
- **Infrastructure Architecture** - Cloud infrastructure, DevOps, observability
- **Enterprise Governance** - Security, compliance, risk, operations
- **Implementation Blueprint** - Build plans, testing, deployment, scaling

### Repository Structure

```
dayjoy-ai-platform/
├── apps/                    # Deployable applications
│   ├── voice-ai/           # Voice AI service
│   ├── whatsapp-ai/        # WhatsApp AI service
│   ├── website-ai/         # Website AI service
│   ├── admin-dashboard/    # Admin dashboard
│   ├── customer-portal/    # Customer portal
│   ├── distributor-portal/ # Distributor portal
│   └── employee-portal/    # Employee portal
├── services/                # Backend services
│   ├── api-gateway/        # API gateway
│   ├── rag-service/        # RAG knowledge service
│   ├── agent-orchestrator/ # AI agent orchestrator
│   ├── integration-service/ # CRM/ERP integrations
│   └── notification-service/ # Notifications
├── packages/                # Shared libraries
│   ├── ui/                 # UI component library
│   ├── utils/              # Shared utilities
│   ├── config/             # Shared configuration
│   ├── types/              # Type definitions
│   └── sdk/                # Client SDKs
├── agents/                  # AI agents
│   ├── business-assistants/ # Business AI assistants
│   ├── support-agents/     # Support AI agents
│   └── automation-agents/  # Automation AI agents
├── knowledge/               # RAG knowledge base
│   ├── sources/            # Knowledge sources
│   ├── processed/          # Processed knowledge
│   └── validation/         # Knowledge validation
├── database/                # Database layer
│   ├── migrations/         # Database migrations
│   ├── models/             # Data models
│   └── seeds/              # Seed data
├── infrastructure/          # Infrastructure
│   ├── terraform/          # Terraform configurations
│   ├── kubernetes/         # Kubernetes manifests
│   └── docker/             # Docker configurations
├── automation/              # Automation workflows
│   ├── business-workflows/ # Business process automation
│   ├── ai-workflows/      # AI-driven automation
│   └── integration-flows/ # Integration workflows
├── tests/                   # Testing
│   ├── unit/              # Unit tests
│   ├── integration/       # Integration tests
│   ├── e2e/               # End-to-end tests
│   └── performance/       # Performance tests
├── scripts/                 # Development scripts
├── tools/                   # Development tools
├── docs/                    # Documentation
│   ├── architecture/       # Architecture docs
│   ├── getting-started/   # Onboarding
│   ├── standards/         # Engineering standards
│   └── runbooks/          # Operational runbooks
└── .github/                 # GitHub configurations
```

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Python 3.11+
- pnpm 9+
- Docker 24+
- Git 2.40+

### Quick Start

```bash
# Clone repository
git clone https://github.com/dayjoy/dayjoy-ai-platform.git
cd dayjoy-ai-platform

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env.local

# Start development
pnpm dev
```

### Documentation

- [Developer Onboarding](./docs/getting-started/onboarding.md)
- [Engineering Standards](./docs/standards/)
- [Architecture Overview](./docs/architecture/README.md)

## 📦 Repository Organization

### Applications (`apps/`)

Deployable frontend applications:

- **Voice AI** - Voice-based AI interactions
- **WhatsApp AI** - WhatsApp business AI
- **Website AI** - Website AI chatbot
- **Admin Dashboard** - Enterprise admin interface
- **Customer Portal** - Customer self-service
- **Distributor Portal** - Distributor management
- **Employee Portal** - Internal employee tools

### Services (`services/`)

Backend microservices:

- **API Gateway** - Central API entry point
- **RAG Service** - Knowledge retrieval service
- **Agent Orchestrator** - AI agent coordination
- **Integration Service** - CRM/ERP integrations
- **Notification Service** - Multi-channel notifications

### Shared Libraries (`packages/`)

Reusable code shared across applications:

- **UI** - Component library
- **Utils** - Shared utilities
- **Config** - Configuration management
- **Types** - TypeScript type definitions
- **SDK** - Client SDKs

### AI Agents (`agents/`)

AI agent implementations:

- **Business Assistants** - Business process AI
- **Support Agents** - Customer support AI
- **Automation Agents** - Workflow automation AI

### Knowledge Base (`knowledge/`)

RAG knowledge management:

- **Sources** - Raw knowledge sources
- **Processed** - Processed knowledge artifacts
- **Validation** - Knowledge validation results

### Database (`database/`)

Database layer:

- **Migrations** - Schema migrations
- **Models** - Data models
- **Seeds** - Seed data

### Infrastructure (`infrastructure/`)

Infrastructure as code:

- **Terraform** - Cloud infrastructure
- **Kubernetes** - Container orchestration
- **Docker** - Container definitions

### Automation (`automation/`)

Business and AI automation:

- **Business Workflows** - Process automation
- **AI Workflows** - AI-driven automation
- **Integration Flows** - System integrations

### Testing (`tests/`)

Test suites:

- **Unit** - Unit tests
- **Integration** - Integration tests
- **E2E** - End-to-end tests
- **Performance** - Performance tests

## 🏛️ Governance

### Code Ownership

See [CODEOWNERS](./.github/CODEOWNERS) for team ownership of repository areas.

### Engineering Standards

All code must follow [Engineering Standards](./docs/standards/README.md):

- Code style and conventions
- Testing requirements
- Security requirements
- Documentation standards
- Git workflow

### Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

## 📊 Development Workflow

### Git Branch Strategy

- `main` - Production-ready code
- `develop` - Integration branch
- `feature/*` - Feature branches
- `release/*` - Release preparation
- `hotfix/*` - Production hotfixes

### Pull Request Process

1. Create feature branch from `develop`
2. Develop and test locally
3. Submit PR to `develop`
4. Code review by team
5. CI/CD validation
6. Merge to `develop`
7. Release to `main`

### Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## 🔒 Security

- All commits are signed
- Security scanning in CI
- Dependency vulnerability monitoring
- Access control via CODEOWNERS
- Secrets managed via environment variables

## 📈 Monitoring & Observability

- Application monitoring configured
- Logging standards enforced
- Metrics collection enabled
- Alerting configured for production

## 📝 License

Proprietary - Dayjoy Enterprise. All rights reserved.

See [LICENSE](./LICENSE) for details.

## 📞 Support

- **Engineering Team**: engineering@dayjoy.com
- **Documentation**: [docs/](./docs/)
- **Issues**: [GitHub Issues](https://github.com/dayjoy/dayjoy-ai-platform/issues)

---

**Dayjoy Enterprise AI Platform** - Production-Ready AI Ecosystem