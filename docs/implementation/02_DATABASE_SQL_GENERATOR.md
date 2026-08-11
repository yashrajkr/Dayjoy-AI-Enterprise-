# Database Implementation Guide - Step 2

> **Use this file with AI to generate SQL code**

---

## How to Use This File

**Copy this file and use with AI (Cursor, Copilot, Claude, etc.)**

**Prompt**: "Generate PostgreSQL CREATE TABLE SQL for the following tables based on the Dayjoy Enterprise AI Platform database design"

---

## Core Tables (140+ Total)

### 1. core.tenants

```
Purpose: Multi-tenant organization isolation
Columns: id (UUID PK), name (VARCHAR), slug (VARCHAR UNIQUE), status (ENUM), settings (JSONB), created_at, updated_at
Indexes: slug UNIQUE, status BTREE
Expected Size: 1K-10K rows
```

### 2. core.users

```
Purpose: User account management
Columns: id (UUID PK), tenant_id (UUID FK), email (VARCHAR), password_hash (VARCHAR), phone (VARCHAR), first_name (VARCHAR), last_name (VARCHAR), status (ENUM), last_login_at (TIMESTAMP), created_at, updated_at
Indexes: tenant_id BTREE, email UNIQUE (WHERE status != 'deleted'), status BTREE
Constraints: email format CHECK
Expected Size: 100K-1M rows
```

### 3. core.user_sessions

```
Purpose: User session management
Columns: id (UUID PK), user_id (UUID FK), tenant_id (UUID FK), token_hash (VARCHAR), ip_address (INET), user_agent (TEXT), expires_at (TIMESTAMP), created_at
Indexes: user_id BTREE, token_hash UNIQUE, expires_at BTREE
Expected Size: 1M-10M rows
```

### 4. core.roles

```
Purpose: Role definition for RBAC
Columns: id (UUID PK), tenant_id (UUID FK), name (VARCHAR), description (TEXT), is_system (BOOLEAN DEFAULT false), created_at, updated_at
Indexes: tenant_id BTREE, (tenant_id, name) UNIQUE
Expected Size: 1K-10K rows
```

### 5. core.permissions

```
Purpose: Permission definitions
Columns: id (UUID PK), resource (VARCHAR), action (VARCHAR), description (TEXT), created_at
Indexes: (resource, action) UNIQUE
Expected Size: 100-1K rows
```

### 6. core.role_permissions

```
Purpose: Role-permission mapping
Columns: role_id (UUID FK PK), permission_id (UUID FK PK), created_at
Indexes: role_id BTREE, permission_id BTREE
Expected Size: 1K-10K rows
```

### 7. core.user_roles

```
Purpose: User-role assignment
Columns: user_id (UUID FK PK), role_id (UUID FK PK), tenant_id (UUID FK), assigned_by (UUID FK), assigned_at (TIMESTAMP), expires_at (TIMESTAMP)
Indexes: user_id BTREE, role_id BTREE, tenant_id BTREE
Expected Size: 100K-1M rows
```

### 8. core.audit_logs

```
Purpose: System-wide audit trail
Columns: id (UUID PK), tenant_id (UUID FK), user_id (UUID FK), action (VARCHAR), resource_type (VARCHAR), resource_id (UUID), old_values (JSONB), new_values (JSONB), ip_address (INET), user_agent (TEXT), created_at
Indexes: tenant_id, user_id, (resource_type, resource_id), action, created_at
Partitioning: Monthly by created_at
Expected Size: 100M-1B+ rows
```

---

## Business Tables

### 9. business.customers

```
Purpose: Customer master data
Columns: id (UUID PK), tenant_id (UUID FK), user_id (UUID FK), customer_type (ENUM), company_name (VARCHAR), first_name (VARCHAR), last_name (VARCHAR), email (VARCHAR), phone (VARCHAR), address (JSONB), status (ENUM), created_at, updated_at
Indexes: tenant_id, user_id, email, phone, status
Expected Size: 100K-1M rows
```

### 10. business.distributors

```
Purpose: Distributor master data
Columns: id (UUID PK), tenant_id (UUID FK), user_id (UUID FK), distributor_code (VARCHAR UNIQUE), company_name (VARCHAR), contact_person (VARCHAR), email (VARCHAR), phone (VARCHAR), address (JSONB), commission_rate (DECIMAL), status (ENUM), created_at, updated_at
Indexes: tenant_id, user_id, distributor_code UNIQUE, email UNIQUE, status
Expected Size: 10K-100K rows
```

### 11. business.products

```
Purpose: Product catalog
Columns: id (UUID PK), tenant_id (UUID FK), category_id (UUID FK), sku (VARCHAR), name (VARCHAR), description (TEXT), price (DECIMAL), cost (DECIMAL), currency (VARCHAR), inventory_count (INTEGER), attributes (JSONB), images (JSONB), status (ENUM), created_at, updated_at
Indexes: tenant_id, category_id, (tenant_id, sku) UNIQUE, status, name GIN (search)
Expected Size: 10K-100K rows
```

### 12. business.orders

```
Purpose: Order management
Columns: id (UUID PK), tenant_id (UUID FK), customer_id (UUID FK), distributor_id (UUID FK), order_number (VARCHAR UNIQUE), status (ENUM), subtotal (DECIMAL), tax (DECIMAL), shipping (DECIMAL), discount (DECIMAL), total (DECIMAL), currency (VARCHAR), shipping_address (JSONB), billing_address (JSONB), metadata (JSONB), created_at, updated_at
Indexes: tenant_id, customer_id, distributor_id, order_number UNIQUE, status, created_at
Partitioning: Monthly by created_at
Expected Size: 10M-100M+ rows
```

### 13. business.order_items

```
Purpose: Order line items
Columns: id (UUID PK), order_id (UUID FK), product_id (UUID FK), quantity (INTEGER), unit_price (DECIMAL), subtotal (DECIMAL), tax (DECIMAL), discount (DECIMAL), total (DECIMAL), metadata (JSONB)
Indexes: order_id BTREE, product_id BTREE
Expected Size: 50M-500M+ rows
```

### 14. business.leads

```
Purpose: Lead management
Columns: id (UUID PK), tenant_id (UUID FK), source_id (UUID FK), assigned_to (UUID FK), first_name (VARCHAR), last_name (VARCHAR), email (VARCHAR), phone (VARCHAR), company (VARCHAR), status (ENUM), score (INTEGER), metadata (JSONB), created_at, updated_at
Indexes: tenant_id, source_id, assigned_to, email, status, created_at
Expected Size: 100K-1M rows
```

### 15. business.interactions

```
Purpose: Customer interaction tracking
Columns: id (UUID PK), tenant_id (UUID FK), customer_id (UUID FK), lead_id (UUID FK), user_id (UUID FK), type (ENUM), subject (VARCHAR), description (TEXT), outcome (VARCHAR), follow_up_required (BOOLEAN), follow_up_date (TIMESTAMP), metadata (JSONB), created_at
Indexes: tenant_id, customer_id, lead_id, user_id, type, created_at
Expected Size: 10M-100M rows
```

---

## AI Tables

### 16. ai.agents

```
Purpose: AI agent definitions
Columns: id (UUID PK), tenant_id (UUID FK), name (VARCHAR), type (ENUM), description (TEXT), configuration (JSONB), capabilities (JSONB), status (ENUM), created_at, updated_at
Indexes: tenant_id, type, status
Expected Size: 100-1K rows
```

### 17. ai.conversations

```
Purpose: AI conversation threads
Columns: id (UUID PK), tenant_id (UUID FK), agent_id (UUID FK), user_id (UUID FK), customer_id (UUID FK), channel (ENUM), session_id (VARCHAR), status (ENUM), context (JSONB), metadata (JSONB), started_at (TIMESTAMP), ended_at (TIMESTAMP), created_at, updated_at
Indexes: tenant_id, agent_id, user_id, customer_id, channel, started_at
Partitioning: Monthly by started_at
Expected Size: 100M-1B+ rows
```

### 18. ai.messages

```
Purpose: Conversation messages
Columns: id (UUID PK), tenant_id (UUID FK), conversation_id (UUID FK), role (ENUM), content (TEXT), content_type (ENUM), metadata (JSONB), tokens_used (INTEGER), created_at
Indexes: tenant_id, conversation_id, created_at
Partitioning: Monthly by created_at
Expected Size: 500M-5B+ rows
```

### 19. ai.rag_documents

```
Purpose: Processed RAG documents
Columns: id (UUID PK), tenant_id (UUID FK), source_id (UUID FK), title (VARCHAR), content (TEXT), metadata (JSONB), word_count (INTEGER), status (ENUM), processed_at (TIMESTAMP), created_at, updated_at
Indexes: tenant_id, source_id, status, title GIN (search)
Expected Size: 1M-10M rows
```

### 20. ai.rag_chunks

```
Purpose: Document chunks for vector retrieval
Columns: id (UUID PK), tenant_id (UUID FK), document_id (UUID FK), chunk_index (INTEGER), content (TEXT), embedding (VECTOR(1536)), metadata (JSONB), created_at
Indexes: tenant_id, document_id, embedding HNSW (similarity search)
Expected Size: 10M-100M rows
```

---

## Channels Tables

### 21. channels.voice_sessions

```
Purpose: Voice call sessions
Columns: id (UUID PK), tenant_id (UUID FK), conversation_id (UUID FK), call_id (VARCHAR UNIQUE), phone_number (VARCHAR), status (ENUM), duration_seconds (INTEGER), recording_url (VARCHAR), metadata (JSONB), started_at, ended_at, created_at
Indexes: tenant_id, conversation_id, call_id UNIQUE, status, started_at
Expected Size: 10M-100M rows
```

### 22. channels.whatsapp_messages

```
Purpose: WhatsApp messages
Columns: id (UUID PK), tenant_id (UUID FK), session_id (UUID FK), contact_id (UUID FK), conversation_id (UUID FK), message_id (VARCHAR UNIQUE), direction (ENUM), type (ENUM), content (TEXT), media_url (VARCHAR), status (ENUM), metadata (JSONB), created_at
Indexes: tenant_id, session_id, contact_id, conversation_id, message_id UNIQUE, created_at
Partitioning: Monthly by created_at
Expected Size: 100M-1B rows
```

### 23. channels.notifications

```
Purpose: Notification queue
Columns: id (UUID PK), tenant_id (UUID FK), user_id (UUID FK), customer_id (UUID FK), distributor_id (UUID FK), type (ENUM), priority (ENUM), subject (VARCHAR), content (TEXT), template_id (UUID FK), status (ENUM), sent_at (TIMESTAMP), metadata (JSONB), created_at, updated_at
Indexes: tenant_id, user_id, status, priority, created_at
Expected Size: 100M-1B rows
```

---

## Automation Tables

### 24. automation.workflows

```
Purpose: Workflow definitions
Columns: id (UUID PK), tenant_id (UUID FK), name (VARCHAR), description (TEXT), type (ENUM), definition (JSONB), version (INTEGER), status (ENUM), created_by (UUID FK), created_at, updated_at
Indexes: tenant_id, (tenant_id, name) UNIQUE, type, status
Expected Size: 100-1K rows
```

### 25. automation.workflow_executions

```
Purpose: Workflow execution history
Columns: id (UUID PK), tenant_id (UUID FK), workflow_id (UUID FK), trigger_id (UUID FK), status (ENUM), input_data (JSONB), output_data (JSONB), error_message (TEXT), started_at, completed_at, duration_ms (INTEGER), metadata (JSONB), created_at
Indexes: tenant_id, workflow_id, status, started_at
Partitioning: Monthly by started_at
Expected Size: 100M-1B rows
```

---

## Analytics Tables

### 26. analytics.metric_values

```
Purpose: Metric time series data
Columns: id (UUID PK), tenant_id (UUID FK), metric_id (UUID FK), value (DECIMAL), dimensions (JSONB), timestamp (TIMESTAMP), created_at
Indexes: tenant_id, metric_id, timestamp, (metric_id, timestamp)
Partitioning: Daily by timestamp
Expected Size: 1B-10B+ rows
```

### 27. analytics.events

```
Purpose: Event tracking
Columns: id (UUID PK), tenant_id (UUID FK), event_type_id (UUID FK), user_id (UUID FK), customer_id (UUID FK), session_id (UUID FK), event_data (JSONB), metadata (JSONB), timestamp (TIMESTAMP)
Indexes: tenant_id, event_type_id, user_id, customer_id, timestamp
Partitioning: Daily by timestamp
Expected Size: 1B-10B+ rows
```

---

## AI Prompt for SQL Generation

```
You are a PostgreSQL expert. Generate production-ready SQL for the Dayjoy Enterprise AI Platform database.

Requirements:
1. Use PostgreSQL 15+ syntax
2. Include all constraints (PK, FK, UNIQUE, CHECK)
3. Include all indexes with proper naming
4. Include partitioning for large tables
5. Include comments for each table
6. Use proper data types (UUID, JSONB, TIMESTAMP WITH TIME ZONE, etc.)
7. Enable row-level security
8. Include RLS policies for multi-tenancy

Generate SQL for these tables: [paste table definitions from above]
```

---

## Next Steps

1. **Generate SQL**: Use AI to generate CREATE TABLE statements
2. **Create Migrations**: Organize into numbered migration files
3. **Test Migrations**: Test on development database
4. **Apply to Staging**: Apply to staging environment
5. **Validate**: Verify all tables, indexes, constraints
6. **Document**: Update schema documentation

---

**File Ready for AI Code Generation**