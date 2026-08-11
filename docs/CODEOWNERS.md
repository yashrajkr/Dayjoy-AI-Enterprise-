# CODEOWNERS Recommendation

> **Repository Ownership and Review Requirements**
>
> This file defines code ownership for automatic review assignment.

## Format

```
# Pattern @owner
```

## Recommended CODEOWNERS

```gitignore
# Dayjoy Enterprise AI Platform - CODEOWNERS

# Global owners
* @dayjoy/engineering @dayjoy/architecture

# Applications
/apps/voice-ai/ @dayjoy/voice-ai-team
/apps/whatsapp-ai/ @dayjoy/whatsapp-ai-team
/apps/website-ai/ @dayjoy/website-ai-team
/apps/admin-dashboard/ @dayjoy/frontend-team
/apps/customer-portal/ @dayjoy/frontend-team
/apps/distributor-portal/ @dayjoy/frontend-team
/apps/employee-portal/ @dayjoy/frontend-team

# Services
/services/api-gateway/ @dayjoy/backend-team @dayjoy/architecture
/services/rag-service/ @dayjoy/ai-team @dayjoy/rag-team
/services/agent-orchestrator/ @dayjoy/ai-team @dayjoy/architecture
/services/integration-service/ @dayjoy/integration-team
/services/notification-service/ @dayjoy/backend-team

# Shared packages
/packages/ui/ @dayjoy/frontend-team @dayjoy/design-team
/packages/utils/ @dayjoy/engineering
/packages/config/ @dayjoy/architecture @dayjoy/devops
/packages/types/ @dayjoy/architecture @dayjoy/engineering
/packages/sdk/ @dayjoy/backend-team @dayjoy/integration-team

# AI agents
/agents/business-assistants/ @dayjoy/ai-team @dayjoy/business-team
/agents/support-agents/ @dayjoy/ai-team @dayjoy/support-team
/agents/automation-agents/ @dayjoy/ai-team @dayjoy/automation-team

# Knowledge base
/knowledge/ @dayjoy/rag-team @dayjoy/knowledge-team

# Database
/database/ @dayjoy/database-team @dayjoy/architecture

# Infrastructure
/infrastructure/ @dayjoy/devops-team @dayjoy/security-team

# Automation
/automation/ @dayjoy/automation-team @dayjoy/business-team

# Tests
/tests/ @dayjoy/qa-team @dayjoy/engineering

# Documentation
/docs/ @dayjoy/documentation-team @dayjoy/engineering

# Configuration
.github/ @dayjoy/devops-team @dayjoy/security-team
.eslintrc.* @dayjoy/frontend-team @dayjoy/backend-team
.prettierrc.* @dayjoy/frontend-team @dayjoy/backend-team
tsconfig.* @dayjoy/architecture @dayjoy/engineering
pnpm-workspace.yaml @dayjoy/architecture @dayjoy/devops

# Scripts and tools
/scripts/ @dayjoy/devops-team
/tools/ @dayjoy/devops-team
```

## Owner Teams

| Team | Responsibilities |
|------|-----------------|
| `@dayjoy/engineering` | All engineering |
| `@dayjoy/architecture` | Architecture and design |
| `@dayjoy/frontend-team` | Frontend applications |
| `@dayjoy/backend-team` | Backend services |
| `@dayjoy/ai-team` | AI platform and agents |
| `@dayjoy/voice-ai-team` | Voice AI service |
| `@dayjoy/whatsapp-ai-team` | WhatsApp AI service |
| `@dayjoy/website-ai-team` | Website AI service |
| `@dayjoy/rag-team` | RAG knowledge base |
| `@dayjoy/integration-team` | CRM/ERP integrations |
| `@dayjoy/devops-team` | Infrastructure and DevOps |
| `@dayjoy/security-team` | Security and compliance |
| `@dayjoy/qa-team` | Quality assurance |
| `@dayjoy/database-team` | Database management |
| `@dayjoy/automation-team` | Business automation |
| `@dayjoy/knowledge-team` | Knowledge curation |
| `@dayjoy/documentation-team` | Documentation |
| `@dayjoy/design-team` | UI/UX design |
| `@dayjoy/business-team` | Business stakeholders |
| `@dayjoy/support-team` | Support operations |

## Review Requirements

### Required Reviews

- **All PRs**: Minimum 1 approval from code owner
- **Architecture changes**: `@dayjoy/architecture` approval
- **Security changes**: `@dayjoy/security-team` approval
- **AI changes**: `@dayjoy/ai-team` approval
- **Infrastructure changes**: `@dayjoy/devops-team` approval
- **Database changes**: `@dayjoy/database-team` approval

### Optional Reviews

- **Documentation**: `@dayjoy/documentation-team`
- **UI/UX**: `@dayjoy/design-team`
- **Business logic**: `@dayjoy/business-team`

## Override Process

If CODEOWNERS review is blocked:

1. Contact team lead
2. Escalate to engineering manager
3. Document reason for override
4. Review after merge if urgent

## Maintenance

- Review CODEOWNERS quarterly
- Update as teams change
- Ensure all areas have owners
- Remove inactive owners

---

**Contact**: engineering@dayjoy.com for CODEOWNERS questions