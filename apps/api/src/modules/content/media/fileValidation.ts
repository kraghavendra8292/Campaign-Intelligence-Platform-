import { AppError } from '../../../errors/AppError';

/**
 * Upload validation.
 *
 * The rule that matters: **the declared MIME type is not evidence.** A browser
 * sends whatever `Content-Type` the client chooses, and the extension is just
 * text. So each allowed format is confirmed by inspecting its magic bytes, and
 * an upload is accepted only when the sniffed type, the declared type and the
 * extension all agree.
 *
 * SVG is deliberately excluded despite being an image: it is an XML document
 * that can carry `<script>`, and serving one from the site's own origin is
 * stored XSS.
 */

export interface ValidatedUpload {
  readonly kind: 'IMAGE' | 'DOCUMENT';
  readonly mimeType: string;
  readonly extension: string;
  readonly width?: number;
  readonly height?: number;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024; // 20 MB

interface FormatSpec {
  readonly kind: 'IMAGE' | 'DOCUMENT';
  readonly mimeType: string;
  readonly extensions: readonly string[];
  /** Confirms the bytes really are this format. */
  readonly matches: (buffer: Buffer) => boolean;
}

function startsWith(buffer: Buffer, bytes: readonly number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

const FORMATS: readonly FormatSpec[] = [
  {
    kind: 'IMAGE',
    mimeType: 'image/jpeg',
    extensions: ['jpg', 'jpeg'],
    matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  },
  {
    kind: 'IMAGE',
    mimeType: 'image/png',
    extensions: ['png'],
    matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    kind: 'IMAGE',
    mimeType: 'image/webp',
    extensions: ['webp'],
    // "RIFF" .... "WEBP"
    matches: (b) =>
      startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8),
  },
  {
    kind: 'IMAGE',
    mimeType: 'image/gif',
    extensions: ['gif'],
    matches: (b) => startsWith(b, [0x47, 0x49, 0x46, 0x38]),
  },
  {
    kind: 'DOCUMENT',
    mimeType: 'application/pdf',
    extensions: ['pdf'],
    matches: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]),
  },
];

/**
 * Validates an upload by content, not by claim.
 *
 * Order is deliberate: size first (cheapest, and bounds everything after it),
 * then signature, then cross-checks against what the client claimed.
 */
export function validateUpload(input: {
  buffer: Buffer;
  declaredMimeType: string;
  originalName: string;
}): ValidatedUpload {
  const { buffer, declaredMimeType, originalName } = input;

  if (buffer.byteLength === 0) {
    throw AppError.validation('The uploaded file is empty.', { details: { field: 'file' } });
  }

  const format = FORMATS.find((candidate) => candidate.matches(buffer));

  if (!format) {
    throw AppError.validation(
      'Unsupported file type. Allowed: JPEG, PNG, WebP, GIF images and PDF documents.',
      { details: { field: 'file' } },
    );
  }

  const limit = format.kind === 'IMAGE' ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
  if (buffer.byteLength > limit) {
    throw AppError.validation(
      `File is too large. Maximum ${Math.round(limit / (1024 * 1024))} MB for this type.`,
      { details: { field: 'file', limit } },
    );
  }

  // The declared type must agree with the bytes. A mismatch is either a
  // misconfigured client or an attempt to have the file served as something it
  // is not, and neither should be silently accepted.
  const declared = declaredMimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (declared && declared !== format.mimeType) {
    throw AppError.validation('The file contents do not match its declared type.', {
      details: { field: 'file' },
    });
  }

  const extension = extractExtension(originalName);
  if (extension && !format.extensions.includes(extension)) {
    throw AppError.validation('The file extension does not match its contents.', {
      details: { field: 'file' },
    });
  }

  const dimensions = format.kind === 'IMAGE' ? readImageDimensions(buffer, format.mimeType) : null;

  return {
    kind: format.kind,
    mimeType: format.mimeType,
    extension: extension ?? format.extensions[0] ?? '',
    ...(dimensions ?? {}),
  };
}

function extractExtension(filename: string): string | null {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(filename.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

/**
 * Reads intrinsic image dimensions from the header.
 *
 * Stored so the public site can reserve the right box before the image loads,
 * which is what prevents layout shift. Parsed here rather than with an image
 * library because only the header is needed - decoding attacker-supplied pixels
 * is a larger attack surface than reading a few integers.
 */
function readImageDimensions(
  buffer: Buffer,
  mimeType: string,
): { width: number; height: number } | null {
  try {
    if (mimeType === 'image/png' && buffer.length >= 24) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }

    if (mimeType === 'image/gif' && buffer.length >= 10) {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }

    if (mimeType === 'image/jpeg') {
      return readJpegDimensions(buffer);
    }

    if (mimeType === 'image/webp') {
      return readWebpDimensions(buffer);
    }
  } catch {
    // Dimensions are an optimisation, never a validity requirement.
    return null;
  }

  return null;
}

/** Walks JPEG segments to the start-of-frame marker holding the size. */
function readJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2;

  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    if (marker === undefined) return null;

    // SOF0..SOF15, excluding the non-frame markers in that range.
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isStartOfFrame) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }

    offset += 2 + buffer.readUInt16BE(offset + 2);
  }

  return null;
}

/** Handles the lossy (VP8), lossless (VP8L) and extended (VP8X) variants. */
function readWebpDimensions(buffer: Buffer): { width: number; height: number } | null {
  const chunk = buffer.subarray(12, 16).toString('ascii');

  if (chunk === 'VP8 ' && buffer.length >= 30) {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }

  if (chunk === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }

  if (chunk === 'VP8X' && buffer.length >= 30) {
    const width = 1 + (buffer.readUIntLE(24, 3) & 0xffffff);
    const height = 1 + (buffer.readUIntLE(27, 3) & 0xffffff);
    return { width, height };
  }

  return null;
}

export const UPLOAD_LIMITS = {
  maxImageBytes: MAX_IMAGE_BYTES,
  maxDocumentBytes: MAX_DOCUMENT_BYTES,
  /** Multer's ceiling. The per-type limit above is the real check. */
  maxAnyBytes: MAX_DOCUMENT_BYTES,
} as const;
