import { EVIDENCE_TYPE_LABELS, type EvidenceType } from '@rk/types';
import { apiBaseUrl } from '../../config/env';
import type { PublicEvidence } from '../../features/work/workQueries';
import { formatDate } from '../../lib/format';

/**
 * Public evidence: the documents and photographs behind a claim.
 *
 * SEPARATED INTO DOCUMENTS AND PHOTOGRAPHS, and the photographs into before /
 * during / after, because those groupings are the whole reason a reader opens
 * this section. A flat list of twelve thumbnails answers nothing.
 *
 * THE BEFORE/AFTER PAIRING IS NEVER INFERRED. An image appears under "Before"
 * only because a staff member classified it as `BEFORE_PHOTO`. Guessing the
 * pairing from upload order or filename would let the page make a claim about
 * cause and effect that nobody asserted - two photographs under those labels is
 * an argument, not a gallery.
 *
 * Documents are links, never inline frames. The API serves them with
 * `Content-Disposition: attachment`, so embedding one would produce a broken
 * viewer; more importantly a PDF rendered inside the site's own origin is a
 * script-execution surface the site does not need.
 */

const SEQUENCE: Array<{ type: EvidenceType; label: string }> = [
  { type: 'BEFORE_PHOTO', label: 'Before' },
  { type: 'DURING_PHOTO', label: 'During' },
  { type: 'AFTER_PHOTO', label: 'After' },
];

export function EvidenceGallery({
  evidence,
  heading = 'Evidence',
}: {
  evidence: PublicEvidence[];
  heading?: string;
}) {
  if (evidence.length === 0) return null;

  const images = evidence.filter((item) => item.isImage);
  const documents = evidence.filter((item) => !item.isImage);

  const sequenced = SEQUENCE.map((group) => ({
    ...group,
    items: images.filter((item) => item.evidenceType === group.type),
  })).filter((group) => group.items.length > 0);

  const otherImages = images.filter(
    (item) => !SEQUENCE.some((group) => group.type === item.evidenceType),
  );

  return (
    <section className="evidence" aria-labelledby="evidence-heading">
      <h2 id="evidence-heading">{heading}</h2>
      <p className="evidence__intro">
        Supporting records published by this campaign. Each item states its source so it can be
        checked independently.
      </p>

      {documents.length > 0 ? (
        <ul className="evidence__documents">
          {documents.map((item) => (
            <EvidenceDocument key={item.id} item={item} />
          ))}
        </ul>
      ) : null}

      {sequenced.length > 0 ? (
        <div className="evidence__sequence">
          {sequenced.map((group) => (
            <div key={group.type} className="evidence__sequence-group">
              <h3>{group.label}</h3>
              <div className="evidence__images">
                {group.items.map((item) => (
                  <EvidencePhoto key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {otherImages.length > 0 ? (
        <div className="evidence__sequence-group">
          <h3>Photographs</h3>
          <div className="evidence__images">
            {otherImages.map((item) => (
              <EvidencePhoto key={item.id} item={item} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function EvidenceDocument({ item }: { item: PublicEvidence }) {
  return (
    <li className="evidence__document">
      <span className="evidence__type">{EVIDENCE_TYPE_LABELS[item.evidenceType]}</span>
      <span className="evidence__title">{item.title}</span>
      {item.description ? <p className="evidence__description">{item.description}</p> : null}

      {/* Provenance. Shown only when present - a blank "Reference: —" row
          suggests the field was meant to be filled and somebody forgot. */}
      <dl className="evidence__meta">
        {item.issuingAuthority ? (
          <>
            <dt>Issued by</dt>
            <dd>{item.issuingAuthority}</dd>
          </>
        ) : null}
        {item.referenceNumber ? (
          <>
            <dt>Reference</dt>
            <dd>{item.referenceNumber}</dd>
          </>
        ) : null}
        {item.issuedOn ? (
          <>
            <dt>Dated</dt>
            <dd>{formatDate(item.issuedOn)}</dd>
          </>
        ) : null}
        {item.sourceNote ? (
          <>
            <dt>Source</dt>
            <dd>{item.sourceNote}</dd>
          </>
        ) : null}
      </dl>

      {item.documentId ? (
        <a
          className="evidence__link"
          href={`${apiBaseUrl}/media/${item.documentId}`}
          // Opens outside the app. `noreferrer` as well as `noopener` because
          // the target is a download endpoint that has no need to know which
          // page the reader came from.
          target="_blank"
          rel="noopener noreferrer"
        >
          Open {item.documentName ?? 'document'}
        </a>
      ) : null}
    </li>
  );
}

function EvidencePhoto({ item }: { item: PublicEvidence }) {
  return (
    <figure className="evidence__photo">
      <img
        src={`${apiBaseUrl}/media/${item.documentId}`}
        // The caption is the alt text when there is one. An empty alt is
        // correct for a decorative image, but evidence is never decorative -
        // a reader using a screen reader needs to know what was photographed.
        alt={item.title}
        loading="lazy"
      />
      <figcaption>
        <span className="evidence__title">{item.title}</span>
        {item.capturedOn || item.capturedLocation ? (
          <span className="evidence__photo-meta">
            {[item.capturedLocation, item.capturedOn ? formatDate(item.capturedOn) : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
