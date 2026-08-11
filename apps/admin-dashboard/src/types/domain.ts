// Dayjoy AI Enterprise — Domain Types
// Mirrors backend Prisma models so views can swap localStorage for REST with no type changes.

// ===== RBAC =====
export type RoleName =
  | "SUPER_ADMIN"
  | "AI_ADMIN"
  | "KNOWLEDGE_ADMIN"
  | "AUTOMATION_ADMIN"
  | "ANALYTICS_ADMIN"
  | "SUPPORT_ADMIN";

export type Permission =
  | "view" | "create" | "edit" | "delete" | "configure" | "test" | "export" | "execute";

export type ResourceType =
  | "assistant" | "knowledge" | "tool" | "memory" | "prompt"
  | "voice" | "whatsapp" | "website" | "automation" | "admin"
  | "audit" | "config";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  permissions: Record<ResourceType, Permission[]>;
  status: "active" | "suspended" | "invited";
  lastActiveAt: string | null;
  createdAt: string;
}

// ===== AI Assistants =====
export type AgentType =
  | "SUPPORT" | "SALES" | "ONBOARDING" | "TECHNICAL" | "BILLING"
  | "DISTRIBUTOR" | "ADMIN" | "VOICE" | "WHATSAPP" | "WEB";

export type ChannelType = "voice" | "whatsapp" | "website";

export interface Assistant {
  id: string;
  name: string;
  type: AgentType;
  description: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  knowledgeSourceIds: string[];
  toolIds: string[];
  memoryEnabled: boolean;
  memoryRetentionDays: number;
  allowedChannels: ChannelType[];
  status: "active" | "draft" | "archived";
  conversations: number;
  accuracy: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ===== Knowledge Base =====
export interface KnowledgeDocument {
  id: string;
  title: string;
  category: string;
  format: "pdf" | "docx" | "md" | "txt" | "html" | "csv";
  sizeBytes: number;
  chunks: number;
  status: "uploading" | "processing" | "ready" | "failed";
  progress: number; // 0–100
  errorMessage?: string;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

// ===== Tools =====
export type ToolCategory =
  | "knowledge" | "crm" | "catalog" | "communication" | "calendar" | "utility" | "custom";

export type ToolExecutionType = "function" | "api" | "workflow";

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  executionType: ToolExecutionType;
  schema: string; // JSON schema for parameters
  endpoint?: string;
  enabled: boolean;
  calls: number;
  successRate: number;
  avgLatencyMs: number;
  assistantIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ===== Memory =====
export type MemoryType = "FACT" | "PREFERENCE" | "HISTORY" | "CONTEXT";
export type MemoryScope = "customer" | "session" | "distributor" | "tenant";

export interface MemoryRecord {
  id: string;
  key: string;
  type: MemoryType;
  scope: MemoryScope;
  value: string;
  importance: number; // 1–10
  agentId: string | null;
  expiresAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ===== Prompts =====
export interface PromptVersion {
  version: number;
  content: string;
  changedBy: string;
  changedAt: string;
  changeNote?: string;
}

export interface Prompt {
  id: string;
  name: string;
  description: string;
  category: "system" | "rag" | "channel" | "escalation" | "custom";
  content: string;
  tokens: number;
  versions: PromptVersion[];
  activeVersion: number;
  status: "active" | "draft" | "archived";
  assistantIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ===== Audit Log =====
export type AuditAction = "INSERT" | "UPDATE" | "DELETE" | "TEST" | "CONFIGURE" | "EXPORT";

export interface AuditEntry {
  id: string;
  action: AuditAction;
  resourceType: ResourceType;
  resourceId: string | null;
  resourceName: string | null;
  userId: string;
  userEmail: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string;
  createdAt: string;
}

// ===== Provider Config =====
export interface ProviderConfig {
  id: string;
  provider: "vapi" | "whatsapp" | "openai" | "twilio" | "sendgrid";
  displayName: string;
  configured: boolean;
  requiredFields: string[];
  configuredFields: string[];
  lastCheckedAt: string | null;
  notes?: string;
}

// ===== Channel Config =====
export interface WebsiteChannelConfig {
  enabled: boolean;
  assistantId: string | null;
  promptId: string | null;
  knowledgeSourceIds: string[];
  toolIds: string[];
  model: string;
  rateLimitPerMinute: number;
  requireAuth: boolean;
  allowedOrigins: string[];
  updatedAt: string;
}

export interface WhatsAppChannelConfig {
  enabled: boolean;
  assistantId: string | null;
  promptId: string | null;
  knowledgeSourceIds: string[];
  toolIds: string[];
  businessPhoneNumberId: string | null;
  webhookSecret: string | null;
  webhookUrl: string | null;
  templates: { name: string; language: string; status: "approved" | "pending" | "rejected" }[];
  updatedAt: string;
}

// ===== Voice Session =====
export type VoiceCallState = "idle" | "connecting" | "connected" | "active" | "ending" | "ended" | "failed";

export interface VoiceCall {
  id: string;
  state: VoiceCallState;
  direction: "inbound" | "outbound";
  customerName: string;
  customerPhone: string;
  assistantId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  outcome: string | null;
}
