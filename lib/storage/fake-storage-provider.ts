import type { StorageProvider } from "./types";

/**
 * In-memory StorageProvider for unit tests, so upload/parse/generation logic
 * can be tested without a real S3/MinIO connection.
 */
export class FakeStorageProvider implements StorageProvider {
  private readonly objects = new Map<
    string,
    { body: Buffer; contentType: string }
  >();

  async putObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    this.objects.set(key, { body, contentType });
  }

  async getObject(key: string): Promise<Buffer> {
    const object = this.objects.get(key);
    if (!object) {
      throw new Error(`Storage object not found: ${key}`);
    }
    return object.body;
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  has(key: string): boolean {
    return this.objects.has(key);
  }
}
