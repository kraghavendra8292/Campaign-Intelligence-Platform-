import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { ApolloServer } from '@apollo/server';
import { DEFAULT_ISSUE_CATEGORIES } from '@rk/types';
import { createApp } from '../app';
import type { GraphQLContext } from '../graphql/context/index';
import { prisma } from '../database/prisma';
import {
  addMembership,
  cleanupFixtures,
  createTenant,
  createUser,
  databaseAvailable,
  type TestTenant,
  type TestUser,
} from './helpers/fixtures';
import { gql, login } from './helpers/graphqlClient';
import { generateReferenceNumber } from '../modules/issues/shared/issueGuards';
import { InMemoryAttemptLimiter, setAttemptLimiter } from '../modules/auth/rateLimiter';
import {
  hashTrackingToken,
  issueTrackingToken,
} from '../modules/communication/shared/trackingToken';
import {
  buildIdempotencyKey,
  notificationService,
} from '../modules/communication/notification.service';
import {
  renderNotification,
  isAllowedTemplateVariable,
  TemplateRenderError,
} from '../modules/communication/templates/index';
import { redactEmail, setNotificationProvider } from '../modules/communication/provider/index';
import {
  resetNotificationQueue,
  waitForNotificationQueue,
} from '../modules/communication/notificationQueue';
import type {
  NotificationProvider,
  NotificationSendResult,
  RenderedMessage,
} from '../modules/communication/provider/notificationProvider';
import { NotificationProviderError } from '../modules/communication/provider/notificationProvider';

/**
 * Phase 8: citizen communication.
 *
 * The properties under test are the ones whose failure would harm a member of
 * the public rather than merely break a feature:
 *
 *  - an internal note must never reach a citizen;
 *  - a public page must never expose a phone number, an email or a staff name;
 *  - a tracking token must be required before anybody can attach an address to
 *    somebody else's submission or write words onto it;
 *  - the same event must never send the same person two messages;
 *  - a citizen's answer must not silently change an issue's status;
 *  - and nothing must cross a tenant boundary.
 */

const available = await databaseAvailable();

let app: Express;
let apollo: ApolloServer<GraphQLContext>;

let tenantA: TestTenant;
let tenantB: TestTenant;
let adminA: TestUser;
let adminB: TestUser;
let coordinatorA: TestUser;
let viewerA: TestUser;

let tokenAdminA = '';
let tokenAdminB = '';
let tokenCoordinatorA = '';
let tokenViewerA = '';

/** Captures what a provider was asked to send, so privacy can be asserted. */
class CapturingProvider implements NotificationProvider {
  readonly name = 'capture';
  readonly channel = 'EMAIL' as const;
  readonly sent: RenderedMessage[] = [];
  private available = true;
  private failWith: NotificationProviderError | null = null;

  isAvailable(): boolean {
    return this.available;
  }

  setAvailable(value: boolean): void {
    this.available = value;
  }

  failNext(error: NotificationProviderError): void {
    this.failWith = error;
  }

  reset(): void {
    this.sent.length = 0;
    this.available = true;
    this.failWith = null;
  }

  send(message: RenderedMessage): Promise<NotificationSendResult> {
    if (this.failWith) {
      const error = this.failWith;
      this.failWith = null;
      return Promise.reject(error);
    }
    this.sent.push(message);
    return Promise.resolve({ confirmedDelivery: false });
  }
}

const provider = new CapturingProvider();

async function seedCategories(organizationId: string): Promise<void> {
  await prisma.issueCategory.createMany({
    data: DEFAULT_ISSUE_CATEGORIES.map((category, index) => ({
      organizationId,
      key: category.key,
      label: category.label,
      displayOrder: index,
    })),
    skipDuplicates: true,
  });
}

/**
 * Creates a submission with a known tracking token and full contact details.
 *
 * The contact details matter: several tests assert that a phone number and an
 * email which DO exist on the row never reach a public response. A fixture
 * without them would pass those assertions vacuously.
 *
 * THE REFERENCE COMES FROM THE PLATFORM'S OWN GENERATOR rather than from a
 * timestamp. An earlier version built one from `Date.now().toString(36)`, which
 * can emit i, l, o and u - characters the Phase 5 alphabet deliberately
 * excludes so a reference read aloud cannot be mistranscribed as 1 or 0. Such a
 * reference fails `isIssueReference`, so every token check rejected it, and it
 * did so INTERMITTENTLY depending on the clock. Using the real generator makes
 * the fixture produce references the platform actually issues.
 */
async function createIssue(
  organizationId: string,
  overrides: { status?: string; resolved?: boolean } = {},
): Promise<{ id: string; reference: string; token: string }> {
  const reference = generateReferenceNumber('ISSUE');
  const tracking = issueTrackingToken();

  const issue = await prisma.issue.create({
    data: {
      organizationId,
      referenceNumber: reference,
      type: 'ISSUE',
      title: 'Fixture submission about a drain',
      description: 'A fixture submission used by the Phase 8 communication tests.',
      status: (overrides.status ?? 'SUBMITTED') as 'SUBMITTED',
      moderationStatus: 'APPROVED',
      ward: 'Ward 7',
      isAnonymous: false,
      contactName: 'Fixture Citizen',
      contactPhone: '+91 98765 43210',
      contactEmail: 'citizen@example.test',
      consentGiven: true,
      consentAt: new Date(),
      trackingTokenHash: tracking.hash,
      trackingTokenIssuedAt: new Date(),
      ...(overrides.resolved ? { resolvedAt: new Date() } : {}),
    },
    select: { id: true, referenceNumber: true },
  });

  // A history row so the public timeline has something to project, and an
  // internal note so the leak tests have something that must NOT appear.
  await prisma.issueHistory.create({
    data: {
      organizationId,
      issueId: issue.id,
      action: 'SUBMITTED',
      detail: 'INTERNAL-DETAIL-SHOULD-NEVER-BE-PUBLIC',
    },
  });
  await prisma.issueInternalNote.create({
    data: {
      organizationId,
      issueId: issue.id,
      note: 'INTERNAL-STAFF-NOTE-SHOULD-NEVER-BE-PUBLIC',
    },
  });

  return { id: issue.id, reference: issue.referenceNumber, token: tracking.token };
}

beforeAll(async () => {
  if (!available) return;

  const created = await createApp();
  app = created.app;
  apollo = created.apollo;

  tenantA = await createTenant();
  tenantB = await createTenant();
  await seedCategories(tenantA.organizationId);
  await seedCategories(tenantB.organizationId);

  adminA = await createUser();
  await addMembership(adminA.id, tenantA.organizationId, 'CAMPAIGN_ADMIN');
  adminB = await createUser();
  await addMembership(adminB.id, tenantB.organizationId, 'CAMPAIGN_ADMIN');
  coordinatorA = await createUser();
  await addMembership(coordinatorA.id, tenantA.organizationId, 'FIELD_COORDINATOR');
  viewerA = await createUser();
  await addMembership(viewerA.id, tenantA.organizationId, 'VIEWER');

  tokenAdminA = (await login(app, adminA.email, adminA.password)).accessToken;
  tokenAdminB = (await login(app, adminB.email, adminB.password)).accessToken;
  tokenCoordinatorA = (await login(app, coordinatorA.email, coordinatorA.password)).accessToken;
  tokenViewerA = (await login(app, viewerA.email, viewerA.password)).accessToken;
}, 240_000);

beforeEach(() => {
  if (!available) return;
  // A fresh limiter per test: every public endpoint here is keyed on IP, and
  // all of these run from 127.0.0.1, so without this the later tests would fail
  // with RATE_LIMITED for reasons unrelated to what they assert.
  setAttemptLimiter(new InMemoryAttemptLimiter());
  provider.reset();
  setNotificationProvider(provider);
  resetNotificationQueue();
});

afterEach(() => {
  if (!available) return;
  setNotificationProvider(null);
});

afterAll(async () => {
  if (!available) return;
  // Drain before deleting fixtures: a worker still writing delivery rows while
  // cleanup removes the organisation they belong to deadlocks the delete.
  await waitForNotificationQueue(20_000);
  await apollo.stop();
  await cleanupFixtures();
  await prisma.$disconnect();
}, 240_000);

function field<T = Record<string, unknown>>(
  result: { data: Record<string, unknown> | null },
  name: string,
): T {
  const value = result.data?.[name];
  if (value === undefined || value === null) {
    throw new Error(`GraphQL response contained no "${name}" field.`);
  }
  return value as T;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const TIMELINE = /* GraphQL */ `
  query Timeline($reference: String!) {
    publicIssueTimeline(reference: $reference) {
      referenceNumber
      status
      categoryLabel
      organizationName
      submittedAt
      timeline {
        id
        status
        occurredAt
      }
      publicUpdates {
        id
        body
        publishedAt
      }
      followUpAvailable
      existingFollowUp {
        response
      }
    }
  }
`;

const FOLLOW = /* GraphQL */ `
  mutation Follow($input: FollowIssueInput!) {
    followIssue(input: $input) {
      subscribed
      destinationRedacted
    }
  }
`;

const UNSUBSCRIBE = /* GraphQL */ `
  mutation Unsubscribe($reference: String!, $trackingToken: String!) {
    unsubscribeFromIssue(reference: $reference, trackingToken: $trackingToken) {
      subscribed
    }
  }
`;

const SUBMIT_FOLLOW_UP = /* GraphQL */ `
  mutation SubmitFollowUp($input: SubmitFollowUpInput!) {
    submitIssueFollowUp(input: $input) {
      recorded
      reopenRequested
      message
    }
  }
`;

const CREATE_UPDATE = /* GraphQL */ `
  mutation CreateUpdate($issueId: ID!, $body: String!) {
    createPublicIssueUpdate(issueId: $issueId, body: $body) {
      id
      status
      body
    }
  }
`;

const PUBLISH_UPDATE = /* GraphQL */ `
  mutation PublishUpdate($updateId: ID!) {
    publishPublicIssueUpdate(updateId: $updateId) {
      id
      status
      publishedAt
    }
  }
`;

const ISSUE_COMMUNICATION = /* GraphQL */ `
  query IssueCommunication($issueId: ID!) {
    issueCommunication(issueId: $issueId) {
      publicUpdateCount
      notifications {
        id
        status
        recipientRedacted
        event
      }
      subscription {
        channel
        active
      }
      followUps {
        id
        response
        reopenRequested
        status
      }
    }
  }
`;

const OVERVIEW = /* GraphQL */ `
  query Overview {
    communicationOverview {
      total
      sent
      failed
      skipped
      activeSubscriptions
      pendingReopenRequests
      notificationsEnabled
    }
  }
`;

const FOLLOW_UPS = /* GraphQL */ `
  query FollowUps($pendingOnly: Boolean) {
    communicationFollowUps(pendingOnly: $pendingOnly) {
      id
      response
      reopenRequested
      status
      issue {
        referenceNumber
      }
    }
  }
`;

const REVIEW = /* GraphQL */ `
  mutation Review($followUpId: ID!, $outcome: FollowUpOutcome!) {
    reviewIssueFollowUp(followUpId: $followUpId, outcome: $outcome) {
      id
      status
      outcome
    }
  }
`;

// ---------------------------------------------------------------------------
// Tracking token
// ---------------------------------------------------------------------------

describe('tracking token', () => {
  it('stores only a digest and never the plaintext', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);
    const row = await prisma.issue.findUniqueOrThrow({
      where: { id: issue.id },
      select: { trackingTokenHash: true },
    });

    // The digest, not the token. A leaked row must not yield a working code.
    expect(row.trackingTokenHash).toBe(hashTrackingToken(issue.token));
    expect(row.trackingTokenHash).not.toBe(issue.token);
    expect(row.trackingTokenHash).toHaveLength(64);
  });

  it('generates unpredictable, non-sequential tokens', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => issueTrackingToken().token));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the token exactly once, in the submission receipt', async () => {
    if (!available) return;

    const SUBMIT = /* GraphQL */ `
      mutation Submit($input: SubmitIssueInput!) {
        submitIssue(input: $input) {
          referenceNumber
          trackingToken
        }
      }
    `;

    const result = await gql(
      app,
      SUBMIT,
      {
        input: {
          organizationSlug: tenantA.slug,
          type: 'ISSUE',
          title: 'Streetlight is out on the main road',
          description: 'The streetlight outside the community hall has not worked for two weeks.',
        },
      },
      { origin: 'http://localhost:5173' },
    );

    expect(result.errors).toBeNull();
    const receipt = field<{ referenceNumber: string; trackingToken: string }>(
      result,
      'submitIssue',
    );

    expect(receipt.trackingToken).toMatch(/^[0-9a-f]{64}$/);

    // And it is not recoverable afterwards: the timeline query, which is the
    // only other public read, has no field that could carry it.
    const timeline = await gql(app, TIMELINE, { reference: receipt.referenceNumber });
    expect(JSON.stringify(timeline.data)).not.toContain(receipt.trackingToken);
  });

  it('refuses a wrong token, a missing token and an unknown reference alike', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);
    const wrong = issueTrackingToken().token;

    const attempts = await Promise.all([
      gql(app, UNSUBSCRIBE, { reference: issue.reference, trackingToken: wrong }),
      gql(app, UNSUBSCRIBE, { reference: issue.reference, trackingToken: 'not-a-token' }),
      gql(app, UNSUBSCRIBE, { reference: 'ISS-2026-ZZZZZZZZ', trackingToken: issue.token }),
    ]);

    const messages = new Set<string>();
    for (const attempt of attempts) {
      expect(attempt.errors).not.toBeNull();
      messages.add(attempt.errors?.[0]?.message ?? '');
    }

    // ONE indistinguishable message for all three. Anything else confirms to
    // somebody guessing that a reference exists.
    expect(messages.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Public privacy
// ---------------------------------------------------------------------------

describe('public page privacy', () => {
  it('exposes no citizen contact detail, internal note or staff name', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);
    const result = await gql(app, TIMELINE, { reference: issue.reference });

    expect(result.errors).toBeNull();
    const payload = JSON.stringify(result.data);

    // All of these exist on the row. None may appear in a public response.
    expect(payload).not.toContain('98765');
    expect(payload).not.toContain('citizen@example.test');
    expect(payload).not.toContain('Fixture Citizen');
    expect(payload).not.toContain('INTERNAL-STAFF-NOTE');
    // The history `detail` column in particular - the timeline projects the
    // status beside it and must never project this.
    expect(payload).not.toContain('INTERNAL-DETAIL');
    // The citizen's own title and description are withheld too, matching the
    // Phase 5 lookup: somebody who found a reference must not read them.
    expect(payload).not.toContain('fixture submission about a drain');
  });

  it('shows a published update but never a draft or a withdrawn one', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);

    const draft = await gql(
      app,
      CREATE_UPDATE,
      { issueId: issue.id, body: 'DRAFT-TEXT-NOT-FOR-CITIZENS yet under consideration.' },
      { accessToken: tokenAdminA },
    );
    const draftId = field<{ id: string }>(draft, 'createPublicIssueUpdate').id;

    // While it is a draft the citizen sees nothing.
    const before = await gql(app, TIMELINE, { reference: issue.reference });
    const beforePayload = JSON.stringify(before.data);
    expect(beforePayload).not.toContain('DRAFT-TEXT-NOT-FOR-CITIZENS');

    await gql(app, PUBLISH_UPDATE, { updateId: draftId }, { accessToken: tokenAdminA });

    const after = await gql(app, TIMELINE, { reference: issue.reference });
    const updates = field<Record<string, unknown>>(after, 'publicIssueTimeline').publicUpdates as {
      body: string;
    }[];
    expect(updates).toHaveLength(1);
    expect(updates[0]?.body).toContain('DRAFT-TEXT-NOT-FOR-CITIZENS');
  });

  it('returns null for unknown, spam and suspended alike', async () => {
    if (!available) return;

    const spam = await createIssue(tenantA.organizationId);
    await prisma.issue.update({
      where: { id: spam.id },
      data: { moderationStatus: 'SPAM' },
    });

    const [unknown, marked] = await Promise.all([
      gql(app, TIMELINE, { reference: 'ISS-2026-ZZZZZZZZ' }),
      gql(app, TIMELINE, { reference: spam.reference }),
    ]);

    expect(unknown.data?.publicIssueTimeline).toBeNull();
    expect(marked.data?.publicIssueTimeline).toBeNull();
  });

  it('projects only status transitions onto the timeline', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);

    // An internal-only history action. It must not appear on the timeline.
    await prisma.issueHistory.create({
      data: {
        organizationId: tenantA.organizationId,
        issueId: issue.id,
        action: 'ASSIGNED',
        detail: 'Assigned to a named staff member',
      },
    });

    const result = await gql(app, TIMELINE, { reference: issue.reference });
    const timeline = field<Record<string, unknown>>(result, 'publicIssueTimeline').timeline as {
      status: string;
    }[];

    // Only the SUBMITTED entry. The assignment is invisible.
    expect(timeline).toHaveLength(1);
    expect(JSON.stringify(timeline)).not.toContain('named staff member');
  });
});

// ---------------------------------------------------------------------------
// Subscription and consent
// ---------------------------------------------------------------------------

describe('subscription and consent', () => {
  it('requires explicit consent', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);

    const result = await gql(app, FOLLOW, {
      input: {
        reference: issue.reference,
        trackingToken: issue.token,
        channel: 'EMAIL',
        destination: 'resident@example.test',
        consent: false,
      },
    });

    expect(result.errorCode).toBe('VALIDATION_ERROR');
    const count = await prisma.issueSubscription.count({ where: { issueId: issue.id } });
    expect(count).toBe(0);
  });

  it('records consent with an instant, and masks the address on the way out', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);

    const result = await gql(app, FOLLOW, {
      input: {
        reference: issue.reference,
        trackingToken: issue.token,
        channel: 'EMAIL',
        destination: 'resident@example.test',
        consent: true,
      },
    });

    expect(result.errors).toBeNull();
    const payload = field<{ subscribed: boolean; destinationRedacted: string }>(
      result,
      'followIssue',
    );

    expect(payload.subscribed).toBe(true);
    // Masked, so an over-the-shoulder reader learns the domain and nothing else.
    expect(payload.destinationRedacted).not.toBe('resident@example.test');
    expect(payload.destinationRedacted).toContain('@example.test');

    const row = await prisma.issueSubscription.findFirstOrThrow({
      where: { issueId: issue.id },
    });
    expect(row.consentGivenAt).toBeInstanceOf(Date);
    expect(row.active).toBe(true);
  });

  it('refuses a subscription without the tracking token', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);

    // The threat this answers: with reference-only auth, anybody holding a
    // reference could attach their own address to a stranger's submission.
    const result = await gql(app, FOLLOW, {
      input: {
        reference: issue.reference,
        trackingToken: issueTrackingToken().token,
        channel: 'EMAIL',
        destination: 'attacker@example.test',
        consent: true,
      },
    });

    expect(result.errors).not.toBeNull();
    expect(await prisma.issueSubscription.count({ where: { issueId: issue.id } })).toBe(0);
  });

  it('refuses an unsupported channel rather than silently accepting it', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);

    const result = await gql(app, FOLLOW, {
      input: {
        reference: issue.reference,
        trackingToken: issue.token,
        channel: 'SMS',
        destination: '+919876543210',
        consent: true,
      },
    });

    // SMS is declared in the schema and has no provider. Accepting it would
    // create a subscription that silently never delivers.
    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });

  it('stops future messages without deleting anything', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);
    await gql(app, FOLLOW, {
      input: {
        reference: issue.reference,
        trackingToken: issue.token,
        channel: 'EMAIL',
        destination: 'resident@example.test',
        consent: true,
      },
    });

    const result = await gql(app, UNSUBSCRIBE, {
      reference: issue.reference,
      trackingToken: issue.token,
    });
    expect(result.errors).toBeNull();

    const row = await prisma.issueSubscription.findFirstOrThrow({
      where: { issueId: issue.id },
    });
    expect(row.active).toBe(false);
    expect(row.unsubscribedAt).toBeInstanceOf(Date);

    // The submission itself is untouched: asking to stop being emailed is not
    // asking to withdraw a civic complaint.
    const stillThere = await prisma.issue.findUnique({ where: { id: issue.id } });
    expect(stillThere).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

describe('notifications', () => {
  /**
   * Subscribes and ASSERTS it worked.
   *
   * A silent failure here would surface later as "no notification was queued",
   * which points at the notification service rather than at the missing
   * consent that actually caused it.
   */
  async function subscribe(issue: { reference: string; token: string }): Promise<void> {
    const result = await gql(app, FOLLOW, {
      input: {
        reference: issue.reference,
        trackingToken: issue.token,
        channel: 'EMAIL',
        destination: 'resident@example.test',
        consent: true,
      },
    });
    // The message is included so a setup failure names its own cause rather
    // than surfacing later as "no notification was queued".
    expect(result.errors, JSON.stringify(result.errors)).toBeNull();
  }

  it('derives an idempotency key from the event facts, not a clock', () => {
    const first = buildIdempotencyKey({
      issueId: 'i1',
      event: 'ISSUE_RESOLVED',
      subject: 'RESOLVED',
    });
    const second = buildIdempotencyKey({
      issueId: 'i1',
      event: 'ISSUE_RESOLVED',
      subject: 'RESOLVED',
    });
    const different = buildIdempotencyKey({
      issueId: 'i1',
      event: 'ISSUE_RESOLVED',
      subject: 'CLOSED',
    });

    expect(first).toBe(second);
    expect(first).not.toBe(different);
  });

  it('creates one notification and refuses a duplicate of the same event', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);
    await subscribe(issue);

    const first = await notificationService.queue({
      issueId: issue.id,
      event: 'ISSUE_STATUS_CHANGED',
      subject: 'UNDER_REVIEW',
    });
    const second = await notificationService.queue({
      issueId: issue.id,
      event: 'ISSUE_STATUS_CHANGED',
      subject: 'UNDER_REVIEW',
    });

    expect(first.queued).toBe(true);
    // The unique constraint caught the repeat. Reported as a skip, not an error:
    // "we already sent this" is a success.
    expect(second.queued).toBe(false);

    const count = await prisma.issueNotification.count({ where: { issueId: issue.id } });
    expect(count).toBe(1);
  });

  it('does not send twice when a status change is replayed through GraphQL', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);
    await subscribe(issue);

    const STATUS = /* GraphQL */ `
      mutation Status($id: ID!, $status: IssueStatus!) {
        updateIssueStatus(id: $id, status: $status) {
          id
          status
        }
      }
    `;

    await gql(app, STATUS, { id: issue.id, status: 'UNDER_REVIEW' }, { accessToken: tokenAdminA });
    // A replayed mutation. Phase 5 rejects the illegal transition, but even a
    // client retrying the accepted one must not produce a second message.
    await gql(app, STATUS, { id: issue.id, status: 'UNDER_REVIEW' }, { accessToken: tokenAdminA });

    await waitForNotificationQueue(10_000);

    const notifications = await prisma.issueNotification.findMany({
      where: { issueId: issue.id, event: 'ISSUE_STATUS_CHANGED' },
    });
    expect(notifications).toHaveLength(1);
  });

  it('skips rather than fails when there is no consent', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);

    const outcome = await notificationService.queue({
      issueId: issue.id,
      event: 'ISSUE_STATUS_CHANGED',
      subject: 'UNDER_REVIEW',
    });

    expect(outcome.queued).toBe(false);
    // Nothing is recorded at all: most citizens never subscribe, and the system
    // should be silent for them rather than logging a failure per event.
    expect(await prisma.issueNotification.count({ where: { issueId: issue.id } })).toBe(0);
  });

  it('does not send to somebody who unsubscribed while the message was queued', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);
    await subscribe(issue);

    const queued = await notificationService.queue({
      issueId: issue.id,
      event: 'ISSUE_STATUS_CHANGED',
      subject: 'ACKNOWLEDGED',
    });
    expect(queued.queued).toBe(true);

    // The gap between queue and send is real with a queue. Consent is checked
    // at SEND time for exactly this case.
    await gql(app, UNSUBSCRIBE, { reference: issue.reference, trackingToken: issue.token });

    if (queued.queued) await notificationService.deliver(queued.notificationId);

    expect(provider.sent).toHaveLength(0);
    const row = await prisma.issueNotification.findFirstOrThrow({
      where: { issueId: issue.id },
    });
    expect(row.status).toBe('SKIPPED');
  });

  it('records a failure safely, without provider internals', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);
    await subscribe(issue);

    provider.failNext(
      new NotificationProviderError(
        'PROVIDER_UNAVAILABLE',
        'connect ECONNREFUSED 1.2.3.4:587',
        true,
      ),
    );

    const queued = await notificationService.queue({
      issueId: issue.id,
      event: 'ISSUE_STATUS_CHANGED',
      subject: 'IN_PROGRESS',
    });
    if (queued.queued) await notificationService.deliver(queued.notificationId);

    const row = await prisma.issueNotification.findFirstOrThrow({
      where: { issueId: issue.id },
    });

    expect(row.status).toBe('FAILED');
    expect(row.failureKind).toBe('PROVIDER_UNAVAILABLE');
    // The safe mapped sentence, never the provider's own text.
    expect(row.failureReason).not.toContain('ECONNREFUSED');
    expect(row.failureReason).toContain('could not be reached');
  });

  it('gives up after the attempt ceiling rather than retrying forever', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);
    await subscribe(issue);

    const queued = await notificationService.queue({
      issueId: issue.id,
      event: 'ISSUE_STATUS_CHANGED',
      subject: 'CLOSED',
    });
    if (!queued.queued) throw new Error('expected a queued notification');

    for (let attempt = 0; attempt < 4; attempt += 1) {
      provider.failNext(new NotificationProviderError('TIMEOUT', 'timed out', true));
      await prisma.issueNotification.update({
        where: { id: queued.notificationId },
        data: { status: 'QUEUED' },
      });
      await notificationService.deliver(queued.notificationId);
    }

    const row = await prisma.issueNotification.findUniqueOrThrow({
      where: { id: queued.notificationId },
    });
    expect(row.status).toBe('FAILED');
    expect(row.attempts).toBeLessThanOrEqual(3);
  });

  it('never puts a citizen phone number or name into an outbound message', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);
    await subscribe(issue);

    const queued = await notificationService.queue({
      issueId: issue.id,
      event: 'ISSUE_STATUS_CHANGED',
      subject: 'ACKNOWLEDGED',
    });
    if (queued.queued) await notificationService.deliver(queued.notificationId);

    expect(provider.sent).toHaveLength(1);
    const message = JSON.stringify(provider.sent[0]);

    expect(message).not.toContain('98765');
    expect(message).not.toContain('Fixture Citizen');
    // The citizen's own title is excluded too: an email subject line is the
    // least private place on the internet.
    expect(message).not.toContain('Fixture submission about a drain');
    expect(message).not.toContain('INTERNAL-STAFF-NOTE');
    // And it carries the way out.
    expect(message).toContain('Stop receiving updates');
  });
});

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

describe('notification templates', () => {
  const context = {
    issueReference: 'ISS-2026-ABCD1234',
    status: 'IN_PROGRESS',
    categoryLabel: 'Roads',
    submittedAt: new Date('2026-09-10T00:00:00Z'),
    updatedAt: new Date('2026-09-12T00:00:00Z'),
    organizationName: 'Test Campaign',
    trackingUrl: 'https://example.test/track-issue?reference=ISS-2026-ABCD1234',
    unsubscribeUrl: 'https://example.test/track-issue?action=unsubscribe',
    publicUpdate: 'Passed to the roads team.',
  };

  it('renders every event without leaving a placeholder', () => {
    const events = [
      'ISSUE_RECEIVED',
      'ISSUE_STATUS_CHANGED',
      'PUBLIC_UPDATE_PUBLISHED',
      'ISSUE_RESOLVED',
      'ISSUE_REOPENED',
    ] as const;

    for (const event of events) {
      const rendered = renderNotification(event, context);
      expect(rendered.subject.length).toBeGreaterThan(0);
      expect(rendered.body).toContain('ISS-2026-ABCD1234');
      expect(rendered.version).toContain(event);
      expect(rendered.body).not.toMatch(/\{\{/);
    }
  });

  it('enforces the variable allow-list', () => {
    // The control that stops a future template edit introducing
    // `{{contactPhone}}` and emailing a citizen's own number back to them.
    expect(isAllowedTemplateVariable('issueReference')).toBe(true);
    expect(isAllowedTemplateVariable('status')).toBe(true);
    expect(isAllowedTemplateVariable('contactPhone')).toBe(false);
    expect(isAllowedTemplateVariable('contactEmail')).toBe(false);
    expect(isAllowedTemplateVariable('internalNote')).toBe(false);
    expect(isAllowedTemplateVariable('title')).toBe(false);
  });

  it('refuses to send a message that still contains a placeholder', () => {
    // A value carrying `{{...}}` must stop the send rather than reach an inbox.
    expect(() =>
      renderNotification('PUBLIC_UPDATE_PUBLISHED', {
        ...context,
        publicUpdate: 'See {{contactEmail}} for details.',
      }),
    ).toThrow(TemplateRenderError);
  });

  it('masks an address without destroying its recognisability', () => {
    expect(redactEmail('resident@example.test')).toContain('@example.test');
    expect(redactEmail('resident@example.test')).not.toContain('resident');
    expect(redactEmail('not-an-address')).toBe('***');
  });
});

// ---------------------------------------------------------------------------
// Public updates
// ---------------------------------------------------------------------------

describe('public updates', () => {
  it('creates a draft that is not visible and then publishes it', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);

    const draft = await gql(
      app,
      CREATE_UPDATE,
      { issueId: issue.id, body: 'This has been passed to the roads team for inspection.' },
      { accessToken: tokenAdminA },
    );
    const created = field<{ id: string; status: string }>(draft, 'createPublicIssueUpdate');
    expect(created.status).toBe('DRAFT');

    const published = await gql(
      app,
      PUBLISH_UPDATE,
      { updateId: created.id },
      { accessToken: tokenAdminA },
    );
    expect(field<{ status: string }>(published, 'publishPublicIssueUpdate').status).toBe(
      'PUBLISHED',
    );
  });

  it('rejects HTML rather than silently stripping it', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);

    const result = await gql(
      app,
      CREATE_UPDATE,
      { issueId: issue.id, body: 'Fixed <script>alert(1)</script> the problem completely.' },
      { accessToken: tokenAdminA },
    );

    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });

  it('refuses to publish the same update twice', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);
    const draft = await gql(
      app,
      CREATE_UPDATE,
      { issueId: issue.id, body: 'Work has been scheduled for next week.' },
      { accessToken: tokenAdminA },
    );
    const id = field<{ id: string }>(draft, 'createPublicIssueUpdate').id;

    await gql(app, PUBLISH_UPDATE, { updateId: id }, { accessToken: tokenAdminA });
    const again = await gql(app, PUBLISH_UPDATE, { updateId: id }, { accessToken: tokenAdminA });

    expect(again.errorCode).toBe('CONFLICT');
  });

  it('audits creation and publication separately', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);
    const draft = await gql(
      app,
      CREATE_UPDATE,
      { issueId: issue.id, body: 'An inspection has been arranged for this location.' },
      { accessToken: tokenAdminA },
    );
    const id = field<{ id: string }>(draft, 'createPublicIssueUpdate').id;
    await gql(app, PUBLISH_UPDATE, { updateId: id }, { accessToken: tokenAdminA });

    const [created, published] = await Promise.all([
      prisma.auditLog.findFirst({
        where: {
          organizationId: tenantA.organizationId,
          action: 'PUBLIC_UPDATE_CREATED',
          entityId: id,
        },
      }),
      prisma.auditLog.findFirst({
        where: {
          organizationId: tenantA.organizationId,
          action: 'PUBLIC_UPDATE_PUBLISHED',
          entityId: id,
        },
      }),
    ]);

    // Drafting is private; publishing is the organisation speaking. Two acts,
    // two records.
    expect(created?.actorUserId).toBe(adminA.id);
    expect(published?.actorUserId).toBe(adminA.id);
    // Neither records the body: it is text about a citizen's report and the
    // audit log is widely readable within a tenant.
    expect(JSON.stringify(created?.metadata)).not.toContain('inspection has been arranged');
  });
});

// ---------------------------------------------------------------------------
// Follow-up
// ---------------------------------------------------------------------------

describe('follow-up', () => {
  it('is offered only once the submission is finished', async () => {
    if (!available) return;

    const open = await createIssue(tenantA.organizationId, { status: 'IN_PROGRESS' });

    const result = await gql(app, SUBMIT_FOLLOW_UP, {
      input: {
        reference: open.reference,
        trackingToken: open.token,
        response: 'RESOLVED',
      },
    });

    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });

  it('records the answer and does NOT change the status', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId, {
      status: 'RESOLVED',
      resolved: true,
    });

    const result = await gql(app, SUBMIT_FOLLOW_UP, {
      input: {
        reference: issue.reference,
        trackingToken: issue.token,
        response: 'NOT_RESOLVED',
        comment: 'The road is still damaged.',
      },
    });

    expect(result.errors).toBeNull();
    const payload = field<{ recorded: boolean; reopenRequested: boolean }>(
      result,
      'submitIssueFollowUp',
    );
    expect(payload.reopenRequested).toBe(true);

    // THE CENTRAL ASSERTION OF THE FOLLOW-UP DESIGN. A citizen saying "no" is
    // information for a person to act on, never an instruction the system
    // executes - otherwise anybody holding a token could bounce a closed issue
    // back open indefinitely.
    const after = await prisma.issue.findUniqueOrThrow({
      where: { id: issue.id },
      select: { status: true },
    });
    expect(after.status).toBe('RESOLVED');
  });

  it('treats "partially" as a signal rather than a reopen request', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId, {
      status: 'RESOLVED',
      resolved: true,
    });

    const result = await gql(app, SUBMIT_FOLLOW_UP, {
      input: {
        reference: issue.reference,
        trackingToken: issue.token,
        response: 'PARTIALLY_RESOLVED',
      },
    });

    expect(field<{ reopenRequested: boolean }>(result, 'submitIssueFollowUp').reopenRequested).toBe(
      false,
    );
  });

  it('accepts one answer per submission', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId, {
      status: 'RESOLVED',
      resolved: true,
    });

    const input = {
      reference: issue.reference,
      trackingToken: issue.token,
      response: 'RESOLVED',
    };

    await gql(app, SUBMIT_FOLLOW_UP, { input });
    const again = await gql(app, SUBMIT_FOLLOW_UP, { input });

    expect(again.errorCode).toBe('CONFLICT');
    expect(await prisma.issueFollowUp.count({ where: { issueId: issue.id } })).toBe(1);
  });

  it('requires the tracking token', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId, {
      status: 'RESOLVED',
      resolved: true,
    });

    const result = await gql(app, SUBMIT_FOLLOW_UP, {
      input: {
        reference: issue.reference,
        trackingToken: issueTrackingToken().token,
        response: 'NOT_RESOLVED',
      },
    });

    expect(result.errors).not.toBeNull();
    expect(await prisma.issueFollowUp.count({ where: { issueId: issue.id } })).toBe(0);
  });

  it('appears in the admin reopen queue and can be reviewed', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId, {
      status: 'RESOLVED',
      resolved: true,
    });
    await gql(app, SUBMIT_FOLLOW_UP, {
      input: {
        reference: issue.reference,
        trackingToken: issue.token,
        response: 'NOT_RESOLVED',
        comment: 'Still broken.',
      },
    });

    const queue = await gql(app, FOLLOW_UPS, { pendingOnly: true }, { accessToken: tokenAdminA });
    const rows = field<Record<string, unknown>[]>(queue, 'communicationFollowUps');
    const row = rows.find(
      (entry) =>
        (entry.issue as { referenceNumber: string } | null)?.referenceNumber === issue.reference,
    );
    expect(row).toBeDefined();

    const reviewed = await gql(
      app,
      REVIEW,
      { followUpId: row?.id, outcome: 'REOPENED' },
      { accessToken: tokenAdminA },
    );
    expect(field<{ status: string }>(reviewed, 'reviewIssueFollowUp').status).toBe('REVIEWED');

    // Reviewing records the decision. It still does not move the issue - that
    // is a separate act through the Phase 5 status path.
    const after = await prisma.issue.findUniqueOrThrow({
      where: { id: issue.id },
      select: { status: true },
    });
    expect(after.status).toBe('RESOLVED');
  });
});

// ---------------------------------------------------------------------------
// RBAC and tenancy
// ---------------------------------------------------------------------------

describe('authorization', () => {
  it('refuses an unauthenticated admin query', async () => {
    if (!available) return;
    const result = await gql(app, OVERVIEW);
    expect(result.errors).not.toBeNull();
  });

  it('refuses a viewer, who holds no communication permission', async () => {
    if (!available) return;

    const result = await gql(app, OVERVIEW, {}, { accessToken: tokenViewerA });
    expect(result.errorCode).toBe('FORBIDDEN');
  });

  it('lets a coordinator read but not publish', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);

    const read = await gql(
      app,
      ISSUE_COMMUNICATION,
      { issueId: issue.id },
      { accessToken: tokenCoordinatorA },
    );
    expect(read.errors).toBeNull();

    const draft = await gql(
      app,
      CREATE_UPDATE,
      { issueId: issue.id, body: 'A coordinator may prepare text for a colleague.' },
      { accessToken: tokenCoordinatorA },
    );
    const id = field<{ id: string }>(draft, 'createPublicIssueUpdate').id;

    // Drafting is ungated; speaking to a citizen is not.
    const publish = await gql(
      app,
      PUBLISH_UPDATE,
      { updateId: id },
      { accessToken: tokenCoordinatorA },
    );
    expect(publish.errorCode).toBe('FORBIDDEN');
  });
});

describe('tenant isolation', () => {
  it('does not let one tenant publish an update on another tenant submission', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);

    const result = await gql(
      app,
      CREATE_UPDATE,
      { issueId: issue.id, body: 'An update written by the wrong organisation entirely.' },
      { accessToken: tokenAdminB },
    );

    // NOT_FOUND rather than FORBIDDEN: confirming the id exists would leak that
    // another tenant holds it.
    expect(result.errorCode).toBe('NOT_FOUND');
  });

  it('does not let one tenant read another tenant communication', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);
    const result = await gql(
      app,
      ISSUE_COMMUNICATION,
      { issueId: issue.id },
      { accessToken: tokenAdminB },
    );

    expect(result.errorCode).toBe('NOT_FOUND');
  });

  it('scopes the communication overview to the caller tenant', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);
    await gql(app, FOLLOW, {
      input: {
        reference: issue.reference,
        trackingToken: issue.token,
        channel: 'EMAIL',
        destination: 'resident@example.test',
        consent: true,
      },
    });

    const [a, b] = await Promise.all([
      gql(app, OVERVIEW, {}, { accessToken: tokenAdminA }),
      gql(app, OVERVIEW, {}, { accessToken: tokenAdminB }),
    ]);

    const countA = await prisma.issueSubscription.count({
      where: { organizationId: tenantA.organizationId, active: true },
    });
    const countB = await prisma.issueSubscription.count({
      where: { organizationId: tenantB.organizationId, active: true },
    });

    expect(field(a, 'communicationOverview').activeSubscriptions).toBe(countA);
    expect(field(b, 'communicationOverview').activeSubscriptions).toBe(countB);
  });

  it('does not leak follow-up between tenants', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId, {
      status: 'RESOLVED',
      resolved: true,
    });
    await gql(app, SUBMIT_FOLLOW_UP, {
      input: {
        reference: issue.reference,
        trackingToken: issue.token,
        response: 'NOT_RESOLVED',
      },
    });

    const result = await gql(app, FOLLOW_UPS, { pendingOnly: false }, { accessToken: tokenAdminB });
    const rows = field<Record<string, unknown>[]>(result, 'communicationFollowUps');

    expect(
      rows.some(
        (row) =>
          (row.issue as { referenceNumber: string } | null)?.referenceNumber === issue.reference,
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe('rate limiting', () => {
  it('throttles repeated public lookups', async () => {
    if (!available) return;

    const issue = await createIssue(tenantA.organizationId);

    let limited = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const result = await gql(app, TIMELINE, { reference: issue.reference });
      if (result.errorCode === 'RATE_LIMITED') {
        limited = true;
        break;
      }
    }

    expect(limited).toBe(true);
  });
});
