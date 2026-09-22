import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The API binds no ports in tests (supertest uses an ephemeral server) but
    // Prisma holds a pool, so a single fork keeps connection use predictable.
    // Integration tests exercise a real database and real Argon2id hashing.
    // Both are deliberately slow - a fast password hash would be a weak one -
    // and the database may be a remote managed Postgres, so the default 5s is
    // far too tight. Raised rather than mocked: mocking the hash or the
    // database would remove exactly the behaviour these tests verify.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: 'forks',
    // Vitest 4 replaced poolOptions with top-level concurrency controls.
    fileParallelism: false,
    maxWorkers: 1,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      LOG_PRETTY: 'false',
      // Phase 6. The assistant is ON in tests but backed by the MOCK provider,
      // so the whole service layer - prompts, validation, safety screening,
      // persistence - is exercised without a network call or an API key. A
      // suite that mocked the service instead would prove nothing about the
      // validation it skipped.
      AI_ENABLED: 'true',
      AI_PROVIDER: 'mock',
      // Automatic processing is off so Phase 5's submission tests behave
      // exactly as they did before Phase 6 existed, and so no background
      // worker writes rows after a suite has torn its fixtures down. The AI
      // suite drives the queue explicitly to test that path.
      AI_AUTO_PROCESS_ON_SUBMIT: 'false',
      // Phase 8. Outbound messaging is ON in tests but backed by a capturing
      // provider injected per test, so the real service layer - templates, the
      // variable allow-list, consent checks, idempotency, delivery state - is
      // exercised without a mail server. A suite that mocked the service would
      // prove nothing about the rendering it skipped.
      NOTIFICATIONS_ENABLED: 'true',
      EMAIL_PROVIDER: 'log',
      EMAIL_FROM: 'noreply@example.test',
    },
  },
});
