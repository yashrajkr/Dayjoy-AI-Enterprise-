# Voice AI (Vapi) Module 1: Setup Guide

## ✅ Module 1 Complete

### Files Created (5 Files)

1. **`vapi-config.ts`** - Vapi configuration and environment variables
2. **`vapi-client-service.ts`** - Vapi SDK client service
3. **`vapi-assistant-config.ts`** - Assistant personality and voice settings
4. **`vapi-database-schema.prisma`** - Database schema for voice sessions
5. **`vapi-module.ts`** - NestJS module

All files saved to your artifacts.

---

## 🎯 What Module 1 Provides

### 1. Vapi Client Service
- ✅ Create outbound calls
- ✅ Get call details
- ✅ End calls
- ✅ Get transcripts
- ✅ Get recordings
- ✅ Handle webhook events
- ✅ Verify webhook signatures

### 2. Assistant Configuration
- ✅ Voice settings (11labs, PlayHT)
- ✅ Personality traits
- ✅ Business rules
- ✅ Greeting messages
- ✅ Fallback and escalation rules

### 3. Database Schema
- ✅ `voice_sessions` - Call sessions
- ✅ `voice_transcripts` - Call transcripts
- ✅ `voice_analytics` - Call analytics

### 4. Configuration
- ✅ Environment variables
- ✅ Default settings
- ✅ Multi-assistant support

---

## 🚀 Setup Instructions

### Step 1: Install Vapi SDK

```bash
cd services/api-gateway
pnpm add @vapi-ai/sdk
```

### Step 2: Add Environment Variables

Add to your `.env` file:

```env
# Vapi Configuration
VAPI_API_KEY=your_vapi_api_key_here
VAPI_VOICE_ID=rachel
VAPI_WEBHOOK_URL=https://your-domain.com/api/voice/webhook
VAPI_WEBHOOK_SECRET=your_webhook_secret_here

# Voice Settings
VAPI_ASSISTANT_NAME=Dayjoy Support Agent
VAPI_FIRST_MESSAGE=Hi! Thank you for calling Dayjoy. This is Sarah, your virtual assistant. How can I help you today?
```

### Step 3: Add Database Schema

Add the schema to your `prisma/schema.prisma` file:

```prisma
// Copy content from vapi-database-schema.prisma
```

Then run:

```bash
pnpm prisma migrate dev
pnpm prisma generate
```

### Step 4: Import Vapi Module

In your `src/app.module.ts`:

```typescript
import { VapiModule } from './modules/voice/vapi.module';

@Module({
  imports: [
    // ... other modules
    VapiModule,
  ],
})
export class AppModule {}
```

### Step 5: Create Vapi Assistant

1. Go to [Vapi Dashboard](https://vapi.ai)
2. Create a new assistant
3. Configure:
   - Name: `Dayjoy Support Agent`
   - Voice: `Rachel` (11labs)
   - Model: `gpt-4o`
   - Language: `en-US`
4. Copy the Assistant ID
5. Update `vapi-config.ts` with your Assistant ID

### Step 6: Test the Setup

```typescript
// Test in your code
import { VapiClientService } from './modules/voice/vapi-client.service';

// Inject VapiClientService
constructor(private vapiClient: VapiClientService) {}

// Test creating a call
const call = await this.vapiClient.createCall('+1234567890');
console.log('Call created:', call.id);
```

---

## 📋 Configuration Options

### Voice Options

| Voice ID | Provider | Style | Best For |
|----------|----------|-------|----------|
| `rachel` | 11labs | Professional female | Customer support |
| `josh` | 11labs | Professional male | Sales |
| `arnold` | 11labs | Authoritative male | Business |
| `bella` | 11labs | Friendly female | Casual support |

### Model Options

| Model | Cost | Quality | Best For |
|-------|------|---------|----------|
| `gpt-4o` | $$$$ | Best | Complex queries |
| `gpt-4-turbo` | $$$ | Excellent | Most use cases |
| `gpt-3.5-turbo` | $ | Good | Simple queries |

---

## 🎯 Next Steps

### Module 2: Assistant Identity & System Prompts

In the next module, we'll create:
- ✅ Master system prompt for Dayjoy
- ✅ Assistant personality and tone
- ✅ Business rules and constraints
- ✅ RAG integration prompts
- ✅ Escalation triggers
- ✅ Human transfer protocols

**Ready to proceed with Module 2?**

---

## 📊 Summary

**✅ Complete:**
- Vapi client service
- Assistant configuration
- Database schema
- Environment setup
- NestJS module

**⏳ Next:**
- System prompts
- Conversation flows
- Tool integration

---

**Files Location:** Your artifacts folder
**Status:** Production-ready for Module 1