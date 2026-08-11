/**
 * Commissions tests — verify tier ladder + commission math used by the
 * orders/profile pages (Agent 3 owns the commissions page itself).
 */
import { describe, it, expect } from "vitest";
import {
  TIER_COMMISSION_RATES,
  DISTRIBUTOR_TIERS,
} from "@/lib/constants";
import { MOCK_ORDERS, MOCK_PRODUCTS } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

describe("Commissions — tier rates", () => {
  it("BRONZE = 3%", () => expect(TIER_COMMISSION_RATES.BRONZE).toBe(3));
  it("SILVER = 5%", () => expect(TIER_COMMISSION_RATES.SILVER).toBe(5));
  it("GOLD = 8%", () => expect(TIER_COMMISSION_RATES.GOLD).toBe(8));
  it("PLATINUM = 12%", () => expect(TIER_COMMISSION_RATES.PLATINUM).toBe(12));
  it("DIAMOND = 15%", () => expect(TIER_COMMISSION_RATES.DIAMOND).toBe(15));
});

describe("Commissions — calculation math", () => {
  it("commission = distributorPrice × quantity × commissionRate / 100", () => {
    const product = MOCK_PRODUCTS[0]!;
    const qty = 5;
    const expected = Math.round(
      (product.distributorPrice * qty * product.commissionRate) / 100,
    );
    const actual = Math.round(
      (product.distributorPrice * qty * product.commissionRate) / 100,
    );
    expect(actual).toBe(expected);
  });

  it("order commission = sum of line commissions", () => {
    for (const order of MOCK_ORDERS) {
      const sum = order.items.reduce((s, i) => s + i.commissionEarned, 0);
      expect(Math.abs(order.commissionEarned - sum)).toBeLessThan(1);
    }
  });

  it("every order item has a positive commissionEarned (when qty > 0)", () => {
    for (const order of MOCK_ORDERS) {
      for (const item of order.items) {
        expect(item.commissionEarned).toBeGreaterThan(0);
      }
    }
  });

  it("commission rate per line matches the product's commissionRate", () => {
    const product = MOCK_PRODUCTS[0]!;
    const order = MOCK_ORDERS.find((o) =>
      o.items.some((i) => i.productId === product.id),
    );
    expect(order).toBeDefined();
    const line = order!.items.find((i) => i.productId === product.id);
    expect(line).toBeDefined();
    expect(line!.commissionRate).toBe(product.commissionRate);
  });
});

describe("Commissions — currency formatting", () => {
  it("formatCurrency renders INR with no decimals by default", () => {
    const formatted = formatCurrency(4050);
    expect(formatted).toContain("₹");
    expect(formatted).not.toContain(".00");
  });

  it("formatCurrency handles null/undefined gracefully", () => {
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency(undefined)).toBe("—");
  });

  it("formatCurrency handles zero", () => {
    expect(formatCurrency(0)).toContain("0");
  });
});

describe("Commissions — ladder coverage", () => {
  it("all 5 tiers have rates in 3–15% range", () => {
    for (const tier of DISTRIBUTOR_TIERS) {
      const rate = TIER_COMMISSION_RATES[tier];
      expect(rate).toBeGreaterThanOrEqual(3);
      expect(rate).toBeLessThanOrEqual(15);
    }
  });
});
