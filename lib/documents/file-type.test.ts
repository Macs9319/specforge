import { describe, expect, it } from "vitest";
import { detectSourceFileType } from "./file-type";

describe("detectSourceFileType", () => {
  it("detects PDF by mime type", () => {
    expect(detectSourceFileType("doc.pdf", "application/pdf")).toBe("PDF");
  });

  it("detects DOCX by mime type", () => {
    expect(
      detectSourceFileType(
        "doc.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("DOCX");
  });

  it("detects Markdown by extension when the mime type is generic", () => {
    expect(detectSourceFileType("notes.md", "application/octet-stream")).toBe(
      "MARKDOWN",
    );
  });

  it("detects plain text by mime type", () => {
    expect(detectSourceFileType("notes.txt", "text/plain")).toBe("TEXT");
  });

  it("falls back to the extension when the mime type is unrecognized", () => {
    expect(detectSourceFileType("doc.pdf", "application/octet-stream")).toBe(
      "PDF",
    );
  });

  it("returns null for an unsupported file", () => {
    expect(detectSourceFileType("image.png", "image/png")).toBeNull();
  });

  it("returns null for a filename with no extension and an unknown mime type", () => {
    expect(detectSourceFileType("README", "application/octet-stream")).toBeNull();
  });
});
