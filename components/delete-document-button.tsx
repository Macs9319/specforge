"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteDocumentButton({
  documentId,
}: {
  documentId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm("Delete this document? This can't be undone.")) {
      return;
    }

    setError(null);
    setPending(true);
    const response = await fetch(`/api/documents/${documentId}`, {
      method: "DELETE",
    });
    setPending(false);

    if (!response.ok) {
      setError("Couldn't delete this document. Please try again.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="text-sm text-red-600 underline disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
