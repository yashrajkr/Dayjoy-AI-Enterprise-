/**
 * Order types — consumed by the order list, detail, tracking, invoice,
 * and return pages.
 */

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "returned"
  | "refunded"
  | "failed";

export type PaymentStatus =
  | "pending"
  | "paid"
  | "partially_paid"
  | "refunded"
  | "partially_refunded"
  | "failed"
  | "cancelled";

export type PaymentMethod =
  | "card"
  | "upi"
  | "netbanking"
  | "wallet"
  | "cod"
  | "emi";

export type FulfillmentMethod = "delivery" | "pickup";

export interface OrderItem {
  id: string;
  productId: string;
  productSlug?: string;
  name: string;
  sku: string;
  imageUrl?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  currency: string;
  /** Current status of this specific line (e.g. returned). */
  status?: OrderStatus;
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  total: number;
  currency: string;
}

export interface ShippingAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  /** Optional delivery instructions. */
  instructions?: string;
}

export interface PaymentInfo {
  method: PaymentMethod;
  status: PaymentStatus;
  /** Last 4 of card / UPI vpa / transaction ref. */
  reference?: string;
  paidAt?: string;
  transactionId?: string;
}

export interface OrderTrackingEvent {
  id: string;
  status: OrderStatus;
  label: string;
  description?: string;
  location?: string;
  timestamp: string;
  /** Whether this step is complete (vs. upcoming). */
  completed: boolean;
  /** Whether this is the current active step. */
  current?: boolean;
}

export interface OrderInvoice {
  id: string;
  number: string;
  url: string;
  issuedAt: string;
}

export interface Order {
  id: string;
  number: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  items: OrderItem[];
  totals: OrderTotals;
  currency: string;
  itemCount: number;
  fulfillment: FulfillmentMethod;
  shippingAddress?: ShippingAddress;
  billingAddress?: ShippingAddress;
  payment?: PaymentInfo;
  trackingNumber?: string;
  trackingUrl?: string;
  carrier?: string;
  /** Ordered/Placed timestamp. */
  placedAt: string;
  /** Estimated delivery window. */
  estimatedDeliveryAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  /** Tracking timeline (ordered → confirmed → shipped → delivered). */
  tracking?: OrderTrackingEvent[];
  invoice?: OrderInvoice;
  /** Whether the order is eligible for return. */
  isReturnable?: boolean;
  /** Whether the order is eligible for reorder. */
  isReorderable?: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ===== Order creation =====

export interface CreateOrderItemInput {
  productId: string;
  quantity: number;
}

export interface CreateOrderDto {
  items: CreateOrderItemInput[];
  shippingAddressId?: string;
  billingAddressId?: string;
  paymentMethod: PaymentMethod;
  fulfillment: FulfillmentMethod;
  notes?: string;
  /** Coupon / promo code. */
  couponCode?: string;
}

export interface CreateOrderResponse {
  order: Order;
  /** Payment gateway redirect URL or intent client secret, if needed. */
  paymentRedirectUrl?: string;
  paymentClientSecret?: string;
}

// ===== Returns =====

export type ReturnReason =
  | "damaged"
  | "defective"
  | "wrong_item"
  | "not_as_described"
  | "no_longer_needed"
  | "better_price_found"
  | "other";

export type ReturnStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "pickup_scheduled"
  | "picked_up"
  | "received"
  | "refunded"
  | "cancelled";

export interface ReturnRequestItem {
  orderItemId: string;
  quantity: number;
  reason: ReturnReason;
  comment?: string;
}

export interface CreateReturnDto {
  orderId: string;
  items: ReturnRequestItem[];
  pickupAddressId?: string;
  pickupNotes?: string;
}

export interface OrderReturn {
  id: string;
  number: string;
  orderId: string;
  orderNumber: string;
  status: ReturnStatus;
  items: Array<ReturnRequestItem & { name?: string; imageUrl?: string }>;
  pickupAddress?: ShippingAddress;
  requestedAt: string;
  resolvedAt?: string;
  refundAmount?: number;
  currency?: string;
}

// ===== Order filters =====

export interface OrderFilters {
  status?: OrderStatus[];
  search?: string;
  /** ISO date range. */
  fromDate?: string;
  toDate?: string;
}

export type OrderSortOption =
  | "date_desc"
  | "date_asc"
  | "total_desc"
  | "total_asc";
