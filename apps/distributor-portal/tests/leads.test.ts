/**
 * Leads tests — verify the lead pipeline constants + service shape.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
} from "@/lib/constants";
import { leadsService } from "@/lib/services";
import { MOCK_LEADS } from "@/lib/mock-data";
import { getScoreColor, getStatusColor } from "@/lib/utils";

describe("Leads — pipeline stages", () => {
  it("LEAD_STAGES has 5 stages in pipeline order", () => {
    expect(LEAD_STAGES).toEqual([
      "NEW",
      "CONTACTED",
      "QUALIFIED",
      "CONVERTED",
      "LOST",
    ]);
  });

  it("every stage has a label", () => {
    for (const stage of LEAD_STAGES) {
      expect(LEAD_STAGE_LABELS[stage]).toBeTruthy();
    }
  });

  it("CONVERTED and LOST are terminal stages", () => {
    expect(LEAD_STAGES).toContain("CONVERTED");
    expect(LEAD_STAGES).toContain("LOST");
  });
});

describe("Leads — sources", () => {
  it("LEAD_SOURCES includes common channels", () => {
    expect(LEAD_SOURCES).toContain("WEBSITE");
    expect(LEAD_SOURCES).toContain("REFERRAL");
    expect(LEAD_SOURCES).toContain("WHATSAPP");
    expect(LEAD_SOURCES).toContain("SOCIAL_MEDIA");
  });

  it("every source has a label", () => {
    for (const source of LEAD_SOURCES) {
      expect(LEAD_SOURCE_LABELS[source]).toBeTruthy();
    }
  });
});

describe("Leads — service (mock fallback)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns all leads when no filters", async () => {
    const result = await leadsService.list();
    expect(result.data).toHaveLength(MOCK_LEADS.length);
    expect(result.total).toBe(MOCK_LEADS.length);
  });

  it("filters by stage", async () => {
    const newLeads = await leadsService.list({ stage: "NEW" });
    expect(newLeads.data.every((l) => l.stage === "NEW")).toBe(true);
    expect(newLeads.data.length).toBeGreaterThan(0);
  });

  it("filters by source", async () => {
    const referrals = await leadsService.list({ source: "REFERRAL" });
    expect(referrals.data.every((l) => l.source === "REFERRAL")).toBe(true);
  });

  it("search matches name, email, or phone", async () => {
    const result = await leadsService.list({ search: "aarav" });
    expect(result.data.length).toBeGreaterThan(0);
    expect(
      result.data[0]!.firstName.toLowerCase().includes("aarav"),
    ).toBe(true);
  });

  it("throws on unknown id", async () => {
    await expect(leadsService.get("nonexistent")).rejects.toThrow(
      "Lead not found",
    );
  });

  it("returns existing lead by id", async () => {
    const lead = await leadsService.get("lead_001");
    expect(lead.id).toBe("lead_001");
    expect(lead.firstName).toBe("Aarav");
  });

  it("addNote appends a note to the lead", async () => {
    const before = await leadsService.get("lead_001");
    const beforeCount = before.notes.length;
    await leadsService.addNote("lead_001", "Test note");
    const after = await leadsService.get("lead_001");
    expect(after.notes.length).toBe(beforeCount + 1);
    expect(after.notes[0]!.body).toBe("Test note");
  });

  it("updateStage changes the stage", async () => {
    const updated = await leadsService.updateStage("lead_001", "CONTACTED");
    expect(updated.stage).toBe("CONTACTED");
  });

  it("convert sets stage to CONVERTED and assigns customer id", async () => {
    const converted = await leadsService.convert("lead_002");
    expect(converted.stage).toBe("CONVERTED");
    expect(converted.convertedCustomerId).toBeTruthy();
  });

  it("suggestScore returns a 0–100 score and reasoning", async () => {
    const result = await leadsService.suggestScore({
      firstName: "Test",
      lastName: "User",
      source: "REFERRAL",
      company: "Acme Corp",
      interest: "Wellness products",
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.reasoning).toBeTruthy();
    expect(result.reasoning.length).toBeGreaterThan(10);
  });

  it("suggestScore gives higher score for REFERRAL than COLD_CALL", async () => {
    const referralScore = await leadsService.suggestScore({
      firstName: "A",
      lastName: "B",
      source: "REFERRAL",
    });
    const coldScore = await leadsService.suggestScore({
      firstName: "A",
      lastName: "B",
      source: "COLD_CALL",
    });
    expect(referralScore.score).toBeGreaterThan(coldScore.score);
  });

  it("suggestNextAction returns action + script + priority", async () => {
    const result = await leadsService.suggestNextAction("lead_001");
    expect(result.action).toBeTruthy();
    expect(result.script).toBeTruthy();
    expect(["HIGH", "CRITICAL", "MEDIUM"]).toContain(result.priority);
  });
});

describe("Leads — score color", () => {
  it("score ≥ 75 is emerald", () => {
    expect(getScoreColor(80)).toContain("emerald");
  });

  it("score 50–74 is amber", () => {
    expect(getScoreColor(60)).toContain("amber");
  });

  it("score < 25 is rose", () => {
    expect(getScoreColor(10)).toContain("rose");
  });
});

describe("Leads — stage status color", () => {
  it("CONVERTED stage is emerald", () => {
    expect(getStatusColor("CONVERTED")).toContain("emerald");
  });

  it("LOST stage is rose", () => {
    expect(getStatusColor("LOST")).toContain("rose");
  });

  it("NEW stage is amber", () => {
    expect(getStatusColor("NEW")).toContain("amber");
  });
});
