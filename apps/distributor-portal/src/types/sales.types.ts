/**
 * Sales domain types — consumed by `GET /api/analytics/sales` and
 * `GET /api/orders?distributorId=…`.
 */

export type SalesChannel = "VOICE" | "WHATSAPP" | "WEB" | "MOBILE" | "STORE" | "REFERRED";

export interface SalesMetrics {
  totalSales: number;
  totalOrders: number;
  avgOrderValue: number;
  uniqueCustomers: number;
  returnedOrders: number;
  cancelledOrders: number;
  conversionRate: number;
  growthPercentage: number;
}

export interface SalesDataPoint {
  date: string;
  label: string; // formatted display label
  total: number;
  count: number;
}

export interface SalesByCategory {
  category: string;
  total: number;
  count: number;
  percentage: number;
}

export interface SalesByChannel {
  channel: SalesChannel;
  total: number;
  count: number;
  percentage: number;
}

export interface SalesByDayOfWeek {
  day: string;
  total: number;
  count: number;
}

export interface TopProduct {
  productId: string;
  productName: string;
  sku?: string;
  category?: string;
  quantity: number;
  revenue: number;
  growthPercentage?: number;
}

export interface TopCustomer {
  customerId: string;
  customerName: string;
  email?: string;
  orderCount: number;
  totalSpent: number;
  avgOrderValue: number;
  lastOrderDate?: string;
}

export interface SalesDashboardData {
  period: {
    startDate: string;
    endDate: string;
  };
  metrics: SalesMetrics;
  trend: SalesDataPoint[];
  byCategory: SalesByCategory[];
  byChannel: SalesByChannel[];
  byDayOfWeek: SalesByDayOfWeek[];
  topProducts: TopProduct[];
  topCustomers: TopCustomer[];
}

export interface SalesFilters {
  distributorId?: string;
  startDate?: string;
  endDate?: string;
  channel?: SalesChannel;
  category?: string;
}
