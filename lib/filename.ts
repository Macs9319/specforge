/**
 * Replaces anything that isn't a safe filename character with an
 * underscore — used both for the object key a file is stored under and
 * for filenames offered to the browser on download.
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
