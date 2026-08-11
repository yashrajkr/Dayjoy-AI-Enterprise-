/**
 * Distributor domain types.
 *
 * Mirrors `backend/distributors/dto/create-distributor.dto.ts` and the
 * Prisma `Distributor` model. Tiers follow `DistributorTierEnum`.
 */

export type DistributorTier = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
export type DistributorStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "DELETED";

export interface DistributorAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface Distributor {
  id: string;
  distributorCode: string;
  companyName: string;
  contactPerson?: string;
  email: string;
  phone?: string;
  commissionRate?: number;
  tier?: DistributorTier;
  status: DistributorStatus;
  address?: DistributorAddress;
  /** The sponsor/distributor who referred this distributor. */
  sponsorId?: string | null;
  sponsorCode?: string | null;
  parentDistributorId?: string | null;
  /** Optional metadata envelope persisted on the backend. */
  metadata?: Record<string, unknown>;
  /** Total lifetime revenue (computed by the service). */
  totalRevenue?: number;
  /** Total lifetime commission earned (computed by the service). */
  totalCommission?: number;
  joinedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DistributorWithStats extends Distributor {
  ordersCount?: number;
  customersCount?: number;
  teamSize?: number;
  monthlySales?: number;
  monthlyCommission?: number;
  activeLeads?: number;
}

/** Performance metrics returned by `GET /api/distributors/:id/performance`. */
export interface DistributorPerformance {
  distributorId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  sales: {
    total: number;
    count: number;
    avgOrderValue: number;
    byMonth: Array<{ month: string; total: number; count: number }>;
    byCategory: Array<{ category: string; total: number; count: number }>;
    byChannel: Array<{ channel: string; total: number; count: number }>;
    byDayOfWeek: Array<{ day: string; total: number; count: number }>;
    topProducts: Array<{
      productId: string;
      productName: string;
      quantity: number;
      revenue: number;
    }>;
    topCustomers: Array<{
      customerId: string;
      customerName: string;
      orderCount: number;
      totalSpent: number;
    }>;
  };
  team: {
    totalMembers: number;
    activeMembers: number;
    byTier: Array<{ tier: DistributorTier; count: number }>;
    byLevel: Array<{ level: number; count: number }>;
    growth: Array<{ month: string; added: number; total: number }>;
  };
  commissions: {
    total: number;
    pending: number;
    paid: number;
    byMonth: Array<{ month: string; total: number; pending: number; paid: number }>;
    byType: Array<{ type: string; total: number }>;
  };
  customers: {
    total: number;
    new: number;
    returning: number;
    conversionRate: number;
  };
}

export interface Tier {
  name: DistributorTier;
  label: string;
  minSales: number;
  commissionRate: number;
  benefits: string[];
}

export interface DistributorCommission {
  id: string;
  distributorId: string;
  orderId: string;
  orderNumber?: string;
  customerId?: string;
  customerName?: string;
  /** Gross order amount. */
  orderAmount: number;
  /** Commission percentage applied. */
  commissionRate: number;
  /** Final commission amount. */
  commissionAmount: number;
  status: "PENDING" | "PAID" | "CANCELLED";
  /** Commission type — personal sale, team override, bonus. */
  type?: "PERSONAL" | "TEAM" | "BONUS";
  /** Level in the downline (0 = personal sale, 1+ = team override). */
  level?: number;
  payoutDate?: string | null;
  payoutReference?: string | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionSummary {
  distributorId: string;
  totalEarned: number;
  totalPending: number;
  totalPaid: number;
  thisMonth: number;
  lastMonth: number;
  personalCommission: number;
  teamCommission: number;
  bonuses: number;
  nextPayoutDate?: string;
  nextPayoutEstimated?: number;
  recentCommissions: DistributorCommission[];
  payoutHistory: Array<{
    id: string;
    date: string;
    amount: number;
    reference?: string;
    status: string;
  }>;
}

export interface UpdateDistributorPayload {
  contactPerson?: string;
  phone?: string;
  commissionRate?: number;
  tier?: DistributorTier;
  address?: Partial<DistributorAddress>;
}
