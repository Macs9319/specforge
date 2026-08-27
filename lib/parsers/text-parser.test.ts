import { describe, expect, it } from "vitest";
import { parseText } from "./text-parser";

describe("parseText", () => {
  it("decodes a UTF-8 buffer to a string", async () => {
    const text = await parseText(Buffer.from("# Process Flow\n\nStep one."));
    expect(text).toBe("# Process Flow\n\nStep one.");
  });
});
