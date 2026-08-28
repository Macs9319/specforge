import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sanitizeFilename } from "@/lib/filename";
import { findOwnedPrdWithDocument } from "@/lib/prds/queries";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const prd = await findOwnedPrdWithDocument(prisma, session.user.id, id);
  if (!prd || prd.currentVersion === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const title = prd.document.title.replace(/\.[^.]+$/, "");
  const filename = `${sanitizeFilename(title) || "prd"}.md`;

  return new NextResponse(prd.currentVersion.content, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
