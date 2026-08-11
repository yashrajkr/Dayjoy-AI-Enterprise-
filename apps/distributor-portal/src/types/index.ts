/**
 * Shared types for the Dayjoy Distributor Portal.
 */

export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ===== Lead =====
export type LeadStage =
  | "NEW"
  | "CONTACTED"
  | "QUALIFIED"
  | "CONVERTED"
  | "LOST";

export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  interest: string | null;
  source: string;
  stage: LeadStage;
  score: number; // 0–100
  notes: LeadNote[];
  activities: LeadActivity[];
  assignedAt: string;
  lastContactedAt: string | null;
  convertedCustomerId: string | null;
}

export interface LeadNote {
  id: string;
  body: string;
  author: string;
  createdAt: string;
}

export interface LeadActivity {
  id: string;
  type: "NOTE" | "CALL" | "EMAIL" | "WHATSAPP" | "MEETING" | "STATUS_CHANGE";
  title: string;
  description?: string;
  createdAt: string;
}

// ===== Customer =====
export type CustomerType = "INDIVIDUAL" | "RETAILER" | "WHOLESALE";
export type CustomerStatus = "ACTIVE" | "INACTIVE";

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  company: string | null;
  type: CustomerType;
  status: CustomerStatus;
  ltv: number; // lifetime value (INR)
  totalOrders: number;
  lastOrderAt: string | null;
  notes: CustomerNote[];
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  createdAt: string;
}

export interface CustomerNote {
  id: string;
  body: string;
  author: string;
  createdAt: string;
}

// ===== Product =====
export interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string;
  category: string;
  description: string;
  longDescription: string;
  images: string[];
  mrp: number; // retail price
  distributorPrice: number; // what the distributor pays
  commissionRate: number; // percent
  stock: number;
  rating: number;
  reviewCount: number;
  features: string[];
  trainingModuleIds: string[];
}

// ===== Order =====
export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "RETURNED"
  | "REFUNDED";

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  productImage: string | null;
  quantity: number;
  unitPrice: number;
  commissionRate: number;
  lineTotal: number;
  commissionEarned: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  commissionEarned: number;
  status: OrderStatus;
  shippingAddress: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  invoiceUrl: string | null;
  timeline: OrderTimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderTimelineEntry {
  id: string;
  status: OrderStatus | "CREATED";
  label: string;
  description?: string;
  timestamp: string;
}

// ===== AI Assistant =====
export interface AiMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations?: AiCitation[];
  toolCalls?: AiToolCall[];
  createdAt: string;
}

export interface AiCitation {
  source: string;
  title: string;
  url?: string;
}

export interface AiToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: string;
}

export interface AiConversation {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  lastMessageAt: string;
  channel: "WEB" | "VOICE" | "WHATSAPP";
}

// ===== Training =====
export interface TrainingModule {
  id: string;
  title: string;
  slug: string;
  category: string;
  description: string;
  thumbnail: string;
  duration: number; // seconds
  type: "VIDEO" | "DOCUMENT" | "INTERACTIVE";
  videoUrl?: string;
  documentUrl?: string;
  outline: string[];
  progress: number; // 0–100
  completed: boolean;
  locked: boolean;
  quiz?: TrainingQuiz;
  order: number;
}

export interface TrainingQuiz {
  questions: TrainingQuestion[];
  passingScore: number;
}

export interface TrainingQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
}

// ===== Knowledge =====
export interface KnowledgeArticle {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  content: string; // markdown
  author: string;
  updatedAt: string;
  readTime: number; // minutes
  views: number;
  helpful: number;
  notHelpful: number;
  tags: string[];
  relatedIds: string[];
}

// ===== Announcement =====
export interface Announcement {
  id: string;
  title: string;
  category: string;
  summary: string;
  body: string;
  author: string;
  publishedAt: string;
  pinned: boolean;
  read: boolean;
}

// ===== Event =====
export interface EventItem {
  id: string;
  title: string;
  type: "WEBINAR" | "TRAINING" | "MEETING" | "LAUNCH";
  description: string;
  startAt: string;
  endAt: string;
  location: string;
  meetingLink?: string;
  capacity: number;
  registered: number;
  rsvped: boolean;
  past: boolean;
  recordingUrl?: string;
}

// ===== Notification =====
export type NotificationType =
  | "COMMISSION"
  | "TEAM"
  | "ORDER"
  | "ANNOUNCEMENT"
  | "SYSTEM";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  link?: string;
  createdAt: string;
}

// ===== Document =====
export interface DocumentItem {
  id: string;
  name: string;
  category: string;
  type: "PDF" | "XLSX" | "DOCX" | "IMAGE" | "ZIP";
  size: number; // bytes
  url: string;
  uploadedAt: string;
  uploadedBy: string;
}

// ===== Distributor Profile =====
export interface DistributorProfile {
  id: string;
  distributorCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  avatarUrl: string | null;
  dateOfBirth: string | null;
  tier: string;
  joinDate: string;
  sponsorName: string;
  businessName: string | null;
  taxId: string | null;
  panNumber: string | null;
  gstNumber: string | null;
  bankAccount: {
    accountHolder: string;
    accountNumber: string;
    ifsc: string;
    bankName: string;
    branch: string;
  } | null;
  address: {
    line1: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  } | null;
  documents: ProfileDocument[];
}

export interface ProfileDocument {
  id: string;
  type: "ID_PROOF" | "ADDRESS_PROOF" | "BANK_PROOF" | "PHOTO";
  name: string;
  uploadedAt: string;
  verified: boolean;
}

// ===== Settings =====
export interface UserSettings {
  theme: "light" | "dark" | "brand";
  language: string;
  dateFormat: string;
  timezone: string;
  notifications: {
    channels: {
      email: boolean;
      sms: boolean;
      whatsapp: boolean;
      push: boolean;
    };
    categories: {
      commission: boolean;
      team: boolean;
      order: boolean;
      announcement: boolean;
      system: boolean;
    };
  };
  privacy: {
    profileVisible: boolean;
    contactInfoVisible: boolean;
  };
}
