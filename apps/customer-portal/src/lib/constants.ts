import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Sparkles,
  LifeBuoy,
  Bell,
  Settings,
  History,
  Phone,
  MessageCircle,
} from "lucide-react";

export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME || "Dayjoy AI Customer Portal";

/** Full brand name (used in footer / auth-shell headings). */
export const APP_NAME_FULL = "Dayjoy AI";

export const APP_VERSION = "1.0.0";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

/** Public support email + phone — surfaced in the footer + auth shell. */
export const SUPPORT_EMAIL = "support@dayjoy.ai";
export const SUPPORT_PHONE = "+91 800 123 4567";

/** Customer-facing role literals (mirrors backend `CustomerRole`). */
export const CUSTOMER_ROLES = [
  "CUSTOMER",
  "VIP_CUSTOMER",
  "WHOLESALE_CUSTOMER",
] as const;
export type CustomerRole = (typeof CUSTOMER_ROLES)[number];

/**
 * Routes that don't require authentication. Used by the `(portal)`
 * layout's client-side auth gate.
 */
export const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-otp",
] as const;

/** Returns true when `pathname` should be accessible without auth. */
export function isPublicRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );
}

/** Footer link grid — consumed by `customer-footer.tsx`. */
export const FOOTER_LINKS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Shop",
    links: [
      { label: "All Products", href: "/products" },
      { label: "Categories", href: "/products/category/all" },
      { label: "Search", href: "/products/search" },
      { label: "Today's Offers", href: "/products?filter=offers" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "My Orders", href: "/orders" },
      { label: "Profile", href: "/profile" },
      { label: "Settings", href: "/settings" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help Center", href: "/support" },
      { label: "FAQs", href: "/support/faqs" },
      { label: "Knowledge Base", href: "/support/knowledge-base" },
      { label: "Live Chat", href: "/support/live-chat" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/legal/privacy" },
      { label: "Terms of Service", href: "/legal/terms" },
      { label: "Return Policy", href: "/legal/returns" },
      { label: "Cookie Policy", href: "/legal/cookies" },
    ],
  },
];

/**
 * Languages supported by the language switcher (Profile → Preferences
 * + Settings → Language). Exported as both `LANGUAGES` (preferred by
 * the preferences tab) and `SUPPORTED_LANGUAGES` (preferred by the
 * Settings page) for compatibility.
 */
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी (Hindi)" },
  { code: "bn", label: "বাংলা (Bengali)" },
  { code: "ta", label: "தமிழ் (Tamil)" },
  { code: "te", label: "తెలుగు (Telugu)" },
  { code: "mr", label: "मराठी (Marathi)" },
  { code: "kn", label: "ಕನ್ನಡ (Kannada)" },
  { code: "gu", label: "ગુજરાતી (Gujarati)" },
] as const;

/** Currencies surfaced in the preferences select. */
export const CURRENCIES = [
  { code: "INR", symbol: "₹", label: "Indian Rupee" },
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "AED", symbol: "د.إ", label: "UAE Dirham" },
  { code: "GBP", symbol: "£", label: "British Pound" },
  { code: "EUR", symbol: "€", label: "Euro" },
] as const;

/** WhatsApp support number — pre-fills wa.me links from Settings. */
export const WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "919999999999";

/** Vapi public key + assistant id for voice AI. */
export const VAPI_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || "";
export const VAPI_ASSISTANT_ID =
  process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID || "";

export const STORAGE_KEYS = {
  ACCESS_TOKEN: "cp_access_token",
  REFRESH_TOKEN: "cp_refresh_token",
  USER: "cp_user",
  THEME: "cp-theme",
  LANGUAGE: "cp-language",
  NOTIF_PREFS: "cp-notif-prefs",
} as const;

export const QUERY_KEYS = {
  auth: ["auth"] as const,
  me: ["auth", "me"] as const,
  products: ["products"] as const,
  orders: ["orders"] as const,
  aiConversations: ["ai", "conversations"] as const,
  aiConversation: (id: string) => ["ai", "conversations", id] as const,
  aiMessages: (conversationId: string) =>
    ["ai", "conversations", conversationId, "messages"] as const,
  knowledgeArticles: ["knowledge", "articles"] as const,
  knowledgeArticle: (id: string) => ["knowledge", "articles", id] as const,
  knowledgeQuery: ["knowledge", "query"] as const,
  notifications: ["notifications"] as const,
  notificationPreferences: ["notifications", "preferences"] as const,
  supportTickets: ["support", "tickets"] as const,
  supportTicket: (id: string) => ["support", "tickets", id] as const,
  liveChat: (sessionId: string) => ["support", "live-chat", sessionId] as const,
} as const;

export const ROUTES = {
  login: "/login",
  dashboard: "/dashboard",
  aiAssistant: "/ai-assistant",
  aiHistory: "/ai-assistant/history",
  support: "/support",
  supportTickets: "/support/tickets",
  supportNewTicket: "/support/tickets/new",
  supportLiveChat: "/support/live-chat",
  supportFaqs: "/support/faqs",
  supportKnowledge: "/support/knowledge-base",
  notifications: "/notifications",
  settings: "/settings",
} as const;

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
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
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Products", href: "/products", icon: Package },
      { label: "Orders", href: "/orders", icon: ShoppingCart },
    ],
  },
  {
    section: "AI Assistant",
    items: [
      { label: "AI Chat", href: "/ai-assistant", icon: Sparkles },
      { label: "History", href: "/ai-assistant/history", icon: History },
    ],
  },
  {
    section: "Support",
    items: [
      { label: "Support Center", href: "/support", icon: LifeBuoy },
      { label: "My Tickets", href: "/support/tickets", icon: LifeBuoy },
      { label: "Live Chat", href: "/support/live-chat", icon: MessageCircle },
      { label: "FAQs", href: "/support/faqs", icon: LifeBuoy },
      { label: "Knowledge Base", href: "/support/knowledge-base", icon: LifeBuoy },
    ],
  },
  {
    section: "Account",
    items: [
      { label: "Notifications", href: "/notifications", icon: Bell },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

/** AI quick-reply suggestions shown above the chat input. */
export const AI_QUICK_REPLIES: string[] = [
  "Track my recent order",
  "What's the return policy?",
  "Recommend a product for me",
  "How do I contact a distributor?",
  "Show me today's offers",
];

/** Support ticket categories. */
export const TICKET_CATEGORIES = [
  "Order Issue",
  "Product Inquiry",
  "Payment",
  "Shipping",
  "Returns & Refunds",
  "Account",
  "Other",
] as const;

export const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const TICKET_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
] as const;

/** FAQ categories. */
export const FAQ_CATEGORIES = [
  "Orders",
  "Products",
  "Payments",
  "Shipping",
  "Returns",
  "Account",
] as const;

/** Notification types. */
export const NOTIFICATION_TYPES = [
  "order",
  "promotion",
  "support",
  "system",
] as const;

/** Knowledge-base categories surfaced to customers. */
export const KB_CATEGORIES = [
  "Getting Started",
  "Account",
  "Orders",
  "Payments",
  "Shipping",
  "Returns",
  "Privacy & Security",
] as const;

/** Alias for `LANGUAGES` (used by the Settings → Language tab). */
export const SUPPORTED_LANGUAGES = LANGUAGES;

export const SUPPORTED_TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
] as const;

export const DATE_FORMATS = [
  { value: "dd MMM yyyy", label: "DD MMM YYYY (07 Aug 2026)" },
  { value: "MM/dd/yyyy", label: "MM/DD/YYYY (08/07/2026)" },
  { value: "dd-MM-yyyy", label: "DD-MM-YYYY (07-08-2026)" },
  { value: "yyyy-MM-dd", label: "YYYY-MM-DD (2026-08-07)" },
] as const;
