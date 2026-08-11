/**
 * Orders tests — verify order constants + service shape + commission math.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
} from "@/lib/constants";
import { ordersService } from "@/lib/services";
import { MOCK_ORDERS, MOCK_PRODUCTS, MOCK_CUSTOMERS } from "@/lib/mock-data";

describe("Orders — statuses", () => {
  it("ORDER_STATUSES has 8 statuses", () => {
    expect(ORDER_STATUSES).toHaveLength(8);
  });

  it("ORDER_STATUSES contains the canonical flow", () => {
    expect(ORDER_STATUSES).toContain("PENDING");
    expect(ORDER_STATUSES).toContain("CONFIRMED");
    expect(ORDER_STATUSES).toContain("PROCESSING");
    expect(ORDER_STATUSES).toContain("SHIPPED");
    expect(ORDER_STATUSES).toContain("DELIVERED");
    expect(ORDER_STATUSES).toContain("CANCELLED");
  });

  it("every status has a label", () => {
    for (const s of ORDER_STATUSES) {
      expect(ORDER_STATUS_LABELS[s]).toBeTruthy();
    }
  });
});

describe("Orders — service (mock fallback)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns all orders when no filters", async () => {
    const result = await ordersService.list();
    expect(result).toHaveLength(MOCK_ORDERS.length);
  });

  it("filters by status", async () => {
    const shipped = await ordersService.list({ status: "SHIPPED" });
    expect(shipped.every((o) => o.status === "SHIPPED")).toBe(true);
  });

  it("search matches order number", async () => {
    const result = await ordersService.list({ search: "0142" });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.orderNumber).toContain("0142");
  });

  it("throws on unknown id", async () => {
    await expect(ordersService.get("nonexistent")).rejects.toThrow(
      "Order not found",
    );
  });

  it("returns existing order by id", async () => {
    const order = await ordersService.get("ord_001");
    expect(order.id).toBe("ord_001");
    expect(order.orderNumber).toContain("DJ-ORD");
  });

  it("creates a new order with computed totals", async () => {
    const customer = MOCK_CUSTOMERS[0]!;
    const product = MOCK_PRODUCTS[0]!;
    const order = await ordersService.create({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 2 }],
      shippingAddress: "Test address",
    });

    expect(order.customerId).toBe(customer.id);
    expect(order.items).toHaveLength(1);
    expect(order.items[0]!.quantity).toBe(2);
    expect(order.subtotal).toBe(product.distributorPrice * 2);
    expect(order.tax).toBe(Math.round(order.subtotal * 0.18));
    expect(order.total).toBe(order.subtotal + order.tax + order.shipping);
    expect(order.status).toBe("PENDING");
    expect(order.timeline[0]!.status).toBe("CREATED");
  });

  it("commission is correctly calculated from product rate", async () => {
    const customer = MOCK_CUSTOMERS[0]!;
    const product = MOCK_PRODUCTS[0]!;
    const order = await ordersService.create({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1 }],
      shippingAddress: "Test",
    });
    const expectedCommission = Math.round(
      (product.distributorPrice * product.commissionRate) / 100,
    );
    expect(order.commissionEarned).toBe(expectedCommission);
  });

  it("free shipping when subtotal > ₹5000", async () => {
    const customer = MOCK_CUSTOMERS[2]!; // wholesale customer
    const product = MOCK_PRODUCTS[0]!;
    const order = await ordersService.create({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 3 }], // 3 × 2400 = 7200
      shippingAddress: "Test",
    });
    expect(order.subtotal).toBeGreaterThan(5000);
    expect(order.shipping).toBe(0);
  });

  it("charges shipping when subtotal ≤ ₹5000", async () => {
    const customer = MOCK_CUSTOMERS[3]!;
    const product = MOCK_PRODUCTS.find((p) => p.distributorPrice < 2000)!;
    const order = await ordersService.create({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1 }],
      shippingAddress: "Test",
    });
    expect(order.subtotal).toBeLessThanOrEqual(5000);
    expect(order.shipping).toBe(149);
  });

  it("throws when customer does not exist", async () => {
    await expect(
      ordersService.create({
        customerId: "nonexistent",
        items: [{ productId: MOCK_PRODUCTS[0]!.id, quantity: 1 }],
        shippingAddress: "Test",
      }),
    ).rejects.toThrow("Customer not found");
  });

  it("throws when product does not exist", async () => {
    const customer = MOCK_CUSTOMERS[0]!;
    await expect(
      ordersService.create({
        customerId: customer.id,
        items: [{ productId: "nonexistent", quantity: 1 }],
        shippingAddress: "Test",
      }),
    ).rejects.toThrow("Product not found");
  });
});

describe("Orders — mock data integrity", () => {
  it("every order has items array with at least one item", () => {
    for (const order of MOCK_ORDERS) {
      expect(Array.isArray(order.items)).toBe(true);
      expect(order.items.length).toBeGreaterThan(0);
    }
  });

  it("every order's total = subtotal + tax + shipping", () => {
    for (const order of MOCK_ORDERS) {
      const computed = order.subtotal + order.tax + order.shipping;
      expect(Math.abs(order.total - computed)).toBeLessThan(1);
    }
  });

  it("every order's commission matches the sum of line commissions", () => {
    for (const order of MOCK_ORDERS) {
      const sum = order.items.reduce((s, i) => s + i.commissionEarned, 0);
      expect(Math.abs(order.commissionEarned - sum)).toBeLessThan(1);
    }
  });
});
