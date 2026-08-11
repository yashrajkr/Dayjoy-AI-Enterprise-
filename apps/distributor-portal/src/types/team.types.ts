import type { DistributorTier } from "./distributor.types";

/**
 * Team / downline tree types.
 *
 * The backend exposes downline members via `GET /api/distributors/:id/performance`
 * (team block) and via the generic `GET /api/distributors?sponsorId=…` filter.
 * The portal composes the recursive tree client-side for visualisation.
 */

export type TeamMemberStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export interface DownlineMember {
  id: string;
  distributorId: string;
  distributorCode: string;
  name: string;
  email: string;
  phone?: string;
  tier: DistributorTier;
  level: number; // 0 = self, 1 = direct recruit, 2 = grand-recruit, ...
  status: TeamMemberStatus;
  sponsorId?: string | null;
  sponsorName?: string | null;
  joinedAt: string;
  /** This member's personal sales for the current month. */
  monthlySales: number;
  /** This member's personal commission for the current month. */
  monthlyCommission: number;
  /** Direct children count (used for the "N recruits" badge). */
  directCount: number;
  /** Total team size under this member (recursive). */
  teamSize: number;
  avatarUrl?: string;
}

export interface TeamTreeNode extends DownlineMember {
  children: TeamTreeNode[];
  /** Collapsed state — used by the tree UI. */
  collapsed?: boolean;
}

export interface TeamStructure {
  root: DownlineMember;
  members: DownlineMember[];
  totalMembers: number;
  activeMembers: number;
  byTier: Array<{ tier: DistributorTier; count: number; percentage: number }>;
  byLevel: Array<{ level: number; count: number; percentage: number }>;
  byStatus: Array<{ status: TeamMemberStatus; count: number }>;
  monthlyTeamSales: number;
  monthlyTeamCommission: number;
}

export interface TeamMemberDetail extends DownlineMember {
  address?: {
    city?: string;
    state?: string;
    country?: string;
  };
  totalRevenue: number;
  totalCommission: number;
  ordersCount: number;
  customersCount: number;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    amount: number;
    status: string;
    date: string;
  }>;
  downline: DownlineMember[];
  commissionEarnedFromThisMember: number;
}
