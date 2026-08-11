# AI Management Fix Audit

**Date:** 2026-08-09
**Scope:** Frontend admin dashboard — AI Management capabilities
**Status:** Audit complete; fix plan defined

## Executive summary

The Dayjoy AI Enterprise **backend** has a complete and well-modelled data layer
(AiAgent, AiMemory, RagDocument, RagChunk, AuditLog, Role, Permission, VoiceSession,
WhatsappSession, WebSession, Workflow). The **frontend** is currently a static
mock-only shell: every button fires a `toast.info()` notification and nothing
actually mutates state, persists to a store, or calls the backend.

The ProLockedPage component ("Upgrade to Pro") is incorrectly applied to seven
internal-admin views. This must be removed entirely — internal admins do not
subscribe to tiers; they are authorised via RBAC.

## Per-feature audit

### 1. Knowledge Base
| Aspect | Current state |
|---|---|
| Frontend component | `src/components/views/knowledge-view.tsx` |
| Frontend API | none — uses static `kbDocuments` array from `src/data/mock.ts` |
| Backend service | `backend/knowledge/knowledge.service.ts` (exists, with articles.service.ts) |
| Backend controller | `backend/knowledge/knowledge.controller.ts` |
| Database models | `RagDocument`, `RagChunk`, `RagSource`, `RagEmbedding`, `RagQuery` |
| **Current failure** | Upload button = toast only. Export = toast only. "Last 7 days" filter does not exist. Search input is wired to local state but does not filter the table. Delete / reprocess do not exist. |
| **Root cause** | No client-side data store; no API client wiring; mock data is immutable. |
| **Required fix** | Build `knowledgeStore` (Zustand + localStorage), real upload dialog with file validation + processing pipeline simulation, export to CSV, date-range filter that actually filters, search that filters table, delete with confirm, reprocess action. |

### 2. AI Assistants (AI Management → Agents tab)
| Aspect | Current state |
|---|---|
| Frontend component | `src/components/views/ai-view.tsx` (Agents tab) |
| Frontend API | none — uses static `agents` array |
| Backend service | `backend/ai/ai.service.ts` |
| Database models | `AiAgent` with `AgentType` enum (SUPPORT, SALES, ONBOARDING, TECHNICAL, BILLING, DISTRIBUTOR, ADMIN, VOICE, WHATSAPP, WEB) |
| **Current failure** | "Configure" = toast. "Test" = toast. No "Open Assistant" page. No create/edit/delete. No way to attach knowledge/tools/memory/prompts to an assistant. |
| **Root cause** | No assistant store; no assistant detail page; no form. |
| **Required fix** | Build `assistantStore`, assistant detail drawer (open), configure form (name, type, description, system prompt, model, temperature, knowledge sources, tools, memory, allowed channels), test runner that executes the configured pipeline. |

### 3. Tools (AI Management → Tools tab)
| Aspect | Current state |
|---|---|
| Frontend component | `src/components/views/ai-view.tsx` (Tools tab) |
| Frontend API | none — uses static `tools` array |
| Backend service | `backend/ai/tools.service.ts` |
| **Current failure** | No "Add Tool" button. No edit/delete. "Test" = toast only. |
| **Root cause** | No tool store; no form. |
| **Required fix** | Build `toolStore`, Add Tool dialog, Edit dialog, Delete with confirm, Test runner that shows the tool's input/output, enable/disable toggle, assistant-assignment field. |

### 4. Memory (AI Management → Memory tab)
| Aspect | Current state |
|---|---|
| Frontend component | `src/components/views/ai-view.tsx` (Memory tab) |
| Frontend API | none — uses static `memoryRows` array |
| Backend service | `backend/ai/memory.service.ts` |
| Database models | `AiMemory` with `MemoryType` enum (FACT, PREFERENCE, HISTORY, CONTEXT) |
| **Current failure** | Read-only table. No add/edit/delete. No "Test retrieval" action. No retention policy config. |
| **Root cause** | No memory store. |
| **Required fix** | Build `memoryStore`, Add memory dialog, Edit, Delete, Test retrieval (returns matching memories for a query), retention policy display. |

### 5. Prompts (AI Management → Prompts tab)
| Aspect | Current state |
|---|---|
| Frontend component | `src/components/views/ai-view.tsx` (Prompts tab) |
| Frontend API | none — uses static `prompts` array |
| **Current failure** | No "Add Prompt". "Edit Prompt" = toast. No version, no activate/deactivate, no test. |
| **Root cause** | No prompt store; no prompt editor. |
| **Required fix** | Build `promptStore` with versioning, Add/Edit dialog with monospace editor, Test runner (executes against a chosen assistant or standalone), Activate/Deactivate, version history. |

### 6. Voice AI
| Aspect | Current state |
|---|---|
| Frontend component | `src/components/views/voice-view.tsx` |
| Frontend API | none |
| Backend | `vapi/` module exists (63 files) |
| Database models | `VoiceSession`, `VoiceRecording`, `VoiceTranscript`, `VoiceAnalytics` |
| **Current failure** | "End Call" dismisses a hardcoded card. "New Call" = toast. No real call state machine. No Vapi config check. |
| **Root cause** | No voice store; no provider-config concept. |
| **Required fix** | Build `providerConfigStore` (tracks Vapi/WhatsApp/OpenAI config status). Voice view shows "Vapi configuration required" if not configured. If configured, New Call opens a dialer with real state machine (idle → connecting → connected → active → ending → ended). End Call terminates and persists to call log. |

### 7. Website AI (currently ProLocked)
| Aspect | Current state |
|---|---|
| Frontend component | `ProLockedPage` with title="Website Chat" |
| **Current failure** | Shows "Upgrade to Pro" — wrong product model. |
| **Root cause** | ProLockedPage misused for internal features. |
| **Required fix** | Remove ProLockedPage. Build `WebsiteAIConfigView` with: enable/disable toggle, assistant assignment, prompt assignment, knowledge sources, tools, model, rate limits, security settings, analytics preview. |

### 8. WhatsApp AI (currently ProLocked)
| Aspect | Current state |
|---|---|
| Frontend component | `ProLockedPage` with title="WhatsApp AI" |
| **Current failure** | Shows "Upgrade to Pro". |
| **Root cause** | Same as Website AI. |
| **Required fix** | Remove ProLockedPage. Build `WhatsAppAIConfigView` with: WhatsApp status (provider configured?), assistant/prompt/knowledge/tools assignment, webhook config, business number, templates, analytics. If Meta creds missing → "WhatsApp provider configuration required" panel with setup checklist. |

### 9. Users & Roles (currently ProLocked)
| Aspect | Current state |
|---|---|
| Frontend component | `ProLockedPage` with title="Users & Roles" |
| Backend | `Role`, `Permission`, `UserRole` models exist |
| **Current failure** | Shows "Upgrade to Pro". Single-admin assumption. |
| **Root cause** | Same; no admin store. |
| **Required fix** | Build `adminStore` with multiple admins, roles (SUPER_ADMIN, AI_ADMIN, KNOWLEDGE_ADMIN, AUTOMATION_ADMIN, ANALYTICS_ADMIN, SUPPORT_ADMIN), permissions, add/edit/delete admin, role assignment. |

### 10. Audit Logs (currently ProLocked)
| Aspect | Current state |
|---|---|
| Frontend component | `ProLockedPage` with title="Audit Logs" |
| Backend | `AuditLog` model with `AuditAction` enum (INSERT, UPDATE, DELETE) |
| **Current failure** | Shows "Upgrade to Pro". |
| **Root cause** | Same; no audit store. |
| **Required fix** | Build `auditStore` that captures every CRUD operation across all stores. Audit Logs view shows a filterable, searchable table of all entries. |

### 11. Quick Actions (Dashboard)
| Aspect | Current state |
|---|---|
| Frontend component | `src/components/views/dashboard-view.tsx` "Quick Actions" button |
| **Current failure** | Toast only. |
| **Required fix** | Open a real command palette / dropdown with: New Assistant, Upload Document, Add Tool, Add Prompt, New Call (if Vapi configured), View Analytics. Each item routes to the correct view or opens the correct dialog. |

## Cross-cutting issues

1. **No client-side persistence** — every reload resets to mock data. Need Zustand stores with localStorage persistence.
2. **No forms** — no Add/Edit dialogs exist. Need a reusable form dialog pattern.
3. **No confirm dialogs** — destructive actions (delete) have no confirmation. Need AlertDialog wrapper.
4. **No loading/empty/error states** — every view assumes data is present. Need skeleton + empty + error components.
5. **No provider-config concept** — Voice/WhatsApp need a "configuration required" state distinct from "feature locked".
6. **No audit trail** — no store captures user actions. Need `auditStore` that all other stores write to.
7. **ProLockedPage misuse** — used for 7 internal features. Must be deleted or repurposed.

## Architecture decision

Since the backend is not yet running in this preview environment, the frontend
will use **Zustand stores with localStorage persistence** to simulate the full
CRUD + audit flow. Each store's API surface mirrors the backend's REST endpoints
so that when the backend is wired (Step 4 of the production roadmap), only the
store implementations need to change — the views remain identical.

The stores are:
- `assistantStore` — AiAgent CRUD
- `knowledgeStore` — RagDocument CRUD + upload/processing pipeline
- `toolStore` — Tool CRUD
- `memoryStore` — AiMemory CRUD
- `promptStore` — Prompt CRUD with versioning
- `auditStore` — AuditLog append-only
- `adminStore` — User + Role CRUD (multi-admin)
- `providerConfigStore` — Vapi/WhatsApp/OpenAI config status
- `websiteConfigStore` — Website channel config
- `whatsappConfigStore` — WhatsApp channel config
- `voiceSessionStore` — Active voice session state machine

All stores persist to `localStorage` under the `dayjoy_*` namespace and write
to `auditStore` on every mutation.
