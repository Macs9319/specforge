export function parseText(buffer: Buffer): Promise<string> {
  return Promise.resolve(buffer.toString("utf-8"));
}
