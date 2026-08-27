import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { findOwnedPrd } from "@/lib/prds/queries";

const patchSchema = z.object({
  content: z.string().min(1).max(200_000),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const prd = await findOwnedPrd(prisma, session.user.id, id);
  if (!prd) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (prd.content === null) {
    return NextResponse.json(
      { error: "There's nothing to edit yet." },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please provide non-empty Markdown content." },
      { status: 400 },
    );
  }

  const updated = await prisma.prd.update({
    where: { id },
    data: { content: parsed.data.content, editedAt: new Date() },
  });

  return NextResponse.json({ prd: updated });
}
