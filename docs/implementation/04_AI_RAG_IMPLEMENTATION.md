# AI Services & RAG Implementation Guide - Step 4

> **Use this file with AI to generate AI/RAG code**

---

## How to Use This File

**Copy this file and use with AI (Cursor, Copilot, Claude, etc.)**

**Prompt**: "Generate AI/RAG implementation code for the Dayjoy Enterprise AI Platform based on the following specifications"

---

## 1. LLM Gateway Implementation

**Purpose**: Multi-LLM provider integration with intelligent routing

**Supported Providers**:
- OpenAI (GPT-4, GPT-4o, GPT-3.5-Turbo)
- Anthropic (Claude 3 Opus, Sonnet, Haiku)
- Google (Gemini Pro, Gemini Ultra)
- Meta (Llama 3)
- Cohere (Command, Command R+)

**AI Prompt**:
```
Generate a LLM Gateway with:
- Provider abstraction (OpenAI, Anthropic, Google, etc.)
- Intelligent routing based on cost, latency, capability
- Automatic fallback on provider failure
- Cost optimization (use cheapest provider for simple tasks)
- Rate limit handling with automatic retry
- Response caching for repeated queries
- Streaming support
- Token usage tracking per request
- Configuration via environment variables
- Unit and integration tests

Tech Stack: TypeScript, Node.js
```

**Configuration**:
```yaml
llm_gateway:
  providers:
    - name: openai
      models: [gpt-4o, gpt-4-turbo, gpt-3.5-turbo]
      priority: 1
      fallback: anthropic
      
    - name: anthropic
      models: [claude-3-opus, claude-3-sonnet, claude-3-haiku]
      priority: 2
      fallback: google
      
  routing:
    strategy: cost_optimized
    rules:
      - complexity: high
        model: gpt-4o
      - complexity: medium
        model: claude-3-sonnet
      - complexity: low
        model: gpt-3.5-turbo
        
  fallback:
    enabled: true
    max_retries: 3
    retry_delay_ms: 1000
    
  caching:
    enabled: true
    ttl_seconds: 3600
    max_size: 10000
```

---

## 2. Agent Orchestrator

**Purpose**: Conversation routing, context management, agent selection

**Components**:
- Intent Classifier
- Context Manager
- Agent Router
- Response Processor

**AI Prompt**:
```
Generate an Agent Orchestrator with:
- Intent classification (support, sales, onboarding, technical, billing)
- Context loading (conversation history, user memory, RAG context)
- Agent selection based on intent
- Tool execution (RAG, CRM lookup, etc.)
- LLM call via LLM Gateway
- Response parsing and formatting
- Memory update
- Analytics logging

Tech Stack: TypeScript, Node.js
```

---

## 3. Memory Service

**Purpose**: Short-term and long-term AI memory

**Memory Types**:
- **Short-Term**: Conversation context (last 10-20 messages)
- **Long-Term**: User preferences, facts, conversation summaries
- **Context**: Session context, important events

**AI Prompt**:
```
Generate a Memory Service with:
- Short-term memory (conversation context, recent messages)
- Long-term memory (user preferences, facts, summaries)
- Memory operations (create, retrieve, update, delete)
- Memory importance scoring
- Memory expiration handling
- Context building for LLM prompts
- Redis caching for fast access
- Database persistence
- Unit and integration tests

Tech Stack: TypeScript, Node.js, Redis, PostgreSQL
```

**Memory Schema**:
```typescript
interface Memory {
  id: string;
  user_id: string;
  type: 'fact' | 'preference' | 'history' | 'context';
  key: string;
  value: string;
  importance: number; // 1-10
  expires_at?: Date;
  created_at: Date;
  updated_at: Date;
}
```

---

## 4. RAG Service Implementation

**Purpose**: Knowledge base processing, embeddings, retrieval

### 4.1 Document Ingestion

**AI Prompt**:
```
Generate a Document Ingestion Service with:
- File upload support (PDF, DOCX, TXT, HTML, MD)
- Text extraction (pdf-parse, mammoth for DOCX)
- Format detection
- Metadata extraction (title, author, date, word count)
- Raw document storage
- Progress tracking
- Error handling
- Unit and integration tests

Tech Stack: TypeScript, Node.js, pdf-parse, mammoth
```

### 4.2 Document Processing

**AI Prompt**:
```
Generate a Document Processing Service with:
- Text cleaning (remove special characters, normalize whitespace)
- Semantic chunking (512-1024 tokens per chunk)
- Chunk overlap (50-100 tokens)
- Chunk metadata generation
- Chunk storage with document reference
- Progress tracking
- Error handling
- Unit and integration tests

Tech Stack: TypeScript, Node.js, tiktoken (for token counting)
```

**Chunking Parameters**:
```typescript
const chunkingConfig = {
  chunkSize: 512, // tokens
  chunkOverlap: 50, // tokens
  strategy: 'semantic', // by paragraph/section
};
```

### 4.3 Embedding Generation

**AI Prompt**:
```
Generate an Embedding Service with:
- Embedding generation using OpenAI ada-002 (1536 dimensions)
- Batch embedding generation
- Vector storage in PostgreSQL (pgvector)
- HNSW index creation for fast similarity search
- Progress tracking
- Error handling
- Unit and integration tests

Tech Stack: TypeScript, Node.js, OpenAI API, pgvector
```

### 4.4 Retrieval Service

**AI Prompt**:
```
Generate a Retrieval Service with:
- Hybrid search (BM25 + vector similarity)
- Similarity search on embeddings (cosine similarity)
- Re-ranking of results
- Top-K retrieval (default: 5 chunks)
- Context building for LLM
- Similarity threshold filtering
- Progress tracking
- Error handling
- Unit and integration tests

Tech Stack: TypeScript, Node.js, pgvector
```

**Retrieval Configuration**:
```typescript
const retrievalConfig = {
  topK: 5,
  similarityThreshold: 0.7,
  rerank: true,
  hybridSearch: {
    enabled: true,
    bm25Weight: 0.3,
    vectorWeight: 0.7,
  },
};
```

---

## 5. Voice AI Implementation (Vapi)

**Purpose**: Voice call integration with Vapi

**Components**:
- Vapi Client
- Webhook Handler
- Session Manager
- Recording Manager
- Transcription Service

**AI Prompt**:
```
Generate a Voice AI Service with:
- Vapi SDK integration
- Webhook handler for Vapi events (call started, call ended, transcript)
- Session manager for voice call lifecycle
- Recording manager for recording storage and retrieval
- Transcription service for recording transcription
- Integration with AI Orchestrator for real-time responses
- Call analytics (duration, sentiment, resolution)
- Unit and integration tests

Tech Stack: TypeScript, Node.js, Vapi SDK
```

**Vapi Configuration**:
```typescript
const vapiConfig = {
  voiceAgent: {
    name: 'Dayjoy Support Agent',
    voice: 'professional_female',
    language: 'en-US',
    speed: 1.0,
    pitch: 1.0,
    interruptionEnabled: true,
    silenceThresholdMs: 500,
  },
};
```

---

## 6. WhatsApp AI Implementation

**Purpose**: WhatsApp Business API integration

**Components**:
- WhatsApp Client
- Webhook Handler
- Message Router
- Session Manager
- Contact Manager
- Template Manager

**AI Prompt**:
```
Generate a WhatsApp Service with:
- WhatsApp Business API SDK integration
- Webhook handler for incoming messages
- Message router for routing to AI
- Session manager for WhatsApp sessions
- Contact manager for contact management
- Template manager for message templates
- Media handler (images, audio, video, documents)
- Integration with AI Orchestrator
- Delivery tracking
- Unit and integration tests

Tech Stack: TypeScript, Node.js, WhatsApp Business API
```

---

## 7. Website Chat Implementation

**Purpose**: Website chat widget and backend

**Components**:
- Chat Widget (React)
- Session Manager
- Event Tracker
- Message Router

**AI Prompt**:
```
Generate a Website Chat Service with:
- React chat widget component
- Session manager for web chat sessions
- Event tracker for user behavior
- Message router for routing to AI
- Real-time messaging (WebSocket)
- Typing indicators
- Read receipts
- File upload support
- Quick replies
- Emoji picker
- Chat history
- Analytics tracking
- Unit and integration tests

Tech Stack: React, TypeScript, Socket.io
```

**Widget Configuration**:
```typescript
const widgetConfig = {
  position: 'bottom-right',
  theme: 'light',
  primaryColor: '#007bff',
  welcomeMessage: 'Hi! How can I help you?',
  placeholder: 'Type your message...',
  showAvatar: true,
  showTimestamp: true,
  enableSuggestions: true,
  maxSuggestions: 3,
};
```

---

## 8. AI Evaluation Service

**Purpose**: AI quality monitoring and feedback

**Components**:
- Quality Monitor
- Feedback Collector
- Metrics Tracker
- Alert Manager

**AI Prompt**:
```
Generate an AI Evaluation Service with:
- Quality monitoring (accuracy, relevance, helpfulness)
- Feedback collection (thumbs up/down, star rating, text feedback)
- Metrics tracking (response time, accuracy, toxicity, hallucination)
- Alert manager for quality issues
- A/B testing support
- Dashboard for AI metrics
- Unit and integration tests

Tech Stack: TypeScript, Node.js
```

**AI Metrics**:
```typescript
interface AIMetrics {
  responseTimeP95: number; // < 2s
  accuracy: number; // > 90%
  relevance: number; // > 90%
  helpfulness: number; // > 4/5
  toxicity: number; // < 0.1
  hallucinationRate: number; // < 1%
  fallbackRate: number; // < 5%
  costPerConversation: number;
}
```

---

## 9. AI Security Implementation

**Purpose**: AI security and governance

**Components**:
- Input Validation
- Output Validation
- PII Detection
- Toxicity Detection
- Prompt Injection Protection

**AI Prompt**:
```
Generate an AI Security Service with:
- Input validation (sanitize, validate)
- Output validation (check for toxicity, PII)
- PII detection and redaction
- Toxicity detection
- Prompt injection protection
- Fact checking for hallucination detection
- Audit logging for all AI interactions
- Rate limiting
- Cost controls
- Unit and integration tests

Tech Stack: TypeScript, Node.js
```

---

## 10. AI Cost Optimization

**Purpose**: AI cost management and optimization

**Strategies**:
- Intelligent routing (cheapest model for simple tasks)
- Caching (repeated queries)
- Token optimization (shorter prompts, concise responses)
- Batch processing

**AI Prompt**:
```
Generate an AI Cost Optimization Service with:
- Intelligent model routing based on task complexity
- Response caching for repeated queries
- Token usage tracking per request/user
- Cost per conversation tracking
- Budget alerts
- Cost optimization recommendations
- Dashboard for cost metrics
- Unit and integration tests

Tech Stack: TypeScript, Node.js
```

---

## AI Implementation Prompt Template

```
You are a senior AI engineer. Generate production-ready AI/RAG code for the Dayjoy Enterprise AI Platform.

Requirements:
1. Use TypeScript/Python with strict typing
2. Follow clean architecture principles
3. Include error handling
4. Include logging
5. Include unit tests
6. Include integration tests
7. Use environment configuration
8. Follow security best practices
9. Include monitoring and metrics
10. Include cost optimization
11. Include AI safety measures
12. Include documentation

Generate code for: [paste component definition from above]
```

---

**File Ready for AI Code Generation**