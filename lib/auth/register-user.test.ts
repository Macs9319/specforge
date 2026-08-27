import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../../generated/prisma";
import { registerUser } from "./register-user";

describe("registerUser", () => {
  it("creates a user and returns its id", async () => {
    const create = vi.fn().mockResolvedValue({ id: "user_1" });

    const result = await registerUser(
      { user: { create } } as never,
      { email: "a@example.com", password: "password123" },
    );

    expect(result).toEqual({ ok: true, userId: "user_1" });
    expect(create).toHaveBeenCalledWith({
      data: {
        email: "a@example.com",
        passwordHash: expect.any(String),
      },
    });
  });

  it("returns EMAIL_TAKEN when the email is already registered", async () => {
    const create = vi.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.10.0",
      }),
    );

    const result = await registerUser(
      { user: { create } } as never,
      { email: "a@example.com", password: "password123" },
    );

    expect(result).toEqual({ ok: false, error: "EMAIL_TAKEN" });
  });

  it("rethrows unrelated database errors", async () => {
    const create = vi.fn().mockRejectedValue(new Error("connection lost"));

    await expect(
      registerUser(
        { user: { create } } as never,
        { email: "a@example.com", password: "password123" },
      ),
    ).rejects.toThrow("connection lost");
  });
});
