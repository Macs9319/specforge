import { describe, expect, it, vi } from "vitest";
import { FakeStorageProvider } from "../storage/fake-storage-provider";
import { MAX_UPLOAD_SIZE_BYTES, uploadDocument } from "./upload-document";

function fakeDeps() {
  const storage = new FakeStorageProvider();
  const create = vi.fn().mockImplementation(({ data }) =>
    Promise.resolve({
      id: "doc_1",
      ...data,
    }),
  );
  return { storage, prisma: { document: { create } }, create };
}

describe("uploadDocument", () => {
  it("stores the file and creates a Document row for a valid PDF", async () => {
    const { storage, prisma } = fakeDeps();
    const buffer = Buffer.from("%PDF-1.4 fake pdf contents");

    const result = await uploadDocument(
      { storage, prisma: prisma as never },
      {
        userId: "user_1",
        filename: "process-flow.pdf",
        mimeType: "application/pdf",
        buffer,
      },
    );

    expect(result).toEqual({
      ok: true,
      document: { id: "doc_1", title: "process-flow.pdf", status: "PENDING" },
    });

    const [[createArgs]] = (prisma.document.create as ReturnType<typeof vi.fn>)
      .mock.calls;
    expect(createArgs.data.storageKey).toMatch(/^user_1\//);
    expect(await storage.getObject(createArgs.data.storageKey)).toEqual(
      buffer,
    );
  });

  it("rejects a file over the size limit without touching storage or the database", async () => {
    const { storage, prisma, create } = fakeDeps();
    const buffer = Buffer.alloc(MAX_UPLOAD_SIZE_BYTES + 1);

    const result = await uploadDocument(
      { storage, prisma: prisma as never },
      {
        userId: "user_1",
        filename: "huge.pdf",
        mimeType: "application/pdf",
        buffer,
      },
    );

    expect(result).toEqual({ ok: false, error: "FILE_TOO_LARGE" });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an unsupported file type", async () => {
    const { storage, prisma, create } = fakeDeps();

    const result = await uploadDocument(
      { storage, prisma: prisma as never },
      {
        userId: "user_1",
        filename: "image.png",
        mimeType: "image/png",
        buffer: Buffer.from("not really a png"),
      },
    );

    expect(result).toEqual({ ok: false, error: "UNSUPPORTED_FILE_TYPE" });
    expect(create).not.toHaveBeenCalled();
  });

  it("strips slashes from the filename so it can't inject extra key segments", async () => {
    const { storage, prisma } = fakeDeps();

    await uploadDocument(
      { storage, prisma: prisma as never },
      {
        userId: "user_1",
        filename: "sneaky/nested/passwd.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("hi"),
      },
    );

    const [[createArgs]] = (prisma.document.create as ReturnType<typeof vi.fn>)
      .mock.calls;
    const [prefix, ...rest] = createArgs.data.storageKey.split("/");
    expect(prefix).toBe("user_1");
    expect(rest).toHaveLength(1);
  });

  it("removes the uploaded object if the database insert fails", async () => {
    const storage = new FakeStorageProvider();
    const create = vi.fn().mockRejectedValue(new Error("connection lost"));

    await expect(
      uploadDocument(
        { storage, prisma: { document: { create } } as never },
        {
          userId: "user_1",
          filename: "process-flow.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4 fake pdf contents"),
        },
      ),
    ).rejects.toThrow("connection lost");

    const [[createArgs]] = create.mock.calls;
    expect(storage.has(createArgs.data.storageKey)).toBe(false);
  });
});
