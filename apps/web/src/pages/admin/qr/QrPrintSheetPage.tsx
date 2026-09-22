import { Link, useParams } from 'react-router-dom';
import { Button } from '@rk/ui';
import { useAuth } from '../../../features/auth/AuthProvider';
import { useAdminQuery } from '../../../features/admin/adminApi';
import { QR_CODE_DETAIL, type QrCodeRow } from '../../../features/qr/qrQueries';
import { QrBoundary, QrEmptyState } from '../../../components/qr/QrShell';

/**
 * Print-ready sheet for one QR code.
 *
 * Deliberately NOT a design editor. It is one page, laid out for A4, that a
 * field coordinator can send straight to a printer - the symbol at a scannable
 * size, the organisation name, what the code is for, and the human-readable
 * identifier underneath so a damaged symbol can still be traced.
 *
 * The SVG is embedded rather than the PNG: vector output stays sharp at
 * whatever size the sheet is scaled to, which is the whole point of printing.
 *
 * A `@media print` block in `qr.css` hides the console chrome, so the browser's
 * own print dialog produces a clean sheet with no extra tooling.
 */
export function QrPrintSheetPage() {
  const { campaignId = '', qrId = '' } = useParams();
  const { viewer } = useAuth();

  const { state, refetch } = useAdminQuery<{ qrCode: QrCodeRow }>(QR_CODE_DETAIL, { id: qrId });

  return (
    <div className="cms-page print-page">
      <div className="print-page__toolbar">
        <Link to={`/admin/qr-campaigns/${campaignId}/qr/${qrId}`}>
          <Button variant="secondary">Back to QR code</Button>
        </Link>
        <Button variant="primary" onClick={() => window.print()}>
          Print
        </Button>
      </div>

      <QrBoundary state={state} refetch={refetch}>
        {(data) => {
          const code = data.qrCode;

          if (!code.image) {
            return (
              <QrEmptyState
                title="You do not have permission to print this QR code."
                message="Downloading printable assets requires the QR download permission. Ask a campaign administrator."
              />
            );
          }

          return (
            <article className="print-sheet">
              <header className="print-sheet__header">
                <span className="print-sheet__mark" aria-hidden="true">
                  RK
                </span>
                <p className="print-sheet__org">{viewer?.organization?.name ?? ''}</p>
              </header>

              <h1 className="print-sheet__title">{code.name}</h1>
              <p className="print-sheet__campaign">{code.campaign.name}</p>

              {/*
                The API returns trusted SVG markup that it generated itself from
                a server-side library - it is not user input and never passes
                through a content field. It is injected as markup rather than as
                an <img> so the printer scales the vector rather than a bitmap.
              */}
              <div
                className="print-sheet__symbol"
                dangerouslySetInnerHTML={{ __html: code.image.svg }}
              />

              <p className="print-sheet__code">{code.code}</p>

              {code.description ? (
                <p className="print-sheet__description">{code.description}</p>
              ) : null}

              <footer className="print-sheet__footer">
                <p>Scan to visit the campaign website.</p>
                <p className="print-sheet__url">{code.image.scanUrl}</p>
                {code.placement ? (
                  <p className="print-sheet__placement">Placement: {code.placement}</p>
                ) : null}
              </footer>
            </article>
          );
        }}
      </QrBoundary>
    </div>
  );
}
