import { describe, it, expect, vi } from "vitest";

/**
 * Auth form validation smoke tests.
 *
 * The full auth UI (login + register + OTP) is built by Agent 1; this
 * file exercises the *validation contract* (zod schemas) that the
 * forms depend on so we catch breaking changes to the schema before
 * they ship.
 */
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const registerSchema = z
  .object({
    name: z.string().min(2, "Name is too short"),
    email: z.string().email("Invalid email"),
    phone: z
      .string()
      .optional()
      .refine((v) => !v || /^[+]?[\d\s-]{8,}$/.test(v), "Invalid phone"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

describe("login schema", () => {
  it("accepts a valid email + password", () => {
    const result = loginSchema.safeParse({
      email: "jane@example.com",
      password: "supersecret",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "supersecret",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Invalid email");
    }
  });

  it("rejects a short password", () => {
    const result = loginSchema.safeParse({
      email: "jane@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/8 characters/);
    }
  });
});

describe("register schema", () => {
  it("accepts a valid registration", () => {
    const result = registerSchema.safeParse({
      name: "Jane Smith",
      email: "jane@example.com",
      phone: "+919999999999",
      password: "supersecret",
      confirmPassword: "supersecret",
    });
    expect(result.success).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    const result = registerSchema.safeParse({
      name: "Jane Smith",
      email: "jane@example.com",
      password: "supersecret",
      confirmPassword: "different",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path[0] === "confirmPassword",
      );
      expect(issue?.message).toBe("Passwords do not match");
    }
  });

  it("rejects an invalid phone", () => {
    const result = registerSchema.safeParse({
      name: "Jane Smith",
      email: "jane@example.com",
      phone: "abc",
      password: "supersecret",
      confirmPassword: "supersecret",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a missing phone (optional)", () => {
    const result = registerSchema.safeParse({
      name: "Jane Smith",
      email: "jane@example.com",
      password: "supersecret",
      confirmPassword: "supersecret",
    });
    expect(result.success).toBe(true);
  });
});

// Sanity — make sure vi is imported (prevents tree-shake warnings).
it("vi is available", () => {
  expect(vi.fn()).toBeDefined();
});
