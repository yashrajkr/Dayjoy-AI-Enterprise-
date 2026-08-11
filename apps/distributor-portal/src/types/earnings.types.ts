import type { DistributorTier } from "./distributor.types";

/**
 * Earnings domain types — derived from
 * `GET /api/distributors/:id/commissions` and aggregated client-side.
 */

export type CommissionType = "PERSONAL" | "TEAM" | "BONUS";
export type PayoutStatus = "PENDING" | "PAID" | "CANCELLED";

export interface EarningsMetrics {
  totalEarnings: number;
  personalSalesCommission: number;
  teamCommission: number;
  bonuses: number;
  pendingPayout: number;
  thisMonth: number;
  lastMonth: number;
  growthPercentage: number;
  ytdEarnings: number;
}

export interface CommissionDataPoint {
  month: string;
  label: string;
  total: number;
  personal: number;
  team: number;
  bonus: number;
}

export interface EarningsByTier {
  tier: DistributorTier;
  total: number;
  count: number;
}

export interface PayoutRecord {
  id: string;
  date: string;
  amount: number;
  status: PayoutStatus;
  reference?: string;
  method?: string;
  period?: string;
  taxDeducted?: number;
  netAmount?: number;
}

export interface EarningsBreakdownItem {
  type: CommissionType;
  label: string;
  amount: number;
  percentage: number;
  color: string;
}

export interface EarningsDashboardData {
  period: {
    startDate: string;
    endDate: string;
  };
  metrics: EarningsMetrics;
  trend: CommissionDataPoint[];
  breakdown: EarningsBreakdownItem[];
  byTier: EarningsByTier[];
  payoutHistory: PayoutRecord[];
  nextPayout: {
    date: string;
    estimatedAmount: number;
    daysUntilPayout: number;
  };
  taxDocuments: Array<{
    id: string;
    year: number;
    type: string;
    documentUrl?: string;
    status: "AVAILABLE" | "PENDING" | "PROCESSING";
  }>;
}

export interface CommissionDetail {
  id: string;
  distributorId: string;
  distributorName?: string;
  orderId: string;
  orderNumber: string;
  orderAmount: number;
  commissionRate: number;
  commissionAmount: number;
  status: PayoutStatus;
  type: CommissionType;
  level?: number;
  customer: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
  payout?: {
    id: string;
    date: string;
    reference?: string;
    method?: string;
    netAmount?: number;
  } | null;
  order: {
    id: string;
    orderNumber: string;
    date: string;
    status: string;
    items: Array<{
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
    subtotal: number;
    tax: number;
    shipping: number;
    total: number;
  };
  createdAt: string;
  updatedAt: string;
}
