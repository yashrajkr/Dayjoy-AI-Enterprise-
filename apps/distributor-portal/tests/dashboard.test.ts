/**
 * Dashboard tests — verify the dashboard navigation + sidebar structure.
 *
 * Agent 3 owns the actual dashboard page. These tests verify the shared
 * navigation structure (sidebar sections) and the root redirect behavior
 * that the dashboard depends on.
 */
import { describe, it, expect } from "vitest";
import { NAV_SECTIONS, APP_NAME, DISTRIBUTOR_TIERS, TIER_COMMISSION_RATES } from "@/lib/constants";

describe("Dashboard — navigation structure", () => {
  it("NAV_SECTIONS has 5 top-level sections", () => {
    expect(NAV_SECTIONS).toHaveLength(5);
    const sectionNames = NAV_SECTIONS.map((s) => s.section);
    expect(sectionNames).toEqual([
      "Overview",
      "Business",
      "Growth",
      "Resources",
      "Account",
    ]);
  });

  it("Dashboard appears in the Overview section", () => {
    const overview = NAV_SECTIONS.find((s) => s.section === "Overview");
    expect(overview).toBeDefined();
    const dashItem = overview!.items.find((i) => i.href === "/dashboard");
    expect(dashItem).toBeDefined();
    expect(dashItem!.label).toBe("Dashboard");
  });

  it("AI Assistant appears in the Overview section", () => {
    const overview = NAV_SECTIONS.find((s) => s.section === "Overview");
    const aiItem = overview!.items.find((i) => i.href === "/ai-assistant");
    expect(aiItem).toBeDefined();
    expect(aiItem!.label).toBe("AI Assistant");
  });

  it("all nav items have non-empty href, label, and icon", () => {
    for (const section of NAV_SECTIONS) {
      for (const item of section.items) {
        expect(item.href).toBeTruthy();
        expect(item.href.startsWith("/")).toBe(true);
        expect(item.label).toBeTruthy();
        expect(item.icon).toBeTruthy();
      }
    }
  });

  it("no duplicate nav hrefs", () => {
    const hrefs = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    const unique = new Set(hrefs);
    expect(unique.size).toBe(hrefs.length);
  });
});

describe("Dashboard — app metadata", () => {
  it("APP_NAME is a non-empty string", () => {
    expect(typeof APP_NAME).toBe("string");
    expect(APP_NAME.length).toBeGreaterThan(0);
    expect(APP_NAME).toContain("Dayjoy");
  });
});

describe("Dashboard — tier ladder", () => {
  it("DISTRIBUTOR_TIERS contains 5 tiers in ascending order", () => {
    expect(DISTRIBUTOR_TIERS).toEqual([
      "BRONZE",
      "SILVER",
      "GOLD",
      "PLATINUM",
      "DIAMOND",
    ]);
  });

  it("TIER_COMMISSION_RATES increases with tier", () => {
    const rates = DISTRIBUTOR_TIERS.map((t) => TIER_COMMISSION_RATES[t]);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThan(rates[i - 1]!);
    }
  });

  it("BRONZE rate is 3% and DIAMOND rate is 15%", () => {
    expect(TIER_COMMISSION_RATES.BRONZE).toBe(3);
    expect(TIER_COMMISSION_RATES.DIAMOND).toBe(15);
  });
});
