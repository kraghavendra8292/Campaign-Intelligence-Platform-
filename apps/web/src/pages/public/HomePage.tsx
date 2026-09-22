import { Badge, Button, Card, CardBody, CardHeader } from '@rk/ui';
import { Link } from 'react-router-dom';
import { ApiHealthCard } from '../../features/health/ApiHealthCard';

/**
 * Public landing placeholder.
 *
 * Establishes the visual language of the reference design (dark navy hero,
 * green primary action, rounded cards) without implementing any Phase 3
 * candidate content.
 */
export function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero__inner">
          <Badge tone="success" withDot>
            Foundation ready
          </Badge>
          <h1 className="hero__title">RK Campaign Intelligence Platform</h1>
          <p className="hero__subtitle">
            The technical foundation for a multi-tenant campaign and public-engagement platform.
            Candidate profiles, verified work, QR campaigns, citizen feedback and issue reporting
            are delivered in later phases.
          </p>
          <div className="hero__actions">
            <Button variant="primary" size="lg" onClick={scrollToStatus}>
              View platform status
            </Button>
            <Link to="/admin">
              <Button variant="secondary" size="lg">
                Campaign console
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section id="status" className="section">
        <div className="section__inner">
          <h2 className="section__title">Platform status</h2>
          <div className="grid grid--2">
            <ApiHealthCard />

            <Card>
              <CardHeader
                title="Phase 1 scope"
                description="What this foundation deliberately does and does not include."
              />
              <CardBody>
                <ul className="checklist">
                  <li>Monorepo, GraphQL API, PostgreSQL and Prisma</li>
                  <li>Design tokens and reusable UI primitives</li>
                  <li>Logging, error handling and security foundations</li>
                  <li className="checklist__item--muted">
                    No authentication, CMS, QR, feedback, issues or AI yet
                  </li>
                </ul>
              </CardBody>
            </Card>
          </div>
        </div>
      </section>
    </>
  );
}

function scrollToStatus(): void {
  document.getElementById('status')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
