# Dayjoy Voice AI - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Install Dependencies
```bash
pnpm add @vapi-ai/sdk
```

### Step 2: Set Environment Variables
```env
VAPI_API_KEY=your_vapi_api_key
VAPI_WEBHOOK_SECRET=your_secret
DATABASE_URL=postgresql://...
```

### Step 3: Run Database Migration
```bash
pnpm prisma migrate dev
```

### Step 4: Import Module
```typescript
import { VapiModule } from './modules/voice/vapi.module';

@Module({
  imports: [VapiModule],
})
```

### Step 5: Configure Vapi Dashboard
1. Go to vapi.ai
2. Create assistant
3. Add system prompt
4. Set webhook URL
5. Enable function calling

### Step 6: Test
```bash
curl http://localhost:3000/api/voice/webhook/health
```

## ✅ You're Ready!

All 63 files are in your artifacts folder.
Check your artifacts panel to download them all!

🎉 **Production Ready!**