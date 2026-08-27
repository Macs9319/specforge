import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listUserDocuments } from "@/lib/documents/queries";
import { uploadDocument } from "@/lib/documents/upload-document";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/storage";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const documents = await listUserDocuments(prisma, session.user.id);

  return NextResponse.json({ documents });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "No file was provided." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const result = await uploadDocument(
    { prisma, storage: getStorageProvider() },
    {
      userId: session.user.id,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      buffer,
    },
  );

  if (!result.ok) {
    const messages: Record<typeof result.error, string> = {
      FILE_TOO_LARGE: "File is too large. The maximum size is 10MB.",
      UNSUPPORTED_FILE_TYPE:
        "Unsupported file type. Please upload a PDF, DOCX, Markdown, or plain text file.",
    };
    return NextResponse.json(
      { error: messages[result.error] },
      { status: 400 },
    );
  }

  return NextResponse.json({ document: result.document }, { status: 201 });
}
