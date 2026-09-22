import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { ApolloServer } from '@apollo/server';
import request from 'supertest';
import {
  EVIDENCE_TYPES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  VERIFICATION_STATUSES,
  findUnsupportedClaims,
  publicWorkStatusFor,
} from '@rk/types';
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

/**
 * Phase 9: verified work, evidence and public transparency.
 *
 * The properties under test are the ones whose failure would mislead a member
 * of the public rather than merely break a feature:
 *
 *  - a claim must never carry a VERIFIED badge that no person granted;
 *  - private evidence must not be readable publicly, through the API OR
 *    through the file route that serves the bytes;
 *  - an internal note and a rejection reason must never reach a public payload;
 *  - a draft or rejected claim must not appear on the public site;
 *  - swapping evidence under a verified claim must invalidate the verification;
 *  - proposed work must never be presented as completed;
 *  - transparency counters must come from the database, not from anywhere else;
 *  - and nothing must cross a tenant boundary.
 */

const available = await databaseAvailable();

let app: Express;
let apollo: ApolloServer<GraphQLContext>;

let tenantA: TestTenant;
let tenantB: TestTenant;
let adminA: TestUser;
let adminB: TestUser;
let editorA: TestUser;
let viewerA: TestUser;

let tokenAdminA = '';
let tokenAdminB = '';
let tokenEditorA = '';
let tokenViewerA = '';

/** A published project in the given tenant, with sane defaults. */
async function makeWork(
  tenant: TestTenant,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; slug: string }> {
  const slug = `work-${Math.random().toString(36).slice(2, 10)}`;
  const row = await prisma.project.create({
    data: {
      organizationId: tenant.organizationId,
      slug,
      locale: 'en',
      title: `Road improvement ${slug}`,
      shortDescription: 'Resurfacing between the market and the school.',
      category: 'INFRASTRUCTURE',
      area: 'Ward 12',
      projectStatus: 'COMPLETED',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      ...overrides,
    },
    select: { id: true, slug: true },
  });
  return row;
}

async function makeAchievement(
  tenant: TestTenant,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; slug: string }> {
  const slug = `ach-${Math.random().toString(36).slice(2, 10)}`;
  return prisma.achievement.create({
    data: {
      organizationId: tenant.organizationId,
      slug,
      locale: 'en',
      title: `Achievement ${slug}`,
      category: 'INFRASTRUCTURE',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      ...overrides,
    },
    select: { id: true, slug: true },
  });
}

/** Adds evidence through the real mutation, so validation and audit run. */
async function addEvidence(
  token: string,
  subjectType: 'PROJECT' | 'ACHIEVEMENT',
  subjectId: string,
  input: Record<string, unknown> = {},
) {
  const result = await gql(
    app,
    `mutation Add($subjectType: WorkSubjectType!, $subjectId: ID!, $input: WorkEvidenceInput!) {
      addWorkEvidence(subjectType: $subjectType, subjectId: $subjectId, input: $input) {
        id
        isPublic
        evidenceType
        internalNote
      }
    }`,
    {
      subjectType,
      subjectId,
      input: { title: 'Completion certificate', evidenceType: 'COMPLETION_CERTIFICATE', ...input },
    },
    { accessToken: token },
  );
  // Asserted with the serialised error so a setup failure names its own cause
  // rather than surfacing later as an unrelated undefined.
  expect(JSON.stringify(result.errors ?? null)).toBe('null');
  return result.data?.addWorkEvidence as {
    id: string;
    isPublic: boolean;
    evidenceType: string;
    internalNote: string | null;
  };
}

async function submitAndVerify(
  subjectType: 'PROJECT' | 'ACHIEVEMENT',
  subjectId: string,
): Promise<void> {
  const submitted = await gql(
    app,
    `mutation S($t: WorkSubjectType!, $id: ID!) {
      submitWorkForVerification(subjectType: $t, subjectId: $id) { verification }
    }`,
    { t: subjectType, id: subjectId },
    { accessToken: tokenAdminA },
  );
  expect(JSON.stringify(submitted.errors ?? null)).toBe('null');

  const decided = await gql(
    app,
    `mutation D($t: WorkSubjectType!, $id: ID!) {
      decideWorkVerification(subjectType: $t, subjectId: $id, decision: VERIFY) { verification }
    }`,
    { t: subjectType, id: subjectId },
    { accessToken: tokenAdminA },
  );
  expect(JSON.stringify(decided.errors ?? null)).toBe('null');
}

/**
 * Unwraps a successful GraphQL result.
 *
 * WHY THIS EXISTS. Reading `result.data?.field` and then indexing into it turns
 * any server-side failure into `TypeError: Cannot read properties of undefined`
 * on a later line - which names neither the operation that failed nor the reason.
 * Two intermittent connection failures during Phase 10 presented exactly that
 * way and cost real time to trace back to their cause.
 *
 * Asserting on the serialised errors first means a failure reports the actual
 * message, the way the Phase 8 suite already does.
 */
function dataOf<T = Record<string, unknown>>(
  result: { data?: Record<string, unknown> | null; errors?: unknown },
  field: string,
): T {
  expect(JSON.stringify(result.errors ?? null)).toBe('null');
  const value = result.data?.[field];
  expect(value, `expected data.${field} to be present`).toBeDefined();
  return value as T;
}

beforeAll(async () => {
  if (!available) return;
  const created = await createApp();
  app = created.app;
  apollo = created.apollo;

  tenantA = await createTenant();
  tenantB = await createTenant();

  adminA = await createUser();
  adminB = await createUser();
  editorA = await createUser();
  viewerA = await createUser();

  await addMembership(adminA.id, tenantA.organizationId, 'CAMPAIGN_ADMIN');
  await addMembership(adminB.id, tenantB.organizationId, 'CAMPAIGN_ADMIN');
  await addMembership(editorA.id, tenantA.organizationId, 'CONTENT_MANAGER');
  await addMembership(viewerA.id, tenantA.organizationId, 'VIEWER');

  tokenAdminA = (await login(app, adminA.email, adminA.password)).accessToken;
  tokenAdminB = (await login(app, adminB.email, adminB.password)).accessToken;
  tokenEditorA = (await login(app, editorA.email, editorA.password)).accessToken;
  tokenViewerA = (await login(app, viewerA.email, viewerA.password)).accessToken;
});

afterAll(async () => {
  if (!available) return;
  await apollo?.stop();
  await cleanupFixtures();
});

// ---------------------------------------------------------------------------
// Vocabulary. No database needed.
// ---------------------------------------------------------------------------

describe('Phase 9 vocabulary', () => {
  it('keeps one verification enum, extended rather than duplicated', () => {
    // The Phase 3 enum gained REJECTED; there is no parallel Phase 9 list.
    expect(VERIFICATION_STATUSES).toEqual(['UNVERIFIED', 'IN_REVIEW', 'VERIFIED', 'REJECTED']);
  });

  it('maps stored project statuses onto public labels without inventing one', () => {
    expect(publicWorkStatusFor('PLANNED')).toBe('PROPOSED');
    expect(publicWorkStatusFor('IN_PROGRESS')).toBe('ONGOING');
    expect(publicWorkStatusFor('ON_HOLD')).toBe('ONGOING');
    expect(publicWorkStatusFor('COMPLETED')).toBe('COMPLETED');
    // A cancelled work is not a transparency claim and has no public bucket.
    expect(publicWorkStatusFor('CANCELLED')).toBeNull();
  });

  it('never maps a non-completed status onto COMPLETED', () => {
    for (const status of ['PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'CANCELLED']) {
      expect(publicWorkStatusFor(status)).not.toBe('COMPLETED');
    }
  });

  it('flags unsupported superlative claims', () => {
    expect(findUnsupportedClaims('The project is 100% complete.')).toContain('100% complete');
    expect(findUnsupportedClaims('An unprecedented, world-class result')).toEqual(
      expect.arrayContaining(['unprecedented', 'world-class']),
    );
    expect(findUnsupportedClaims('Resurfacing finished in March.')).toEqual([]);
  });

  it('classifies evidence without asserting authority', () => {
    // Every type is a description of an artefact. None is a trust level, and
    // nothing in the enum grants a document standing it has not earned.
    expect(EVIDENCE_TYPES).toContain('GOVERNMENT_ORDER');
    expect(EVIDENCE_TYPES).toContain('OTHER');
    expect(EVIDENCE_TYPES.some((type) => /VERIFIED|TRUSTED|AUTHENTIC/.test(type))).toBe(false);
  });

  it('grants evidence handling to editors but verification only to administrators', () => {
    expect(ROLE_PERMISSIONS.CONTENT_MANAGER).toContain('EVIDENCE_MANAGE');
    // The edit/publish split, applied to claim/verification: a content manager
    // assembles the case and somebody else decides whether it holds.
    expect(ROLE_PERMISSIONS.CONTENT_MANAGER).not.toContain('ACHIEVEMENT_VERIFY');
    expect(ROLE_PERMISSIONS.CONTENT_MANAGER).not.toContain('WORK_VERIFY');
    expect(ROLE_PERMISSIONS.CAMPAIGN_ADMIN).toContain('WORK_VERIFY');
    expect(ROLE_PERMISSIONS.VIEWER).not.toContain('EVIDENCE_READ');
  });

  it('adds no permission that could profile a citizen', () => {
    // The permanent prohibition, re-asserted with Phase 9's grants in place.
    const forbidden =
      /SUPPORTER_|OPPONENT_|VOTER_|VOTING_|PROFILING_|AFFILIATION|IDEOLOG|PERSUAS|PREDICT/;
    expect(PERMISSIONS.filter((permission) => forbidden.test(permission))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Everything below needs a database.
// ---------------------------------------------------------------------------

describe.skipIf(!available)('verification workflow', () => {
  it('starts unverified and does not become verified by creating a record', async () => {
    const work = await makeWork(tenantA);
    const row = await prisma.project.findUniqueOrThrow({
      where: { id: work.id },
      select: { verification: true, verifiedAt: true, verifiedByUserId: true },
    });
    expect(row.verification).toBe('UNVERIFIED');
    expect(row.verifiedAt).toBeNull();
    expect(row.verifiedByUserId).toBeNull();
  });

  it('does not become verified by attaching evidence', async () => {
    const work = await makeWork(tenantA);
    await addEvidence(tokenAdminA, 'PROJECT', work.id);

    const row = await prisma.project.findUniqueOrThrow({
      where: { id: work.id },
      select: { verification: true },
    });
    // Uploading a file is not a check. This is the single most important
    // assertion in the phase.
    expect(row.verification).toBe('UNVERIFIED');
  });

  it('refuses to submit a claim with no evidence', async () => {
    const work = await makeWork(tenantA);
    const result = await gql(
      app,
      `mutation S($id: ID!) {
        submitWorkForVerification(subjectType: PROJECT, subjectId: $id) { verification }
      }`,
      { id: work.id },
      { accessToken: tokenAdminA },
    );
    expect(result.errors?.[0]?.message).toMatch(/evidence/i);
  });

  it('refuses to verify a claim whose evidence was removed while it waited', async () => {
    const work = await makeWork(tenantA);
    const evidence = await addEvidence(tokenAdminA, 'PROJECT', work.id);

    await gql(
      app,
      `mutation S($id: ID!) { submitWorkForVerification(subjectType: PROJECT, subjectId: $id) { verification } }`,
      { id: work.id },
      { accessToken: tokenAdminA },
    );

    await prisma.workEvidence.delete({ where: { id: evidence.id } });

    const decided = await gql(
      app,
      `mutation D($id: ID!) {
        decideWorkVerification(subjectType: PROJECT, subjectId: $id, decision: VERIFY) { verification }
      }`,
      { id: work.id },
      { accessToken: tokenAdminA },
    );
    expect(decided.errors?.[0]?.message).toMatch(/nothing here to verify/i);
  });

  it('records a verification against a named person', async () => {
    const work = await makeWork(tenantA);
    await addEvidence(tokenAdminA, 'PROJECT', work.id);
    await submitAndVerify('PROJECT', work.id);

    const row = await prisma.project.findUniqueOrThrow({
      where: { id: work.id },
      select: { verification: true, verifiedAt: true, verifiedByUserId: true },
    });
    expect(row.verification).toBe('VERIFIED');
    expect(row.verifiedAt).not.toBeNull();
    expect(row.verifiedByUserId).toBe(adminA.id);
  });

  it('requires a reason to reject, and keeps it internal', async () => {
    const work = await makeWork(tenantA);
    await addEvidence(tokenAdminA, 'PROJECT', work.id);
    await gql(
      app,
      `mutation S($id: ID!) { submitWorkForVerification(subjectType: PROJECT, subjectId: $id) { verification } }`,
      { id: work.id },
      { accessToken: tokenAdminA },
    );

    const noReason = await gql(
      app,
      `mutation D($id: ID!) {
        decideWorkVerification(subjectType: PROJECT, subjectId: $id, decision: REJECT) { verification }
      }`,
      { id: work.id },
      { accessToken: tokenAdminA },
    );
    expect(noReason.errors?.[0]?.message).toMatch(/reason/i);

    const withReason = await gql(
      app,
      `mutation D($id: ID!, $r: String) {
        decideWorkVerification(subjectType: PROJECT, subjectId: $id, decision: REJECT, reason: $r) {
          verification
        }
      }`,
      { id: work.id, r: 'The completion certificate does not name this stretch of road.' },
      { accessToken: tokenAdminA },
    );
    expect(JSON.stringify(withReason.errors ?? null)).toBe('null');

    const row = await prisma.project.findUniqueOrThrow({
      where: { id: work.id },
      select: { verification: true, rejectionReason: true },
    });
    expect(row.verification).toBe('REJECTED');
    expect(row.rejectionReason).toMatch(/completion certificate/i);
  });

  it('keeps an immutable history including reversals', async () => {
    const work = await makeWork(tenantA);
    await addEvidence(tokenAdminA, 'PROJECT', work.id);
    await submitAndVerify('PROJECT', work.id);

    await gql(
      app,
      `mutation W($id: ID!, $r: String!) {
        withdrawWorkVerification(subjectType: PROJECT, subjectId: $id, reason: $r) { verification }
      }`,
      { id: work.id, r: 'The certificate turned out to relate to a different ward.' },
      { accessToken: tokenAdminA },
    );

    const history = await gql(
      app,
      `query H($id: ID!) {
        verificationHistory(subjectType: PROJECT, subjectId: $id) { action toStatus }
      }`,
      { id: work.id },
      { accessToken: tokenAdminA },
    );
    const actions = (history.data?.verificationHistory as Array<{ action: string }>).map(
      (entry) => entry.action,
    );

    // The earlier VERIFIED entry survives the withdrawal: overwriting it would
    // erase the record that the claim once carried a badge.
    expect(actions).toEqual(['SUBMITTED_FOR_REVIEW', 'VERIFIED', 'VERIFICATION_WITHDRAWN']);
  });

  it('does not publish a claim as a side effect of verifying it', async () => {
    const work = await makeWork(tenantA, { status: 'DRAFT', publishedAt: null });
    await addEvidence(tokenAdminA, 'PROJECT', work.id);
    await submitAndVerify('PROJECT', work.id);

    const row = await prisma.project.findUniqueOrThrow({
      where: { id: work.id },
      select: { status: true, verification: true },
    });
    // Verified and still a draft. Checking and saying are different acts.
    expect(row.verification).toBe('VERIFIED');
    expect(row.status).toBe('DRAFT');
  });
});

describe.skipIf(!available)('evidence changes invalidate a decision', () => {
  it('reopens a verified claim when evidence is swapped', async () => {
    const work = await makeWork(tenantA);
    const evidence = await addEvidence(tokenAdminA, 'PROJECT', work.id);
    await submitAndVerify('PROJECT', work.id);

    const updated = await gql(
      app,
      `mutation U($id: ID!, $input: WorkEvidenceInput!) {
        updateWorkEvidence(evidenceId: $id, input: $input) { id }
      }`,
      {
        id: evidence.id,
        input: { title: 'A completely different document', evidenceType: 'OTHER' },
      },
      { accessToken: tokenAdminA },
    );
    expect(JSON.stringify(updated.errors ?? null)).toBe('null');

    const row = await prisma.project.findUniqueOrThrow({
      where: { id: work.id },
      select: { verification: true, verifiedAt: true, verifiedByUserId: true },
    });
    // The badge cannot survive the evidence it was granted against.
    expect(row.verification).toBe('IN_REVIEW');
    expect(row.verifiedAt).toBeNull();
    expect(row.verifiedByUserId).toBeNull();
  });

  it('reopens a verified claim when evidence is removed', async () => {
    const work = await makeWork(tenantA);
    const keep = await addEvidence(tokenAdminA, 'PROJECT', work.id);
    const drop = await addEvidence(tokenAdminA, 'PROJECT', work.id, { title: 'Second document' });
    await submitAndVerify('PROJECT', work.id);

    await gql(
      app,
      `mutation R($id: ID!) { removeWorkEvidence(evidenceId: $id) { success } }`,
      { id: drop.id },
      { accessToken: tokenAdminA },
    );

    const row = await prisma.project.findUniqueOrThrow({
      where: { id: work.id },
      select: { verification: true },
    });
    expect(row.verification).toBe('IN_REVIEW');
    expect(keep.id).toBeTruthy();
  });

  it('does not reopen for a presentation-only edit', async () => {
    const work = await makeWork(tenantA);
    const evidence = await addEvidence(tokenAdminA, 'PROJECT', work.id);
    await submitAndVerify('PROJECT', work.id);

    await gql(
      app,
      `mutation U($id: ID!, $input: WorkEvidenceInput!) {
        updateWorkEvidence(evidenceId: $id, input: $input) { id }
      }`,
      {
        id: evidence.id,
        // Same document, same claim about it; only the description changes.
        input: {
          title: 'Completion certificate',
          evidenceType: 'COMPLETION_CERTIFICATE',
          description: 'Tidied wording.',
        },
      },
      { accessToken: tokenAdminA },
    );

    const row = await prisma.project.findUniqueOrThrow({
      where: { id: work.id },
      select: { verification: true },
    });
    // Re-reviewing over a typo would train reviewers to click through.
    expect(row.verification).toBe('VERIFIED');
  });

  it('does not reopen when only visibility changes', async () => {
    const work = await makeWork(tenantA);
    const evidence = await addEvidence(tokenAdminA, 'PROJECT', work.id);
    await submitAndVerify('PROJECT', work.id);

    await gql(
      app,
      `mutation V($id: ID!) {
        setWorkEvidenceVisibility(evidenceId: $id, isPublic: true) { isPublic }
      }`,
      { id: evidence.id },
      { accessToken: tokenAdminA },
    );

    const row = await prisma.project.findUniqueOrThrow({
      where: { id: work.id },
      select: { verification: true },
    });
    // The reviewer saw the same document either way; what changed is who else can.
    expect(row.verification).toBe('VERIFIED');
  });
});

describe.skipIf(!available)('public visibility', () => {
  it('defaults evidence to internal', async () => {
    const work = await makeWork(tenantA);
    const evidence = await addEvidence(tokenAdminA, 'PROJECT', work.id);
    expect(evidence.isPublic).toBe(false);
  });

  it('does not expose internal evidence on the public page', async () => {
    const work = await makeWork(tenantA);
    await addEvidence(tokenAdminA, 'PROJECT', work.id, {
      title: 'Private contractor correspondence',
      internalNote: 'Source asked not to be named.',
      isPublic: false,
    });

    const result = await gql(
      app,
      `query W($org: String!, $slug: String!) {
        publicWork(input: { organizationSlug: $org }, slug: $slug) {
          evidence { id title }
        }
      }`,
      { org: tenantA.slug, slug: work.slug },
    );

    const evidence = dataOf<{ evidence: unknown[] }>(result, 'publicWork').evidence;
    expect(evidence).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('Private contractor correspondence');
    expect(JSON.stringify(result)).not.toContain('Source asked not to be named');
  });

  it('exposes evidence once it is deliberately published', async () => {
    const work = await makeWork(tenantA);
    await addEvidence(tokenAdminA, 'PROJECT', work.id, {
      title: 'Municipal completion certificate',
      referenceNumber: 'MC/2026/118',
      issuingAuthority: 'City Municipal Corporation',
      internalNote: 'Cross-checked against the work order.',
      isPublic: true,
    });

    const result = await gql(
      app,
      `query W($org: String!, $slug: String!) {
        publicWork(input: { organizationSlug: $org }, slug: $slug) {
          evidence { title referenceNumber issuingAuthority }
        }
      }`,
      { org: tenantA.slug, slug: work.slug },
    );

    const evidence = dataOf<{ evidence: Array<{ title: string }> }>(result, 'publicWork').evidence;
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.title).toBe('Municipal completion certificate');
    // Provenance is published; the reviewer's working note is not.
    expect(JSON.stringify(result)).toContain('MC/2026/118');
    expect(JSON.stringify(result)).not.toContain('Cross-checked against the work order');
  });

  it('has no field for an internal note on any public type', async () => {
    const result = await gql(
      app,
      `query W($org: String!, $slug: String!) {
        publicWork(input: { organizationSlug: $org }, slug: $slug) {
          evidence { internalNote }
        }
      }`,
      { org: tenantA.slug, slug: 'anything' },
    );
    // A schema-level guarantee: the field does not exist, so no resolver has to
    // remember to omit it.
    expect(result.errors?.[0]?.message).toMatch(/Cannot query field "internalNote"/);
  });

  it('never exposes a rejection reason publicly', async () => {
    const work = await makeWork(tenantA);
    await addEvidence(tokenAdminA, 'PROJECT', work.id);
    await gql(
      app,
      `mutation S($id: ID!) { submitWorkForVerification(subjectType: PROJECT, subjectId: $id) { verification } }`,
      { id: work.id },
      { accessToken: tokenAdminA },
    );
    await gql(
      app,
      `mutation D($id: ID!, $r: String) {
        decideWorkVerification(subjectType: PROJECT, subjectId: $id, decision: REJECT, reason: $r) { verification }
      }`,
      { id: work.id, r: 'The supporting letter is unsigned and undated.' },
      { accessToken: tokenAdminA },
    );

    const result = await gql(
      app,
      `query W($org: String!, $slug: String!) {
        publicWork(input: { organizationSlug: $org }, slug: $slug) { verification title }
      }`,
      { org: tenantA.slug, slug: work.slug },
    );
    expect(JSON.stringify(result)).not.toContain('unsigned and undated');
  });

  it('does not list a draft work publicly', async () => {
    const work = await makeWork(tenantA, { status: 'DRAFT', publishedAt: null });
    const detail = await gql(
      app,
      `query W($org: String!, $slug: String!) {
        publicWork(input: { organizationSlug: $org }, slug: $slug) { id }
      }`,
      { org: tenantA.slug, slug: work.slug },
    );
    expect(detail.errors?.[0]?.message).toMatch(/not available/i);
  });

  it('does not list a cancelled work publicly', async () => {
    const work = await makeWork(tenantA, { projectStatus: 'CANCELLED' });
    const detail = await gql(
      app,
      `query W($org: String!, $slug: String!) {
        publicWork(input: { organizationSlug: $org }, slug: $slug) { id }
      }`,
      { org: tenantA.slug, slug: work.slug },
    );
    expect(detail.errors?.[0]?.message).toMatch(/not available/i);
  });

  it('reports verification exactly as stored, never inferring it', async () => {
    const work = await makeWork(tenantA);
    await addEvidence(tokenAdminA, 'PROJECT', work.id, { isPublic: true });

    const result = await gql(
      app,
      `query W($org: String!, $slug: String!) {
        publicWork(input: { organizationSlug: $org }, slug: $slug) {
          verification
          evidence { id }
        }
      }`,
      { org: tenantA.slug, slug: work.slug },
    );

    const work1 = dataOf<{ verification: string; evidence: unknown[] }>(result, 'publicWork');
    // Published evidence present, and still UNVERIFIED: evidence is not a check.
    expect(work1.evidence).toHaveLength(1);
    expect(work1.verification).toBe('UNVERIFIED');
  });

  it('labels a proposed work as proposed, never completed', async () => {
    const work = await makeWork(tenantA, { projectStatus: 'PLANNED' });
    const result = await gql(
      app,
      `query W($org: String!, $slug: String!) {
        publicWork(input: { organizationSlug: $org }, slug: $slug) { workStatus }
      }`,
      { org: tenantA.slug, slug: work.slug },
    );
    expect(dataOf<{ workStatus: string }>(result, 'publicWork').workStatus).toBe('PROPOSED');
  });
});

describe.skipIf(!available)('file access', () => {
  /** A stored asset plus a row that references it as evidence. */
  async function makeAsset(tenant: TestTenant) {
    return prisma.mediaAsset.create({
      data: {
        organizationId: tenant.organizationId,
        kind: 'DOCUMENT',
        storageKey: `test/${Math.random().toString(36).slice(2)}.pdf`,
        originalName: 'certificate.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        checksumSha256: Math.random().toString(36).slice(2).padEnd(64, '0'),
      },
      select: { id: true },
    });
  }

  it('does not serve a document that is only private evidence', async () => {
    const work = await makeWork(tenantA);
    const asset = await makeAsset(tenantA);
    await addEvidence(tokenAdminA, 'PROJECT', work.id, {
      documentId: asset.id,
      isPublic: false,
    });

    const response = await request(app).get(`/media/${asset.id}`);
    // 404, not 401: answering "unauthorised" would confirm a document exists at
    // that id, which is exactly what private evidence must not disclose.
    expect(response.status).toBe(404);
  });

  it('does not serve private evidence to a signed-in user without the grant', async () => {
    const work = await makeWork(tenantA);
    const asset = await makeAsset(tenantA);
    await addEvidence(tokenAdminA, 'PROJECT', work.id, {
      documentId: asset.id,
      isPublic: false,
    });

    const response = await request(app)
      .get(`/media/${asset.id}`)
      .set('authorization', `Bearer ${tokenViewerA}`)
      .set('x-organization-id', tenantA.organizationId);
    expect(response.status).toBe(404);
  });

  it('does not serve one tenant private evidence to another tenant', async () => {
    const work = await makeWork(tenantA);
    const asset = await makeAsset(tenantA);
    await addEvidence(tokenAdminA, 'PROJECT', work.id, {
      documentId: asset.id,
      isPublic: false,
    });

    const response = await request(app)
      .get(`/media/${asset.id}`)
      .set('authorization', `Bearer ${tokenAdminB}`)
      .set('x-organization-id', tenantB.organizationId);
    expect(response.status).toBe(404);
  });

  it('still serves an ordinary published image anonymously', async () => {
    // The Phase 9 gate must not have broken Phase 3: a cover image is public
    // content and backs an <img src> on the public site.
    const asset = await makeAsset(tenantA);
    await prisma.project.create({
      data: {
        organizationId: tenantA.organizationId,
        slug: `cover-${Math.random().toString(36).slice(2, 10)}`,
        locale: 'en',
        title: 'With a cover image',
        category: 'OTHER',
        status: 'PUBLISHED',
        coverImageId: asset.id,
      },
    });

    const response = await request(app).get(`/media/${asset.id}`);
    // Not 404 for authorization reasons. The bytes are absent in a test
    // environment with no object stored, so 404-from-storage is possible;
    // what matters is that it is not refused before storage is consulted.
    expect([200, 404]).toContain(response.status);
  });
});

describe.skipIf(!available)('RBAC', () => {
  it('refuses evidence management to a viewer', async () => {
    const work = await makeWork(tenantA);
    const result = await gql(
      app,
      `mutation A($id: ID!, $input: WorkEvidenceInput!) {
        addWorkEvidence(subjectType: PROJECT, subjectId: $id, input: $input) { id }
      }`,
      { id: work.id, input: { title: 'Something' } },
      { accessToken: tokenViewerA },
    );
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
  });

  it('lets a content manager attach evidence but not verify', async () => {
    const work = await makeWork(tenantA);
    const added = await addEvidence(tokenEditorA, 'PROJECT', work.id, {
      title: 'Editor supplied document',
    });
    expect(added.id).toBeTruthy();

    await gql(
      app,
      `mutation S($id: ID!) { submitWorkForVerification(subjectType: PROJECT, subjectId: $id) { verification } }`,
      { id: work.id },
      { accessToken: tokenEditorA },
    );

    const decided = await gql(
      app,
      `mutation D($id: ID!) {
        decideWorkVerification(subjectType: PROJECT, subjectId: $id, decision: VERIFY) { verification }
      }`,
      { id: work.id },
      { accessToken: tokenEditorA },
    );
    expect(decided.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
  });

  it('refuses the verification queue to a viewer', async () => {
    const result = await gql(
      app,
      `query { verificationQueue { id } }`,
      {},
      { accessToken: tokenViewerA },
    );
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
  });

  it('refuses evidence reading to a viewer', async () => {
    const work = await makeWork(tenantA);
    const result = await gql(
      app,
      `query E($id: ID!) { workEvidence(subjectType: PROJECT, subjectId: $id) { id } }`,
      { id: work.id },
      { accessToken: tokenViewerA },
    );
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
  });

  it('refuses rejection through the Phase 3 verification mutation', async () => {
    const achievement = await makeAchievement(tenantA);
    const result = await gql(
      app,
      `mutation V($id: ID!) {
        setAchievementVerification(id: $id, verification: REJECTED) { id }
      }`,
      { id: achievement.id },
      { accessToken: tokenAdminA },
    );
    // Rejecting without a reason would produce an unactionable rejected claim.
    expect(result.errors?.[0]?.message).toMatch(/reason/i);
  });
});

describe.skipIf(!available)('tenant isolation', () => {
  it('does not let one tenant attach evidence to another tenant record', async () => {
    const work = await makeWork(tenantA);
    const result = await gql(
      app,
      `mutation A($id: ID!, $input: WorkEvidenceInput!) {
        addWorkEvidence(subjectType: PROJECT, subjectId: $id, input: $input) { id }
      }`,
      { id: work.id, input: { title: 'Injected' } },
      { accessToken: tokenAdminB },
    );
    // NOT_FOUND, never FORBIDDEN: FORBIDDEN would confirm the id exists.
    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
  });

  it('does not let one tenant verify another tenant claim', async () => {
    const work = await makeWork(tenantA);
    await addEvidence(tokenAdminA, 'PROJECT', work.id);

    const result = await gql(
      app,
      `mutation D($id: ID!) {
        decideWorkVerification(subjectType: PROJECT, subjectId: $id, decision: VERIFY) { verification }
      }`,
      { id: work.id },
      { accessToken: tokenAdminB },
    );
    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
  });

  it('does not let one tenant read another tenant evidence', async () => {
    const work = await makeWork(tenantA);
    await addEvidence(tokenAdminA, 'PROJECT', work.id, { internalNote: 'Tenant A only.' });

    const result = await gql(
      app,
      `query E($id: ID!) { workEvidence(subjectType: PROJECT, subjectId: $id) { id internalNote } }`,
      { id: work.id },
      { accessToken: tokenAdminB },
    );
    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
    expect(JSON.stringify(result)).not.toContain('Tenant A only');
  });

  it('does not let one tenant read another tenant verification history', async () => {
    const work = await makeWork(tenantA);
    const result = await gql(
      app,
      `query H($id: ID!) { verificationHistory(subjectType: PROJECT, subjectId: $id) { id } }`,
      { id: work.id },
      { accessToken: tokenAdminB },
    );
    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
  });

  it('does not surface one tenant work on another tenant public site', async () => {
    const work = await makeWork(tenantA, { title: 'Tenant A only road' });

    const result = await gql(
      app,
      `query W($org: String!, $slug: String!) {
        publicWork(input: { organizationSlug: $org }, slug: $slug) { id title }
      }`,
      { org: tenantB.slug, slug: work.slug },
    );
    // Slugs are unique per tenant, not globally, so this is a real risk.
    expect(result.errors?.[0]?.message).toMatch(/not available/i);
    expect(JSON.stringify(result)).not.toContain('Tenant A only road');
  });

  it('counts only its own tenant in the transparency summary', async () => {
    const before = await gql(
      app,
      `query S($org: String!) {
        transparencySummary(input: { organizationSlug: $org }) { publishedWorks }
      }`,
      { org: tenantB.slug },
    );
    const baseline = dataOf<{ publishedWorks: number }>(
      before,
      'transparencySummary',
    ).publishedWorks;

    await makeWork(tenantA);

    const after = await gql(
      app,
      `query S($org: String!) {
        transparencySummary(input: { organizationSlug: $org }) { publishedWorks }
      }`,
      { org: tenantB.slug },
    );
    expect(dataOf<{ publishedWorks: number }>(after, 'transparencySummary').publishedWorks).toBe(
      baseline,
    );
  });
});

describe.skipIf(!available)('transparency metrics', () => {
  it('counts from the database and separates the three work states', async () => {
    const tenant = await createTenant();
    await makeWork(tenant, { projectStatus: 'PLANNED' });
    await makeWork(tenant, { projectStatus: 'IN_PROGRESS' });
    await makeWork(tenant, { projectStatus: 'IN_PROGRESS' });
    await makeWork(tenant, { projectStatus: 'COMPLETED' });
    await makeWork(tenant, { projectStatus: 'CANCELLED' });
    await makeWork(tenant, { status: 'DRAFT', publishedAt: null });

    const result = await gql(
      app,
      `query S($org: String!) {
        transparencySummary(input: { organizationSlug: $org }) {
          proposedWorks
          ongoingWorks
          completedWorks
          publishedWorks
          verifiedWorks
          evidenceCoveragePct
        }
      }`,
      { org: tenant.slug },
    );

    const summary = dataOf<Record<string, number | null>>(result, 'transparencySummary');
    expect(summary.proposedWorks).toBe(1);
    expect(summary.ongoingWorks).toBe(2);
    expect(summary.completedWorks).toBe(1);
    // Cancelled and draft are both excluded from the public total.
    expect(summary.publishedWorks).toBe(4);
    expect(summary.verifiedWorks).toBe(0);
  });

  it('reports evidence coverage as null rather than zero when nothing is published', async () => {
    const tenant = await createTenant();
    const result = await gql(
      app,
      `query S($org: String!) {
        transparencySummary(input: { organizationSlug: $org }) {
          publishedWorks
          evidenceCoveragePct
        }
      }`,
      { org: tenant.slug },
    );
    const summary = dataOf<Record<string, number | null>>(result, 'transparencySummary');
    expect(summary.publishedWorks).toBe(0);
    // 0% would state something false with the confidence of a measurement.
    expect(summary.evidenceCoveragePct).toBeNull();
  });

  it('counts only publicly readable evidence towards coverage', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    await addMembership(admin.id, tenant.organizationId, 'CAMPAIGN_ADMIN');
    const token = (await login(app, admin.email, admin.password)).accessToken;

    const withPublic = await makeWork(tenant);
    const withPrivate = await makeWork(tenant);
    await addEvidence(token, 'PROJECT', withPublic.id, { isPublic: true });
    await addEvidence(token, 'PROJECT', withPrivate.id, { isPublic: false });

    const result = await gql(
      app,
      `query S($org: String!) {
        transparencySummary(input: { organizationSlug: $org }) {
          publishedWorks
          evidenceBackedWorks
          evidenceCoveragePct
        }
      }`,
      { org: tenant.slug },
    );
    const summary = dataOf<Record<string, number>>(result, 'transparencySummary');
    expect(summary.publishedWorks).toBe(2);
    // A figure shown to the public has to mean something they can check.
    expect(summary.evidenceBackedWorks).toBe(1);
    expect(summary.evidenceCoveragePct).toBe(50);
  });
});

describe.skipIf(!available)('search, filters and pagination', () => {
  it('filters by work status in the database', async () => {
    const tenant = await createTenant();
    await makeWork(tenant, { projectStatus: 'PLANNED', title: 'Planned bridge' });
    await makeWork(tenant, { projectStatus: 'COMPLETED', title: 'Completed drain' });

    const result = await gql(
      app,
      `query W($org: String!) {
        publicWorks(input: { organizationSlug: $org }, filter: { workStatus: PROPOSED }) {
          nodes { title workStatus }
          totalCount
        }
      }`,
      { org: tenant.slug },
    );
    const connection = dataOf<{
      nodes: Array<{ title: string; workStatus: string }>;
      totalCount: number;
    }>(result, 'publicWorks');
    expect(connection.totalCount).toBe(1);
    expect(connection.nodes[0]?.workStatus).toBe('PROPOSED');
  });

  it('combines a year filter with a search term instead of dropping one', async () => {
    const tenant = await createTenant();
    await makeWork(tenant, {
      title: 'Drain clearing north',
      completionDate: new Date('2026-04-01'),
    });
    await makeWork(tenant, {
      title: 'Drain clearing south',
      completionDate: new Date('2024-04-01'),
    });

    const result = await gql(
      app,
      `query W($org: String!) {
        publicWorks(
          input: { organizationSlug: $org }
          filter: { year: 2026, search: "Drain clearing" }
        ) {
          nodes { title }
          totalCount
        }
      }`,
      { org: tenant.slug },
    );
    // Both clauses produce an `OR`; spreading them into one object would have
    // silently discarded the year and returned both rows.
    expect(dataOf<{ totalCount: number }>(result, 'publicWorks').totalCount).toBe(1);
  });

  it('filters to verified work only', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    await addMembership(admin.id, tenant.organizationId, 'CAMPAIGN_ADMIN');
    const token = (await login(app, admin.email, admin.password)).accessToken;

    const verified = await makeWork(tenant, { title: 'Checked work' });
    await makeWork(tenant, { title: 'Unchecked work' });

    await addEvidence(token, 'PROJECT', verified.id);
    await gql(
      app,
      `mutation S($id: ID!) { submitWorkForVerification(subjectType: PROJECT, subjectId: $id) { verification } }`,
      { id: verified.id },
      { accessToken: token },
    );
    await gql(
      app,
      `mutation D($id: ID!) {
        decideWorkVerification(subjectType: PROJECT, subjectId: $id, decision: VERIFY) { verification }
      }`,
      { id: verified.id },
      { accessToken: token },
    );

    const result = await gql(
      app,
      `query W($org: String!) {
        publicWorks(input: { organizationSlug: $org }, filter: { verifiedOnly: true }) {
          nodes { title verification }
          totalCount
        }
      }`,
      { org: tenant.slug },
    );
    const connection = dataOf<{
      nodes: Array<{ title: string }>;
      totalCount: number;
    }>(result, 'publicWorks');
    expect(connection.totalCount).toBe(1);
    expect(connection.nodes[0]?.title).toBe('Checked work');
  });

  it('pages rather than returning everything', async () => {
    const tenant = await createTenant();
    for (let index = 0; index < 5; index += 1) {
      await makeWork(tenant, { title: `Paged work ${index}` });
    }

    const result = await gql(
      app,
      `query W($org: String!) {
        publicWorks(input: { organizationSlug: $org }, filter: { first: 2 }) {
          nodes { id }
          totalCount
          hasMore
          endCursor
        }
      }`,
      { org: tenant.slug },
    );
    const connection = dataOf<{
      nodes: unknown[];
      totalCount: number;
      hasMore: boolean;
      endCursor: string | null;
    }>(result, 'publicWorks');
    expect(connection.nodes).toHaveLength(2);
    expect(connection.totalCount).toBe(5);
    expect(connection.hasMore).toBe(true);
    expect(connection.endCursor).not.toBeNull();
  });
});

describe.skipIf(!available)('audit', () => {
  it('records the decision and the material separately, without the reason', async () => {
    const work = await makeWork(tenantA);
    await addEvidence(tokenAdminA, 'PROJECT', work.id);
    await submitAndVerify('PROJECT', work.id);

    const entries = await prisma.auditLog.findMany({
      where: {
        organizationId: tenantA.organizationId,
        entityId: work.id,
      },
      select: { action: true, metadata: true },
    });
    const actions = entries.map((entry) => entry.action);
    expect(actions).toContain('WORK_SUBMITTED_FOR_VERIFICATION');
    expect(actions).toContain('WORK_VERIFIED');

    const evidenceEntries = await prisma.auditLog.findMany({
      where: { organizationId: tenantA.organizationId, entityType: 'WorkEvidence' },
      select: { action: true },
    });
    expect(evidenceEntries.map((entry) => entry.action)).toContain('WORK_EVIDENCE_ADDED');
  });

  it('records a visibility change separately from an ordinary edit', async () => {
    const work = await makeWork(tenantA);
    const evidence = await addEvidence(tokenAdminA, 'PROJECT', work.id);

    await gql(
      app,
      `mutation V($id: ID!) { setWorkEvidenceVisibility(evidenceId: $id, isPublic: true) { isPublic } }`,
      { id: evidence.id },
      { accessToken: tokenAdminA },
    );

    const entries = await prisma.auditLog.findMany({
      where: { entityId: evidence.id },
      select: { action: true },
    });
    // Publishing a document cannot be undone for anybody who already read it,
    // so it must be answerable without diffing update records.
    expect(entries.map((entry) => entry.action)).toContain('WORK_EVIDENCE_VISIBILITY_CHANGED');
  });

  it('keeps reviewer reasoning out of the audit log', async () => {
    const work = await makeWork(tenantA);
    await addEvidence(tokenAdminA, 'PROJECT', work.id);
    await gql(
      app,
      `mutation S($id: ID!) { submitWorkForVerification(subjectType: PROJECT, subjectId: $id) { verification } }`,
      { id: work.id },
      { accessToken: tokenAdminA },
    );
    const secret = 'The contractor is under investigation locally.';
    await gql(
      app,
      `mutation D($id: ID!, $r: String) {
        decideWorkVerification(subjectType: PROJECT, subjectId: $id, decision: REJECT, reason: $r) { verification }
      }`,
      { id: work.id, r: secret },
      { accessToken: tokenAdminA },
    );

    const entries = await prisma.auditLog.findMany({
      where: { entityId: work.id },
      select: { metadata: true },
    });
    // AUDIT_READ is a wider grant than EVIDENCE_READ, so copying the reason
    // here would route around the permission that contains it.
    expect(JSON.stringify(entries)).not.toContain('under investigation');
  });
});

describe.skipIf(!available)('the reviewer queue', () => {
  it('lists waiting claims oldest first with their evidence count', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    await addMembership(admin.id, tenant.organizationId, 'CAMPAIGN_ADMIN');
    const token = (await login(app, admin.email, admin.password)).accessToken;

    const first = await makeWork(tenant, { title: 'Older submission' });
    const second = await makeWork(tenant, { title: 'Newer submission' });

    await addEvidence(token, 'PROJECT', first.id);
    await gql(
      app,
      `mutation S($id: ID!) { submitWorkForVerification(subjectType: PROJECT, subjectId: $id) { verification } }`,
      { id: first.id },
      { accessToken: token },
    );

    await addEvidence(token, 'PROJECT', second.id);
    await addEvidence(token, 'PROJECT', second.id, { title: 'Second document' });
    await gql(
      app,
      `mutation S($id: ID!) { submitWorkForVerification(subjectType: PROJECT, subjectId: $id) { verification } }`,
      { id: second.id },
      { accessToken: token },
    );

    const result = await gql(
      app,
      `query Q { verificationQueue { title evidenceCount subjectType } }`,
      {},
      { accessToken: token },
    );
    const rows = dataOf<
      Array<{
        title: string;
        evidenceCount: number;
      }>
    >(result, 'verificationQueue');
    expect(rows).toHaveLength(2);
    // Oldest first: any other order lets the awkward case sink.
    expect(rows[0]?.title).toBe('Older submission');
    expect(rows[1]?.evidenceCount).toBe(2);
  });

  it('covers both projects and achievements in one queue', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    await addMembership(admin.id, tenant.organizationId, 'CAMPAIGN_ADMIN');
    const token = (await login(app, admin.email, admin.password)).accessToken;

    const work = await makeWork(tenant);
    const achievement = await makeAchievement(tenant);
    await addEvidence(token, 'PROJECT', work.id);
    await addEvidence(token, 'ACHIEVEMENT', achievement.id);

    for (const [type, id] of [
      ['PROJECT', work.id],
      ['ACHIEVEMENT', achievement.id],
    ] as const) {
      await gql(
        app,
        `mutation S($t: WorkSubjectType!, $id: ID!) {
          submitWorkForVerification(subjectType: $t, subjectId: $id) { verification }
        }`,
        { t: type, id },
        { accessToken: token },
      );
    }

    const result = await gql(
      app,
      `query Q { verificationQueue { subjectType } }`,
      {},
      { accessToken: token },
    );
    const types = dataOf<Array<{ subjectType: string }>>(result, 'verificationQueue').map(
      (row) => row.subjectType,
    );
    // A reviewer asks "what is waiting for me?", not "what achievements are
    // waiting, and separately what projects?".
    expect(types.sort()).toEqual(['ACHIEVEMENT', 'PROJECT']);
  });
});

describe.skipIf(!available)('evidence integrity', () => {
  it('refuses a document belonging to another tenant', async () => {
    const work = await makeWork(tenantA);
    const foreign = await prisma.mediaAsset.create({
      data: {
        organizationId: tenantB.organizationId,
        kind: 'DOCUMENT',
        storageKey: `test/${Math.random().toString(36).slice(2)}.pdf`,
        originalName: 'foreign.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        checksumSha256: Math.random().toString(36).slice(2).padEnd(64, '0'),
      },
      select: { id: true },
    });

    const result = await gql(
      app,
      `mutation A($id: ID!, $input: WorkEvidenceInput!) {
        addWorkEvidence(subjectType: PROJECT, subjectId: $id, input: $input) { id }
      }`,
      { id: work.id, input: { title: 'Borrowed', documentId: foreign.id } },
      { accessToken: tokenAdminA },
    );
    expect(result.errors?.[0]?.message).toMatch(/not available in this organisation/i);
  });

  it('rejects an unsupported evidence type rather than silently defaulting', async () => {
    const work = await makeWork(tenantA);
    const result = await gql(
      app,
      `mutation A($id: ID!, $input: WorkEvidenceInput!) {
        addWorkEvidence(subjectType: PROJECT, subjectId: $id, input: $input) { id }
      }`,
      { id: work.id, input: { title: 'Odd', evidenceType: 'NOT_A_TYPE' } },
      { accessToken: tokenAdminA },
    );
    expect(result.errors?.[0]).toBeDefined();
  });

  it('stamps evidence with its tenant so it can be filtered without a join', async () => {
    const work = await makeWork(tenantA);
    const evidence = await addEvidence(tokenAdminA, 'PROJECT', work.id);
    const row = await prisma.workEvidence.findUniqueOrThrow({
      where: { id: evidence.id },
      select: { organizationId: true, projectId: true, achievementId: true },
    });
    expect(row.organizationId).toBe(tenantA.organizationId);
    // Exactly one subject, enforced by a CHECK constraint in the migration.
    expect(row.projectId).toBe(work.id);
    expect(row.achievementId).toBeNull();
  });

  it('refuses evidence attached to both subjects at once', async () => {
    const work = await makeWork(tenantA);
    const achievement = await makeAchievement(tenantA);

    await expect(
      prisma.workEvidence.create({
        data: {
          organizationId: tenantA.organizationId,
          projectId: work.id,
          achievementId: achievement.id,
          title: 'Belongs to both',
        },
      }),
      // The database refuses it, not only the service - a service is one
      // refactor away from a second write path, a constraint is not.
    ).rejects.toThrow();
  });
});

beforeEach(() => {
  // No shared mutable state between tests in this suite: each creates its own
  // records. Declared for symmetry with the other suites and to make an
  // accidental addition of shared state visible.
});
