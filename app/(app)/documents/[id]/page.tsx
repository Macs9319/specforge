import { notFound } from "next/navigation";
import { ProcessingStatusView } from "@/components/processing-status-view";
import { requireSession } from "@/lib/auth/require-session";
import { findOwnedDocumentWithPrd } from "@/lib/documents/queries";
import { prisma } from "@/lib/prisma";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const document = await findOwnedDocumentWithPrd(prisma, session.user.id, id);

  if (!document) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{document.title}</h1>
        <p className="text-sm text-gray-500">
          Uploaded {document.createdAt.toLocaleDateString()}
        </p>
      </div>
      <ProcessingStatusView
        // Forces a full remount on navigation between two documents —
        // without it, React can reuse this subtree's component instances
        // (including PrdViewer's local edit-draft state) across the App
        // Router's soft navigation between two instances of this same
        // dynamic route, showing/editing the wrong document's PRD.
        key={document.id}
        documentId={document.id}
        initialDocument={{
          status: document.status,
          errorMessage: document.errorMessage,
          prd: document.prd
            ? {
                id: document.prd.id,
                status: document.prd.status,
                errorMessage: document.prd.errorMessage,
                content: document.prd.content,
                editedAt: document.prd.editedAt?.toISOString() ?? null,
              }
            : null,
        }}
      />
    </div>
  );
}
