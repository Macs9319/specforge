import { env } from "../env";
import { createS3ClientFromEnv, S3StorageProvider } from "./s3-storage-provider";
import type { StorageProvider } from "./types";

let instance: StorageProvider | undefined;

export function getStorageProvider(): StorageProvider {
  if (!instance) {
    instance = new S3StorageProvider(createS3ClientFromEnv(), env.S3_BUCKET);
  }
  return instance;
}

export type { StorageProvider } from "./types";
