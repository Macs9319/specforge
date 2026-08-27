import type { SourceFileType } from "../../generated/prisma";

const MIME_TO_TYPE: Record<string, SourceFileType> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "DOCX",
  "text/markdown": "MARKDOWN",
  "text/x-markdown": "MARKDOWN",
  "text/plain": "TEXT",
};

const EXTENSION_TO_TYPE: Record<string, SourceFileType> = {
  pdf: "PDF",
  docx: "DOCX",
  md: "MARKDOWN",
  markdown: "MARKDOWN",
  txt: "TEXT",
};

function extensionOf(filename: string): string | undefined {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === filename.length - 1) return undefined;
  return filename.slice(dotIndex + 1).toLowerCase();
}

/**
 * Determines the SourceFileType from the upload's declared mime type and
 * filename extension. Trusts the extension when the mime type is generic
 * or absent (browsers/OSes are inconsistent about mime types for
 * .md/.docx), but rejects anything neither recognizes.
 */
export function detectSourceFileType(
  filename: string,
  mimeType: string,
): SourceFileType | null {
  const byMime = MIME_TO_TYPE[mimeType.toLowerCase()];
  if (byMime) return byMime;

  const ext = extensionOf(filename);
  if (ext && EXTENSION_TO_TYPE[ext]) return EXTENSION_TO_TYPE[ext];

  return null;
}
