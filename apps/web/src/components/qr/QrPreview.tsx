import { useState } from 'react';
import { Button } from '@rk/ui';

/**
 * QR preview, download and copy.
 *
 * The symbol is rendered by the API and arrives as data on an already
 * authorised query, so this component never fetches anything itself - which is
 * also why the admin's in-memory access token is enough. An `<img src>` to a
 * protected endpoint would carry no credential.
 *
 * Downloads are built in the browser from the data already in hand: a Blob and
 * an object URL. No second round trip, and no download endpoint to authorise.
 */

export interface QrImage {
  readonly scanUrl: string;
  readonly pngDataUrl: string;
  readonly svg: string;
}

/** Turns a base64 data URL into a Blob, so it can be saved as a real file. */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(header ?? '')?.[1] ?? 'application/octet-stream';
  const binary = atob(payload ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Released on the next tick: revoking synchronously can cancel the download
  // in some browsers before it has started reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function QrPreview({
  image,
  code,
  name,
  compact,
}: {
  image: QrImage;
  code: string;
  name: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyScanUrl(): Promise<void> {
    try {
      await navigator.clipboard.writeText(image.scanUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied or unavailable over plain HTTP. The URL
      // is visible below regardless, so the user can still select it by hand.
      setCopied(false);
    }
  }

  return (
    <div className={`qr-preview${compact ? ' qr-preview--compact' : ''}`}>
      <img
        className="qr-preview__image"
        src={image.pngDataUrl}
        alt={`QR code ${code} for ${name}`}
        width={compact ? 140 : 240}
        height={compact ? 140 : 240}
      />

      <div className="qr-preview__meta">
        <p className="qr-preview__code">{code}</p>
        <p className="qr-preview__url" title={image.scanUrl}>
          {image.scanUrl}
        </p>

        {compact ? null : (
          <div className="qr-preview__actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => saveBlob(dataUrlToBlob(image.pngDataUrl), `${code}.png`)}
            >
              Download PNG
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                saveBlob(new Blob([image.svg], { type: 'image/svg+xml' }), `${code}.svg`)
              }
            >
              Download SVG
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void copyScanUrl()}>
              {copied ? 'Copied' : 'Copy URL'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
