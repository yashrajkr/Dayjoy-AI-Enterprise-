import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  Wallet,
  Receipt,
  Target,
  UserCircle,
  Package,
  ShoppingCart,
  Bot,
  GraduationCap,
  BookOpen,
  Bell,
  Settings,
} from "lucide-react";

export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME || "Dayjoy AI Distributor Portal";

export const APP_VERSION = "1.0.0";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

/** Default INR currency code used by all formatting helpers. */
export const DEFAULT_CURRENCY = "INR";

// ===== Navigation =====

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Optional badge (e.g. "NEW") shown to the right of the label. */
  badge?: string;
}

export interface NavSection {
  section: string;
  items: NavItem[];
}

/**
 * Single source of truth for the distributor sidebar — grouped by
 * functional area (overview, business, learning, account).
 */
export const NAV_ITEMS: NavSection[] = [
  {
    section: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    section: "Business",
    items: [
      { label: "Team", href: "/team", icon: Users },
      { label: "Sales", href: "/sales", icon: TrendingUp },
      { label: "Earnings", href: "/earnings", icon: Wallet },
      { label: "Commissions", href: "/commissions", icon: Receipt },
      { label: "Leads", href: "/leads", icon: Target },
      { label: "Customers", href: "/customers", icon: UserCircle },
    ],
  },
  {
    section: "Catalog",
    items: [
      { label: "Products", href: "/products", icon: Package },
      { label: "Orders", href: "/orders", icon: ShoppingCart },
    ],
  },
  {
    section: "AI & Learning",
    items: [
      { label: "AI Assistant", href: "/ai-assistant", icon: Bot, badge: "AI" },
      { label: "Training", href: "/training", icon: GraduationCap },
      { label: "Knowledge Base", href: "/knowledge", icon: BookOpen },
    ],
  },
  {
    section: "Account",
    items: [
      { label: "Notifications", href: "/notifications", icon: Bell },
      { label: "Profile", href: "/profile", icon: UserCircle },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

// ===== Distributor Tiers =====

export interface TierInfo {
  value: "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
  label: string;
  minSales: number;
  commissionRate: number;
  color: string;
  benefits: string[];
}

export const TIERS: TierInfo[] = [
  {
    value: "BRONZE",
    label: "Bronze",
    minSales: 0,
    commissionRate: 3,
    color: "text-amber-700 dark:text-amber-500",
    benefits: [
      "3% personal commission",
      "Access to product catalog",
      "Basic training materials",
    ],
  },
  {
    value: "SILVER",
    label: "Silver",
    minSales: 50000,
    commissionRate: 5,
    color: "text-slate-700 dark:text-slate-300",
    benefits: [
      "5% personal commission",
      "1% team override (level 1)",
      "Priority support",
      "Marketing materials",
    ],
  },
  {
    value: "GOLD",
    label: "Gold",
    minSales: 200000,
    commissionRate: 8,
    color: "text-yellow-700 dark:text-yellow-400",
    benefits: [
      "8% personal commission",
      "2% team override (level 1–2)",
      "Monthly performance bonus",
      "Dedicated account manager",
    ],
  },
  {
    value: "PLATINUM",
    label: "Platinum",
    minSales: 500000,
    commissionRate: 12,
    color: "text-cyan-700 dark:text-cyan-400",
    benefits: [
      "12% personal commission",
      "3% team override (level 1–3)",
      "Quarterly leadership bonus",
      "Annual retreat invitation",
    ],
  },
];

// ===== React Query keys =====

export const QUERY_KEYS = {
  auth: ["auth"] as const,
  me: ["auth", "me"] as const,
  distributor: (id: string) => ["distributor", id] as const,
  distributorPerformance: (id: string, range?: string) =>
    ["distributor", id, "performance", range ?? "default"] as const,
  distributorCommissions: (id: string) =>
    ["distributor", id, "commissions"] as const,
  team: (id: string) => ["team", id] as const,
  teamMember: (memberId: string) => ["team", "member", memberId] as const,
  sales: (range?: string) => ["sales", range ?? "default"] as const,
  earnings: (range?: string) => ["earnings", range ?? "default"] as const,
  commissions: (filters?: Record<string, unknown>) =>
    ["commissions", filters ?? {}] as const,
  commissionDetail: (id: string) => ["commissions", "detail", id] as const,
  notifications: ["notifications"] as const,
} as const;

// ===== Storage keys =====

export const STORAGE_KEYS = {
  ACCESS_TOKEN: "dp_access_token",
  REFRESH_TOKEN: "dp_refresh_token",
  TOKEN_EXPIRY: "dp_token_expiry",
  USER: "dp_user",
  DISTRIBUTOR: "dp_distributor",
  THEME: "dp-theme",
  SIDEBAR_COLLAPSED: "dp-sidebar-collapsed",
} as const;

// ===== Routes =====

export const ROUTES = {
  login: "/login",
  register: "/register",
  dashboard: "/dashboard",
  team: "/team",
  sales: "/sales",
  earnings: "/earnings",
  commissions: "/commissions",
  profile: "/profile",
  settings: "/settings",
} as const;

export const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
] as const;

// ===== Date range presets =====

export type DateRangePreset = "today" | "7d" | "30d" | "90d" | "ytd" | "custom";

export interface DateRangeOption {
  value: DateRangePreset;
  label: string;
  description: string;
}

export const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  { value: "today", label: "Today", description: "Current day" },
  { value: "7d", label: "Last 7 days", description: "Past week" },
  { value: "30d", label: "Last 30 days", description: "Past month" },
  { value: "90d", label: "Last 90 days", description: "Past quarter" },
  { value: "ytd", label: "Year to date", description: "Since Jan 1" },
  { value: "custom", label: "Custom range", description: "Pick dates" },
];

// ===== Label maps (used by existing scaffolded detail pages) =====
//
// These maps provide human-readable labels for enum-like fields. They
// are kept here (rather than co-located with each type) so any page
// can import a single `LABELS` namespace.

export const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Individual",
  RETAILER: "Retailer",
  WHOLESALE: "Wholesale",
};

export const LEAD_STAGE_LABELS: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  CONVERTED: "Converted",
  LOST: "Lost",
};

export const LEAD_SOURCE_LABELS: Record<string, string> = {
  WEBSITE: "Website",
  REFERRAL: "Referral",
  SOCIAL: "Social Media",
  EVENT: "Event",
  COLD_CALL: "Cold Call",
  WHATSAPP: "WhatsApp",
  VOICE: "Voice Call",
  OTHER: "Other",
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  RETURNED: "Returned",
  REFUNDED: "Refunded",
};

export const PRODUCT_CATEGORY_LABELS: Record<string, string> = {
  AYURVEDA: "Ayurveda",
  WELLNESS: "Wellness",
  NUTRITION: "Nutrition",
  SKINCARE: "Skincare",
  HAIRCARE: "Haircare",
  SUPPLEMENTS: "Supplements",
  OTHER: "Other",
};

export const KNOWLEDGE_CATEGORY_LABELS: Record<string, string> = {
  PRODUCT: "Products",
  POLICY: "Policies",
  TRAINING: "Training",
  TROUBLESHOOTING: "Troubleshooting",
  MARKETING: "Marketing",
  COMPANY: "Company",
};

export const TRAINING_CATEGORY_LABELS: Record<string, string> = {
  ONBOARDING: "Onboarding",
  PRODUCT: "Product Knowledge",
  SALES: "Sales Techniques",
  COMPENSATION: "Compensation Plan",
  LEADERSHIP: "Leadership",
};

export const NOTIFICATION_TYPES = [
  "COMMISSION",
  "TEAM",
  "ORDER",
  "ANNOUNCEMENT",
  "SYSTEM",
] as const;

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  COMMISSION: "Commission",
  TEAM: "Team",
  ORDER: "Order",
  ANNOUNCEMENT: "Announcement",
  SYSTEM: "System",
};

export const TIER_COMMISSION_RATES: Record<string, number> = {
  BRONZE: 3,
  SILVER: 5,
  GOLD: 8,
  PLATINUM: 12,
};

// ===== NAV_SECTIONS (legacy alias used by the existing sidebar.tsx) =====
//
// The existing scaffolded `src/components/layout/sidebar.tsx` (no longer
// wired into the live route tree — superseded by
// `distributor-sidebar.tsx`) imports `NAV_SECTIONS`. We re-export
// `NAV_ITEMS` under that name so the orphaned file still type-checks
// for `tsc --noEmit`.
export const NAV_SECTIONS = NAV_ITEMS;

// ===== Feature constants (Agent 4 — additive) =====
//
// These arrays + AI_QUICK_ACTIONS + DIAMOND tier are consumed by the
// feature pages (leads, products, orders, training, knowledge, etc.)
// and by the test suite. They are purely additive — no existing export
// is modified. Appended after Agent 3's foundation constants.

export const DISTRIBUTOR_TIERS = [
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "DIAMOND",
] as const;

// Augment TIER_COMMISSION_RATES with DIAMOND (Agent 3's version omits it).
// We attach it via Object.assign to avoid redeclaring the const.
Object.assign(TIER_COMMISSION_RATES, { DIAMOND: 15 });

export const LEAD_STAGES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "CONVERTED",
  "LOST",
] as const;

export const LEAD_SOURCES = [
  "WEBSITE",
  "REFERRAL",
  "SOCIAL_MEDIA",
  "EVENT",
  "COLD_CALL",
  "WHATSAPP",
  "WALK_IN",
  "OTHER",
] as const;

export const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "RETURNED",
  "REFUNDED",
] as const;

export const CUSTOMER_TYPES = ["INDIVIDUAL", "RETAILER", "WHOLESALE"] as const;

export const PRODUCT_CATEGORIES = [
  "WELLNESS",
  "BEAUTY",
  "HOME",
  "NUTRITION",
  "PERSONAL_CARE",
  "ACCESSORIES",
] as const;

export const TRAINING_CATEGORIES = [
  "ONBOARDING",
  "PRODUCT_TRAINING",
  "SALES_TECHNIQUES",
  "BUSINESS_PLAN",
  "LEADERSHIP",
] as const;

export const KNOWLEDGE_CATEGORIES = [
  "POLICIES",
  "COMPENSATION_PLAN",
  "SOPS",
  "FAQS",
  "PRODUCT_INFO",
] as const;

export const DOCUMENT_CATEGORIES = [
  "INVOICES",
  "COMMISSION_STATEMENTS",
  "TAX_DOCUMENTS",
  "CERTIFICATES",
  "AGREEMENTS",
  "OTHER",
] as const;

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  INVOICES: "Invoices",
  COMMISSION_STATEMENTS: "Commission Statements",
  TAX_DOCUMENTS: "Tax Documents",
  CERTIFICATES: "Certificates",
  AGREEMENTS: "Agreements",
  OTHER: "Other",
};

export const ANNOUNCEMENT_CATEGORIES = [
  "COMPANY",
  "PRODUCT",
  "EVENT",
  "PROMOTION",
] as const;

export const ANNOUNCEMENT_CATEGORY_LABELS: Record<string, string> = {
  COMPANY: "Company",
  PRODUCT: "Product",
  EVENT: "Event",
  PROMOTION: "Promotion",
};

export const AI_QUICK_ACTIONS: {
  label: string;
  prompt: string;
  icon: string;
}[] = [
  {
    label: "Generate a product pitch",
    prompt:
      "Generate a 60-second sales pitch for the Dayjoy Glow Diffuser I can use with a new prospect.",
    icon: "Megaphone",
  },
  {
    label: "Suggest follow-up for a lead",
    prompt:
      "I have a lead who showed interest in wellness products last week but hasn't replied to my WhatsApp. Suggest the best follow-up message.",
    icon: "MessageCircle",
  },
  {
    label: "Analyze my team performance",
    prompt:
      "Analyze my team's performance this month and identify my top 3 performers and 2 under-performers.",
    icon: "BarChart3",
  },
  {
    label: "How do I reach the next tier?",
    prompt:
      "I'm currently at GOLD tier with ₹4.2L in sales. What do I need to do to reach PLATINUM tier next month?",
    icon: "Trophy",
  },
];
