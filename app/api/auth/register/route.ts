import { NextResponse } from "next/server";
import { registerUser } from "@/lib/auth/register-user";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validation/auth-schemas";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please provide a valid email and a password of at least 8 characters." },
      { status: 400 },
    );
  }

  const result = await registerUser(prisma, parsed.data);

  if (!result.ok) {
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 },
    );
  }

  return NextResponse.json({ id: result.userId }, { status: 201 });
}
