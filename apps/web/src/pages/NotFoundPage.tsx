import { Link } from 'react-router-dom';
import { Button } from '@rk/ui';

export function NotFoundPage() {
  return (
    <section className="section">
      <div className="section__inner centered">
        <p className="not-found__code">404</p>
        <h1 className="section__title">Page not found</h1>
        <p className="prose">The page you requested does not exist.</p>
        <Link to="/">
          <Button variant="primary">Back to home</Button>
        </Link>
      </div>
    </section>
  );
}
