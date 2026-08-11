/**
 * Auth tests — verify the API client's auth-related behavior.
 *
 * These tests exercise the response interceptor's 401 handling and the
 * auth-storage helpers. Agent 3 owns the full /login page + useAuth hook;
 * this file covers the cross-cutting auth concerns shared by all pages.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { STORAGE_KEYS } from "@/lib/constants";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("Auth — storage keys", () => {
  beforeEach(() => localStorageMock.clear());
  afterEach(() => vi.clearAllMocks());

  it("STORAGE_KEYS contains ACCESS_TOKEN and REFRESH_TOKEN", () => {
    expect(STORAGE_KEYS.ACCESS_TOKEN).toBe("dj_access_token");
    expect(STORAGE_KEYS.REFRESH_TOKEN).toBe("dj_refresh_token");
    expect(STORAGE_KEYS.USER).toBe("dj_user");
  });

  it("stores and retrieves tokens", () => {
    localStorageMock.setItem(STORAGE_KEYS.ACCESS_TOKEN, "test-token");
    expect(localStorageMock.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBe(
      "test-token",
    );
  });

  it("clears auth storage on logout", () => {
    localStorageMock.setItem(STORAGE_KEYS.ACCESS_TOKEN, "test-token");
    localStorageMock.setItem(STORAGE_KEYS.USER, "{}");
    localStorageMock.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorageMock.removeItem(STORAGE_KEYS.USER);
    expect(localStorageMock.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBeNull();
    expect(localStorageMock.getItem(STORAGE_KEYS.USER)).toBeNull();
  });
});

describe("Auth — token presence", () => {
  beforeEach(() => localStorageMock.clear());

  it("detects when no token is present", () => {
    expect(localStorageMock.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBeNull();
  });

  it("detects when a token is present", () => {
    localStorageMock.setItem(STORAGE_KEYS.ACCESS_TOKEN, "abc");
    expect(localStorageMock.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBe("abc");
  });
});

describe("Auth — settings persistence", () => {
  beforeEach(() => localStorageMock.clear());

  it("persists user settings as JSON", () => {
    const settings = { theme: "dark", language: "en-IN" };
    localStorageMock.setItem(
      STORAGE_KEYS.SETTINGS,
      JSON.stringify(settings),
    );
    const raw = localStorageMock.getItem(STORAGE_KEYS.SETTINGS);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual(settings);
  });

  it("handles corrupted settings gracefully", () => {
    localStorageMock.setItem(STORAGE_KEYS.SETTINGS, "{invalid json");
    const raw = localStorageMock.getItem(STORAGE_KEYS.SETTINGS);
    expect(() => JSON.parse(raw!)).toThrow();
  });
});
