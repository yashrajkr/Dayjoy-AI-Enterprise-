# Backend API Implementation Guide - Step 3

> **Use this file with AI to generate backend code**

---

## How to Use This File

**Copy this file and use with AI (Cursor, Copilot, Claude, etc.)**

**Prompt**: "Generate NestJS/Express/FastAPI backend code for the following services based on the Dayjoy Enterprise AI Platform architecture"

---

## Backend Services (14 Total)

### Service 1: Auth Service

**Purpose**: Authentication, authorization, sessions

**Endpoints**:
```
POST /auth/login - User login
POST /auth/logout - User logout
POST /auth/refresh - Refresh token
POST /auth/register - User registration
POST /auth/forgot-password - Password reset request
POST /auth/reset-password - Password reset
GET /auth/me - Current user info
POST /auth/verify-email - Email verification
```

**Database Tables**: core.users, core.user_sessions, core.roles, core.permissions, core.user_roles

**Services**:
- AuthService: Login, logout, register, password reset
- SessionService: Create, validate, invalidate sessions
- TokenService: JWT generation, validation, refresh
- PasswordService: Hash, validate, reset

**AI Prompt**:
```
Generate a NestJS AuthModule with:
- AuthService with login, logout, register, passwordReset methods
- AuthController with all endpoints
- JWT strategy for authentication
- Session management with Redis
- Password hashing with bcrypt
- Email verification flow
- Role-based access control
- Input validation with class-validator
- Error handling
- Unit tests
```

---

### Service 2: CRM Service

**Purpose**: Customers, distributors, leads, interactions

**Endpoints**:
```
GET /crm/customers - List customers
POST /crm/customers - Create customer
GET /crm/customers/:id - Get customer
PUT /crm/customers/:id - Update customer
GET /crm/customers/:id/orders - Customer orders
GET /crm/customers/:id/interactions - Customer interactions

GET /crm/distributors - List distributors
POST /crm/distributors - Create distributor
GET /crm/distributors/:id - Get distributor
GET /crm/distributors/:id/commissions - Distributor commissions

GET /crm/leads - List leads
POST /crm/leads - Create lead
PUT /crm/leads/:id - Update lead
POST /crm/leads/:id/convert - Convert lead to customer
POST /crm/leads/:id/follow-ups - Create follow-up

POST /crm/interactions - Create interaction
GET /crm/interactions - List interactions
```

**Database Tables**: business.customers, business.distributors, business.leads, business.interactions, business.follow_ups

**AI Prompt**:
```
Generate a NestJS CrmModule with:
- CustomerService with CRUD operations
- DistributorService with CRUD and commission calculations
- LeadService with lifecycle management (new → contacted → qualified → converted)
- InteractionService for tracking customer interactions
- FollowUpService for task management
- All controllers with proper validation
- Database integration with TypeORM/Prisma
- Caching with Redis
- Unit and integration tests
```

---

### Service 3: Product Service

**Purpose**: Product catalog, categories

**Endpoints**:
```
GET /products - List products (with pagination, filtering, sorting)
POST /products - Create product
GET /products/:id - Get product
PUT /products/:id - Update product
DELETE /products/:id - Delete product
GET /products/search - Search products (full-text search)

GET /categories - List categories
POST /categories - Create category
GET /categories/:id - Get category
GET /categories/:id/products - Category products
```

**Database Tables**: business.products, business.product_categories

**AI Prompt**:
```
Generate a NestJS ProductModule with:
- ProductService with CRUD operations
- CategoryService with hierarchical category management
- Product search with Elasticsearch/PostgreSQL full-text search
- Product filtering by price, category, attributes
- Product sorting by price, name, created_at
- Image upload integration
- Inventory tracking
- Caching for product listings
- Unit and integration tests
```

---

### Service 4: Order Service

**Purpose**: Order management

**Endpoints**:
```
GET /orders - List orders (with filtering by status, date, customer)
POST /orders - Create order
GET /orders/:id - Get order
PUT /orders/:id/status - Update order status
GET /orders/:id/items - Order items
POST /orders/:id/items - Add order item
POST /orders/:id/cancel - Cancel order
GET /orders/statistics - Order statistics
```

**Database Tables**: business.orders, business.order_items

**AI Prompt**:
```
Generate a NestJS OrderModule with:
- OrderService with order lifecycle management
- OrderItemService for line items
- Order status workflow (pending → confirmed → processing → shipped → delivered)
- Order total calculation (subtotal + tax + shipping - discount)
- Inventory check and reservation
- Order notifications
- Order statistics and reporting
- Transaction management
- Unit and integration tests
```

---

### Service 5: AI Service

**Purpose**: AI agents, conversations, messages, memory

**Endpoints**:
```
GET /ai/agents - List agents
POST /ai/agents - Create agent
GET /ai/agents/:id - Get agent
PUT /ai/agents/:id - Update agent

GET /ai/conversations - List conversations
POST /ai/conversations - Create conversation
GET /ai/conversations/:id - Get conversation
GET /ai/conversations/:id/messages - Get messages
POST /ai/conversations/:id/messages - Send message
DELETE /ai/conversations/:id - Delete conversation

GET /ai/memory - Get AI memory
POST /ai/memory - Create memory
PUT /ai/memory/:id - Update memory
DELETE /ai/memory/:id - Delete memory

POST /ai/chat - Send chat message (unified endpoint)
```

**Database Tables**: ai.agents, ai.conversations, ai.messages, ai.ai_memory, ai.memory_contexts

**AI Prompt**:
```
Generate a NestJS AiModule with:
- AgentService for agent management
- ConversationService for conversation lifecycle
- MessageService for message storage and retrieval
- MemoryService for AI memory (short-term and long-term)
- Integration with LLM Gateway (OpenAI, Anthropic, Google)
- Integration with RAG Service
- Context building for prompts
- Streaming responses
- Token usage tracking
- Conversation analytics
- Unit and integration tests
```

---

### Service 6: RAG Service

**Purpose**: Knowledge base, embeddings, retrieval

**Endpoints**:
```
GET /rag/sources - List sources
POST /rag/sources - Create source
POST /rag/sources/:id/process - Process source

POST /rag/documents - Upload document
GET /rag/documents - List documents
POST /rag/documents/:id/chunk - Chunk document
DELETE /rag/documents/:id - Delete document

POST /rag/embeddings/generate - Generate embeddings
POST /rag/retrieve - Retrieve relevant chunks
POST /rag/search - Similarity search
```

**Database Tables**: ai.rag_sources, ai.rag_documents, ai.rag_chunks, ai.embeddings

**AI Prompt**:
```
Generate a NestJS RagModule with:
- DocumentIngestionService for file upload and text extraction
- DocumentProcessorService for text cleaning and chunking (512-1024 tokens per chunk)
- EmbeddingService for generating embeddings (OpenAI ada-002, 1536 dimensions)
- RetrievalService for hybrid search (BM25 + vector similarity)
- Vector index management (HNSW)
- Re-ranking of results
- Context building for LLM
- Integration with AI Service
- Unit and integration tests
```

---

### Service 7: Voice AI Service

**Purpose**: Voice calls, recordings, Vapi integration

**Endpoints**:
```
POST /voice/sessions - Create voice session
GET /voice/sessions/:id - Get session
GET /voice/sessions/:id/recording - Get recording
POST /voice/recordings/:id/transcribe - Transcribe recording
POST /voice/vapi/webhook - Vapi webhook handler
GET /voice/vapi/status - Vapi status
```

**Database Tables**: channels.voice_sessions, channels.voice_recordings

**AI Prompt**:
```
Generate a NestJS VoiceAiModule with:
- VapiClient integration
- WebhookHandler for Vapi webhooks
- SessionManager for voice session lifecycle
- RecordingManager for recording storage and retrieval
- TranscriptionService for recording transcription
- Integration with AI Service for real-time responses
- Call analytics
- Unit and integration tests
```

---

### Service 8: WhatsApp Service

**Purpose**: WhatsApp messaging, sessions

**Endpoints**:
```
POST /whatsapp/messages - Send message
GET /whatsapp/messages - List messages
GET /whatsapp/contacts - List contacts
POST /whatsapp/contacts - Create contact
POST /whatsapp/sessions - Create session
POST /whatsapp/webhook - WhatsApp webhook handler
```

**Database Tables**: channels.whatsapp_contacts, channels.whatsapp_messages, channels.whatsapp_sessions

**AI Prompt**:
```
Generate a NestJS WhatsAppModule with:
- WhatsAppClient integration (WhatsApp Business API)
- WebhookHandler for WhatsApp webhooks
- MessageRouter for routing messages to AI
- SessionManager for WhatsApp sessions
- ContactManager for contact management
- TemplateManager for message templates
- Media handler for images, audio, video, documents
- Integration with AI Service
- Unit and integration tests
```

---

### Service 9: Notification Service

**Purpose**: Multi-channel notifications

**Endpoints**:
```
GET /notifications - List notifications
POST /notifications - Create notification
GET /notifications/:id - Get notification
PUT /notifications/:id/status - Update status

GET /notifications/templates - List templates
POST /notifications/templates - Create template
PUT /notifications/templates/:id - Update template

POST /notifications/email - Send email
POST /notifications/sms - Send SMS
POST /notifications/whatsapp - Send WhatsApp
POST /notifications/push - Send push
```

**Database Tables**: channels.notifications, channels.notification_templates, channels.notification_logs

**AI Prompt**:
```
Generate a NestJS NotificationModule with:
- NotificationQueue for managing notification queue
- TemplateManager for notification templates
- EmailChannel integration (SendGrid/AWS SES)
- SmsChannel integration (Twilio)
- WhatsAppChannel integration
- PushChannel integration (Firebase)
- DeliveryTracker for tracking delivery status
- RetryManager for failed notifications
- Rate limiting
- Unit and integration tests
```

---

### Service 10: Analytics Service

**Purpose**: Metrics, events, reports, dashboards

**Endpoints**:
```
POST /analytics/events - Track event
GET /analytics/events - List events
GET /analytics/metrics - List metrics
POST /analytics/metrics - Create metric
GET /analytics/metrics/:id/values - Get metric values
GET /analytics/reports - List reports
POST /analytics/reports - Create report
GET /analytics/reports/:id/data - Get report data
GET /analytics/dashboards - List dashboards
GET /analytics/dashboards/:id - Get dashboard
```

**Database Tables**: analytics.metrics, analytics.metric_values, analytics.events, analytics.reports, analytics.dashboards

**AI Prompt**:
```
Generate a NestJS AnalyticsModule with:
- MetricCollector for collecting metrics
- EventTracker for tracking events
- ReportGenerator for generating reports
- DashboardBuilder for building dashboards
- DataAggregator for aggregating data
- Time-series data storage (timescale or partitioned tables)
- Data visualization endpoints
- Export functionality (CSV, PDF)
- Caching for metrics
- Unit and integration tests
```

---

### Service 11: Automation Service

**Purpose**: Workflows, triggers, executions

**Endpoints**:
```
GET /automation/workflows - List workflows
POST /automation/workflows - Create workflow
GET /automation/workflows/:id - Get workflow
PUT /automation/workflows/:id - Update workflow

GET /automation/triggers - List triggers
POST /automation/triggers - Create trigger

GET /automation/executions - List executions
GET /automation/executions/:id/logs - Get execution logs

GET /automation/rules - List rules
POST /automation/rules - Create rule
```

**Database Tables**: automation.workflows, automation.workflow_steps, automation.workflow_triggers, automation.workflow_executions, automation.execution_logs

**AI Prompt**:
```
Generate a NestJS AutomationModule with:
- WorkflowEngine for executing workflows
- TriggerManager for managing triggers (event, schedule, api, manual)
- ExecutionManager for managing workflow executions
- RuleEngine for executing automation rules
- JobScheduler for scheduled jobs
- Workflow step execution (action, condition, loop, wait, trigger)
- Execution logging
- Retry logic for failed steps
- Integration with AI Service for AI-driven automation
- Unit and integration tests
```

---

### Service 12: User Service

**Purpose**: User management, profiles

**Endpoints**:
```
GET /users - List users
GET /users/:id - Get user
POST /users - Create user
PUT /users/:id - Update user
DELETE /users/:id - Delete user
GET /users/:id/profile - Get user profile
PUT /users/:id/profile - Update profile
```

**Database Tables**: core.users, portals.customer_profiles, portals.distributor_profiles, portals.employee_profiles

**AI Prompt**:
```
Generate a NestJS UserModule with:
- UserService with CRUD operations
- ProfileService for profile management
- RoleService for role assignment
- Search functionality
- User filtering and sorting
- Profile picture upload
- User preferences
- Integration with Auth Service
- Unit and integration tests
```

---

### Service 13: File Service

**Purpose**: File uploads, storage, CDN

**Endpoints**:
```
POST /files/upload - Upload file
GET /files/:id - Get file
DELETE /files/:id - Delete file
GET /files/:id/download - Download file
POST /files/presigned - Get presigned URL
```

**AI Prompt**:
```
Generate a NestJS FileModule with:
- FileUploadService for handling uploads
- StorageService for S3/Azure Blob/GCS integration
- CDN integration (CloudFront/Azure CDN)
- Presigned URL generation
- File validation (type, size)
- File metadata management
- File access control
- Unit and integration tests
```

---

### Service 14: Audit Service

**Purpose**: Audit logging, compliance

**Endpoints**:
```
GET /audit/logs - List audit logs
GET /audit/logs/:id - Get audit log
GET /audit/data-changes - List data changes
GET /audit/access-logs - List access logs
GET /audit/compliance - List compliance records
```

**Database Tables**: audit.audit_logs, audit.data_changes, audit.access_logs, audit.compliance_records, audit.retention_policies

**AI Prompt**:
```
Generate a NestJS AuditModule with:
- AuditLogService for audit trail
- DataChangeService for tracking data changes
- AccessLogService for access logging
- ComplianceService for compliance records
- RetentionService for data retention policies
- Search and filtering
- Export functionality
- Real-time audit streaming
- Unit and integration tests
```

---

## Shared Packages

### Package: @dayjoy/utils

**Utilities**:
- Format functions (date, currency, number)
- Validation functions
- String manipulation
- Object manipulation
- Array utilities

**AI Prompt**:
```
Generate a @dayjoy/utils package with:
- formatDate, formatCurrency, formatNumber
- validateEmail, validatePhone, validateUrl
- capitalize, camelCase, snakeCase
- deepClone, deepMerge, pick, omit
- unique, groupBy, sortBy
- Unit tests
```

### Package: @dayjoy/types

**Type Definitions**:
- User, Customer, Distributor, Product, Order types
- API request/response types
- Database model types

**AI Prompt**:
```
Generate a @dayjoy/types package with:
- All entity types (User, Customer, Distributor, Product, Order, etc.)
- API types (requests, responses, errors)
- Database types
- Enums (status, type, etc.)
- Export all types from index.ts
```

### Package: @dayjoy/ui

**UI Components**:
- Button, Input, Select, Checkbox, Radio, Switch, Textarea
- Container, Grid, Flex, Stack, Divider
- Table, Card, List, Avatar, Badge, Tag, Tooltip
- Alert, Toast, Modal, Dialog, Drawer, Progress, Spinner, Skeleton
- Form, FormField, FormLabel, FormError

**AI Prompt**:
```
Generate a @dayjoy/ui package with:
- All basic components (Button, Input, Select, etc.)
- All layout components (Container, Grid, Flex, etc.)
- All data display components (Table, Card, List, etc.)
- All feedback components (Alert, Toast, Modal, etc.)
- All form components (Form, FormField, etc.)
- Tailwind CSS styling
- TypeScript types
- Storybook stories
- Unit tests
```

---

## Backend AI Prompt Template

```
You are a senior backend engineer. Generate production-ready backend code for the Dayjoy Enterprise AI Platform.

Requirements:
1. Use [NestJS/Express/FastAPI] framework
2. Use TypeScript/Python with strict typing
3. Follow clean architecture principles
4. Include input validation
5. Include error handling
6. Include logging
7. Include unit tests
8. Include integration tests
9. Use database repository pattern
10. Use dependency injection
11. Include API documentation (OpenAPI/Swagger)
12. Include environment configuration
13. Include Docker configuration
14. Follow security best practices

Generate code for: [paste service definition from above]
```

---

**File Ready for AI Code Generation**