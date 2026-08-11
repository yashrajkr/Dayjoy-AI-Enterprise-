# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest `main` | ✅ |
| latest release tag | ✅ |
| older versions | ❌ |

## Reporting a Vulnerability

The Dayjoy AI team takes security bugs seriously. We appreciate your efforts to responsibly disclose your findings, and will make every effort to acknowledge your contributions.

### How to Report

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please report vulnerabilities via:

- **Email**: security@dayjoyai.com
- **Subject**: `[SECURITY] <brief description>`
- **PGP**: (optional) encrypt to key fingerprint `ABCD 1234 5678 9ABC`

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Affected components (backend, frontend, DB, etc.)
- Potential impact
- Suggested fix (if any)
- Your name/handle for acknowledgment (optional)

### Response Timeline

| Step | Target |
|------|--------|
| Acknowledge receipt | 24 hours |
| Initial assessment | 72 hours |
| Fix or mitigation | 7-90 days (severity-dependent) |
| Public disclosure | After fix released (coordinated with reporter) |

### Scope

**In scope:**
- Authentication bypass
- Authorization flaws (privilege escalation)
- SQL injection
- XSS, CSRF
- Secrets exposure
- RCE (Remote Code Execution)
- DoS vulnerabilities
- AI-specific: prompt injection, PII leakage, model abuse

**Out of scope:**
- Theoretical attacks without proof of concept
- Social engineering
- Physical attacks
- Attacks requiring insider access
- Bugs in third-party dependencies (report upstream)

### Rewards

We offer:
- Public acknowledgment (with your permission)
- Swag (stickers, t-shirts)
- Bounty (for significant findings, at our discretion)

## Security Measures

This project implements:

- **Authentication**: SAML 2.0 SSO + OAuth 2.0 + API keys
- **Authorization**: RBAC with OPA (Open Policy Agent)
- **Encryption**: AES-256 at rest, TLS 1.3 in transit, mTLS service-to-service
- **Secrets**: HashiCorp Vault (no secrets in code/env)
- **PII**: Detection, redaction, tokenization (Presidio)
- **AI Guardrails**: Prompt injection filter, output toxicity filter, PII filter
- **Audit**: Append-only, tamper-evident audit log
- **Compliance**: SOC 2 (in progress), DPDP, HIPAA (planned), PCI-DSS (planned)

## Disclosure Policy

- We practice **coordinated disclosure**
- We will not take legal action against researchers who follow this policy
- We will acknowledge your contribution (with your permission)
- We request 90 days before public disclosure (negotiable for complex fixes)
