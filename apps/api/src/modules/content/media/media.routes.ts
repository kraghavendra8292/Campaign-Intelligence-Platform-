import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { authorizationService } from '../../auth/authorization.service';
import { authContextService } from '../../auth/authContext.service';
import { AppError } from '../../../errors/AppError';
import { TENANT_HEADER } from '@rk/config';
import { mediaService } from './media.service';
import { getMediaStorage } from './storage';
import { UPLOAD_LIMITS } from './fileValidation';

/**
 * Media upload and delivery.
 *
 * REST rather than GraphQL because multipart uploads through GraphQL require a
 * non-standard protocol extension, and a plain `POST` with a `FormData` body is
 * what every browser and HTTP client already does well.
 *
 *   POST /media/upload   authenticated, needs MEDIA_CREATE
 *   GET  /media/:id      public - it backs <img src> on the public site
 */

/**
 * Files are buffered in memory, not written to a temp directory.
 *
 * Validation inspects the bytes before anything is persisted, so a rejected
 * upload never touches the filesystem and cannot leave a partial file behind.
 * The size ceiling keeps the memory cost bounded.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_LIMITS.maxAnyBytes, files: 1 },
});

function headerValue(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
}

export function createMediaRouter(): Router {
  const router = Router();

  router.post(
    '/media/upload',
    (req: Request, res: Response, next: NextFunction) => {
      upload.single('file')(req, res, (error: unknown) => {
        // Multer's own errors are surfaced as ordinary validation failures
        // rather than leaking its internal error shape.
        if (error) {
          const code = (error as { code?: string }).code;
          if (code === 'LIMIT_FILE_SIZE') {
            next(AppError.validation('That file is too large.'));
            return;
          }
          next(AppError.validation('The upload could not be read.'));
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // The upload route reuses the same credential path as GraphQL, so a
        // revoked session cannot upload even though this is not a resolver.
        const auth = await authContextService.resolve({
          authorizationHeader: headerValue(req, 'authorization'),
          organizationHeader: headerValue(req, TENANT_HEADER),
          correlationId: req.correlationId,
        });

        const actor = authorizationService.requireAuth(auth);
        const file = req.file;

        if (!file) {
          throw AppError.validation('No file was supplied.', { details: { field: 'file' } });
        }

        const altTextRaw = (req.body as { altText?: unknown } | undefined)?.altText;

        const asset = await mediaService.upload(
          actor,
          {
            buffer: file.buffer,
            originalName: file.originalname,
            declaredMimeType: file.mimetype,
            ...(typeof altTextRaw === 'string' ? { altText: altTextRaw } : {}),
          },
          {
            ipAddress: req.ip ?? null,
            userAgent: headerValue(req, 'user-agent') ?? null,
            correlationId: req.correlationId,
          },
        );

        res.status(201).json({ media: asset });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Serves a stored file.
   *
   * Public for published content - this is the `src` of images on the public
   * site. Three hardening measures apply:
   *
   *  - `Content-Type` is the type recorded at upload after signature checking,
   *    never one echoed from the request, so a file cannot be served as
   *    something it is not;
   *  - documents are sent as attachments, so a PDF cannot render inline within
   *    the site's own origin;
   *  - PHASE 9: an asset used only as private evidence is NOT served
   *    anonymously. `resolveForServing` decides that; see its comment for why
   *    the rule is drawn where it is.
   *
   * A restricted asset returns the SAME 404 as a missing one. Answering 401
   * would confirm that a document exists at that id, which is exactly what
   * somebody enumerating ids is trying to learn - and the whole point of
   * private evidence is that its existence is not public either.
   */
  router.get('/media/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Express 5 types a wildcard param as string | string[]; narrow it
      // rather than trusting the shape.
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!id) throw AppError.notFound('Media not found.');

      const asset = await mediaService.resolveForServing(id);

      if (!asset || asset.kind === 'VIDEO_LINK') {
        throw AppError.notFound('Media not found.');
      }

      if (asset.restricted) {
        // Resolved through the same credential path as GraphQL, so a revoked
        // session cannot read evidence even though this is not a resolver.
        const auth = await authContextService
          .resolve({
            authorizationHeader: headerValue(req, 'authorization'),
            organizationHeader: headerValue(req, TENANT_HEADER),
            correlationId: req.correlationId,
          })
          .catch(() => null);

        const permitted =
          auth !== null &&
          auth.organizationId === asset.organizationId &&
          authorizationService.can(auth, 'EVIDENCE_READ');

        if (!permitted) throw AppError.notFound('Media not found.');
      }

      const stream = await getMediaStorage().createReadStream(asset.storageKey);
      if (!stream) throw AppError.notFound('Media not found.');

      res.setHeader('Content-Type', asset.mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (asset.restricted) {
        // Never cached by a shared cache. The response depends on who asked,
        // and a CDN or proxy that stored it would serve a private document to
        // the next anonymous request for the same URL.
        res.setHeader('Cache-Control', 'private, no-store');
      } else {
        // Content is immutable: a new upload gets a new id, so it can be cached
        // aggressively without a stale-image problem.
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }

      if (asset.kind === 'DOCUMENT') {
        const safeName = asset.originalName.replace(/["\r\n]/g, '');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      }

      stream.on('error', () => {
        if (!res.headersSent) res.status(404).end();
        else res.end();
      });

      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
