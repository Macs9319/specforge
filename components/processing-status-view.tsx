"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { PrdViewer } from "./prd-viewer";

type Status = "PENDING" | "PROCESSING" | "COMPLETE" | "FAILED";

export type DocumentWithPrdStatus = {
  status: Status;
  errorMessage: string | null;
  prd: {
    id: string;
    status: Status;
    errorMessage: string | null;
    content: string | null;
    editedAt: string | null;
  } | null;
};

type Phase =
  | { kind: "parsing" }
  | { kind: "parse-failed"; error: string | null }
  | { kind: "generating" }
  | { kind: "generate-failed"; error: string | null }
  | {
      kind: "ready";
      prd: { id: string; content: string; editedAt: string | null };
    };

/**
 * The single source of truth for "what state is this document in" — both
 * the polling interval decision and the rendered UI derive from this, so
 * they can't drift out of sync the way two independent status checks can.
 */
function derivePhase(document: DocumentWithPrdStatus): Phase {
  if (document.status === "PENDING" || document.status === "PROCESSING") {
    return { kind: "parsing" };
  }
  if (document.status === "FAILED") {
    return { kind: "parse-failed", error: document.errorMessage };
  }
  // document.status === "COMPLETE"
  if (
    !document.prd ||
    document.prd.status === "PENDING" ||
    document.prd.status === "PROCESSING"
  ) {
    return { kind: "generating" };
  }
  if (document.prd.status === "FAILED") {
    return { kind: "generate-failed", error: document.prd.errorMessage };
  }
  return {
    kind: "ready",
    prd: {
      id: document.prd.id,
      content: document.prd.content ?? "",
      editedAt: document.prd.editedAt,
    },
  };
}

function isTerminal(phase: Phase): boolean {
  return phase.kind !== "parsing" && phase.kind !== "generating";
}

async function fetchDocument(url: string): Promise<DocumentWithPrdStatus> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch document status");
  }
  const body = await response.json();
  return body.document;
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

  const { data, mutate } = useSWR(
    `/api/documents/${documentId}`,
    fetchDocument,
    {
      fallbackData: initialDocument,
      refreshInterval: (latest) =>
        latest && isTerminal(derivePhase(latest)) ? 0 : 2500,
    },
  );

  const phase = derivePhase(data ?? initialDocument);

  async function runAction(path: string) {
    setActionError(null);
    setActionPending(true);

    try {
      const response = await fetch(`/api/documents/${documentId}/${path}`, {
        method: "POST",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setActionError(body?.error ?? "That didn't work. Please try again.");
        return;
      }

      // Force a fresh fetch — without this, the SWR cache still holds the
      // terminal (FAILED/ready) state that stopped polling, so refetching
      // is what makes polling resume once the new state is non-terminal.
      await mutate();
      router.refresh();
    } catch {
      setActionError("Network error. Please check your connection and try again.");
    } finally {
      setActionPending(false);
    }
  }

  switch (phase.kind) {
    case "parsing":
      return <StatusBlock label="Parsing document…" />;

    case "parse-failed":
      return (
        <StatusBlock
          label="Parsing failed"
          error={phase.error}
          action={{
            label: "Retry",
            pending: actionPending,
            onClick: () => runAction("retry"),
          }}
          actionError={actionError}
        />
      );

    case "generating":
      return <StatusBlock label="Generating PRD…" />;

    case "generate-failed":
      return (
        <StatusBlock
          label="PRD generation failed"
          error={phase.error}
          action={{
            label: "Retry",
            pending: actionPending,
            onClick: () => runAction("retry"),
          }}
          actionError={actionError}
        />
      );

    case "ready":
      return (
        <PrdViewer
          prd={phase.prd}
          onRegenerate={() => runAction("regenerate")}
          regeneratePending={actionPending}
          regenerateError={actionError}
        />
      );
  }
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
