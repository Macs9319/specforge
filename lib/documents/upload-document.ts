import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma";
import type { StorageProvider } from "../storage/types";
import { detectSourceFileType } from "./file-type";

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

export type UploadDocumentInput = {
  userId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
};

export type UploadDocumentResult =
  | {
      ok: true;
      document: {
        id: string;
        title: string;
        status: string;
        storageKey: string;
      };
    }
  | { ok: false; error: "FILE_TOO_LARGE" | "UNSUPPORTED_FILE_TYPE" };

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}

export async function uploadDocument(
  deps: {
    prisma: Pick<PrismaClient, "document">;
    storage: StorageProvider;
  },
  input: UploadDocumentInput,
): Promise<UploadDocumentResult> {
  if (input.buffer.byteLength > MAX_UPLOAD_SIZE_BYTES) {
    return { ok: false, error: "FILE_TOO_LARGE" };
  }

  const fileType = detectSourceFileType(input.filename, input.mimeType);
  if (!fileType) {
    return { ok: false, error: "UNSUPPORTED_FILE_TYPE" };
  }

  const storageKey = `${input.userId}/${randomUUID()}-${sanitizeFilename(input.filename)}`;
  await deps.storage.putObject(storageKey, input.buffer, input.mimeType);

  let document;
  try {
    document = await deps.prisma.document.create({
      data: {
        userId: input.userId,
        title: input.filename,
        originalFilename: input.filename,
        fileType,
        mimeType: input.mimeType,
        fileSizeBytes: input.buffer.byteLength,
        storageKey,
        status: "PENDING",
      },
    });
  } catch (error) {
    // Don't leave an orphaned object with no Document row referencing it.
    await deps.storage.deleteObject(storageKey).catch(() => undefined);
    throw error;
  }

  return {
    ok: true,
    document: {
      id: document.id,
      title: document.title,
      status: document.status,
      storageKey: document.storageKey,
    },
  };
}
