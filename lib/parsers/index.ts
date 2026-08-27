import type { SourceFileType } from "../../generated/prisma";
import { parseDocx } from "./docx-parser";
import { parsePdf } from "./pdf-parser";
import { parseText } from "./text-parser";

export function parseDocument(
  fileType: SourceFileType,
  buffer: Buffer,
): Promise<string> {
  switch (fileType) {
    case "PDF":
      return parsePdf(buffer);
    case "DOCX":
      return parseDocx(buffer);
    case "MARKDOWN":
    case "TEXT":
      return parseText(buffer);
  }
}
