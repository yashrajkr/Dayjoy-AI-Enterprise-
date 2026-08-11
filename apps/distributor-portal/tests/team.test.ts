/**
 * Team tests — verify team-related constants + service contracts.
 *
 * Agent 3 owns the team page + team service. These tests cover the
 * cross-cutting team concepts (NAV_SECTIONS includes /team, distributor
 * tier ladder affects team commissions) that my feature pages depend on.
 */
import { describe, it, expect } from "vitest";
import { NAV_SECTIONS, DISTRIBUTOR_TIERS, TIER_COMMISSION_RATES } from "@/lib/constants";

describe("Team — navigation", () => {
  it("/team is in the Growth section", () => {
    const growth = NAV_SECTIONS.find((s) => s.section === "Growth");
    expect(growth).toBeDefined();
    const teamItem = growth!.items.find((i) => i.href === "/team");
    expect(teamItem).toBeDefined();
    expect(teamItem!.label).toBe("My Team");
  });

  it("/team nav item uses the Network icon", () => {
    const growth = NAV_SECTIONS.find((s) => s.section === "Growth")!;
    const teamItem = growth.items.find((i) => i.href === "/team")!;
    expect(teamItem.icon).toBe("Network");
  });
});

describe("Team — tier ladder supports override commissions", () => {
  it("every tier has a commission rate defined", () => {
    for (const tier of DISTRIBUTOR_TIERS) {
      expect(TIER_COMMISSION_RATES[tier]).toBeDefined();
      expect(typeof TIER_COMMISSION_RATES[tier]).toBe("number");
      expect(TIER_COMMISSION_RATES[tier]).toBeGreaterThan(0);
    }
  });

  it("PLATINUM (12%) earns more override than GOLD (8%)", () => {
    expect(TIER_COMMISSION_RATES.PLATINUM).toBeGreaterThan(
      TIER_COMMISSION_RATES.GOLD,
    );
  });

  it("DIAMOND (15%) is the highest tier rate", () => {
    const max = Math.max(...Object.values(TIER_COMMISSION_RATES));
    expect(TIER_COMMISSION_RATES.DIAMOND).toBe(max);
  });
});

describe("Team — distributor ladder is monotonic", () => {
  it("commission rates are strictly increasing across the ladder", () => {
    const rates = DISTRIBUTOR_TIERS.map((t) => TIER_COMMISSION_RATES[t]);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThan(rates[i - 1]!);
    }
  });

  it("the ladder has exactly 5 tiers", () => {
    expect(DISTRIBUTOR_TIERS).toHaveLength(5);
  });
});
