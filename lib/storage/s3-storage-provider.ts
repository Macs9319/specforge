import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "../env";
import { logger } from "../logger";
import type { StorageProvider } from "./types";

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private bucketReady: Promise<void> | undefined;

  constructor(client: S3Client, bucket: string) {
    this.client = client;
    this.bucket = bucket;
  }

  private ensureBucket(): Promise<void> {
    if (!this.bucketReady) {
      this.bucketReady = this.client
        .send(new CreateBucketCommand({ Bucket: this.bucket }))
        .then(() => undefined)
        .catch((error: unknown) => {
          const name = (error as { name?: string } | null)?.name;
          if (
            name === "BucketAlreadyOwnedByYou" ||
            name === "BucketAlreadyExists"
          ) {
            return;
          }
          // Don't cache a hard failure — a transient error, or a
          // least-privilege production role that can't create buckets
          // against a bucket already provisioned by IaC, shouldn't
          // permanently break every future upload. Log it, let the next
          // call retry, and let the real put/get/delete fail naturally
          // if the bucket genuinely isn't usable.
          this.bucketReady = undefined;
          logger.warn(
            { err: error, bucket: this.bucket },
            "Could not confirm/create storage bucket; continuing optimistically",
          );
        });
    }
    return this.bucketReady;
  }

  async putObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async getObject(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) {
      throw new Error(`Storage object not found: ${key}`);
    }
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

export function createS3ClientFromEnv(): S3Client {
  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
}
