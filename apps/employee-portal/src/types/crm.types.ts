/**
 * CRM types — Customer, Distributor, Lead. Employee Portal.
 */

export type CustomerType = "INDIVIDUAL" | "DISTRIBUTOR" | "RESELLER" | "WHOLESALE";
export type CustomerStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "BLACKLISTED";

export interface CustomerOrder {
  id: string;
  number: string;
  total: number;
  currency?: string;
  status: string;
  createdAt: string;
  items?: { id: string; name: string; qty: number; price: number }[];
}

export interface CustomerInteraction {
  id: string;
  type: "CALL" | "EMAIL" | "CHAT" | "WHATSAPP" | "MEETING" | "NOTE";
  summary: string;
  channel?: string;
  createdAt: string;
  handledBy?: string;
}

export interface CustomerNote {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  altPhone?: string;
  type: CustomerType;
  status: CustomerStatus;
  city?: string;
  state?: string;
  country?: string;
  address?: string;
  gstin?: string;
  lifetimeValue?: number;
  currency?: string;
  totalOrders?: number;
  lastOrderAt?: string | null;
  tags?: string[];
  assignedToId?: string | null;
  assignedToName?: string | null;
  createdAt: string;
  updatedAt?: string;

  orders?: CustomerOrder[];
  interactions?: CustomerInteraction[];
  notes?: CustomerNote[];
  ticketIds?: string[];
}

export interface CustomerFilters {
  search?: string;
  type?: CustomerType | "ALL";
  status?: CustomerStatus | "ALL";
}

// ===== Distributor =====

export type DistributorTier = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" | "DIAMOND";
export type DistributorStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING";

export interface DistributorSalesPoint {
  id: string;
  name: string;
  city?: string;
  status: string;
}

export interface DistributorTeamMember {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  tier?: DistributorTier;
  joinedAt?: string;
}

export interface DistributorPerformance {
  month: string; // e.g. "2026-07"
  revenue: number;
  ordersCount: number;
  newCustomers: number;
}

export interface Distributor {
  id: string;
  code: string;
  companyName: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  altPhone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  gstin?: string;
  tier: DistributorTier;
  status: DistributorStatus;
  commissionRate?: number;
  joinedAt?: string;
  parentDistributorId?: string | null;
  parentDistributorName?: string | null;
  lifetimeValue?: number;
  currency?: string;
  totalOrders?: number;
  totalDownline?: number;
  salesPoints?: DistributorSalesPoint[];
  team?: DistributorTeamMember[];
  performance?: DistributorPerformance[];
  assignedToId?: string | null;
  assignedToName?: string | null;
  notes?: CustomerNote[];
  createdAt: string;
  updatedAt?: string;
}

export interface DistributorFilters {
  search?: string;
  tier?: DistributorTier | "ALL";
  status?: DistributorStatus | "ALL";
}

// ===== Lead =====

export type LeadSource =
  | "WEBSITE"
  | "WHATSAPP"
  | "VOICE_CALL"
  | "REFERRAL"
  | "SOCIAL_MEDIA"
  | "EMAIL_CAMPAIGN"
  | "EVENT"
  | "WALK_IN"
  | "OTHER";

export type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "QUALIFIED"
  | "PROPOSAL"
  | "NEGOTIATION"
  | "WON"
  | "LOST";

export interface LeadActivity {
  id: string;
  type: "NOTE" | "CALL" | "EMAIL" | "MEETING" | "STATUS_CHANGE" | "ASSIGNMENT";
  description: string;
  actorId?: string;
  actorName?: string;
  createdAt: string;
}

export interface Lead {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  source: LeadSource;
  status: LeadStatus;
  score?: number; // 0-100
  budget?: number;
  currency?: string;
  notes?: string;
  interestedIn?: string;
  assignedToId?: string | null;
  assignedToName?: string | null;
  customerId?: string | null; // set after conversion
  convertedAt?: string | null;
  expectedCloseDate?: string | null;
  activity?: LeadActivity[];
  createdAt: string;
  updatedAt?: string;
  lastContactedAt?: string | null;
}

export interface LeadFilters {
  search?: string;
  source?: LeadSource | "ALL";
  status?: LeadStatus | "ALL";
  assigneeId?: string | "ME" | "ALL";
}

export interface CreateLeadInput {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  source: LeadSource;
  status?: LeadStatus;
  budget?: number;
  interestedIn?: string;
  notes?: string;
  assignedToId?: string;
}

export interface UpdateLeadInput {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  status?: LeadStatus;
  score?: number;
  budget?: number;
  interestedIn?: string;
  notes?: string;
  assignedToId?: string;
}
