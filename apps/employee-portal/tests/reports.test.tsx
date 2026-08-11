import { describe, it, expect } from "vitest";
import { format, parseISO, subDays } from "date-fns";
import {
  getPerformanceReport,
  getSalesReport,
  getTicketReport,
  summariseSales,
  summariseTickets,
} from "@/lib/mock-data";

describe("Reports — sales", () => {
  it("generates sales rows for the requested date range", () => {
    const start = subDays(new Date(), 6);
    const end = new Date();
    const rows = getSalesReport(start, end);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.order).toMatch(/^ORD-\d+$/);
      expect(r.customer).toBeTruthy();
      expect(r.product).toBeTruthy();
      expect(r.quantity).toBeGreaterThan(0);
      expect(r.total).toBeGreaterThan(0);
    }
  });

  it("summarises sales into total / orders / AOV / by-product / by-category / by-day", () => {
    const rows = getSalesReport(subDays(new Date(), 9), new Date());
    const summary = summariseSales(rows);
    expect(summary.totalSales).toBeGreaterThan(0);
    expect(summary.orders).toBe(rows.length);
    expect(summary.avgOrderValue).toBe(Math.round(summary.totalSales / summary.orders));
    expect(summary.byProduct.length).toBeGreaterThan(0);
    expect(summary.byCategory.length).toBeGreaterThan(0);
    expect(summary.byDay.length).toBeGreaterThan(0);
    // Top product / category are sorted descending by total.
    expect(summary.byProduct[0]!.total).toBeGreaterThanOrEqual(summary.byProduct[1]!.total);
    expect(summary.byCategory[0]!.total).toBeGreaterThanOrEqual(summary.byCategory[1]!.total);
  });

  it("handles an empty input gracefully", () => {
    const summary = summariseSales([]);
    expect(summary.totalSales).toBe(0);
    expect(summary.orders).toBe(0);
    expect(summary.avgOrderValue).toBe(0);
    expect(summary.byProduct).toEqual([]);
    expect(summary.byCategory).toEqual([]);
  });
});

describe("Reports — tickets", () => {
  it("generates ticket rows for the requested date range", () => {
    const rows = getTicketReport(subDays(new Date(), 6), new Date());
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.id).toMatch(/^TKT-\d+$/);
      expect(r.subject).toBeTruthy();
      expect(r.status).toMatch(/^(open|in-progress|resolved|closed)$/);
      expect(r.priority).toMatch(/^(low|medium|high|urgent)$/);
      // Resolved / closed tickets have resolution hours + CSAT.
      if (r.status === "resolved" || r.status === "closed") {
        expect(r.resolutionHours).not.toBeNull();
        expect(r.csat).not.toBeNull();
      }
    }
  });

  it("summarises tickets by status, priority, and day", () => {
    const rows = getTicketReport(subDays(new Date(), 9), new Date());
    const summary = summariseTickets(rows);
    expect(summary.total).toBe(rows.length);
    expect(summary.resolved + summary.open + summary.inProgress + summary.closed).toBe(summary.total);
    expect(summary.byStatus).toHaveLength(4);
    expect(summary.byPriority).toHaveLength(4);
    expect(summary.byDay.length).toBeGreaterThan(0);
    // Sum of byStatus counts equals total.
    const statusSum = summary.byStatus.reduce((s, b) => s + b.count, 0);
    expect(statusSum).toBe(summary.total);
    // Sum of byPriority counts equals total.
    const prioSum = summary.byPriority.reduce((s, b) => s + b.count, 0);
    expect(prioSum).toBe(summary.total);
  });

  it("computes avg resolution hours only over resolved tickets", () => {
    const rows = getTicketReport(subDays(new Date(), 30), new Date());
    const summary = summariseTickets(rows);
    const resolved = rows.filter((r) => r.resolutionHours != null);
    const expected = resolved.length
      ? +(resolved.reduce((s, r) => s + (r.resolutionHours ?? 0), 0) / resolved.length).toFixed(2)
      : 0;
    expect(summary.avgResolutionHours).toBeCloseTo(expected, 1);
  });

  it("computes CSAT as the mean of resolved-ticket CSAT scores", () => {
    const rows = getTicketReport(subDays(new Date(), 30), new Date());
    const summary = summariseTickets(rows);
    const scored = rows.filter((r) => r.csat != null);
    const expected = scored.length
      ? +(scored.reduce((s, r) => s + (r.csat ?? 0), 0) / scored.length).toFixed(2)
      : 0;
    expect(summary.csat).toBeCloseTo(expected, 1);
  });
});

describe("Reports — performance", () => {
  it("returns metrics with mine / teamAvg / goal", () => {
    const report = getPerformanceReport();
    expect(report.metrics.length).toBeGreaterThan(0);
    for (const m of report.metrics) {
      expect(m.metric).toBeTruthy();
      expect(typeof m.mine).toBe("number");
      expect(typeof m.teamAvg).toBe("number");
      expect(typeof m.goal).toBe("number");
    }
  });

  it("returns a 14-day trend with mine + teamAvg values", () => {
    const report = getPerformanceReport();
    expect(report.trend).toHaveLength(14);
    for (const t of report.trend) {
      expect(t.date).toBeTruthy();
      expect(typeof t.mine).toBe("number");
      expect(typeof t.teamAvg).toBe("number");
    }
  });

  it("returns goal progress entries with progress between 0 and ~1.1", () => {
    const report = getPerformanceReport();
    expect(report.goalProgress.length).toBeGreaterThan(0);
    for (const g of report.goalProgress) {
      expect(g.goal).toBeTruthy();
      expect(g.progress).toBeGreaterThan(0);
      expect(g.progress).toBeLessThan(1.5);
      expect(g.target).toBeGreaterThan(0);
      expect(g.current).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Reports — date handling", () => {
  it("sales rows fall within the requested range", () => {
    const start = subDays(new Date(), 3);
    const end = new Date();
    const rows = getSalesReport(start, end);
    for (const r of rows) {
      const d = parseISO(r.date);
      expect(d.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(d.getTime()).toBeLessThanOrEqual(end.getTime() + 86_400_000); // +1 day buffer for ISO edge
    }
  });

  it("ticket rows are tagged with the current date format", () => {
    const rows = getTicketReport(subDays(new Date(), 1), new Date());
    expect(rows.length).toBeGreaterThan(0);
    // Each date is parseable.
    for (const r of rows) {
      expect(() => format(parseISO(r.date), "yyyy-MM-dd")).not.toThrow();
    }
  });
});
