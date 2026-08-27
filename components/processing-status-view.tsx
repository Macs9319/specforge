"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

type Status = "PENDING" | "PROCESSING" | "COMPLETE" | "FAILED";

export type DocumentWithPrdStatus = {
  status: Status;
  errorMessage: string | null;
  prd: {
    status: Status;
    errorMessage: string | null;
  } | null;
};

async function fetchDocument(url: string): Promise<DocumentWithPrdStatus> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch document status");
  }
  const body = await response.json();
  return body.document;
}

function isTerminal(document: DocumentWithPrdStatus): boolean {
  if (document.status === "PENDING" || document.status === "PROCESSING") {
    return false;
  }
  if (document.status === "FAILED") return true;
  if (!document.prd) return false;
  return document.prd.status === "COMPLETE" || document.prd.status === "FAILED";
}

export function ProcessingStatusView({
  documentId,
  initialDocument,
}: {
  documentId: string;
  initialDocument: DocumentWithPrdStatus;
}) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const { data } = useSWR(`/api/documents/${documentId}`, fetchDocument, {
    fallbackData: initialDocument,
    refreshInterval: (latest) =>
      latest && isTerminal(latest) ? 0 : 2500,
  });

  const current = data ?? initialDocument;

  async function runAction(path: string, confirmMessage?: string) {
    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }
    setActionError(null);
    setActionPending(true);
    const response = await fetch(`/api/documents/${documentId}/${path}`, {
      method: "POST",
    });
    setActionPending(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setActionError(body?.error ?? "That didn't work. Please try again.");
      return;
    }

    router.refresh();
  }

  if (current.status === "PENDING" || current.status === "PROCESSING") {
    return <StatusBlock label="Parsing document…" />;
  }

  if (current.status === "FAILED") {
    return (
      <StatusBlock
        label="Parsing failed"
        error={current.errorMessage}
        action={{
          label: "Retry",
          pending: actionPending,
          onClick: () => runAction("retry"),
        }}
        actionError={actionError}
      />
    );
  }

  if (!current.prd || current.prd.status === "PENDING" || current.prd.status === "PROCESSING") {
    return <StatusBlock label="Generating PRD…" />;
  }

  if (current.prd.status === "FAILED") {
    return (
      <StatusBlock
        label="PRD generation failed"
        error={current.prd.errorMessage}
        action={{
          label: "Retry",
          pending: actionPending,
          onClick: () => runAction("retry"),
        }}
        actionError={actionError}
      />
    );
  }

  return (
    <StatusBlock
      label="PRD ready"
      action={{
        label: "Regenerate",
        pending: actionPending,
        onClick: () =>
          runAction(
            "regenerate",
            "Regenerate the PRD? This will overwrite the current content.",
          ),
      }}
      actionError={actionError}
    />
  );
}

function StatusBlock({
  label,
  error,
  action,
  actionError,
}: {
  label: string;
  error?: string | null;
  action?: { label: string; onClick: () => void; pending: boolean };
  actionError?: string | null;
}) {
  return (
    <div className="rounded border border-gray-200 p-6">
      <p className="font-medium">{label}</p>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.pending}
          className="mt-4 rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {action.pending ? "Working…" : action.label}
        </button>
      )}
      {actionError && (
        <p className="mt-2 text-sm text-red-600">{actionError}</p>
      )}
    </div>
  );
}
