export type Trend = "up" | "down";

export type Kpi = {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  display?: string;
  trend: Trend;
  change: string;
  icon: "revenue" | "users" | "phone" | "chat" | "docs" | "chunks" | "query" | "latency" | "bot";
  tone: "brand" | "info" | "success" | "violet";
  live?: boolean;
  spark: number[];
};

export const dashboardKpis: Kpi[] = [
  {
    label: "Total Revenue",
    value: 374000,
    prefix: "₹",
    trend: "up",
    change: "+12.5%",
    icon: "revenue",
    tone: "brand",
    spark: [42, 48, 45, 58, 52, 68, 74],
  },
  {
    label: "Total Customers",
    value: 8452,
    trend: "up",
    change: "+3.2%",
    icon: "users",
    tone: "info",
    spark: [30, 34, 36, 39, 44, 46, 52],
  },
  {
    label: "Active Calls",
    value: 23,
    trend: "up",
    change: "+5",
    icon: "phone",
    tone: "success",
    live: true,
    spark: [12, 18, 15, 22, 19, 26, 23],
  },
  {
    label: "AI Conversations",
    value: 1200,
    trend: "down",
    change: "-2.1%",
    icon: "chat",
    tone: "violet",
    spark: [64, 58, 61, 55, 50, 48, 45],
  },
];

export const revenueSeries = [
  { day: "Mon", revenue: 42000, target: 50000 },
  { day: "Tue", revenue: 48000, target: 50000 },
  { day: "Wed", revenue: 45000, target: 50000 },
  { day: "Thu", revenue: 61000, target: 55000 },
  { day: "Fri", revenue: 53000, target: 55000 },
  { day: "Sat", revenue: 68000, target: 60000 },
  { day: "Sun", revenue: 74000, target: 60000 },
];

export const callOutcomes = [
  { name: "Completed", value: 145, tone: "success" as const },
  { name: "Transferred", value: 23, tone: "brand" as const },
  { name: "Abandoned", value: 12, tone: "danger" as const },
  { name: "Failed", value: 5, tone: "muted" as const },
];

export const aiUsageByChannel = [
  { channel: "Voice", value: 320, tone: "info" as const },
  { channel: "WhatsApp", value: 450, tone: "success" as const },
  { channel: "Website", value: 280, tone: "violet" as const },
  { channel: "API", value: 150, tone: "brand" as const },
];

export type Activity = {
  title: string;
  description: string;
  time: string;
  icon: "phone" | "package" | "message" | "ticket" | "bot";
  tone: "info" | "success" | "brand" | "danger" | "violet";
};

export const recentActivity: Activity[] = [
  {
    title: "Voice call from Rahul Sharma",
    description: "3m 12s · Order status enquiry resolved by Sarah",
    time: "2 min ago",
    icon: "phone",
    tone: "info",
  },
  {
    title: "New order #ORD-042",
    description: "₹18,400 · Dayjoy Wellness bundle · Prepaid",
    time: "9 min ago",
    icon: "package",
    tone: "success",
  },
  {
    title: "New lead from WhatsApp",
    description: "Meera Iyer · Score 82 · Assigned to Kunal",
    time: "24 min ago",
    icon: "message",
    tone: "brand",
  },
  {
    title: "Support ticket #TKT-156",
    description: "Delivery delay · Escalated to human agent",
    time: "41 min ago",
    icon: "ticket",
    tone: "danger",
  },
  {
    title: "AI conversation completed",
    description: "Website chat · 14 turns · CSAT 5.0",
    time: "1 hr ago",
    icon: "bot",
    tone: "violet",
  },
];

export type Service = {
  name: string;
  status: "healthy" | "degraded";
  latency: string;
  uptime: string;
};

export const services: Service[] = [
  { name: "Backend API", status: "healthy", latency: "45ms", uptime: "99.9%" },
  { name: "Database", status: "healthy", latency: "12ms", uptime: "99.9%" },
  { name: "Redis", status: "healthy", latency: "2ms", uptime: "100%" },
  { name: "Voice AI", status: "healthy", latency: "180ms", uptime: "99.5%" },
  { name: "WhatsApp", status: "degraded", latency: "520ms", uptime: "97.2%" },
  { name: "OpenAI", status: "healthy", latency: "850ms", uptime: "99.8%" },
];

export const futureFeatures = [
  {
    name: "AI-Powered Predictions",
    description: "ML models that predict customer behavior and sales trends",
    icon: "brain" as const,
    tone: "violet" as const,
  },
  {
    name: "Multi-Region Deployment",
    description: "Deploy across multiple regions for global low-latency access",
    icon: "globe" as const,
    tone: "info" as const,
  },
  {
    name: "Advanced Voice Cloning",
    description: "Custom voice models for brand-specific AI assistants",
    icon: "mic" as const,
    tone: "brand" as const,
  },
  {
    name: "Blockchain Audit Trail",
    description: "Immutable, tamper-proof audit logs using blockchain technology",
    icon: "shield" as const,
    tone: "success" as const,
  },
];

/* ---------- AI Management ---------- */

export const agents = [
  {
    name: "Sarah",
    role: "Voice Assistant",
    tone: "info" as const,
    conversations: "4,120",
    accuracy: "94%",
    model: "gpt-5-voice",
  },
  {
    name: "Priya",
    role: "WhatsApp Bot",
    tone: "success" as const,
    conversations: "6,480",
    accuracy: "92%",
    model: "gemini-3-flash",
  },
  {
    name: "Raj",
    role: "Website Chat",
    tone: "violet" as const,
    conversations: "3,240",
    accuracy: "90%",
    model: "gpt-5-mini",
  },
];

export const tools = [
  { name: "search_knowledge", description: "Semantic search across the RAG knowledge base", calls: "12,480", rate: 98 },
  { name: "search_products", description: "Look up catalog products, pricing and stock", calls: "8,120", rate: 99 },
  { name: "customer_lookup", description: "Fetch customer profile, orders and LTV", calls: "6,940", rate: 97 },
  { name: "distributor_lookup", description: "Resolve distributor code, tier and team", calls: "2,310", rate: 100 },
  { name: "create_lead", description: "Create and score a new CRM lead", calls: "3,150", rate: 96 },
  { name: "book_appointment", description: "Book a slot on the sales calendar", calls: "1,480", rate: 94 },
  { name: "create_support_ticket", description: "Open a support ticket with context", calls: "2,020", rate: 99 },
  { name: "human_transfer", description: "Warm transfer the conversation to an agent", calls: "670", rate: 100 },
];

export const memoryStats = [
  { label: "Total Memories", value: "12,450" },
  { label: "Preferences", value: "3,200" },
  { label: "Facts", value: "5,800" },
  { label: "Summaries", value: "3,450" },
];

export const memoryRows = [
  { key: "pref:language", type: "Preference", scope: "Customer", entries: "1,240", updated: "2 min ago" },
  { key: "fact:order_history", type: "Fact", scope: "Customer", entries: "4,180", updated: "12 min ago" },
  { key: "summary:conversation", type: "Summary", scope: "Session", entries: "3,450", updated: "26 min ago" },
  { key: "pref:contact_window", type: "Preference", scope: "Customer", entries: "960", updated: "1 hr ago" },
  { key: "fact:distributor_tier", type: "Fact", scope: "Distributor", entries: "620", updated: "3 hrs ago" },
];

export const prompts = [
  { name: "Master System Prompt", description: "Global persona, tone and safety rails", tokens: "1,840 tokens" },
  { name: "Dayjoy Knowledge Prompt", description: "Brand, catalog and policy grounding", tokens: "2,320 tokens" },
  { name: "RAG Integration Prompt", description: "Retrieval formatting and citation rules", tokens: "1,120 tokens" },
  { name: "Escalation Protocols", description: "When and how to transfer to a human", tokens: "780 tokens" },
];

/* ---------- Knowledge Base ---------- */

export const kbDocuments = [
  { title: "Dayjoy Product Catalog 2026", category: "Products", chunks: 420, status: "Ready" as const },
  { title: "Distributor Policy Handbook", category: "Policy", chunks: 260, status: "Ready" as const },
  { title: "Returns & Refunds SOP", category: "Support", chunks: 180, status: "Ready" as const },
  { title: "Voice Agent Playbook", category: "AI", chunks: 145, status: "Processing" as const },
  { title: "Ingredient Compliance Sheet", category: "Compliance", chunks: 310, status: "Ready" as const },
  { title: "Regional Pricing Matrix", category: "Sales", chunks: 205, status: "Processing" as const },
];

export const kbCategories = [
  { name: "Products", count: 42, tone: "brand" as const },
  { name: "Policy", count: 28, tone: "info" as const },
  { name: "Support", count: 31, tone: "success" as const },
  { name: "AI", count: 22, tone: "violet" as const },
  { name: "Compliance", count: 19, tone: "warning" as const },
  { name: "Sales", count: 18, tone: "teal" as const },
];

/* ---------- CRM ---------- */

export const crmCustomers = [
  { name: "Rahul Sharma", type: "Retail", ltv: "₹1,42,000", status: "Active" as const },
  { name: "Meera Iyer", type: "Distributor", ltv: "₹8,60,000", status: "Active" as const },
  { name: "Aditya Verma", type: "Retail", ltv: "₹36,500", status: "Dormant" as const },
  { name: "Sneha Kapoor", type: "Wholesale", ltv: "₹2,95,000", status: "Active" as const },
  { name: "Imran Qureshi", type: "Retail", ltv: "₹58,200", status: "Churn risk" as const },
];

export const distributors = [
  { name: "Sunrise Wellness", code: "DJ-1042", team: 48, tier: "Platinum" as const, sales: "₹24,80,000" },
  { name: "Nova Distributors", code: "DJ-2231", team: 32, tier: "Gold" as const, sales: "₹16,20,000" },
  { name: "Anand Traders", code: "DJ-3390", team: 21, tier: "Gold" as const, sales: "₹12,70,000" },
  { name: "Prime Health Co", code: "DJ-4417", team: 14, tier: "Silver" as const, sales: "₹7,40,000" },
];

export const leads = [
  { name: "Kavya Nair", source: "WhatsApp", score: 88, status: "Hot" as const, owner: "Kunal" },
  { name: "Rohit Desai", source: "Website", score: 72, status: "Warm" as const, owner: "Ananya" },
  { name: "Farhan Ali", source: "Voice", score: 64, status: "Warm" as const, owner: "Kunal" },
  { name: "Divya Menon", source: "Referral", score: 41, status: "Cold" as const, owner: "Rhea" },
  { name: "Sameer Joshi", source: "WhatsApp", score: 91, status: "Hot" as const, owner: "Ananya" },
];

/* ---------- Analytics ---------- */

export const monthlyRevenue = [
  { month: "Mar", revenue: 240000 },
  { month: "Apr", revenue: 285000 },
  { month: "May", revenue: 262000 },
  { month: "Jun", revenue: 331000 },
  { month: "Jul", revenue: 358000 },
  { month: "Aug", revenue: 374000 },
];

export const channelVolume = [
  { month: "Mar", calls: 320, messages: 620 },
  { month: "Apr", calls: 365, messages: 720 },
  { month: "May", calls: 340, messages: 690 },
  { month: "Jun", calls: 410, messages: 810 },
  { month: "Jul", calls: 452, messages: 880 },
  { month: "Aug", calls: 503, messages: 960 },
];

export const toolTrends = [
  { month: "Mar", knowledge: 1400, products: 900, crm: 620 },
  { month: "Apr", knowledge: 1620, products: 1010, crm: 700 },
  { month: "May", knowledge: 1580, products: 1120, crm: 760 },
  { month: "Jun", knowledge: 1860, products: 1280, crm: 880 },
  { month: "Jul", knowledge: 2040, products: 1390, crm: 940 },
  { month: "Aug", knowledge: 2280, products: 1510, crm: 1020 },
];

export const aiPerformanceMetrics = [
  { label: "Response Accuracy", value: 92, target: 90, suffix: "%", tone: "brand" as const },
  { label: "Tool Selection", value: 88, target: 85, suffix: "%", tone: "info" as const },
  { label: "RAG Precision", value: 86, target: 80, suffix: "%", tone: "violet" as const },
  { label: "CSAT", value: 4.5, target: 4, suffix: "/5", tone: "success" as const },
];

/* ---------- Voice AI ---------- */

export const recentCalls = [
  {
    customer: "Rahul Sharma",
    phone: "+91 98200 41122",
    direction: "inbound" as const,
    duration: "03:12",
    outcome: "Resolved",
    status: "completed" as const,
  },
  {
    customer: "Meera Iyer",
    phone: "+91 99870 55210",
    direction: "outbound" as const,
    duration: "05:44",
    outcome: "Order placed",
    status: "completed" as const,
  },
  {
    customer: "Imran Qureshi",
    phone: "+91 91450 77390",
    direction: "inbound" as const,
    duration: "01:08",
    outcome: "Human transfer",
    status: "transferred" as const,
  },
  {
    customer: "Divya Menon",
    phone: "+91 90040 22118",
    direction: "inbound" as const,
    duration: "00:22",
    outcome: "No response",
    status: "abandoned" as const,
  },
  {
    customer: "Sameer Joshi",
    phone: "+91 98330 11908",
    direction: "outbound" as const,
    duration: "04:31",
    outcome: "Appointment booked",
    status: "completed" as const,
  },
];

/* ---------- Automation ---------- */

export const workflows = [
  { name: "Lead Capture & Assignment", category: "CRM", trigger: "lead.created", runs: 1240, rate: 98, active: true },
  { name: "Welcome Email", category: "Email", trigger: "customer.created", runs: 980, rate: 100, active: true },
  { name: "Order Confirmation", category: "Orders", trigger: "order.paid", runs: 860, rate: 99, active: true },
  { name: "Shipping Notification", category: "Orders", trigger: "order.shipped", runs: 742, rate: 99, active: true },
  {
    name: "Appointment Reminder",
    category: "Calendar",
    trigger: "appointment.upcoming",
    runs: 410,
    rate: 100,
    active: true,
  },
  { name: "Ticket Auto-Close", category: "Support", trigger: "ticket.idle", runs: 268, rate: 95, active: false },
  { name: "Memory Cleanup", category: "AI", trigger: "cron.daily", runs: 305, rate: 100, active: true },
  { name: "Conversation Summarization", category: "AI", trigger: "conversation.ended", runs: 206, rate: 97, active: true },
];

/* ---------- System ---------- */

export const systemResources = [
  { label: "CPU", value: 34, tone: "success" as const },
  { label: "Memory", value: 26, tone: "info" as const },
  { label: "Disk", value: 42, tone: "brand" as const },
  { label: "Network", value: 13, tone: "violet" as const },
];

export const securityToggles = [
  "JWT Auth",
  "Rate Limiting",
  "CORS",
  "CSRF",
  "XSS Sanitization",
  "Audit Logging",
  "PII Redaction",
  "Webhook HMAC",
];
