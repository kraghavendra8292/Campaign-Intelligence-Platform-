import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { TENANT_HEADER } from '@rk/config';
import { ISSUE_LIMITS } from '@rk/types';
import type { ApiEnv } from '../../../config/env';
import { AppError } from '../../../errors/AppError';
import { prisma } from '../../../database/prisma';
import { getAttemptLimiter } from '../../auth/rateLimiter';
import { authContextService } from '../../auth/authContext.service';
import { authorizationService } from '../../auth/authorization.service';
import { publicTenantService } from '../../content/public/publicTenant.service';
import { validateUpload } from '../../content/media/fileValidation';
import { getMediaStorage } from '../../content/media/storage';

/**
 * Issue attachments.
 *
 *   POST /public/issue-attachments   anonymous, rate limited, tenant by slug
 *   GET  /issue-attachments/:id      authenticated, ISSUE_ATTACHMENT_READ
 *
 * TWO ROUTES, TWO OPPOSITE AUDIENCES, AND THAT IS THE POINT. Phase 3's media
 * router serves images to the world because they back `<img>` on a public site.
 * These files are photographs of somebody's street - sometimes of their home -
 * attached to a complaint they may have made anonymously. They are never
 * publicly reachable, and the download route is the only way to read one.
 *
 * WHY UPLOAD IS A SEPARATE STEP FROM SUBMISSION
 * A 5 MB photograph cannot travel through a GraphQL mutation: the body limit is
 * 256 KB, and base64 would inflate it further. So the browser uploads first and
 * receives an id plus a CLAIM TOKEN, then names both in `submitIssue`. The token
 * is what stops one anonymous visitor stapling another visitor's photograph to
 * their own report by guessing an id.
 */

function headerValue(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Buffered in memory, never written to a temp directory.
 *
 * Validation inspects the bytes before anything is persisted, so a rejected
 * upload never touches the filesystem and cannot leave a partial file behind.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ISSUE_LIMITS.maxDocumentBytes, files: 1 },
});

/**
 * Phase 5's own size ceiling, tighter than Phase 3's.
 *
 * The shared validator allows 8 MB images and 20 MB PDFs, which suits a staff
 * member uploading a press photograph over an office connection. A citizen is
 * on mobile data next to a pothole, so the limit here is 5 MB and 10 MB - and
 * it is enforced AFTER the magic-byte check, because only then is the real type
 * known rather than merely claimed.
 */
function assertCitizenSizeLimit(kind: 'IMAGE' | 'DOCUMENT', sizeBytes: number): void {
  const limit = kind === 'IMAGE' ? ISSUE_LIMITS.maxImageBytes : ISSUE_LIMITS.maxDocumentBytes;

  if (sizeBytes > limit) {
    throw AppError.validation(
      `That file is too large. Please keep ${kind === 'IMAGE' ? 'photos' : 'documents'} under ${Math.round(limit / (1024 * 1024))} MB.`,
      { details: { field: 'file', limit } },
    );
  }
}

export function createIssueAttachmentRouter(env: ApiEnv): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // Public upload
  // -------------------------------------------------------------------------
  router.post(
    '/public/issue-attachments',
    (req: Request, res: Response, next: NextFunction) => {
      upload.single('file')(req, res, (error: unknown) => {
        if (error) {
          const code = (error as { code?: string }).code;
          if (code === 'LIMIT_FILE_SIZE') {
            next(AppError.validation('That file is too large.'));
            return;
          }
          next(AppError.validation('That file could not be read. Please try another.'));
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Shed abuse before any validation or storage work. Uploads are the
        // most expensive thing an anonymous caller can ask for.
        const limiter = getAttemptLimiter();
        const attempt = await limiter.consume(
          `issue-upload:${req.ip ?? 'unknown'}`,
          env.ISSUE_UPLOAD_MAX_PER_WINDOW,
          env.ISSUE_SUBMIT_WINDOW_MS,
        );

        if (!attempt.allowed) {
          throw AppError.rateLimited(
            'You have uploaded several files already. Please try again in a little while.',
          );
        }

        const file = req.file;
        if (!file) {
          throw AppError.validation('Please choose a file to attach.', {
            details: { field: 'file' },
          });
        }

        const body = req.body as { organizationSlug?: unknown } | undefined;

        // The tenant comes from the public site being viewed, exactly as it
        // does for the submission itself.
        const tenant = await publicTenantService.resolve({
          organizationSlug:
            typeof body?.organizationSlug === 'string' ? body.organizationSlug : null,
          headerSlug: headerValue(req, 'x-organization-slug'),
          host: headerValue(req, 'host'),
        });

        // Content decides the type. The declared MIME and the filename are both
        // attacker-controlled and are cross-checked, never trusted.
        const validated = validateUpload({
          buffer: file.buffer,
          declaredMimeType: file.mimetype,
          originalName: file.originalname,
        });

        assertCitizenSizeLimit(validated.kind, file.buffer.byteLength);

        // The storage key is generated; the client filename is display text and
        // never reaches a path. `../../../../etc/passwd` becomes a label.
        const stored = await getMediaStorage().put({
          organizationId: tenant.organizationId,
          filename: file.originalname,
          content: file.buffer,
          contentType: validated.mimeType,
        });

        const claimToken = randomBytes(24).toString('base64url');

        const attachment = await prisma.issueAttachment.create({
          data: {
            organizationId: tenant.organizationId,
            storageKey: stored.storageKey,
            originalName: file.originalname.slice(0, 255),
            mimeType: validated.mimeType,
            sizeBytes: stored.sizeBytes,
            checksumSha256: stored.checksumSha256,
            claimToken,
          },
          select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
        });

        res.status(201).json({
          attachment: {
            id: attachment.id,
            // Returned exactly once, to whoever uploaded the file. It is the
            // only proof of authorship an anonymous uploader has.
            claimToken,
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Authenticated download
  // -------------------------------------------------------------------------
  router.get('/issue-attachments/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Same credential path as GraphQL, so a revoked session cannot read an
      // attachment even though this is not a resolver.
      const auth = await authContextService.resolve({
        authorizationHeader: headerValue(req, 'authorization'),
        organizationHeader: headerValue(req, TENANT_HEADER),
        correlationId: req.correlationId,
      });

      const actor = authorizationService.requirePermission(auth, 'ISSUE_ATTACHMENT_READ');
      const { organizationId } = authorizationService.requireOrganization(actor);

      const attachmentId = String(req.params.id ?? '');

      const attachment = await prisma.issueAttachment.findFirst({
        // Tenant in the WHERE clause, so an id from another organisation
        // simply does not match. NOT_FOUND rather than FORBIDDEN, so the
        // response cannot confirm that an attachment exists elsewhere.
        where: { id: attachmentId, organizationId },
        select: { storageKey: true, mimeType: true, originalName: true, issueId: true },
      });

      // An unclaimed upload has no issue yet and belongs to nobody; it must
      // not be readable through the admin route either.
      if (!attachment || !attachment.issueId) {
        throw AppError.notFound('That attachment is not available.');
      }

      const stream = await getMediaStorage().createReadStream(attachment.storageKey);
      if (!stream) throw AppError.notFound('That attachment is not available.');

      res.setHeader('Content-Type', attachment.mimeType);
      // `attachment`, not `inline`: the browser saves the file rather than
      // rendering it in the site's own origin, which removes any question of
      // a crafted file executing there.
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${sanitizeFilename(attachment.originalName)}"`,
      );
      // Private and short-lived: this is personal data behind a permission,
      // and it must not sit in a shared proxy cache.
      res.setHeader('Cache-Control', 'private, max-age=60');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

/**
 * Makes a filename safe to put in a Content-Disposition header.
 *
 * Quotes and control characters would let a crafted name break out of the
 * header value; anything outside a conservative set is replaced rather than
 * escaped, because the name is only a convenience for the person saving it.
 */
function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 120);
  return cleaned.length > 0 ? cleaned : 'attachment';
}
