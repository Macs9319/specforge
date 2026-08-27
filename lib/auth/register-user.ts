import type { PrismaClient } from "../../generated/prisma";
import { hashPassword } from "./password";

export type RegisterUserInput = {
  email: string;
  password: string;
};

export type RegisterUserResult =
  | { ok: true; userId: string }
  | { ok: false; error: "EMAIL_TAKEN" };

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function registerUser(
  prisma: Pick<PrismaClient, "user">,
  input: RegisterUserInput,
): Promise<RegisterUserResult> {
  const passwordHash = await hashPassword(input.password);

  try {
    const user = await prisma.user.create({
      data: { email: input.email, passwordHash },
    });
    return { ok: true, userId: user.id };
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return { ok: false, error: "EMAIL_TAKEN" };
    }
    throw error;
  }
}
