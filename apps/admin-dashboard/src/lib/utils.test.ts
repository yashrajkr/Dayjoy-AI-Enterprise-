import { describe, it, expect } from "vitest";
import { formatDate, formatNumber, getInitials, truncate, cn } from "@/lib/utils";

describe("utils", () => {
  describe("cn (class merge)", () => {
    it("merges class names", () => {
      expect(cn("px-2", "py-1")).toBe("px-2 py-1");
    });

    it("resolves conflicts (last wins)", () => {
      expect(cn("px-2", "px-4")).toBe("px-4");
    });

    it("handles conditional classes", () => {
      expect(cn("base", false && "hidden", "visible")).toBe("base visible");
    });
  });

  describe("formatDate", () => {
    it("formats a date string", () => {
      const result = formatDate("2026-07-15T00:00:00Z");
      expect(result).toContain("2026");
      expect(result).toContain("Jul");
    });

    it("formats a Date object", () => {
      const result = formatDate(new Date("2026-07-15"));
      expect(result).toContain("2026");
    });
  });

  describe("formatNumber", () => {
    it("formats numbers with commas", () => {
      expect(formatNumber(1234567)).toBe("1,234,567");
    });

    it("handles small numbers", () => {
      expect(formatNumber(42)).toBe("42");
    });
  });

  describe("truncate", () => {
    it("truncates long text", () => {
      expect(truncate("Hello World", 5)).toBe("Hello…");
    });

    it("does not truncate short text", () => {
      expect(truncate("Hi", 10)).toBe("Hi");
    });
  });

  describe("getInitials", () => {
    it("gets initials from full name", () => {
      expect(getInitials("John Doe")).toBe("JD");
    });

    it("handles single name", () => {
      expect(getInitials("John")).toBe("J");
    });

    it("handles empty string", () => {
      expect(getInitials("")).toBe("?");
    });
  });
});
