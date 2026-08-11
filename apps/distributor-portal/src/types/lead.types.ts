/**
 * Lead domain types — consumed by `GET /api/leads?assignedTo=…`.
 */

export type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "QUALIFIED"
  | "PROPOSAL"
  | "NEGOTIATION"
  | "WON"
  | "LOST";

export type LeadSource =
  | "VOICE"
  | "WHATSAPP"
  | "WEB"
  | "REFERRAL"
  | "SOCIAL"
  | "EVENT"
  | "OTHER";

export type LeadPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface Lead {
  id: string;
  leadNumber?: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  status: LeadStatus;
  source: LeadSource;
  priority: LeadPriority;
  estimatedValue?: number;
  assignedTo?: string;
  assignedToName?: string;
  distributorId?: string;
  notes?: string;
  tags?: string[];
  lastContactedAt?: string | null;
  expectedCloseDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadActivity {
  id: string;
  leadId: string;
  type: "CALL" | "EMAIL" | "MEETING" | "NOTE" | "STATUS_CHANGE";
  description: string;
  performedBy?: string;
  createdAt: string;
}

export interface LeadSummary {
  total: number;
  byStatus: Array<{ status: LeadStatus; count: number }>;
  bySource: Array<{ source: LeadSource; count: number }>;
  byPriority: Array<{ priority: LeadPriority; count: number }>;
  conversionRate: number;
  totalEstimatedValue: number;
}
