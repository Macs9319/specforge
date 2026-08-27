"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { detectSourceFileType } from "@/lib/documents/file-type";
import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/documents/upload-document";

function validateFile(file: File): string | null {
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return "File is too large. The maximum size is 10MB.";
  }
  if (!detectSourceFileType(file.name, file.type || "")) {
    return "Unsupported file type. Please upload a PDF, DOCX, Markdown, or plain text file.";
  }
  return null;
}

export function UploadDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function uploadFile(file: File) {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setUploading(true);

    const formData = new FormData();
    formData.set("file", file);

    const response = await fetch("/api/documents", {
      method: "POST",
      body: formData,
    });

    setUploading(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Upload failed. Please try again.");
      return;
    }

    router.refresh();
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void uploadFile(file);
  }

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void uploadFile(file);
    event.target.value = "";
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? "border-black bg-gray-50" : "border-gray-300"
        }`}
      >
        <p className="font-medium">
          {uploading
            ? "Uploading…"
            : "Drag and drop a document here, or click to browse"}
        </p>
        <p className="text-sm text-gray-500">
          PDF, DOCX, or Markdown/text — up to 10MB
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.md,.markdown,.txt"
          className="hidden"
          onChange={handleFileInputChange}
          disabled={uploading}
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
