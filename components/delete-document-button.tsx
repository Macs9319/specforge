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

  async function handleDelete() {
    if (!window.confirm("Delete this document? This can't be undone.")) {
      return;
    }

    setPending(true);
    const response = await fetch(`/api/documents/${documentId}`, {
      method: "DELETE",
    });
    setPending(false);

    if (response.ok) {
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="text-sm text-red-600 underline disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
