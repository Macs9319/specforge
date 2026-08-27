import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { findOwnedPrd } from "@/lib/prds/queries";
import { prisma } from "@/lib/prisma";

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const prd = await findOwnedPrd(prisma, session.user.id, id);
  if (!prd || prd.content === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const document = await prisma.document.findUnique({
    where: { id: prd.documentId },
  });
  const title = document ? document.title.replace(/\.[^.]+$/, "") : "prd";
  const filename = `${sanitizeFilename(title) || "prd"}.md`;

  return new NextResponse(prd.content, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
