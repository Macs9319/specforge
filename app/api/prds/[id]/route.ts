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

  if (prd.status === "PENDING" || prd.status === "PROCESSING") {
    return NextResponse.json(
      {
        error:
          "A regeneration is in progress for this PRD, so it can't be edited right now.",
      },
      { status: 409 },
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

  // A conditional update rather than a plain one: if a regenerate slips
  // in between the status check above and this write, the status is no
  // longer COMPLETE/FAILED and the update matches zero rows instead of
  // silently clobbering fresh, in-flight (or freshly-written) content.
  const { count } = await prisma.prd.updateMany({
    where: { id, status: { notIn: ["PENDING", "PROCESSING"] } },
    data: { content: parsed.data.content, editedAt: new Date() },
  });

  if (count === 0) {
    return NextResponse.json(
      {
        error:
          "A regeneration started while you were editing, so this save was skipped. Please review and try again.",
      },
      { status: 409 },
    );
  }

  const updated = await prisma.prd.findUniqueOrThrow({ where: { id } });
  return NextResponse.json({ prd: updated });
}
