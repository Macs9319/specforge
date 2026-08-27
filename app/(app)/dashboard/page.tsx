import Link from "next/link";
import { DeleteDocumentButton } from "@/components/delete-document-button";
import { DocumentStatusBadge } from "@/components/document-status-badge";
import { UploadDropzone } from "@/components/upload-dropzone";
import { listUserDocuments } from "@/lib/documents/queries";
import { requireSession } from "@/lib/auth/require-session";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await requireSession();
  const documents = await listUserDocuments(prisma, session.user.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-gray-600">
          Upload a technical document to generate a PRD from it.
        </p>
      </div>

      <UploadDropzone />

      <div>
        <h2 className="mb-3 text-lg font-semibold">Your documents</h2>
        {documents.length === 0 ? (
          <p className="text-gray-600">No documents yet.</p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded border border-gray-200">
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex items-center justify-between p-4"
              >
                <Link href={`/documents/${document.id}`} className="min-w-0">
                  <p className="font-medium underline">{document.title}</p>
                  <p className="text-sm text-gray-500">
                    {document.createdAt.toLocaleDateString()} ·{" "}
                    {(document.fileSizeBytes / 1024).toFixed(0)} KB
                  </p>
                </Link>
                <div className="flex items-center gap-4">
                  <DocumentStatusBadge status={document.status} />
                  <DeleteDocumentButton documentId={document.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
