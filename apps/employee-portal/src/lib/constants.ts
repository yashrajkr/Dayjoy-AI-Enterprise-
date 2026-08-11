import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  Network,
  Target,
  Package,
  TicketIcon,
  BookOpen,
  Bot,
  MessageSquare,
  Bell,
  BarChart3,
  UserCog,
  Settings,
} from "lucide-react";

export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME || "Dayjoy AI Enterprise";

export const APP_VERSION = "1.0.0";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export const PORTAL_NAME = "Employee Portal";

// ===== Roles (subset relevant to the employee portal) =====
export const EMPLOYEE_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
  "AGENT",
  "EMPLOYEE",
  "SUPPORT",
  "SALES",
] as const;

export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];

/**
 * Legacy role aliases — kept for Agent 6's sidebar.tsx / portal-layout.tsx.
 * Maps to the same string union as `EmployeeRole` but uses the original
 * short names (USER_ROLES / UserRole).
 */
export const USER_ROLES = ["EMPLOYEE", "AGENT", "MANAGER", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// ===== Permissions (Agent 6 — extras) =====
export const PERMISSIONS = {
  TASKS_READ: "tasks:read",
  TASKS_WRITE: "tasks:write",
  TICKETS_READ: "tickets:read",
  TICKETS_WRITE: "tickets:write",
  CRM_READ: "customers:read",
  CRM_WRITE: "customers:write",
  LEADS_READ: "leads:read",
  LEADS_WRITE: "leads:write",
  ATTENDANCE_READ: "attendance:read",
  ATTENDANCE_WRITE: "attendance:write",
  REPORTS_READ: "reports:read",
  ANALYTICS_READ: "analytics:read",
  TEAM_READ: "team:read",
  PROFILE_WRITE: "profile:write",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const DEPARTMENTS = [
  "SALES",
  "SUPPORT",
  "MARKETING",
  "OPERATIONS",
  "FINANCE",
  "HR",
  "PRODUCT",
  "ENGINEERING",
  "LOGISTICS",
] as const;

// ===== Navigation =====
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  /**
   * Optional role restriction. When set, the sidebar should only show
   * this item to users with a matching role. `null`/`undefined` = visible
   * to all authenticated users.
   */
  roles?: EmployeeRole[] | null;
}

export interface NavSection {
  section: string;
  items: NavItem[];
}

export const NAV_ITEMS: NavSection[] = [
  {
    section: "Workspace",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Tasks", href: "/tasks", icon: CheckSquare },
      {
        label: "Tickets",
        href: "/tickets",
        icon: TicketIcon,
      },
    ],
  },
  {
    section: "CRM",
    items: [
      { label: "Customers", href: "/crm/customers", icon: Users },
      { label: "Distributors", href: "/crm/distributors", icon: Network },
      { label: "Leads", href: "/crm/leads", icon: Target },
    ],
  },
  {
    section: "Catalog & Knowledge",
    items: [
      { label: "Products", href: "/products", icon: Package },
      { label: "Knowledge Base", href: "/knowledge", icon: BookOpen },
    ],
  },
  {
    section: "Assistants",
    items: [
      { label: "AI Assistant", href: "/ai-assistant", icon: Bot },
      { label: "Internal Chat", href: "/chat", icon: MessageSquare },
      { label: "Notifications", href: "/notifications", icon: Bell },
    ],
  },
  {
    section: "Insights",
    items: [
      { label: "Reports", href: "/reports", icon: BarChart3 },
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
      { label: "Team", href: "/team", icon: Users },
    ],
  },
  {
    section: "Account",
    items: [
      { label: "Profile", href: "/profile", icon: UserCog },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

// ===== React Query keys =====
export const QUERY_KEYS = {
  auth: ["auth"] as const,
  me: ["auth", "me"] as const,
  dashboard: ["dashboard"] as const,
  tasks: ["tasks"] as const,
  task: (id: string) => ["tasks", id] as const,
  taskStats: ["tasks", "stats"] as const,
  customers: ["customers"] as const,
  customer: (id: string) => ["customers", id] as const,
  distributors: ["distributors"] as const,
  distributor: (id: string) => ["distributors", id] as const,
  leads: ["leads"] as const,
  lead: (id: string) => ["leads", id] as const,
  products: ["products"] as const,
  tickets: ["tickets"] as const,
  ticket: (id: string) => ["tickets", id] as const,
  knowledgeArticles: ["knowledge", "articles"] as const,
  knowledgeArticle: (slug: string) => ["knowledge", "articles", slug] as const,
  aiConversations: ["ai", "conversations"] as const,
  aiConversation: (id: string) =>
    ["ai", "conversations", id] as const,
  notifications: ["notifications"] as const,
  analyticsDashboard: ["analytics", "dashboard"] as const,
  chatChannels: ["chat", "channels"] as const,
  chatMessages: (channelId: string) =>
    ["chat", "channels", channelId] as const,
  team: ["team"] as const,
  // ===== Agent 6 (extras) query keys =====
  attendance: ["attendance"] as const,
  attendanceToday: ["attendance", "today"] as const,
  attendanceMonth: (month: string) => ["attendance", "month", month] as const,
  leaveRequests: ["attendance", "leave"] as const,
  leaveBalance: ["attendance", "leave", "balance"] as const,
  reports: ["reports"] as const,
  reportSales: (range: string) => ["reports", "sales", range] as const,
  reportTickets: (range: string) => ["reports", "tickets", range] as const,
  reportPerformance: ["reports", "performance"] as const,
  savedReports: ["reports", "saved"] as const,
  teamMember: (id: string) => ["team", id] as const,
  profile: ["profile"] as const,
  notificationsPreferences: ["notifications", "preferences"] as const,
} as const;

// ===== Storage keys =====
export const STORAGE_KEYS = {
  ACCESS_TOKEN: "ep_access_token",
  REFRESH_TOKEN: "ep_refresh_token",
  TOKEN_EXPIRY: "ep_token_expiry",
  USER: "ep_user",
  THEME: "ep-theme",
  SIDEBAR_COLLAPSED: "ep-sidebar-collapsed",
  TASK_FILTERS: "ep-task-filters",
} as const;

// ===== Routes =====
export const ROUTES = {
  login: "/login",
  dashboard: "/dashboard",
  settings: "/settings",
  profile: "/profile",
} as const;

export const PUBLIC_ROUTES = ["/login"] as const;

// ===== Task / Ticket / Lead / Customer display labels =====
export const TASK_STATUS_LABELS: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
  BLOCKED: "Blocked",
  CANCELLED: "Cancelled",
  ALL: "All",
};

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
  ALL: "All",
};

export const TICKET_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_CUSTOMER: "Waiting on Customer",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  ESCALATED: "Escalated",
  ALL: "All",
};

export const LEAD_STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  PROPOSAL: "Proposal",
  NEGOTIATION: "Negotiation",
  WON: "Won",
  LOST: "Lost",
  ALL: "All",
};

export const LEAD_SOURCE_LABELS: Record<string, string> = {
  WEBSITE: "Website",
  WHATSAPP: "WhatsApp",
  VOICE_CALL: "Voice Call",
  REFERRAL: "Referral",
  SOCIAL_MEDIA: "Social Media",
  EMAIL_CAMPAIGN: "Email Campaign",
  EVENT: "Event",
  WALK_IN: "Walk-in",
  OTHER: "Other",
  ALL: "All",
};

export const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Individual",
  DISTRIBUTOR: "Distributor",
  RESELLER: "Reseller",
  WHOLESALE: "Wholesale",
  ALL: "All",
};

export const DISTRIBUTOR_TIER_LABELS: Record<string, string> = {
  BRONZE: "Bronze",
  SILVER: "Silver",
  GOLD: "Gold",
  PLATINUM: "Platinum",
  DIAMOND: "Diamond",
  ALL: "All",
};

export const TICKET_CATEGORY_LABELS: Record<string, string> = {
  ORDER: "Order",
  PRODUCT: "Product",
  PAYMENT: "Payment",
  SHIPPING: "Shipping",
  RETURN: "Return",
  REFUND: "Refund",
  ACCOUNT: "Account",
  TECHNICAL: "Technical",
  OTHER: "Other",
};

// ===== Knowledge categories =====
export const KNOWLEDGE_CATEGORIES = [
  { slug: "sops", label: "Standard Operating Procedures" },
  { slug: "policies", label: "Policies" },
  { slug: "product-info", label: "Product Information" },
  { slug: "training", label: "Training Material" },
  { slug: "internal", label: "Internal Docs" },
  { slug: "compliance", label: "Compliance" },
] as const;
