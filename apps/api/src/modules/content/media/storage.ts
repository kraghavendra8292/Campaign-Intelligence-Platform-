import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { getEnv } from '../../../config/env';

/**
 * Object storage abstraction.
 *
 * The interface exists so business logic never learns where bytes live. Phase 3
 * ships a local-disk adapter because no object store is provisioned yet; an
 * S3-compatible adapter implements the same four methods and nothing else
 * changes. The seam is the `storageKey` string - opaque to every caller.
 *
 * PRODUCTION REQUIREMENT: local disk does not survive a container restart and
 * is not shared between instances. An S3-compatible adapter is required before
 * running more than one API replica or deploying to ephemeral infrastructure.
 */
export interface StoredObject {
  readonly storageKey: string;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
}

export interface MediaStorage {
  /** Persists bytes and returns the key needed to read them back. */
  put(input: { organizationId: string; filename: string; content: Buffer }): Promise<StoredObject>;
  /** Opens a stream for serving. Returns null when the object is gone. */
  createReadStream(storageKey: string): Promise<Readable | null>;
  /** Removes an object. Missing objects are not an error. */
  remove(storageKey: string): Promise<void>;
  /** Byte length, used to verify an object still matches its metadata row. */
  size(storageKey: string): Promise<number | null>;
}

/**
 * Keys are generated, never derived from the client filename.
 *
 * A filename is attacker-controlled: `../../etc/passwd` or a name with a null
 * byte becomes a path traversal the moment it is joined onto a directory. The
 * key is a UUID under a per-tenant prefix, so the original name is only ever
 * display text.
 */
function buildStorageKey(organizationId: string, filename: string): string {
  const extension = extractSafeExtension(filename);
  return `${organizationId}/${randomUUID()}${extension}`;
}

/** Takes at most one short alphanumeric extension, or none at all. */
function extractSafeExtension(filename: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(filename.trim());
  return match ? `.${match[1]?.toLowerCase()}` : '';
}

/** Rejects any key that is not exactly the shape `put` produces. */
const SAFE_KEY = /^[0-9a-f-]{36}\/[0-9a-f-]{36}(\.[a-z0-9]{1,8})?$/;

export class LocalDiskStorage implements MediaStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async put(input: {
    organizationId: string;
    filename: string;
    content: Buffer;
  }): Promise<StoredObject> {
    const storageKey = buildStorageKey(input.organizationId, input.filename);
    const target = this.resolveKey(storageKey);

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, input.content);

    return {
      storageKey,
      sizeBytes: input.content.byteLength,
      checksumSha256: createHash('sha256').update(input.content).digest('hex'),
    };
  }

  async createReadStream(storageKey: string): Promise<Readable | null> {
    const target = this.safeResolve(storageKey);
    if (!target) return null;

    try {
      await stat(target);
    } catch {
      return null;
    }

    return createReadStream(target);
  }

  async remove(storageKey: string): Promise<void> {
    const target = this.safeResolve(storageKey);
    if (!target) return;
    await rm(target, { force: true });
  }

  async size(storageKey: string): Promise<number | null> {
    const target = this.safeResolve(storageKey);
    if (!target) return null;

    try {
      return (await stat(target)).size;
    } catch {
      return null;
    }
  }

  /**
   * Resolves a key to a path, or null if it is not a key this adapter wrote.
   *
   * Two independent checks: the key must match the generated shape, and the
   * resolved path must still be inside the storage root. Either alone would
   * probably suffice; together they mean a traversal needs both to fail.
   */
  private safeResolve(storageKey: string): string | null {
    if (!SAFE_KEY.test(storageKey)) return null;

    const target = this.resolveKey(storageKey);
    return target.startsWith(this.root) ? target : null;
  }

  private resolveKey(storageKey: string): string {
    return resolve(join(this.root, storageKey));
  }
}

let storage: MediaStorage | null = null;

export function getMediaStorage(): MediaStorage {
  storage ??= new LocalDiskStorage(getEnv().MEDIA_STORAGE_PATH);
  return storage;
}

/** Swap point for an S3 adapter, and for test isolation. */
export function setMediaStorage(next: MediaStorage): void {
  storage = next;
}
