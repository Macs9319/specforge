import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "./auth-schemas";

describe("registerSchema", () => {
  it("normalizes email casing and surrounding whitespace", () => {
    const result = registerSchema.parse({
      email: "  Alice@Example.com  ",
      password: "password123",
    });

    expect(result.email).toBe("alice@example.com");
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(() =>
      registerSchema.parse({ email: "a@example.com", password: "short" }),
    ).toThrow();
  });
});

describe("loginSchema", () => {
  it("normalizes email the same way as registerSchema", () => {
    const result = loginSchema.parse({
      email: "Alice@Example.com",
      password: "anything",
    });

    expect(result.email).toBe("alice@example.com");
  });
});
