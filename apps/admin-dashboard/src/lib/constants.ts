/**
 * Application-wide constants — name, version, navigation, query keys,
 * permissions, and route prefixes.
 *
 * `NAV_ITEMS` is the single source of truth for the sidebar (consumed
 * by `src/components/layout/sidebar.tsx`). Each item carries an
 * optional `permission` key — the sidebar uses `usePermissions()` to
 * hide items the current user cannot access.
 */

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Bot,
  Phone,
  MessageSquare,
  MessageCircle,
  FileText,
  Brain,
  Wrench,
  BookOpen,
  FolderTree,
  Search,
  BarChart3,
  Users,
  Network,
  BadgeCheck,
  Target,
  Package,
  Boxes,
  ShoppingCart,
  TrendingUp,
  Workflow,
  Activity,
  Clock,
  Bell,
  Mail,
  Settings,
  Shield,
  ScrollText,
} from "lucide-react";

export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME || "Dayjoy AI Enterprise";

export const APP_VERSION = "1.0.0";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// ===== Permissions =====

/**
 * Permission strings — `resource:action` format. Must match the
 * backend `PermissionsGuard` literal table.
 */
export const PERMISSIONS = {
  // Auth / users
  USERS_READ: "users:read",
  USERS_WRITE: "users:write",
  USERS_DELETE: "users:delete",
  // CRM
  CUSTOMERS_READ: "customers:read",
  CUSTOMERS_WRITE: "customers:write",
  CUSTOMERS_DELETE: "customers:delete",
  DISTRIBUTORS_READ: "distributors:read",
  DISTRIBUTORS_WRITE: "distributors:write",
  LEADS_READ: "leads:read",
  LEADS_WRITE: "leads:write",
  // Catalog
  PRODUCTS_READ: "products:read",
  PRODUCTS_WRITE: "products:write",
  PRODUCTS_DELETE: "products:delete",
  ORDERS_READ: "orders:read",
  ORDERS_WRITE: "orders:write",
  ORDERS_DELETE: "orders:delete",
  // AI
  AI_READ: "ai:read",
  AI_WRITE: "ai:write",
  AI_EXECUTE: "ai:execute",
  // Knowledge
  KNOWLEDGE_READ: "knowledge:read",
  KNOWLEDGE_WRITE: "knowledge:write",
  KNOWLEDGE_DELETE: "knowledge:delete",
  // Channels
  VOICE_READ: "voice:read",
  VOICE_WRITE: "voice:write",
  WHATSAPP_READ: "whatsapp:read",
  WHATSAPP_WRITE: "whatsapp:write",
  // Analytics
  ANALYTICS_READ: "analytics:read",
  ANALYTICS_EXPORT: "analytics:export",
  // Automation
  WORKFLOWS_READ: "workflows:read",
  WORKFLOWS_WRITE: "workflows:write",
  WORKFLOWS_EXECUTE: "workflows:execute",
  // Notifications
  NOTIFICATIONS_READ: "notifications:read",
  NOTIFICATIONS_MANAGE_TEMPLATES: "notifications:manage_templates",
  // Admin
  ADMIN_READ: "admin:read",
  ADMIN_WRITE: "admin:write",
  ADMIN_VIEW_AUDIT_LOGS: "admin:view_audit_logs",
  ADMIN_MANAGE_TENANTS: "admin:manage_tenants",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// ===== Roles =====

export const USER_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
  "AGENT",
  "VIEWER",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

// ===== Navigation =====

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** `null` = visible to all authenticated users. */
  permission: Permission | null;
  /** Optional badge (e.g. "NEW") shown to the right of the label. */
  badge?: string;
}

export interface NavSection {
  section: string;
  items: NavItem[];
}

export const NAV_ITEMS: NavSection[] = [
  {
    section: "Main",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        permission: null,
      },
    ],
  },
  {
    section: "AI Management",
    items: [
      { label: "AI Assistants", href: "/ai/assistants", icon: Bot, permission: PERMISSIONS.AI_READ },
      { label: "Voice AI", href: "/conversations/voice", icon: Phone, permission: PERMISSIONS.VOICE_READ },
      { label: "Website Chat", href: "/conversations/chat", icon: MessageSquare, permission: PERMISSIONS.AI_READ },
      { label: "WhatsApp AI", href: "/conversations/whatsapp", icon: MessageCircle, permission: PERMISSIONS.WHATSAPP_READ },
      { label: "Prompts", href: "/ai/prompts", icon: FileText, permission: PERMISSIONS.AI_READ },
      { label: "Memory", href: "/ai/memory", icon: Brain, permission: PERMISSIONS.AI_READ },
      { label: "Tools", href: "/ai/tools", icon: Wrench, permission: PERMISSIONS.AI_READ },
    ],
  },
  {
    section: "Knowledge",
    items: [
      { label: "Documents", href: "/knowledge/documents", icon: BookOpen, permission: PERMISSIONS.KNOWLEDGE_READ },
      { label: "Categories", href: "/knowledge/categories", icon: FolderTree, permission: PERMISSIONS.KNOWLEDGE_READ },
      { label: "Search", href: "/knowledge/search", icon: Search, permission: PERMISSIONS.KNOWLEDGE_READ },
      { label: "Analytics", href: "/knowledge/analytics", icon: BarChart3, permission: PERMISSIONS.KNOWLEDGE_READ },
    ],
  },
  {
    section: "CRM",
    items: [
      { label: "Customers", href: "/customers", icon: Users, permission: PERMISSIONS.CUSTOMERS_READ },
      { label: "Distributors", href: "/distributors", icon: Network, permission: PERMISSIONS.DISTRIBUTORS_READ },
      { label: "Employees", href: "/employees", icon: BadgeCheck, permission: PERMISSIONS.USERS_READ },
      { label: "Leads", href: "/leads", icon: Target, permission: PERMISSIONS.LEADS_READ },
    ],
  },
  {
    section: "Products",
    items: [
      { label: "Products", href: "/products", icon: Package, permission: PERMISSIONS.PRODUCTS_READ },
      { label: "Categories", href: "/products/categories", icon: FolderTree, permission: PERMISSIONS.PRODUCTS_READ },
      { label: "Inventory", href: "/products/inventory", icon: Boxes, permission: PERMISSIONS.PRODUCTS_READ },
    ],
  },
  {
    section: "Orders",
    items: [
      { label: "Orders", href: "/orders", icon: ShoppingCart, permission: PERMISSIONS.ORDERS_READ },
    ],
  },
  {
    section: "Analytics",
    items: [
      { label: "Overview", href: "/analytics", icon: BarChart3, permission: PERMISSIONS.ANALYTICS_READ },
      { label: "Voice", href: "/analytics/voice", icon: Phone, permission: PERMISSIONS.ANALYTICS_READ },
      { label: "AI Performance", href: "/analytics/ai", icon: Bot, permission: PERMISSIONS.ANALYTICS_READ },
      { label: "Sales", href: "/analytics/sales", icon: TrendingUp, permission: PERMISSIONS.ANALYTICS_READ },
    ],
  },
  {
    section: "Automation",
    items: [
      { label: "Workflows", href: "/automation/workflows", icon: Workflow, permission: PERMISSIONS.WORKFLOWS_READ },
      { label: "Runs", href: "/automation/runs", icon: Activity, permission: PERMISSIONS.WORKFLOWS_READ },
      { label: "Scheduled", href: "/automation/scheduled", icon: Clock, permission: PERMISSIONS.WORKFLOWS_READ },
    ],
  },
  {
    section: "Notifications",
    items: [
      { label: "Center", href: "/notifications", icon: Bell, permission: null },
      { label: "Templates", href: "/notifications/templates", icon: Mail, permission: PERMISSIONS.NOTIFICATIONS_MANAGE_TEMPLATES },
    ],
  },
  {
    section: "System",
    items: [
      { label: "Configuration", href: "/system/config", icon: Settings, permission: PERMISSIONS.ADMIN_READ },
      { label: "Users", href: "/system/users", icon: Users, permission: PERMISSIONS.ADMIN_READ },
      { label: "Roles", href: "/system/roles", icon: Shield, permission: PERMISSIONS.ADMIN_READ },
      { label: "Audit Logs", href: "/system/audit", icon: ScrollText, permission: PERMISSIONS.ADMIN_VIEW_AUDIT_LOGS },
      { label: "Monitoring", href: "/system/monitoring", icon: Activity, permission: PERMISSIONS.ADMIN_READ },
    ],
  },
];

// ===== React Query keys =====

/**
 * Centralised query keys. React Query invalidations fan out by key
 * prefix, so a single `queryClient.invalidateQueries({ queryKey:
 * QUERY_KEYS.users })` refreshes every user-related list + detail.
 */
export const QUERY_KEYS = {
  auth: ["auth"] as const,
  me: ["auth", "me"] as const,
  users: ["users"] as const,
  customers: ["customers"] as const,
  distributors: ["distributors"] as const,
  distributorPerformance: (id: string) => ["distributors", id, "performance"] as const,
  employees: ["employees"] as const,
  products: ["products"] as const,
  productCategories: ["products", "categories"] as const,
  inventory: ["products", "inventory"] as const,
  orders: ["orders"] as const,
  orderStats: ["orders", "stats"] as const,
  aiAgents: ["ai", "agents"] as const,
  aiConversations: ["ai", "conversations"] as const,
  aiMessages: (conversationId: string) => ["ai", "conversations", conversationId, "messages"] as const,
  aiMemory: ["ai", "memory"] as const,
  aiTools: ["ai", "tools"] as const,
  knowledge: ["knowledge"] as const,
  knowledgeSources: ["knowledge", "sources"] as const,
  knowledgeDocuments: ["knowledge", "documents"] as const,
  knowledgeArticles: ["knowledge", "articles"] as const,
  knowledgeSearch: ["knowledge", "search"] as const,
  voiceSessions: ["voice", "sessions"] as const,
  voiceAssistants: ["voice", "assistants"] as const,
  voiceAnalytics: ["voice", "analytics"] as const,
  whatsappSessions: ["whatsapp", "sessions"] as const,
  whatsappMessages: (sessionId: string) => ["whatsapp", "sessions", sessionId, "messages"] as const,
  whatsappAccounts: ["whatsapp", "accounts"] as const,
  analytics: ["analytics"] as const,
  analyticsDashboard: ["analytics", "dashboard"] as const,
  analyticsSales: ["analytics", "sales"] as const,
  analyticsCustomers: ["analytics", "customers"] as const,
  analyticsProducts: ["analytics", "products"] as const,
  analyticsAi: ["analytics", "ai"] as const,
  analyticsVoice: ["analytics", "voice"] as const,
  analyticsWhatsapp: ["analytics", "whatsapp"] as const,
  analyticsKnowledge: ["analytics", "knowledge"] as const,
  notifications: ["notifications"] as const,
  notificationTemplates: ["notifications", "templates"] as const,
  notificationPreferences: ["notifications", "preferences"] as const,
  workflows: ["automation", "workflows"] as const,
  workflowExecutions: ["automation", "executions"] as const,
  workflowTriggers: ["automation", "triggers"] as const,
  systemHealth: ["system", "health"] as const,
  adminUsers: ["admin", "users"] as const,
  adminTenants: ["admin", "tenants"] as const,
  adminConfig: ["admin", "config"] as const,
  auditLogs: ["admin", "audit-logs"] as const,
  accessLogs: ["admin", "access-logs"] as const,
  integrations: ["admin", "integrations"] as const,
} as const;

// ===== Storage keys =====

export const STORAGE_KEYS = {
  ACCESS_TOKEN: "access_token",
  REFRESH_TOKEN: "refresh_token",
  TOKEN_EXPIRY: "token_expiry",
  USER: "dayjoy_user",
  THEME: "dayjoy-theme",
  SIDEBAR_COLLAPSED: "dayjoy-sidebar-collapsed",
} as const;

// ===== Routes =====

export const ROUTES = {
  login: "/login",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  dashboard: "/dashboard",
  settings: "/settings",
} as const;

export const PUBLIC_ROUTES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/api/health",
] as const;
