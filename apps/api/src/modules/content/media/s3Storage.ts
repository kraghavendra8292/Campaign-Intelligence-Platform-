import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import type { MediaStorage, StoredObject } from './storage';

/**
 * S3-compatible media storage (Neon Object Storage, R2, AWS S3, MinIO, …).
 *
 * Neon requires path-style addressing. Credentials and endpoint come from env
 * so the same adapter works against any S3-compatible host.
 */

/** Rejects any key that is not exactly the shape `put` produces. */
const SAFE_KEY = /^[0-9a-f-]{36}\/[0-9a-f-]{36}(\.[a-z0-9]{1,8})?$/;

function buildStorageKey(organizationId: string, filename: string): string {
  const extension = extractSafeExtension(filename);
  return `${organizationId}/${randomUUID()}${extension}`;
}

function extractSafeExtension(filename: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(filename.trim());
  return match ? `.${match[1]?.toLowerCase()}` : '';
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } })
    .name;
  const alt = (error as { Code?: string }).Code;
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return (
    code === 'NotFound' ||
    code === 'NoSuchKey' ||
    alt === 'NotFound' ||
    alt === 'NoSuchKey' ||
    status === 404
  );
}

export type S3StorageConfig = {
  readonly bucket: string;
  readonly region: string;
  readonly endpoint: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
};

export class S3CompatibleStorage implements MediaStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;

    const clientConfig: S3ClientConfig = {
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // Neon/docs: avoid empty-body checksums breaking uploads.
      requestChecksumCalculation: 'WHEN_REQUIRED',
    };

    this.client = new S3Client(clientConfig);
  }

  async put(input: {
    organizationId: string;
    filename: string;
    content: Buffer;
    contentType?: string;
  }): Promise<StoredObject> {
    const storageKey = buildStorageKey(input.organizationId, input.filename);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: input.content,
        ContentType: input.contentType,
        ContentLength: input.content.byteLength,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    return {
      storageKey,
      sizeBytes: input.content.byteLength,
      checksumSha256: createHash('sha256').update(input.content).digest('hex'),
    };
  }

  async createReadStream(storageKey: string): Promise<Readable | null> {
    if (!SAFE_KEY.test(storageKey)) return null;

    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
        }),
      );

      const body = response.Body;
      if (!body) return null;

      // SDK v3 Body is a web/Node stream hybrid; Node Readable is what Express pipes.
      return body as Readable;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async remove(storageKey: string): Promise<void> {
    if (!SAFE_KEY.test(storageKey)) return;

    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
        }),
      );
    } catch (error) {
      if (isNotFound(error)) return;
      throw error;
    }
  }

  async size(storageKey: string): Promise<number | null> {
    if (!SAFE_KEY.test(storageKey)) return null;

    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
        }),
      );
      return typeof response.ContentLength === 'number' ? response.ContentLength : null;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }
}
