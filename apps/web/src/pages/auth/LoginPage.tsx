import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, CardBody, CardHeader, ErrorState, Field, Input } from '@rk/ui';
import { ApiError, useAuth } from '../../features/auth/AuthProvider';

interface LocationState {
  from?: string;
}

/**
 * Sign-in screen.
 *
 * The form surfaces whatever message the API returned, unchanged. That message
 * is deliberately generic ("Invalid email or password.") for every credential
 * failure, so this page cannot be used to discover which addresses have
 * accounts - a real concern for a campaign platform, where staff membership is
 * itself sensitive.
 */
export function LoginPage() {
  const { status, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const destination = (location.state as LocationState | null)?.from ?? '/admin';

  if (status === 'authenticated') {
    return <Navigate to={destination} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await signIn(email, password);
      void navigate(destination, { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Sign-in failed. Please check your connection and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <CardHeader title="Sign in" description="Campaign console access for authorised staff." />
        <CardBody>
          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <Field htmlFor="email" label="Email address" required>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={submitting}
              />
            </Field>

            <Field htmlFor="password" label="Password" required>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
              />
            </Field>

            {error ? <ErrorState title="Could not sign in" description={error} /> : null}

            <Button type="submit" variant="primary" fullWidth isLoading={submitting}>
              Sign in
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
