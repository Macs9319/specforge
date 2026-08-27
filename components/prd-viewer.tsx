"use client";

import { useState } from "react";
import { PrdMarkdown } from "./prd-markdown";

export type PrdData = {
  id: string;
  content: string;
  editedAt: string | null;
};

export function PrdViewer({
  prd,
  onRegenerate,
  regeneratePending,
  regenerateError,
}: {
  prd: PrdData;
  onRegenerate: () => void;
  regeneratePending: boolean;
  regenerateError: string | null;
}) {
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [draft, setDraft] = useState(prd.content);
  const [savedContent, setSavedContent] = useState(prd.content);
  const [editedAt, setEditedAt] = useState(prd.editedAt);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirty = draft !== savedContent;

  async function handleSave() {
    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`/api/prds/${prd.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setSaveError(body?.error ?? "Failed to save. Please try again.");
        return;
      }

      const body = await response.json();
      setSavedContent(draft);
      setEditedAt(body.prd.editedAt);
      setMode("preview");
    } catch {
      setSaveError("Network error. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleRegenerateClick() {
    const message = dirty
      ? "You have unsaved edits that will be lost if you regenerate now. Regenerate anyway?"
      : "Regenerate the PRD? This will overwrite the current content.";
    if (!window.confirm(message)) {
      return;
    }
    onRegenerate();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={`rounded px-3 py-1 text-sm ${
              mode === "preview"
                ? "bg-black text-white"
                : "border border-gray-300"
            }`}
          >
            Preview
          </button>
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={`rounded px-3 py-1 text-sm ${
              mode === "edit"
                ? "bg-black text-white"
                : "border border-gray-300"
            }`}
          >
            Edit
          </button>
        </div>

        <div className="flex items-center gap-3">
          {editedAt && (
            <span className="text-xs text-gray-500">
              Last edited {new Date(editedAt).toLocaleString()}
            </span>
          )}
          <a
            href={`/api/prds/${prd.id}/export`}
            className="rounded border border-gray-300 px-3 py-1 text-sm"
          >
            Download .md
          </a>
          <button
            type="button"
            onClick={handleRegenerateClick}
            disabled={regeneratePending}
            className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-50"
          >
            {regeneratePending ? "Working…" : "Regenerate"}
          </button>
        </div>
      </div>

      {regenerateError && (
        <p className="text-sm text-red-600">{regenerateError}</p>
      )}

      {mode === "preview" ? (
        <div className="rounded border border-gray-200 p-6">
          <PrdMarkdown content={savedContent} />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={24}
            className="w-full rounded border border-gray-300 p-4 font-mono text-sm"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {dirty && !saving && (
              <span className="text-xs text-gray-500">Unsaved changes</span>
            )}
            {saveError && (
              <p className="text-sm text-red-600">{saveError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
