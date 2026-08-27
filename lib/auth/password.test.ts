import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies a matching password against its hash", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");

    await expect(
      verifyPassword("correct-horse-battery-staple", hash),
    ).resolves.toBe(true);
  });

  it("rejects a non-matching password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");

    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(
      false,
    );
  });

  it("produces a hash that does not equal the plaintext", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");

    expect(hash).not.toBe("correct-horse-battery-staple");
  });
});
