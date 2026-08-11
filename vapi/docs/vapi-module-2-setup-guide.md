# Voice AI (Vapi) Module 2: Setup Guide

## ✅ Module 2 Complete

### Files Created (6 Files)

All saved to your artifacts:

1. **`vapi-master-system-prompt.md`** - Core AI behavior and rules
2. **`vapi-dayjoy-knowledge-prompt.md`** - Dayjoy business knowledge
3. **`vapi-rag-integration-prompt.md`** - How to use RAG
4. **`vapi-conversation-flows.md`** - 7 conversation flow templates
5. **`vapi-escalation-protocols.md`** - Human escalation rules
6. **`vapi-module-2-setup-guide.md`** - This file

---

## 🎯 What Module 2 Provides

### 1. Master System Prompt
- ✅ AI identity and personality
- ✅ Core rules and guidelines
- ✅ RAG-first approach
- ✅ Anti-hallucination safeguards
- ✅ Response quality standards

### 2. Dayjoy Knowledge
- ✅ Company overview
- ✅ Product categories
- ✅ Business opportunity explanation
- ✅ Compensation plan structure
- ✅ Policies and procedures

### 3. RAG Integration
- ✅ When to search RAG
- ✅ How to search effectively
- ✅ What to do when info not found
- ✅ Best practices
- ✅ Example workflows

### 4. Conversation Flows (7)
- ✅ Customer Support
- ✅ Product Inquiry
- ✅ Business Opportunity
- ✅ Appointment Booking
- ✅ Lead Capture
- ✅ Compensation Plan Questions
- ✅ Human Escalation

### 5. Escalation Protocols
- ✅ When to escalate
- ✅ Escalation triggers
- ✅ Transfer process
- ✅ Documentation requirements
- ✅ Quality standards

---

## 🚀 Implementation Instructions

### Step 1: Integrate with Vapi

**In your Vapi Dashboard:**

1. Go to [Vapi.ai](https://vapi.ai)
2. Navigate to Assistants
3. Select your Dayjoy assistant
4. Update the **System Prompt** with content from `vapi-master-system-prompt.md`

### Step 2: Configure RAG Integration

**In your Vapi Assistant settings:**

1. Enable "Function Calling"
2. Add RAG search function:
   ```json
   {
     "name": "search_knowledge_base",
     "description": "Search the knowledge base for information",
     "parameters": {
       "type": "object",
       "properties": {
         "query": {
           "type": "string",
           "description": "Search query for RAG"
         }
       },
       "required": ["query"]
     }
   }
   ```

3. Set up webhook to call your backend RAG service

### Step 3: Add Conversation Flows

**In your backend:**

1. Import conversation flow templates
2. Implement flow logic in your voice service
3. Connect to RAG service for information retrieval
4. Test each flow thoroughly

### Step 4: Set Up Escalation

**In your Vapi Assistant:**

1. Add human transfer function:
   ```json
   {
     "name": "transfer_to_human",
     "description": "Transfer call to human agent",
     "parameters": {
       "type": "object",
       "properties": {
         "department": {
           "type": "string",
           "enum": ["customer_service", "business_development", "technical_support", "manager"]
         },
         "reason": {
           "type": "string",
           "description": "Reason for escalation"
         }
       },
       "required": ["department", "reason"]
     }
   }
   ```

2. Implement webhook handler for transfer requests
3. Set up routing to appropriate departments

---

## 📋 Configuration Checklist

### Voice Settings

- ✅ Voice: Rachel (11labs) - Professional female
- ✅ Stability: 0.8
- ✅ Similarity Boost: 0.7
- ✅ Style: 0.5
- ✅ Use Speaker Boost: true

### Model Settings

- ✅ Provider: OpenAI
- ✅ Model: GPT-4o
- ✅ Temperature: 0.7
- ✅ Max Tokens: 500

### Business Rules

- ✅ Max call duration: 30 minutes
- ✅ Allow interruptions: true
- ✅ Silence timeout: 30 seconds
- ✅ Voicemail enabled: true
- ✅ Recording enabled: true

### Greeting

- ✅ First message configured
- ✅ Voicemail message configured
- ✅ End call phrases configured

---

## 🧪 Testing Checklist

### Test RAG Integration

- ✅ Search for product information
- ✅ Search for compensation plan
- ✅ Search for policies
- ✅ Verify accuracy of responses
- ✅ Test when information not found

### Test Conversation Flows

- ✅ Customer support flow
- ✅ Product inquiry flow
- ✅ Business opportunity flow
- ✅ Appointment booking flow
- ✅ Lead capture flow
- ✅ Human escalation flow

### Test Escalation

- ✅ Customer requests human
- ✅ Complex issue escalation
- ✅ Emotional distress scenario
- ✅ Transfer to different departments
- ✅ Callback scheduling

### Test Anti-Hallucination

- ✅ Ask about non-existent product
- ✅ Ask for made-up information
- ✅ Verify AI says "I don't know"
- ✅ Verify AI offers to escalate

---

## 🎯 Next Steps

### Module 3: Tool Integration

In the next module, we'll create:
- ✅ 8 integrated tools (Search Knowledge, Search Products, Customer Lookup, etc.)
- ✅ Backend service implementations
- ✅ Tool calling configuration
- ✅ Error handling
- ✅ Testing suite

**Ready to proceed with Module 3?**

---

## 📊 Summary

**✅ Complete:**
- Master system prompt
- Dayjoy knowledge base
- RAG integration guide
- 7 conversation flows
- Escalation protocols
- Setup documentation

**⏳ Next:**
- Tool integration
- Backend implementation
- Testing

---

**Files Location:** Your artifacts folder
**Status:** Production-ready prompts and flows
**Integration:** Ready for Vapi dashboard configuration