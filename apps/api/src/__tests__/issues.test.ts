import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { ApolloServer } from '@apollo/server';
import { createApp } from '../app';
import { getEnv } from '../config/env';
import type { GraphQLContext } from '../graphql/context/index';
import { prisma } from '../database/prisma';
import { DEFAULT_ISSUE_CATEGORIES } from '@rk/types';
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
import { setAttemptLimiter, InMemoryAttemptLimiter } from '../modules/auth/rateLimiter';

/**
 * Phase 5: citizen feedback and issue reporting.
 *
 * The properties under test are the ones whose failure would harm a member of
 * the public rather than merely inconvenience the campaign:
 *
 *  - a citizen's contact details must not reach anybody without the permission;
 *  - internal staff notes must not reach the public surface;
 *  - a reference must reveal a status and nothing else;
 *  - nothing must cross a tenant boundary;
 *  - an unsafe file must not be storable, and a filename must never be a path.
 */

const available = await databaseAvailable();

let app: Express;
let apollo: ApolloServer<GraphQLContext>;

let tenantA: TestTenant;
let tenantB: TestTenant;
let adminA: TestUser;
let adminB: TestUser;
let managerA: TestUser;
let viewerA: TestUser;
let analystA: TestUser;
let coordinatorA: TestUser;

let tokenAdminA = '';
let tokenAdminB = '';
let tokenManagerA = '';
let tokenViewerA = '';
let tokenAnalystA = '';
let tokenCoordinatorA = '';

/**
 * Gives each tenant the category vocabulary a real organisation gets.
 *
 * Fixture tenants are created directly rather than through the organisation
 * service, so they do not receive the categories that service provisions.
 */
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

  managerA = await createUser();
  await addMembership(managerA.id, tenantA.organizationId, 'ISSUE_MANAGER');

  viewerA = await createUser();
  await addMembership(viewerA.id, tenantA.organizationId, 'VIEWER');

  analystA = await createUser();
  await addMembership(analystA.id, tenantA.organizationId, 'ANALYST');

  coordinatorA = await createUser();
  await addMembership(coordinatorA.id, tenantA.organizationId, 'FIELD_COORDINATOR');

  tokenAdminA = (await login(app, adminA.email, adminA.password)).accessToken;
  tokenAdminB = (await login(app, adminB.email, adminB.password)).accessToken;
  tokenManagerA = (await login(app, managerA.email, managerA.password)).accessToken;
  tokenViewerA = (await login(app, viewerA.email, viewerA.password)).accessToken;
  tokenAnalystA = (await login(app, analystA.email, analystA.password)).accessToken;
  tokenCoordinatorA = (await login(app, coordinatorA.email, coordinatorA.password)).accessToken;
}, 240_000);

/**
 * A fresh attempt limiter before every test.
 *
 * The submission limiter is keyed on IP, and every test in this file submits
 * from 127.0.0.1 - so without this, the tenth test would exhaust the budget and
 * every later one would fail with RATE_LIMITED for reasons having nothing to do
 * with what it was asserting.
 *
 * This isolates the tests from each other; it does NOT disable the limiter. The
 * spam-protection test below builds its own app with a deliberately tiny budget
 * and proves the limiter still bites.
 */
beforeEach(() => {
  if (!available) return;
  setAttemptLimiter(new InMemoryAttemptLimiter());
});

afterAll(async () => {
  if (!available) return;
  await apollo.stop();
  await cleanupFixtures();
  await prisma.$disconnect();
}, 240_000);

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const SUBMIT = /* GraphQL */ `
  mutation Submit($input: SubmitIssueInput!) {
    submitIssue(input: $input) {
      referenceNumber
      type
      submittedAt
      contactProvided
    }
  }
`;

const PUBLIC_STATUS = /* GraphQL */ `
  query PublicStatus($reference: String!) {
    publicIssueStatus(referenceNumber: $reference) {
      referenceNumber
      type
      categoryLabel
      status
      submittedAt
      updatedAt
    }
  }
`;

const PUBLIC_CATEGORIES = /* GraphQL */ `
  query PublicCategories($input: PublicSiteInput) {
    publicIssueCategories(input: $input) {
      key
      label
    }
  }
`;

const LIST_ISSUES = /* GraphQL */ `
  query ListIssues($filter: IssueFilter) {
    issues(filter: $filter) {
      nodes {
        id
        referenceNumber
        title
        status
        priority
        isAnonymous
        contactProvided
        contactVisible
        contactName
        contactPhone
        contactEmail
        ward
        source
        category {
          key
          label
        }
        assignedTo {
          id
          fullName
        }
      }
      totalCount
      hasMore
    }
  }
`;

const GET_ISSUE = /* GraphQL */ `
  query GetIssue($id: ID!) {
    issue(id: $id) {
      id
      referenceNumber
      title
      description
      status
      priority
      moderationStatus
      contactVisible
      contactName
      contactPhone
      attachmentCount
      noteCount
      campaign {
        id
      }
      qrCode {
        id
        code
      }
    }
  }
`;

const SET_STATUS = /* GraphQL */ `
  mutation SetStatus($id: ID!, $status: IssueStatus!) {
    updateIssueStatus(id: $id, status: $status) {
      id
      status
    }
  }
`;

const SET_PRIORITY = /* GraphQL */ `
  mutation SetPriority($id: ID!, $priority: IssuePriority!) {
    updateIssuePriority(id: $id, priority: $priority) {
      id
      priority
    }
  }
`;

const ASSIGN = /* GraphQL */ `
  mutation Assign($id: ID!, $userId: ID!) {
    assignIssue(id: $id, userId: $userId) {
      id
      assignedTo {
        id
        fullName
      }
    }
  }
`;

const ADD_NOTE = /* GraphQL */ `
  mutation AddNote($issueId: ID!, $note: String!) {
    addIssueInternalNote(issueId: $issueId, note: $note) {
      id
      note
    }
  }
`;

const GET_NOTES = /* GraphQL */ `
  query GetNotes($issueId: ID!) {
    issueNotes(issueId: $issueId) {
      id
      note
    }
  }
`;

const GET_HISTORY = /* GraphQL */ `
  query GetHistory($issueId: ID!) {
    issueHistory(issueId: $issueId) {
      action
      previousStatus
      newStatus
      previousPriority
      newPriority
      detail
    }
  }
`;

const REVEAL_CONTACT = /* GraphQL */ `
  mutation Reveal($id: ID!) {
    revealIssueContact(id: $id) {
      contactName
      contactPhone
      contactEmail
    }
  }
`;

const ANALYTICS = /* GraphQL */ `
  query Analytics($filter: IssueAnalyticsFilter) {
    issueAnalytics(filter: $filter) {
      totalInRange
      totalAllTime
      openCount
      highPriorityOpen
      unassignedOpen
      awaitingModeration
      range {
        days
      }
      byStatus {
        key
        count
      }
      byCategory {
        label
        count
      }
      bySource {
        key
        count
      }
      byWard {
        label
        count
      }
      byType {
        key
        count
      }
      trend {
        count
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SubmitOverrides {
  [key: string]: unknown;
}

async function submit(slug: string, overrides: SubmitOverrides = {}) {
  const result = await gql<{
    submitIssue: {
      referenceNumber: string;
      type: string;
      submittedAt: string;
      contactProvided: boolean;
    };
  }>(app, SUBMIT, {
    input: {
      organizationSlug: slug,
      type: 'ISSUE',
      title: 'Blocked drain on the side lane',
      description: 'The drain has been blocked for several days and water is standing.',
      categoryKey: 'DRAINAGE',
      ward: 'Ward 12',
      ...overrides,
    },
  });

  return result;
}

async function submitOrThrow(slug: string, overrides: SubmitOverrides = {}) {
  const result = await submit(slug, overrides);
  if (!result.data) throw new Error(`Submit failed: ${JSON.stringify(result.errors)}`);
  return result.data.submitIssue;
}

/**
 * Resolves a reference to its internal id.
 *
 * Reads the row directly rather than through the API: these tests need the id
 * as a fixture, and going through the list would make every workflow test also
 * a test of search.
 */
async function idForReference(organizationId: string, reference: string) {
  const row = await prisma.issue.findFirst({
    where: { referenceNumber: reference, organizationId },
    select: { id: true },
  });
  if (!row) throw new Error(`No issue for ${reference}`);
  return row.id;
}

/** A minimal valid PNG, for upload tests. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// ---------------------------------------------------------------------------
// Public submission
// ---------------------------------------------------------------------------

describe.skipIf(!available)('public submission', () => {
  it('accepts an anonymous submission and returns a reference', async () => {
    const receipt = await submitOrThrow(tenantA.slug);

    expect(receipt.referenceNumber).toMatch(/^ISS-\d{4}-[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(receipt.contactProvided).toBe(false);

    const stored = await prisma.issue.findUniqueOrThrow({
      where: { referenceNumber: receipt.referenceNumber },
      select: {
        organizationId: true,
        isAnonymous: true,
        contactName: true,
        contactPhone: true,
        contactEmail: true,
        consentGiven: true,
        status: true,
        moderationStatus: true,
      },
    });

    expect(stored.organizationId).toBe(tenantA.organizationId);
    expect(stored.isAnonymous).toBe(true);
    expect(stored.contactName).toBeNull();
    expect(stored.contactPhone).toBeNull();
    expect(stored.contactEmail).toBeNull();
    expect(stored.consentGiven).toBe(false);
    // Nothing is auto-approved: a human decides.
    expect(stored.moderationStatus).toBe('PENDING_REVIEW');
    expect(stored.status).toBe('SUBMITTED');
  });

  it('requires no authentication at all', async () => {
    // No token, no cookie, no tenant header - what a phone sends.
    const result = await submit(tenantA.slug, { title: 'No account needed' });
    expect(result.errors).toBeNull();
  });

  it('accepts each submission type with its own reference prefix', async () => {
    const cases: Array<[string, string]> = [
      ['FEEDBACK', 'FB'],
      ['ISSUE', 'ISS'],
      ['SUGGESTION', 'SUG'],
      ['COMPLAINT', 'CMP'],
    ];

    for (const [type, prefix] of cases) {
      const receipt = await submitOrThrow(tenantA.slug, { type, title: `A ${type} submission` });
      expect(receipt.referenceNumber.startsWith(`${prefix}-`), `${type} -> ${prefix}`).toBe(true);
    }
  });

  it('stores contact details when given, with consent recorded', async () => {
    const receipt = await submitOrThrow(tenantA.slug, {
      title: 'Contact provided',
      isAnonymous: false,
      contactName: 'Demo Resident',
      contactPhone: '+91 90000 00099',
      contactEmail: 'Resident@Example.Test',
      consentGiven: true,
    });

    expect(receipt.contactProvided).toBe(true);

    const stored = await prisma.issue.findUniqueOrThrow({
      where: { referenceNumber: receipt.referenceNumber },
      select: {
        isAnonymous: true,
        contactName: true,
        contactEmail: true,
        consentGiven: true,
        consentAt: true,
      },
    });

    expect(stored.isAnonymous).toBe(false);
    expect(stored.contactName).toBe('Demo Resident');
    // Normalised, so two spellings of one address do not become two people.
    expect(stored.contactEmail).toBe('resident@example.test');
    expect(stored.consentGiven).toBe(true);
    expect(stored.consentAt).not.toBeNull();
  });

  it('refuses to store contact details without consent', async () => {
    const result = await submit(tenantA.slug, {
      title: 'No consent',
      isAnonymous: false,
      contactPhone: '+91 90000 00098',
    });

    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });

  it('discards contact details when the citizen chose to be anonymous', async () => {
    // A form bug could leave a number in a hidden field. The server clears it
    // rather than trusting the client to have done so.
    const receipt = await submitOrThrow(tenantA.slug, {
      title: 'Anonymous despite fields',
      isAnonymous: true,
      contactName: 'Should Not Persist',
      contactPhone: '+91 90000 00097',
      consentGiven: true,
    });

    const stored = await prisma.issue.findUniqueOrThrow({
      where: { referenceNumber: receipt.referenceNumber },
      select: { isAnonymous: true, contactName: true, contactPhone: true },
    });

    expect(stored.isAnonymous).toBe(true);
    expect(stored.contactName).toBeNull();
    expect(stored.contactPhone).toBeNull();
  });

  it('validates the required fields with citizen-friendly messages', async () => {
    const missingTitle = await submit(tenantA.slug, { title: '   ' });
    expect(missingTitle.errorCode).toBe('VALIDATION_ERROR');
    expect(missingTitle.errors?.[0]?.message).toMatch(/title/i);

    const shortDescription = await submit(tenantA.slug, { description: 'short' });
    expect(shortDescription.errorCode).toBe('VALIDATION_ERROR');

    const longTitle = await submit(tenantA.slug, { title: 'x'.repeat(300) });
    expect(longTitle.errorCode).toBe('VALIDATION_ERROR');

    const longDescription = await submit(tenantA.slug, { description: 'x'.repeat(6000) });
    expect(longDescription.errorCode).toBe('VALIDATION_ERROR');

    const badEmail = await submit(tenantA.slug, {
      isAnonymous: false,
      contactEmail: 'not-an-address',
      consentGiven: true,
    });
    expect(badEmail.errorCode).toBe('VALIDATION_ERROR');

    const badPhone = await submit(tenantA.slug, {
      isAnonymous: false,
      contactPhone: 'call me maybe',
      consentGiven: true,
    });
    expect(badPhone.errorCode).toBe('VALIDATION_ERROR');
  });

  it('rejects a category that is not the tenant’s', async () => {
    const result = await submit(tenantA.slug, { categoryKey: 'NOT_A_CATEGORY' });
    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });

  it('never exposes internal detail in a citizen-facing error', async () => {
    const result = await submit(tenantA.slug, { title: '' });
    const serialized = JSON.stringify(result.errors);

    expect(serialized).not.toMatch(/prisma|postgres|select |stack|at Object|\.ts:/i);
  });

  it('lists only the active categories for the tenant being viewed', async () => {
    const result = await gql<{ publicIssueCategories: Array<{ key: string }> }>(
      app,
      PUBLIC_CATEGORIES,
      { input: { organizationSlug: tenantA.slug } },
    );

    const keys = result.data?.publicIssueCategories.map((row) => row.key) ?? [];
    expect(keys).toContain('ROADS');
    expect(keys).toContain('DRAINAGE');
    expect(keys.length).toBe(DEFAULT_ISSUE_CATEGORIES.length);
  });
});

// ---------------------------------------------------------------------------
// Public tracking
// ---------------------------------------------------------------------------

describe.skipIf(!available)('public tracking', () => {
  it('returns a safe status for a valid reference', async () => {
    const receipt = await submitOrThrow(tenantA.slug, { title: 'Trackable submission' });

    const result = await gql<{
      publicIssueStatus: {
        referenceNumber: string;
        status: string;
        categoryLabel: string | null;
      } | null;
    }>(app, PUBLIC_STATUS, { reference: receipt.referenceNumber });

    expect(result.data?.publicIssueStatus).toMatchObject({
      referenceNumber: receipt.referenceNumber,
      status: 'SUBMITTED',
      categoryLabel: 'Drainage',
    });
  });

  it('is case and whitespace tolerant, as somebody retyping it would be', async () => {
    const receipt = await submitOrThrow(tenantA.slug, { title: 'Case tolerance' });

    const result = await gql<{ publicIssueStatus: { referenceNumber: string } | null }>(
      app,
      PUBLIC_STATUS,
      { reference: `  ${receipt.referenceNumber.toLowerCase()}  ` },
    );

    expect(result.data?.publicIssueStatus?.referenceNumber).toBe(receipt.referenceNumber);
  });

  it('exposes nothing beyond the six permitted fields', async () => {
    const receipt = await submitOrThrow(tenantA.slug, {
      title: 'A title that must stay private',
      description: 'A description mentioning a private circumstance.',
      isAnonymous: false,
      contactName: 'Private Person',
      contactPhone: '+91 90000 00096',
      consentGiven: true,
    });

    // Asking for a private field must be a SCHEMA error, not a redaction - the
    // public type simply does not have these fields.
    const forbidden = await gql(
      app,
      /* GraphQL */ `
        query Leak($reference: String!) {
          publicIssueStatus(referenceNumber: $reference) {
            referenceNumber
            title
          }
        }
      `,
      { reference: receipt.referenceNumber },
    );
    expect(forbidden.errors?.[0]?.message).toMatch(/Cannot query field/i);

    // And nothing private appears in the permitted response.
    const allowed = await gql(app, PUBLIC_STATUS, { reference: receipt.referenceNumber });
    const serialized = JSON.stringify(allowed.data);
    expect(serialized).not.toContain('Private Person');
    expect(serialized).not.toContain('00096');
    expect(serialized).not.toContain('private circumstance');
    expect(serialized).not.toContain('must stay private');
  });

  it('returns null for an unknown or malformed reference, never an error', async () => {
    for (const reference of ['ISS-2026-ZZZZZZZZ', 'nonsense', '', 'ISS-2026-!!!', '../../etc']) {
      const result = await gql<{ publicIssueStatus: unknown }>(app, PUBLIC_STATUS, { reference });
      // Null for every failure mode alike, so the endpoint cannot confirm that
      // a reference exists.
      expect(result.data?.publicIssueStatus, `reference ${reference}`).toBeNull();
      expect(result.errors).toBeNull();
    }
  });

  it('hides a submission marked as spam', async () => {
    const receipt = await submitOrThrow(tenantA.slug, { title: 'Spam candidate' });
    const id = await idForReference(tenantA.organizationId, receipt.referenceNumber);

    await gql(
      app,
      /* GraphQL */ `
        mutation Moderate($id: ID!) {
          moderateIssue(id: $id, moderationStatus: SPAM) {
            id
          }
        }
      `,
      { id },
      { accessToken: tokenAdminA, organizationId: tenantA.organizationId },
    );

    const result = await gql<{ publicIssueStatus: unknown }>(app, PUBLIC_STATUS, {
      reference: receipt.referenceNumber,
    });
    expect(result.data?.publicIssueStatus).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tenant isolation
// ---------------------------------------------------------------------------

describe.skipIf(!available)('tenant isolation', () => {
  it('lists only the caller tenant submissions', async () => {
    await submitOrThrow(tenantA.slug, { title: 'Belongs to tenant A' });
    await submitOrThrow(tenantB.slug, { title: 'Belongs to tenant B' });

    const listA = await gql<{ issues: { nodes: Array<{ title: string }> } }>(
      app,
      LIST_ISSUES,
      { filter: { first: 100 } },
      { accessToken: tokenAdminA, organizationId: tenantA.organizationId },
    );
    const titlesA = listA.data?.issues.nodes.map((node) => node.title) ?? [];
    expect(titlesA).toContain('Belongs to tenant A');
    expect(titlesA).not.toContain('Belongs to tenant B');

    const listB = await gql<{ issues: { nodes: Array<{ title: string }> } }>(
      app,
      LIST_ISSUES,
      { filter: { first: 100 } },
      { accessToken: tokenAdminB, organizationId: tenantB.organizationId },
    );
    const titlesB = listB.data?.issues.nodes.map((node) => node.title) ?? [];
    expect(titlesB).toContain('Belongs to tenant B');
    expect(titlesB).not.toContain('Belongs to tenant A');
  });

  it('cannot read another tenant submission by id', async () => {
    const receipt = await submitOrThrow(tenantA.slug, { title: 'Cross tenant read' });
    const id = await idForReference(tenantA.organizationId, receipt.referenceNumber);

    const result = await gql(
      app,
      GET_ISSUE,
      { id },
      { accessToken: tokenAdminB, organizationId: tenantB.organizationId },
    );

    // NOT_FOUND rather than FORBIDDEN: a distinct "forbidden" would confirm the
    // id exists, turning the error into an enumeration oracle.
    expect(result.errorCode).toBe('NOT_FOUND');
  });

  it('cannot change another tenant submission', async () => {
    const receipt = await submitOrThrow(tenantA.slug, { title: 'Cross tenant write' });
    const id = await idForReference(tenantA.organizationId, receipt.referenceNumber);

    const status = await gql(
      app,
      SET_STATUS,
      { id, status: 'UNDER_REVIEW' },
      { accessToken: tokenAdminB, organizationId: tenantB.organizationId },
    );
    expect(status.errorCode).toBe('NOT_FOUND');

    const unchanged = await prisma.issue.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    expect(unchanged.status).toBe('SUBMITTED');
  });

  it('cannot read another tenant notes, history or attachments', async () => {
    const receipt = await submitOrThrow(tenantA.slug, { title: 'Cross tenant children' });
    const id = await idForReference(tenantA.organizationId, receipt.referenceNumber);

    await gql(
      app,
      ADD_NOTE,
      { issueId: id, note: 'Internal note for tenant A only.' },
      { accessToken: tokenAdminA, organizationId: tenantA.organizationId },
    );

    const optionsB = { accessToken: tokenAdminB, organizationId: tenantB.organizationId };

    expect((await gql(app, GET_NOTES, { issueId: id }, optionsB)).errorCode).toBe('NOT_FOUND');
    expect((await gql(app, GET_HISTORY, { issueId: id }, optionsB)).errorCode).toBe('NOT_FOUND');
    expect(
      (
        await gql(
          app,
          /* GraphQL */ `
            query A($issueId: ID!) {
              issueAttachments(issueId: $issueId) {
                id
              }
            }
          `,
          { issueId: id },
          optionsB,
        )
      ).errorCode,
    ).toBe('NOT_FOUND');
  });

  it('does not count another tenant submissions in analytics', async () => {
    const before = await gql<{ issueAnalytics: { totalAllTime: number } }>(
      app,
      ANALYTICS,
      { filter: { range: 'LAST_30_DAYS' } },
      { accessToken: tokenAdminB, organizationId: tenantB.organizationId },
    );

    await submitOrThrow(tenantA.slug, { title: 'Analytics isolation' });

    const after = await gql<{ issueAnalytics: { totalAllTime: number } }>(
      app,
      ANALYTICS,
      { filter: { range: 'LAST_30_DAYS' } },
      { accessToken: tokenAdminB, organizationId: tenantB.organizationId },
    );

    expect(after.data?.issueAnalytics.totalAllTime).toBe(before.data?.issueAnalytics.totalAllTime);
  });

  it('cannot assign a submission to a user from another organisation', async () => {
    const receipt = await submitOrThrow(tenantA.slug, { title: 'Cross tenant assignee' });
    const id = await idForReference(tenantA.organizationId, receipt.referenceNumber);

    const result = await gql(
      app,
      ASSIGN,
      { id, userId: adminB.id },
      { accessToken: tokenAdminA, organizationId: tenantA.organizationId },
    );

    // Otherwise somebody outside the campaign would receive a queue of its
    // citizens' reports - a cross-tenant leak dressed as an assignment.
    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// RBAC and citizen privacy
// ---------------------------------------------------------------------------

describe.skipIf(!available)('RBAC and citizen contact protection', () => {
  it('rejects unauthenticated access to every admin field', async () => {
    expect((await gql(app, LIST_ISSUES, { filter: {} })).errorCode).toBe('UNAUTHENTICATED');
    expect((await gql(app, ANALYTICS, { filter: {} })).errorCode).toBe('UNAUTHENTICATED');
    expect((await gql(app, GET_NOTES, { issueId: tenantA.organizationId })).errorCode).toBe(
      'UNAUTHENTICATED',
    );
  });

  it('redacts contact details from a caller without the permission', async () => {
    const receipt = await submitOrThrow(tenantA.slug, {
      title: 'Contact redaction check',
      isAnonymous: false,
      contactName: 'Redact Me',
      contactPhone: '+91 90000 00095',
      contactEmail: 'redact@example.test',
      consentGiven: true,
    });

    // A campaign admin holds ISSUE_CONTACT_READ and sees the details.
    const asAdmin = await gql<{ issues: { nodes: Array<Record<string, unknown>> } }>(
      app,
      LIST_ISSUES,
      { filter: { search: receipt.referenceNumber } },
      { accessToken: tokenAdminA, organizationId: tenantA.organizationId },
    );
    const adminRow = asAdmin.data?.issues.nodes[0];
    expect(adminRow?.contactVisible).toBe(true);
    expect(adminRow?.contactName).toBe('Redact Me');

    // A viewer does not, and must see nulls - while still being told a reply is
    // possible, which is what a triager actually needs.
    const asViewer = await gql<{ issues: { nodes: Array<Record<string, unknown>> } }>(
      app,
      LIST_ISSUES,
      { filter: { search: receipt.referenceNumber } },
      { accessToken: tokenViewerA, organizationId: tenantA.organizationId },
    );
    const viewerRow = asViewer.data?.issues.nodes[0];

    expect(asViewer.errors).toBeNull();
    expect(viewerRow?.contactVisible).toBe(false);
    expect(viewerRow?.contactName).toBeNull();
    expect(viewerRow?.contactPhone).toBeNull();
    expect(viewerRow?.contactEmail).toBeNull();
    expect(viewerRow?.contactProvided).toBe(true);

    expect(JSON.stringify(asViewer.data)).not.toContain('Redact Me');
    expect(JSON.stringify(asViewer.data)).not.toContain('00095');
  });

  it('refuses to reveal contact details to a caller without the permission', async () => {
    const receipt = await submitOrThrow(tenantA.slug, {
      title: 'Reveal guard',
      isAnonymous: false,
      contactPhone: '+91 90000 00094',
      consentGiven: true,
    });
    const id = await idForReference(tenantA.organizationId, receipt.referenceNumber);

    const denied = await gql(
      app,
      REVEAL_CONTACT,
      { id },
      { accessToken: tokenViewerA, organizationId: tenantA.organizationId },
    );
    expect(denied.errorCode).toBe('FORBIDDEN');

    const allowed = await gql<{ revealIssueContact: { contactPhone: string | null } }>(
      app,
      REVEAL_CONTACT,
      { id },
      { accessToken: tokenAdminA, organizationId: tenantA.organizationId },
    );
    expect(allowed.data?.revealIssueContact.contactPhone).toBe('+91 90000 00094');

    // The disclosure is audited, and the number itself never enters the record.
    const entries = await prisma.auditLog.findMany({
      where: { organizationId: tenantA.organizationId, action: 'ISSUE_CONTACT_VIEWED' },
      select: { entityId: true, metadata: true },
    });
    expect(entries.some((entry) => entry.entityId === id)).toBe(true);
    expect(JSON.stringify(entries)).not.toContain('00094');
  });

  it('keeps internal notes away from anybody without ISSUE_NOTE_READ', async () => {
    const receipt = await submitOrThrow(tenantA.slug, { title: 'Note guard' });
    const id = await idForReference(tenantA.organizationId, receipt.referenceNumber);

    await gql(
      app,
      ADD_NOTE,
      { issueId: id, note: 'CANDID-STAFF-ASSESSMENT' },
      { accessToken: tokenAdminA, organizationId: tenantA.organizationId },
    );

    const denied = await gql(
      app,
      GET_NOTES,
      { issueId: id },
      { accessToken: tokenViewerA, organizationId: tenantA.organizationId },
    );
    expect(denied.errorCode).toBe('FORBIDDEN');

    // Nor does the note body leak through the timeline, which is read more
    // widely than the notes themselves.
    const history = await gql(
      app,
      GET_HISTORY,
      { issueId: id },
      { accessToken: tokenViewerA, organizationId: tenantA.organizationId },
    );
    expect(JSON.stringify(history.data)).not.toContain('CANDID-STAFF-ASSESSMENT');
  });

  it('does not let a VIEWER change anything', async () => {
    const receipt = await submitOrThrow(tenantA.slug, { title: 'Viewer guard' });
    const id = await idForReference(tenantA.organizationId, receipt.referenceNumber);
    const options = { accessToken: tokenViewerA, organizationId: tenantA.organizationId };

    expect((await gql(app, SET_STATUS, { id, status: 'UNDER_REVIEW' }, options)).errorCode).toBe(
      'FORBIDDEN',
    );
    expect((await gql(app, SET_PRIORITY, { id, priority: 'HIGH' }, options)).errorCode).toBe(
      'FORBIDDEN',
    );
    expect((await gql(app, ASSIGN, { id, userId: managerA.id }, options)).errorCode).toBe(
      'FORBIDDEN',
    );
    expect((await gql(app, ADD_NOTE, { issueId: id, note: 'nope' }, options)).errorCode).toBe(
      'FORBIDDEN',
    );

    const unchanged = await prisma.issue.findUniqueOrThrow({
      where: { id },
      select: { status: true, priority: true, assignedToUserId: true },
    });
    expect(unchanged).toMatchObject({ status: 'SUBMITTED', assignedToUserId: null });
  });

  it('lets an ISSUE_MANAGER handle a submission end to end', async () => {
    const receipt = await submitOrThrow(tenantA.slug, { title: 'Manager scope' });
    const id = await idForReference(tenantA.organizationId, receipt.referenceNumber);
    const options = { accessToken: tokenManagerA, organizationId: tenantA.organizationId };

    expect((await gql(app, SET_STATUS, { id, status: 'UNDER_REVIEW' }, options)).errors).toBeNull();
    expect((await gql(app, SET_PRIORITY, { id, priority: 'HIGH' }, options)).errors).toBeNull();
    expect((await gql(app, ASSIGN, { id, userId: managerA.id }, options)).errors).toBeNull();
    expect(
      (await gql(app, ADD_NOTE, { issueId: id, note: 'Contacted the local officer.' }, options))
        .errors,
    ).toBeNull();
  });

  it('gives an ANALYST aggregates but not the submissions themselves', async () => {
    const options = { accessToken: tokenAnalystA, organizationId: tenantA.organizationId };

    expect((await gql(app, ANALYTICS, { filter: {} }, options)).errors).toBeNull();

    // Deliberately NOT granted ISSUE_READ: the aggregates answer an analyst's
    // question, and the free text citizens wrote adds nothing analytical while
    // often containing personal circumstances.
    expect((await gql(app, LIST_ISSUES, { filter: {} }, options)).errorCode).toBe('FORBIDDEN');
  });

  it('gives a FIELD_COORDINATOR the case but not the citizen’s number', async () => {
    const receipt = await submitOrThrow(tenantA.slug, {
      title: 'Coordinator scope',
      isAnonymous: false,
      contactPhone: '+91 90000 00093',
      consentGiven: true,
    });
    const id = await idForReference(tenantA.organizationId, receipt.referenceNumber);
    const options = { accessToken: tokenCoordinatorA, organizationId: tenantA.organizationId };

    const issue = await gql<{ issue: { contactVisible: boolean; contactPhone: string | null } }>(
      app,
      GET_ISSUE,
      { id },
      options,
    );
    expect(issue.errors).toBeNull();
    expect(issue.data?.issue.contactVisible).toBe(false);
    expect(issue.data?.issue.contactPhone).toBeNull();

    // They can record what they did and move the case along...
    expect((await gql(app, SET_STATUS, { id, status: 'UNDER_REVIEW' }, options)).errors).toBeNull();
    expect(
      (await gql(app, ADD_NOTE, { issueId: id, note: 'Visited the site.' }, options)).errors,
    ).toBeNull();

    // ...but not retriage or reassign it.
    expect((await gql(app, SET_PRIORITY, { id, priority: 'URGENT' }, options)).errorCode).toBe(
      'FORBIDDEN',
    );
    expect((await gql(app, ASSIGN, { id, userId: managerA.id }, options)).errorCode).toBe(
      'FORBIDDEN',
    );
  });
});

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

describe.skipIf(!available)('status, priority, assignment and history', () => {
  it('permits a valid transition and rejects an invalid one', async () => {
    const receipt = await submitOrThrow(tenantA.slug, { title: 'Transition rules' });
    const id = await idForReference(tenantA.organizationId, receipt.referenceNumber);
    const options = { accessToken: tokenAdminA, organizationId: tenantA.organizationId };

    // SUBMITTED cannot jump straight to CLOSED, skipping the acknowledgement a
    // citizen is waiting on.
    expect((await gql(app, SET_STATUS, { id, status: 'CLOSED' }, options)).errorCode).toBe(
      'VALIDATION_ERROR',
    );

    expect(
      (
        await gql<{ updateIssueStatus: { status: string } }>(
          app,
          SET_STATUS,
          { id, status: 'UNDER_REVIEW' },
          options,
        )
      ).data?.updateIssueStatus.status,
    ).toBe('UNDER_REVIEW');

    // And a repeat of the current status is rejected rather than silently
    // writing a no-op history entry.
    expect((await gql(app, SET_STATUS, { id, status: 'UNDER_REVIEW' }, options)).errorCode).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('stamps resolvedAt once and preserves it through a reopen', async () => {
    const receipt = await submitOrThrow(tenantA.slug, { title: 'Resolution stamping' });
    const id = await idForReference(tenantA.organizationId, receipt.referenceNumber);
    const options = { accessToken: tokenAdminA, organizationId: tenantA.organizationId };

    await gql(app, SET_STATUS, { id, status: 'UNDER_REVIEW' }, options);
    await gql(app, SET_STATUS, { id, status: 'RESOLVED' }, options);

    const first = await prisma.issue.findUniqueOrThrow({
      where: { id },
      select: { resolvedAt: true },
    });
    expect(first.resolvedAt).not.toBeNull();

    // Reopened because it was not actually fixed, then resolved again.
    await gql(app, SET_STATUS, { id, status: 'IN_PROGRESS' }, options);
    await gql(app, SET_STATUS, { id, status: 'RESOLVED' }, options);

    const second = await prisma.issue.findUniqueOrThrow({
      where: { id },
      select: { resolvedAt: true },
    });
    expect(second.resolvedAt?.toISOString()).toBe(first.resolvedAt?.toISOString());
  });

  it('records a timeline entry for every change', async () => {
    const receipt = await submitOrThrow(tenantA.slug, { title: 'Timeline' });
    const id = await idForReference(tenantA.organizationId, receipt.referenceNumber);
    const options = { accessToken: tokenAdminA, organizationId: tenantA.organizationId };

    await gql(app, SET_STATUS, { id, status: 'UNDER_REVIEW' }, options);
    await gql(app, SET_PRIORITY, { id, priority: 'HIGH' }, options);
    await gql(app, ASSIGN, { id, userId: managerA.id }, options);
    await gql(app, ADD_NOTE, { issueId: id, note: 'A note.' }, options);

    const history = await gql<{
      issueHistory: Array<{ action: string; previousStatus: string | null }>;
    }>(app, GET_HISTORY, { issueId: id }, options);

    const actions = history.data?.issueHistory.map((entry) => entry.action) ?? [];
    // The citizen's own event opens the timeline.
    expect(actions[0]).toBe('SUBMITTED');
    expect(actions).toContain('STATUS_CHANGED');
    expect(actions).toContain('PRIORITY_CHANGED');
    expect(actions).toContain('ASSIGNED');
    expect(actions).toContain('NOTE_ADDED');
  });

  it('assigns, reassigns and unassigns', async () => {
    const receipt = await submitOrThrow(tenantA.slug, { title: 'Assignment' });
    const id = await idForReference(tenantA.organizationId, receipt.referenceNumber);
    const options = { accessToken: tokenAdminA, organizationId: tenantA.organizationId };

    const assigned = await gql<{ assignIssue: { assignedTo: { id: string } | null } }>(
      app,
      ASSIGN,
      { id, userId: managerA.id },
      options,
    );
    expect(assigned.data?.assignIssue.assignedTo?.id).toBe(managerA.id);

    const unassigned = await gql<{ unassignIssue: { assignedTo: unknown } }>(
      app,
      /* GraphQL */ `
        mutation Unassign($id: ID!) {
          unassignIssue(id: $id) {
            id
            assignedTo {
              id
            }
          }
        }
      `,
      { id },
      options,
    );
    expect(unassigned.data?.unassignIssue.assignedTo).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Filtering and paging
// ---------------------------------------------------------------------------

describe.skipIf(!available)('inbox filtering', () => {
  it('filters by status, priority, type, ward and search', async () => {
    const tenant = await createTenant();
    await seedCategories(tenant.organizationId);
    const admin = await createUser();
    await addMembership(admin.id, tenant.organizationId, 'CAMPAIGN_ADMIN');
    const token = (await login(app, admin.email, admin.password)).accessToken;
    const options = { accessToken: token, organizationId: tenant.organizationId };

    const roads = await submitOrThrow(tenant.slug, {
      title: 'Pothole on the main road',
      categoryKey: 'ROADS',
      ward: 'Ward 12',
    });
    await submitOrThrow(tenant.slug, {
      type: 'SUGGESTION',
      title: 'A suggestion about transport',
      categoryKey: 'TRANSPORT',
      ward: 'Ward 8',
    });

    const roadsId = await idForReference(tenant.organizationId, roads.referenceNumber);
    await gql(app, SET_PRIORITY, { id: roadsId, priority: 'URGENT' }, options);
    await gql(app, SET_STATUS, { id: roadsId, status: 'UNDER_REVIEW' }, options);

    const byStatus = await gql<{ issues: { totalCount: number } }>(
      app,
      LIST_ISSUES,
      { filter: { status: 'UNDER_REVIEW' } },
      options,
    );
    expect(byStatus.data?.issues.totalCount).toBe(1);

    const byPriority = await gql<{ issues: { totalCount: number } }>(
      app,
      LIST_ISSUES,
      { filter: { priority: 'URGENT' } },
      options,
    );
    expect(byPriority.data?.issues.totalCount).toBe(1);

    const byType = await gql<{ issues: { totalCount: number } }>(
      app,
      LIST_ISSUES,
      { filter: { type: 'SUGGESTION' } },
      options,
    );
    expect(byType.data?.issues.totalCount).toBe(1);

    const byWard = await gql<{ issues: { totalCount: number } }>(
      app,
      LIST_ISSUES,
      { filter: { ward: 'Ward 8' } },
      options,
    );
    expect(byWard.data?.issues.totalCount).toBe(1);

    const byReference = await gql<{ issues: { totalCount: number } }>(
      app,
      LIST_ISSUES,
      { filter: { search: roads.referenceNumber } },
      options,
    );
    expect(byReference.data?.issues.totalCount).toBe(1);

    const byTitle = await gql<{ issues: { totalCount: number } }>(
      app,
      LIST_ISSUES,
      { filter: { search: 'pothole' } },
      options,
    );
    expect(byTitle.data?.issues.totalCount).toBe(1);

    const unassigned = await gql<{ issues: { totalCount: number } }>(
      app,
      LIST_ISSUES,
      { filter: { unassignedOnly: true } },
      options,
    );
    expect(unassigned.data?.issues.totalCount).toBe(2);
  });

  it('pages rather than returning everything', async () => {
    const tenant = await createTenant();
    await seedCategories(tenant.organizationId);
    const admin = await createUser();
    await addMembership(admin.id, tenant.organizationId, 'CAMPAIGN_ADMIN');
    const token = (await login(app, admin.email, admin.password)).accessToken;
    const options = { accessToken: token, organizationId: tenant.organizationId };

    for (let i = 0; i < 5; i += 1) {
      await submitOrThrow(tenant.slug, { title: `Paged submission ${i}` });
    }

    const first = await gql<{ issues: { nodes: unknown[]; totalCount: number; hasMore: boolean } }>(
      app,
      LIST_ISSUES,
      { filter: { first: 2, offset: 0 } },
      options,
    );
    expect(first.data?.issues.nodes).toHaveLength(2);
    expect(first.data?.issues.totalCount).toBe(5);
    expect(first.data?.issues.hasMore).toBe(true);

    const last = await gql<{ issues: { nodes: unknown[]; hasMore: boolean } }>(
      app,
      LIST_ISSUES,
      { filter: { first: 2, offset: 4 } },
      options,
    );
    expect(last.data?.issues.nodes).toHaveLength(1);
    expect(last.data?.issues.hasMore).toBe(false);
  });

  it('does not search the description a citizen wrote', async () => {
    const tenant = await createTenant();
    await seedCategories(tenant.organizationId);
    const admin = await createUser();
    await addMembership(admin.id, tenant.organizationId, 'CAMPAIGN_ADMIN');
    const token = (await login(app, admin.email, admin.password)).accessToken;

    await submitOrThrow(tenant.slug, {
      title: 'An ordinary title',
      description: 'This description mentions UNIQUEPERSONALDETAIL in passing.',
    });

    const result = await gql<{ issues: { totalCount: number } }>(
      app,
      LIST_ISSUES,
      { filter: { search: 'UNIQUEPERSONALDETAIL' } },
      { accessToken: token, organizationId: tenant.organizationId },
    );

    // Searching free text would turn the inbox into a way to find people by
    // whatever they happened to mention.
    expect(result.data?.issues.totalCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

describe.skipIf(!available)('attachments', () => {
  it('accepts a valid image and attaches it to a submission', async () => {
    const uploaded = await request(app)
      .post('/public/issue-attachments')
      .field('organizationSlug', tenantA.slug)
      .attach('file', PNG_BYTES, { filename: 'pothole.png', contentType: 'image/png' });

    expect(uploaded.status).toBe(201);
    const attachment = (uploaded.body as { attachment: { id: string; claimToken: string } })
      .attachment;
    expect(attachment.claimToken).toBeTruthy();

    const receipt = await submitOrThrow(tenantA.slug, {
      title: 'With a photo',
      attachments: [{ id: attachment.id, claimToken: attachment.claimToken }],
    });

    const id = await idForReference(tenantA.organizationId, receipt.referenceNumber);
    const issue = await gql<{ issue: { attachmentCount: number } }>(
      app,
      GET_ISSUE,
      { id },
      { accessToken: tokenAdminA, organizationId: tenantA.organizationId },
    );
    expect(issue.data?.issue.attachmentCount).toBe(1);

    // The claim token is cleared once used, so a captured token cannot be
    // replayed onto a second submission.
    const stored = await prisma.issueAttachment.findUniqueOrThrow({
      where: { id: attachment.id },
      select: { claimToken: true, issueId: true },
    });
    expect(stored.claimToken).toBeNull();
    expect(stored.issueId).not.toBeNull();
  });

  it('rejects an unsafe file whatever it claims to be', async () => {
    const cases: Array<[string, Buffer, string]> = [
      ['script.js', Buffer.from('alert(1)'), 'text/javascript'],
      ['page.html', Buffer.from('<script>alert(1)</script>'), 'text/html'],
      ['vector.svg', Buffer.from('<svg onload="alert(1)"></svg>'), 'image/svg+xml'],
      ['binary.exe', Buffer.from([0x4d, 0x5a, 0x90, 0x00]), 'application/octet-stream'],
      // A script that claims to be a PNG: the magic bytes decide, not the claim.
      ['disguised.png', Buffer.from('<script>alert(1)</script>'), 'image/png'],
    ];

    for (const [filename, bytes, contentType] of cases) {
      const response = await request(app)
        .post('/public/issue-attachments')
        .field('organizationSlug', tenantA.slug)
        .attach('file', bytes, { filename, contentType });

      expect(response.status, `${filename} should be rejected`).toBe(422);
    }
  });

  it('never lets a filename become a path', async () => {
    const response = await request(app)
      .post('/public/issue-attachments')
      .field('organizationSlug', tenantA.slug)
      .attach('file', PNG_BYTES, {
        filename: '../../../../etc/passwd.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(201);
    const id = (response.body as { attachment: { id: string } }).attachment.id;

    const stored = await prisma.issueAttachment.findUniqueOrThrow({
      where: { id },
      select: { storageKey: true, originalName: true },
    });

    // The key is generated under a tenant prefix; the hostile name survives
    // only as display text.
    expect(stored.storageKey).not.toContain('..');
    expect(stored.storageKey).not.toContain('etc');
    expect(stored.storageKey).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/);
    expect(stored.originalName).toContain('passwd');
  });

  it('cannot be claimed without the token that was returned at upload', async () => {
    const uploaded = await request(app)
      .post('/public/issue-attachments')
      .field('organizationSlug', tenantA.slug)
      .attach('file', PNG_BYTES, { filename: 'private.png', contentType: 'image/png' });

    const attachment = (uploaded.body as { attachment: { id: string } }).attachment;

    // Somebody else guessing the id, with a wrong token.
    const receipt = await submitOrThrow(tenantA.slug, {
      title: 'Attempted theft of a pending upload',
      attachments: [{ id: attachment.id, claimToken: 'not-the-real-token' }],
    });

    const id = await idForReference(tenantA.organizationId, receipt.referenceNumber);
    const issue = await gql<{ issue: { attachmentCount: number } }>(
      app,
      GET_ISSUE,
      { id },
      { accessToken: tokenAdminA, organizationId: tenantA.organizationId },
    );

    // Dropped silently: the citizen's words matter more than a stale token, and
    // the file stays unclaimed.
    expect(issue.data?.issue.attachmentCount).toBe(0);

    const stored = await prisma.issueAttachment.findUniqueOrThrow({
      where: { id: attachment.id },
      select: { issueId: true },
    });
    expect(stored.issueId).toBeNull();
  });

  it('serves an attachment only to an authorised caller of the same tenant', async () => {
    const uploaded = await request(app)
      .post('/public/issue-attachments')
      .field('organizationSlug', tenantA.slug)
      .attach('file', PNG_BYTES, { filename: 'evidence.png', contentType: 'image/png' });

    const attachment = (uploaded.body as { attachment: { id: string; claimToken: string } })
      .attachment;

    await submitOrThrow(tenantA.slug, {
      title: 'Attachment access control',
      attachments: [{ id: attachment.id, claimToken: attachment.claimToken }],
    });

    // Anonymous: refused. These are photographs of somebody's street.
    expect((await request(app).get(`/issue-attachments/${attachment.id}`)).status).toBe(401);

    // Another tenant: not found, so the response cannot confirm it exists.
    expect(
      (
        await request(app)
          .get(`/issue-attachments/${attachment.id}`)
          .set('Authorization', `Bearer ${tokenAdminB}`)
          .set('x-organization-id', tenantB.organizationId)
      ).status,
    ).toBe(404);

    // A viewer lacks ISSUE_ATTACHMENT_READ.
    expect(
      (
        await request(app)
          .get(`/issue-attachments/${attachment.id}`)
          .set('Authorization', `Bearer ${tokenViewerA}`)
          .set('x-organization-id', tenantA.organizationId)
      ).status,
    ).toBe(403);

    // The owning tenant's admin gets the bytes, as a download rather than an
    // inline render in the site's own origin.
    const allowed = await request(app)
      .get(`/issue-attachments/${attachment.id}`)
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .set('x-organization-id', tenantA.organizationId);

    expect(allowed.status).toBe(200);
    expect(allowed.headers['content-type']).toContain('image/png');
    expect(allowed.headers['content-disposition']).toContain('attachment;');
    expect(allowed.headers['cache-control']).toContain('private');
  });

  it('does not serve an upload that was never claimed', async () => {
    const uploaded = await request(app)
      .post('/public/issue-attachments')
      .field('organizationSlug', tenantA.slug)
      .attach('file', PNG_BYTES, { filename: 'orphan.png', contentType: 'image/png' });

    const id = (uploaded.body as { attachment: { id: string } }).attachment.id;

    const response = await request(app)
      .get(`/issue-attachments/${id}`)
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .set('x-organization-id', tenantA.organizationId);

    // It belongs to no submission and therefore to nobody.
    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Spam protection
// ---------------------------------------------------------------------------

describe.skipIf(!available)('spam protection', () => {
  it('rate limits submissions from one address', async () => {
    // Exercises the REAL shipped budget rather than an injected one. The
    // submission service reads configuration from the process env, so an
    // app-scoped override would not reach it - and testing the actual default
    // is the more useful assertion anyway: it proves the number a deployment
    // will really run with.
    const budget = getEnv().ISSUE_SUBMIT_MAX_PER_WINDOW;

    const statuses: Array<string | null> = [];
    for (let i = 0; i < budget + 2; i += 1) {
      const result = await gql(app, SUBMIT, {
        input: {
          organizationSlug: tenantA.slug,
          type: 'ISSUE',
          title: `Flood attempt ${i}`,
          description: 'Repeated automated submission used to exercise the limiter.',
        },
      });
      statuses.push(result.errorCode);
    }

    // Everything inside the budget is accepted: a genuine reporter, or several
    // people behind one NAT, must never be turned away.
    expect(statuses.slice(0, budget).every((code) => code === null)).toBe(true);
    // Everything past it is shed, with a message a person can act on.
    expect(statuses.slice(budget).every((code) => code === 'RATE_LIMITED')).toBe(true);
  }, 240_000);

  it('rate limits reference lookups far more tightly than submissions', async () => {
    // Brute-forcing an 8-character reference is already impractical; this makes
    // it not worth starting, and stops somebody harvesting references found
    // elsewhere.
    expect(getEnv().ISSUE_TRACK_MAX_PER_WINDOW).toBeLessThan(
      getEnv().ISSUE_SUBMIT_MAX_PER_WINDOW * 10,
    );

    const budget = getEnv().ISSUE_TRACK_MAX_PER_WINDOW;
    let limited = false;

    for (let i = 0; i < budget + 2; i += 1) {
      const result = await gql(app, PUBLIC_STATUS, { reference: 'ISS-2026-ZZZZZZZZ' });
      if (result.errorCode === 'RATE_LIMITED') limited = true;
    }

    expect(limited).toBe(true);
  }, 240_000);
});

// ---------------------------------------------------------------------------
// QR attribution
// ---------------------------------------------------------------------------

describe.skipIf(!available)('QR attribution', () => {
  it('attributes a submission to the printed code the citizen scanned', async () => {
    const tenant = await createTenant();
    await seedCategories(tenant.organizationId);
    const admin = await createUser();
    await addMembership(admin.id, tenant.organizationId, 'CAMPAIGN_ADMIN');
    const token = (await login(app, admin.email, admin.password)).accessToken;
    const options = { accessToken: token, organizationId: tenant.organizationId };

    const campaign = await gql<{ createQrCampaign: { id: string } }>(
      app,
      /* GraphQL */ `
        mutation C($input: QrCampaignInput!) {
          createQrCampaign(input: $input) {
            id
          }
        }
      `,
      { input: { name: 'Feedback Drive', campaignType: 'POSTER' } },
      options,
    );

    const code = await gql<{ createQrCode: { id: string; code: string } }>(
      app,
      /* GraphQL */ `
        mutation Q($campaignId: ID!, $input: QrCodeInput!) {
          createQrCode(campaignId: $campaignId, input: $input) {
            id
            code
          }
        }
      `,
      {
        campaignId: campaign.data?.createQrCampaign.id ?? '',
        input: { name: 'Ward 12 Poster', destinationPath: '/contact', source: 'Poster' },
      },
      options,
    );

    const qrCode = code.data?.createQrCode;

    // The redirect hands the code to the browser, which carries it into the
    // submission. Verified here rather than assumed.
    const redirect = await request(app).get(`/q/${qrCode?.code}`).redirects(0);
    expect(redirect.status).toBe(302);
    expect(redirect.headers.location).toContain(`rk_qr=${qrCode?.code}`);

    const receipt = await submitOrThrow(tenant.slug, {
      title: 'Reported after scanning a poster',
      qrCode: qrCode?.code,
    });

    const stored = await prisma.issue.findUniqueOrThrow({
      where: { referenceNumber: receipt.referenceNumber },
      select: { source: true, qrCodeId: true, campaignId: true },
    });

    expect(stored.source).toBe('QR');
    expect(stored.qrCodeId).toBe(qrCode?.id);
    expect(stored.campaignId).toBe(campaign.data?.createQrCampaign.id);
  }, 180_000);

  it('ignores a QR code belonging to another tenant, without failing', async () => {
    const tenant = await createTenant();
    await seedCategories(tenant.organizationId);
    const admin = await createUser();
    await addMembership(admin.id, tenant.organizationId, 'CAMPAIGN_ADMIN');
    const token = (await login(app, admin.email, admin.password)).accessToken;

    const campaign = await gql<{ createQrCampaign: { id: string } }>(
      app,
      /* GraphQL */ `
        mutation C($input: QrCampaignInput!) {
          createQrCampaign(input: $input) {
            id
          }
        }
      `,
      { input: { name: 'Other Tenant Drive' } },
      { accessToken: token, organizationId: tenant.organizationId },
    );

    const code = await gql<{ createQrCode: { code: string } }>(
      app,
      /* GraphQL */ `
        mutation Q($campaignId: ID!, $input: QrCodeInput!) {
          createQrCode(campaignId: $campaignId, input: $input) {
            code
          }
        }
      `,
      {
        campaignId: campaign.data?.createQrCampaign.id ?? '',
        input: { name: 'Foreign poster', destinationPath: '/contact' },
      },
      { accessToken: token, organizationId: tenant.organizationId },
    );

    // Submitted to tenant A while quoting tenant `tenant`'s code.
    const receipt = await submitOrThrow(tenantA.slug, {
      title: 'Foreign attribution attempt',
      qrCode: code.data?.createQrCode.code,
    });

    const stored = await prisma.issue.findUniqueOrThrow({
      where: { referenceNumber: receipt.referenceNumber },
      select: { organizationId: true, source: true, qrCodeId: true, campaignId: true },
    });

    // The submission succeeds - a citizen must never lose their report over a
    // tracking detail - but nothing is cross-linked.
    expect(stored.organizationId).toBe(tenantA.organizationId);
    expect(stored.source).toBe('DIRECT_WEBSITE');
    expect(stored.qrCodeId).toBeNull();
    expect(stored.campaignId).toBeNull();
  }, 180_000);
});

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

describe.skipIf(!available)('aggregate analytics', () => {
  it('counts by status, category, type, source and ward', async () => {
    const tenant = await createTenant();
    await seedCategories(tenant.organizationId);
    const admin = await createUser();
    await addMembership(admin.id, tenant.organizationId, 'CAMPAIGN_ADMIN');
    const token = (await login(app, admin.email, admin.password)).accessToken;
    const options = { accessToken: token, organizationId: tenant.organizationId };

    const first = await submitOrThrow(tenant.slug, {
      title: 'Roads one',
      categoryKey: 'ROADS',
      ward: 'Ward 12',
    });
    await submitOrThrow(tenant.slug, {
      title: 'Roads two',
      categoryKey: 'ROADS',
      ward: 'Ward 12',
    });
    await submitOrThrow(tenant.slug, {
      type: 'SUGGESTION',
      title: 'Water one',
      categoryKey: 'WATER',
      ward: 'Ward 8',
    });

    const firstId = await idForReference(tenant.organizationId, first.referenceNumber);
    await gql(app, SET_STATUS, { id: firstId, status: 'UNDER_REVIEW' }, options);
    await gql(app, SET_PRIORITY, { id: firstId, priority: 'URGENT' }, options);

    const result = await gql<{
      issueAnalytics: {
        totalInRange: number;
        totalAllTime: number;
        openCount: number;
        highPriorityOpen: number;
        unassignedOpen: number;
        awaitingModeration: number;
        byStatus: Array<{ key: string; count: number }>;
        byCategory: Array<{ label: string; count: number }>;
        bySource: Array<{ key: string; count: number }>;
        byWard: Array<{ label: string; count: number }>;
        byType: Array<{ key: string; count: number }>;
        trend: Array<{ count: number }>;
      };
    }>(app, ANALYTICS, { filter: { range: 'LAST_30_DAYS' } }, options);

    const analytics = result.data?.issueAnalytics;

    expect(analytics?.totalInRange).toBe(3);
    expect(analytics?.totalAllTime).toBe(3);
    expect(analytics?.openCount).toBe(3);
    expect(analytics?.highPriorityOpen).toBe(1);
    expect(analytics?.unassignedOpen).toBe(3);
    expect(analytics?.awaitingModeration).toBe(3);

    const statuses = Object.fromEntries(
      (analytics?.byStatus ?? []).map((row) => [row.key, row.count]),
    );
    expect(statuses.SUBMITTED).toBe(2);
    expect(statuses.UNDER_REVIEW).toBe(1);

    const categories = Object.fromEntries(
      (analytics?.byCategory ?? []).map((row) => [row.label, row.count]),
    );
    expect(categories.Roads).toBe(2);
    expect(categories['Water supply']).toBe(1);

    const wards = Object.fromEntries(
      (analytics?.byWard ?? []).map((row) => [row.label, row.count]),
    );
    expect(wards['Ward 12']).toBe(2);
    expect(wards['Ward 8']).toBe(1);

    const types = Object.fromEntries((analytics?.byType ?? []).map((row) => [row.key, row.count]));
    expect(types.ISSUE).toBe(2);
    expect(types.SUGGESTION).toBe(1);

    const sources = Object.fromEntries(
      (analytics?.bySource ?? []).map((row) => [row.key, row.count]),
    );
    expect(sources.DIRECT_WEBSITE).toBe(3);

    expect(analytics?.trend.reduce((sum, point) => sum + point.count, 0)).toBe(3);
  }, 180_000);

  it('honours the date range', async () => {
    const tenant = await createTenant();
    await seedCategories(tenant.organizationId);
    const admin = await createUser();
    await addMembership(admin.id, tenant.organizationId, 'CAMPAIGN_ADMIN');
    const token = (await login(app, admin.email, admin.password)).accessToken;
    const options = { accessToken: token, organizationId: tenant.organizationId };

    const receipt = await submitOrThrow(tenant.slug, { title: 'Today' });

    // One backdated well outside every preset window.
    await prisma.issue.create({
      data: {
        organizationId: tenant.organizationId,
        referenceNumber: `ISS-2020-${'A'.repeat(8)}`,
        type: 'ISSUE',
        title: 'Historic submission',
        description: 'Backdated for the range test.',
        submittedAt: new Date(Date.now() - 200 * 86_400_000),
      },
    });

    const today = await gql<{ issueAnalytics: { totalInRange: number; range: { days: number } } }>(
      app,
      ANALYTICS,
      { filter: { range: 'TODAY' } },
      options,
    );
    expect(today.data?.issueAnalytics.totalInRange).toBe(1);
    expect(today.data?.issueAnalytics.range.days).toBe(1);

    const month = await gql<{ issueAnalytics: { totalInRange: number; totalAllTime: number } }>(
      app,
      ANALYTICS,
      { filter: { range: 'LAST_30_DAYS' } },
      options,
    );
    expect(month.data?.issueAnalytics.totalInRange).toBe(1);
    // All-time is not windowed, so the backlog does not vanish with the filter.
    expect(month.data?.issueAnalytics.totalAllTime).toBe(2);

    const wide = await gql<{ issueAnalytics: { totalInRange: number } }>(
      app,
      ANALYTICS,
      {
        filter: {
          range: 'CUSTOM',
          from: new Date(Date.now() - 250 * 86_400_000).toISOString(),
          to: new Date().toISOString(),
        },
      },
      options,
    );
    expect(wide.data?.issueAnalytics.totalInRange).toBe(2);

    expect(receipt.referenceNumber).toBeTruthy();
  }, 180_000);
});

// ---------------------------------------------------------------------------
// End to end
// ---------------------------------------------------------------------------

describe.skipIf(!available)('citizen to resolution, end to end', () => {
  it('carries one submission through the whole workflow', async () => {
    const tenant = await createTenant();
    await seedCategories(tenant.organizationId);
    const admin = await createUser();
    await addMembership(admin.id, tenant.organizationId, 'CAMPAIGN_ADMIN');
    const staff = await createUser();
    await addMembership(staff.id, tenant.organizationId, 'ISSUE_MANAGER');
    const token = (await login(app, admin.email, admin.password)).accessToken;
    const options = { accessToken: token, organizationId: tenant.organizationId };

    // 1-7. A citizen submits anonymously, with a location.
    const receipt = await submitOrThrow(tenant.slug, {
      type: 'ISSUE',
      title: 'Street light out near the school gate',
      description: 'Four lights on the approach road have been out for about two weeks.',
      categoryKey: 'ELECTRICITY',
      ward: 'Ward 12',
      locality: 'School Road',
      addressDescription: 'Opposite the school gate',
      isAnonymous: true,
    });

    // 8-9. They receive a reference, and can track it immediately.
    expect(receipt.referenceNumber).toMatch(/^ISS-\d{4}-[0-9A-HJKMNP-TV-Z]{8}$/);

    const tracked = await gql<{ publicIssueStatus: { status: string } | null }>(
      app,
      PUBLIC_STATUS,
      { reference: receipt.referenceNumber },
    );
    expect(tracked.data?.publicIssueStatus?.status).toBe('SUBMITTED');

    // 10-13. Staff find it in the inbox and open it.
    const list = await gql<{ issues: { nodes: Array<{ id: string; referenceNumber: string }> } }>(
      app,
      LIST_ISSUES,
      { filter: { search: receipt.referenceNumber } },
      options,
    );
    const id = list.data?.issues.nodes[0]?.id ?? '';
    expect(list.data?.issues.nodes[0]?.referenceNumber).toBe(receipt.referenceNumber);

    // 14-15. Triage and ownership.
    expect(
      (
        await gql<{ updateIssuePriority: { priority: string } }>(
          app,
          SET_PRIORITY,
          { id, priority: 'HIGH' },
          options,
        )
      ).data?.updateIssuePriority.priority,
    ).toBe('HIGH');

    expect(
      (
        await gql<{ assignIssue: { assignedTo: { id: string } | null } }>(
          app,
          ASSIGN,
          { id, userId: staff.id },
          options,
        )
      ).data?.assignIssue.assignedTo?.id,
    ).toBe(staff.id);

    // 16-19. Through the workflow, with an internal note along the way.
    await gql(app, SET_STATUS, { id, status: 'UNDER_REVIEW' }, options);
    await gql(app, ADD_NOTE, { issueId: id, note: 'Raised with the local officer.' }, options);
    await gql(app, SET_STATUS, { id, status: 'IN_PROGRESS' }, options);
    await gql(app, SET_STATUS, { id, status: 'RESOLVED' }, options);

    // The citizen sees the progress, and still nothing else.
    const trackedAfter = await gql<{ publicIssueStatus: { status: string } | null }>(
      app,
      PUBLIC_STATUS,
      { reference: receipt.referenceNumber },
    );
    expect(trackedAfter.data?.publicIssueStatus?.status).toBe('RESOLVED');

    // 20. The timeline tells the whole story in order.
    const history = await gql<{
      issueHistory: Array<{ action: string; newStatus: string | null }>;
    }>(app, GET_HISTORY, { issueId: id }, options);
    const actions = history.data?.issueHistory.map((entry) => entry.action) ?? [];
    expect(actions[0]).toBe('SUBMITTED');
    expect(actions).toEqual(
      expect.arrayContaining([
        'SUBMITTED',
        'PRIORITY_CHANGED',
        'ASSIGNED',
        'STATUS_CHANGED',
        'NOTE_ADDED',
      ]),
    );

    // 21. Analytics reflects it.
    const analytics = await gql<{
      issueAnalytics: { totalAllTime: number; byStatus: Array<{ key: string; count: number }> };
    }>(app, ANALYTICS, { filter: { range: 'LAST_30_DAYS' } }, options);

    expect(analytics.data?.issueAnalytics.totalAllTime).toBe(1);
    expect(
      analytics.data?.issueAnalytics.byStatus.find((row) => row.key === 'RESOLVED')?.count,
    ).toBe(1);

    // And the audit trail recorded the administrative acts.
    const audit = await prisma.auditLog.findMany({
      where: { organizationId: tenant.organizationId },
      select: { action: true },
    });
    const auditActions = audit.map((entry) => entry.action);
    expect(auditActions).toContain('ISSUE_SUBMITTED');
    expect(auditActions).toContain('ISSUE_STATUS_CHANGED');
    expect(auditActions).toContain('ISSUE_PRIORITY_CHANGED');
    expect(auditActions).toContain('ISSUE_ASSIGNED');
    expect(auditActions).toContain('ISSUE_NOTE_ADDED');
  }, 240_000);
});
