export interface StorageProvider {
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  /** Verifies the backend is reachable and usable, for health checks. */
  healthCheck(): Promise<boolean>;
}
