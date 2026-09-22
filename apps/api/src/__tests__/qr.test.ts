import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { ApolloServer } from '@apollo/server';
import { createApp } from '../app';
import { buildEnvForTesting } from '../config/env';
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
import { flushPendingScans } from '../modules/qr/public/scanEvent.service';

/**
 * Phase 4: QR campaigns, the public redirect, and aggregate analytics.
 *
 * The properties under test are the ones whose failure would matter most:
 * a QR code must not leak across tenants, an unauthorised user must not be able
 * to repoint or retire printed material, an unsafe destination must be
 * impossible to store, and a citizen must reach the website even when analytics
 * is broken.
 *
 * Scans are driven through the REAL HTTP endpoint, not by calling the service:
 * the redirect's behaviour IS the product, and a test that inserted rows
 * directly would prove nothing about what a phone gets back.
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
let analystA: TestUser;

let tokenAdminA = '';
let tokenAdminB = '';
let tokenEditorA = '';
let tokenViewerA = '';
let tokenAnalystA = '';

beforeAll(async () => {
  if (!available) return;

  const created = await createApp();
  app = created.app;
  apollo = created.apollo;

  tenantA = await createTenant();
  tenantB = await createTenant();

  adminA = await createUser();
  await addMembership(adminA.id, tenantA.organizationId, 'CAMPAIGN_ADMIN');

  adminB = await createUser();
  await addMembership(adminB.id, tenantB.organizationId, 'CAMPAIGN_ADMIN');

  editorA = await createUser();
  await addMembership(editorA.id, tenantA.organizationId, 'CONTENT_MANAGER');

  viewerA = await createUser();
  await addMembership(viewerA.id, tenantA.organizationId, 'VIEWER');

  analystA = await createUser();
  await addMembership(analystA.id, tenantA.organizationId, 'ANALYST');

  tokenAdminA = (await login(app, adminA.email, adminA.password)).accessToken;
  tokenAdminB = (await login(app, adminB.email, adminB.password)).accessToken;
  tokenEditorA = (await login(app, editorA.email, editorA.password)).accessToken;
  tokenViewerA = (await login(app, viewerA.email, viewerA.password)).accessToken;
  tokenAnalystA = (await login(app, analystA.email, analystA.password)).accessToken;
}, 180_000);

afterAll(async () => {
  if (!available) return;
  await apollo.stop();
  await cleanupFixtures();
  await prisma.$disconnect();
}, 180_000);

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const CREATE_CAMPAIGN = /* GraphQL */ `
  mutation CreateCampaign($input: QrCampaignInput!) {
    createQrCampaign(input: $input) {
      id
      slug
      name
      status
      qrCodeCount
      totalScans
    }
  }
`;

const CREATE_CODE = /* GraphQL */ `
  mutation CreateCode($campaignId: ID!, $input: QrCodeInput!) {
    createQrCode(campaignId: $campaignId, input: $input) {
      id
      code
      status
      destinationPath
      utmSource
      utmMedium
      utmCampaign
    }
  }
`;

const TRANSITION_CODE = /* GraphQL */ `
  mutation TransitionCode($id: ID!, $action: QrCodeAction!) {
    transitionQrCode(id: $id, action: $action) {
      id
      status
    }
  }
`;

const TRANSITION_CAMPAIGN = /* GraphQL */ `
  mutation TransitionCampaign($id: ID!, $action: QrCampaignAction!) {
    transitionQrCampaign(id: $id, action: $action) {
      id
      status
    }
  }
`;

const LIST_CAMPAIGNS = /* GraphQL */ `
  query ListCampaigns {
    qrCampaigns(first: 50) {
      nodes {
        id
        name
      }
      totalCount
    }
  }
`;

const GET_CAMPAIGN = /* GraphQL */ `
  query GetCampaign($id: ID!) {
    qrCampaign(id: $id) {
      id
      name
      totalScans
      qrCodeCount
    }
  }
`;

const GET_CODE = /* GraphQL */ `
  query GetCode($id: ID!) {
    qrCode(id: $id) {
      id
      code
      totalScans
      image {
        scanUrl
        pngDataUrl
        svg
      }
    }
  }
`;

const ANALYTICS = /* GraphQL */ `
  query Analytics($filter: AnalyticsFilter) {
    qrAnalytics(filter: $filter) {
      totalScans
      automatedScans
      estimatedUniqueScans
      activeQrCodes
      totalQrCodes
      range {
        days
      }
      bySource {
        label
        scans
      }
      byWard {
        label
        scans
      }
      byDevice {
        key
        scans
      }
      byQrCode {
        key
        scans
      }
      trend {
        scans
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeCampaign(token: string, organizationId: string, name: string) {
  const result = await gql<{ createQrCampaign: { id: string; slug: string } }>(
    app,
    CREATE_CAMPAIGN,
    { input: { name, campaignType: 'POSTER' } },
    { accessToken: token, organizationId },
  );
  if (!result.data) throw new Error(`Campaign create failed: ${JSON.stringify(result.errors)}`);
  return result.data.createQrCampaign;
}

async function makeCode(
  token: string,
  organizationId: string,
  campaignId: string,
  overrides: Record<string, unknown> = {},
) {
  const result = await gql<{
    createQrCode: {
      id: string;
      code: string;
      status: string;
      destinationPath: string;
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
    };
  }>(
    app,
    CREATE_CODE,
    {
      campaignId,
      input: {
        name: 'Test QR',
        destinationPath: '/work',
        source: 'Poster',
        ward: 'Ward 12',
        area: 'North',
        ...overrides,
      },
    },
    { accessToken: token, organizationId },
  );
  if (!result.data) throw new Error(`Code create failed: ${JSON.stringify(result.errors)}`);
  return result.data.createQrCode;
}

/** Scans through the real endpoint and waits for the fire-and-forget write. */
async function scan(code: string, headers: Record<string, string> = {}) {
  let call = request(app).get(`/q/${code}`).redirects(0);
  for (const [name, value] of Object.entries(headers)) call = call.set(name, value);

  const response = await call;
  // The route does not await the insert, so the test has to - otherwise it
  // would assert on a count that has not been written yet.
  await flushPendingScans();
  return response;
}

// ---------------------------------------------------------------------------
// Campaigns and codes
// ---------------------------------------------------------------------------

describe.skipIf(!available)('QR campaigns: creation and lifecycle', () => {
  it('creates a campaign as a draft, never active', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Draft Check');
    expect(campaign).toMatchObject({ slug: 'draft-check' });

    const fetched = await gql<{ qrCampaign: { name: string } }>(
      app,
      GET_CAMPAIGN,
      { id: campaign.id },
      { accessToken: tokenAdminA, organizationId: tenantA.organizationId },
    );
    expect(fetched.data?.qrCampaign.name).toBe('Draft Check');

    const created = await prisma.qrCampaign.findUniqueOrThrow({
      where: { id: campaign.id },
      select: { status: true },
    });
    // Activation is a separate permission, so create-and-activate in one step
    // must not be possible.
    expect(created.status).toBe('DRAFT');
  });

  it('rejects a duplicate slug within a tenant but allows it across tenants', async () => {
    await makeCampaign(tokenAdminA, tenantA.organizationId, 'Shared Name');

    const duplicate = await gql(
      app,
      CREATE_CAMPAIGN,
      { input: { name: 'Shared Name' } },
      { accessToken: tokenAdminA, organizationId: tenantA.organizationId },
    );
    expect(duplicate.errorCode).toBe('CONFLICT');

    // The same slug in a different organisation is a different row.
    const other = await makeCampaign(tokenAdminB, tenantB.organizationId, 'Shared Name');
    expect(other.slug).toBe('shared-name');
  });

  it('rejects an end date before its start date', async () => {
    const result = await gql(
      app,
      CREATE_CAMPAIGN,
      {
        input: {
          name: 'Bad Dates',
          startDate: '2026-06-01T00:00:00.000Z',
          endDate: '2026-05-01T00:00:00.000Z',
        },
      },
      { accessToken: tokenAdminA, organizationId: tenantA.organizationId },
    );
    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });

  it('generates a unique, non-sequential public identifier', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Identifier Check');
    const first = await makeCode(tokenAdminA, tenantA.organizationId, campaign.id);
    const second = await makeCode(tokenAdminA, tenantA.organizationId, campaign.id, {
      name: 'Second QR',
    });

    expect(first.code).toMatch(/^RK-QR-[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(second.code).toMatch(/^RK-QR-[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(first.code).not.toBe(second.code);
  });

  it('derives UTM values from the campaign when none are supplied', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Utm Defaults');
    const code = await makeCode(tokenAdminA, tenantA.organizationId, campaign.id);

    expect(code).toMatchObject({
      utmSource: 'qr',
      utmMedium: 'poster',
      utmCampaign: 'utm-defaults',
    });
  });
});

// ---------------------------------------------------------------------------
// Destination validation
// ---------------------------------------------------------------------------

describe.skipIf(!available)('QR codes: destination validation', () => {
  it('rejects every unsafe destination', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Destination Guard');

    const unsafe = [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'file:///etc/passwd',
      'https://evil.example/phish',
      'http://evil.example',
      '//evil.example',
      '/work/../../etc/passwd',
      '/work/..%2f..%2fetc',
      '/work\\..\\..\\windows',
      '/not-a-real-page',
      '/work?utm_source=injected',
      '/work#fragment',
      '',
    ];

    for (const destinationPath of unsafe) {
      const result = await gql(
        app,
        CREATE_CODE,
        { campaignId: campaign.id, input: { name: 'Bad', destinationPath } },
        { accessToken: tokenAdminA, organizationId: tenantA.organizationId },
      );

      expect(result.errorCode, `destination "${destinationPath}" should have been rejected`).toBe(
        'VALIDATION_ERROR',
      );
    }
  });

  it('accepts and normalises legitimate internal paths', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Destination Good');

    const cases: Array<[string, string]> = [
      ['/', '/'],
      ['/work', '/work'],
      ['/work/', '/work'],
      ['/work/road-development', '/work/road-development'],
      ['/achievements/sample-item', '/achievements/sample-item'],
      ['/contact', '/contact'],
    ];

    for (const [input, expected] of cases) {
      const code = await makeCode(tokenAdminA, tenantA.organizationId, campaign.id, {
        name: `Dest ${input}`,
        destinationPath: input,
      });
      expect(code.destinationPath, `destination "${input}"`).toBe(expected);
    }
  });

  it('rejects a UTM value that would corrupt the query string', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Utm Guard');

    const result = await gql(
      app,
      CREATE_CODE,
      {
        campaignId: campaign.id,
        input: { name: 'Bad utm', destinationPath: '/work', utmSource: 'a&b=c' },
      },
      { accessToken: tokenAdminA, organizationId: tenantA.organizationId },
    );
    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// Tenant isolation
// ---------------------------------------------------------------------------

describe.skipIf(!available)('QR: tenant isolation', () => {
  it('lists only the caller tenant campaigns', async () => {
    await makeCampaign(tokenAdminA, tenantA.organizationId, 'Isolation A');
    await makeCampaign(tokenAdminB, tenantB.organizationId, 'Isolation B');

    const listA = await gql<{ qrCampaigns: { nodes: Array<{ name: string }> } }>(
      app,
      LIST_CAMPAIGNS,
      {},
      { accessToken: tokenAdminA, organizationId: tenantA.organizationId },
    );
    const namesA = listA.data?.qrCampaigns.nodes.map((node) => node.name) ?? [];
    expect(namesA).toContain('Isolation A');
    expect(namesA).not.toContain('Isolation B');

    const listB = await gql<{ qrCampaigns: { nodes: Array<{ name: string }> } }>(
      app,
      LIST_CAMPAIGNS,
      {},
      { accessToken: tokenAdminB, organizationId: tenantB.organizationId },
    );
    const namesB = listB.data?.qrCampaigns.nodes.map((node) => node.name) ?? [];
    expect(namesB).toContain('Isolation B');
    expect(namesB).not.toContain('Isolation A');
  });

  it('cannot read another tenant campaign by id', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Cross Read');

    const result = await gql(
      app,
      GET_CAMPAIGN,
      { id: campaign.id },
      { accessToken: tokenAdminB, organizationId: tenantB.organizationId },
    );

    // NOT_FOUND rather than FORBIDDEN: a distinct "forbidden" would confirm the
    // id exists, turning the error into an enumeration oracle.
    expect(result.errorCode).toBe('NOT_FOUND');
  });

  it('cannot plant a QR code inside another tenant campaign', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Cross Plant');

    const result = await gql(
      app,
      CREATE_CODE,
      { campaignId: campaign.id, input: { name: 'Hostile', destinationPath: '/work' } },
      { accessToken: tokenAdminB, organizationId: tenantB.organizationId },
    );
    expect(result.errorCode).toBe('NOT_FOUND');
  });

  it('cannot pause another tenant QR code', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Cross Pause');
    const code = await makeCode(tokenAdminA, tenantA.organizationId, campaign.id);

    const result = await gql(
      app,
      TRANSITION_CODE,
      { id: code.id, action: 'PAUSE' },
      { accessToken: tokenAdminB, organizationId: tenantB.organizationId },
    );
    expect(result.errorCode).toBe('NOT_FOUND');

    const unchanged = await prisma.qrCode.findUniqueOrThrow({
      where: { id: code.id },
      select: { status: true },
    });
    expect(unchanged.status).toBe('ACTIVE');
  });

  it('cannot read another tenant analytics, even by passing their campaign id', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Cross Analytics');
    const code = await makeCode(tokenAdminA, tenantA.organizationId, campaign.id);
    await scan(code.code);

    const forged = await gql(
      app,
      ANALYTICS,
      { filter: { range: 'LAST_30_DAYS', campaignId: campaign.id } },
      { accessToken: tokenAdminB, organizationId: tenantB.organizationId },
    );
    expect(forged.errorCode).toBe('NOT_FOUND');

    // And tenant B's own analytics must not include tenant A's scan.
    const own = await gql<{ qrAnalytics: { totalScans: number } }>(
      app,
      ANALYTICS,
      { filter: { range: 'LAST_30_DAYS' } },
      { accessToken: tokenAdminB, organizationId: tenantB.organizationId },
    );
    expect(own.data?.qrAnalytics.totalScans).toBe(0);
  });

  it('rejects a forged tenant header', async () => {
    const result = await gql(
      app,
      LIST_CAMPAIGNS,
      {},
      { accessToken: tokenAdminA, organizationId: tenantB.organizationId },
    );
    // Membership in B was never granted, so the scope resolves to nothing and
    // the permission check fails closed.
    expect(result.errorCode).toBe('FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
// RBAC
// ---------------------------------------------------------------------------

describe.skipIf(!available)('QR: RBAC', () => {
  it('rejects unauthenticated access to every QR query and mutation', async () => {
    const list = await gql(app, LIST_CAMPAIGNS, {});
    expect(list.errorCode).toBe('UNAUTHENTICATED');

    const create = await gql(app, CREATE_CAMPAIGN, { input: { name: 'Anonymous' } });
    expect(create.errorCode).toBe('UNAUTHENTICATED');

    const analytics = await gql(app, ANALYTICS, { filter: {} });
    expect(analytics.errorCode).toBe('UNAUTHENTICATED');
  });

  it('lets a VIEWER read campaigns but not create or change one', async () => {
    const readable = await gql(
      app,
      LIST_CAMPAIGNS,
      {},
      { accessToken: tokenViewerA, organizationId: tenantA.organizationId },
    );
    expect(readable.errors).toBeNull();

    const created = await gql(
      app,
      CREATE_CAMPAIGN,
      { input: { name: 'Viewer Attempt' } },
      { accessToken: tokenViewerA, organizationId: tenantA.organizationId },
    );
    expect(created.errorCode).toBe('FORBIDDEN');
  });

  it('does not let a VIEWER activate, pause or archive a QR code', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Viewer Lifecycle');
    const code = await makeCode(tokenAdminA, tenantA.organizationId, campaign.id);

    for (const action of ['PAUSE', 'ARCHIVE', 'ACTIVATE'] as const) {
      const result = await gql(
        app,
        TRANSITION_CODE,
        { id: code.id, action },
        { accessToken: tokenViewerA, organizationId: tenantA.organizationId },
      );
      expect(result.errorCode, `viewer should not be able to ${action}`).toBe('FORBIDDEN');
    }

    const unchanged = await prisma.qrCode.findUniqueOrThrow({
      where: { id: code.id },
      select: { status: true },
    });
    expect(unchanged.status).toBe('ACTIVE');
  });

  it('does not show a VIEWER any analytics', async () => {
    const result = await gql(
      app,
      ANALYTICS,
      { filter: {} },
      { accessToken: tokenViewerA, organizationId: tenantA.organizationId },
    );
    expect(result.errorCode).toBe('FORBIDDEN');
  });

  it('lets a CONTENT_MANAGER author a code but not retire one', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Editor Scope');

    const created = await gql<{ createQrCode: { id: string } }>(
      app,
      CREATE_CODE,
      {
        campaignId: campaign.id,
        input: { name: 'Editor QR', destinationPath: '/news' },
      },
      { accessToken: tokenEditorA, organizationId: tenantA.organizationId },
    );
    expect(created.errors).toBeNull();

    const archived = await gql(
      app,
      TRANSITION_CODE,
      { id: created.data?.createQrCode.id ?? '', action: 'ARCHIVE' },
      { accessToken: tokenEditorA, organizationId: tenantA.organizationId },
    );
    expect(archived.errorCode).toBe('FORBIDDEN');
  });

  it('lets an ANALYST read analytics but not author anything', async () => {
    const analytics = await gql(
      app,
      ANALYTICS,
      { filter: { range: 'LAST_7_DAYS' } },
      { accessToken: tokenAnalystA, organizationId: tenantA.organizationId },
    );
    expect(analytics.errors).toBeNull();

    const created = await gql(
      app,
      CREATE_CAMPAIGN,
      { input: { name: 'Analyst Attempt' } },
      { accessToken: tokenAnalystA, organizationId: tenantA.organizationId },
    );
    expect(created.errorCode).toBe('FORBIDDEN');
  });

  it('withholds the printable asset from a role without the download permission', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Download Scope');
    const code = await makeCode(tokenAdminA, tenantA.organizationId, campaign.id);

    const asAdmin = await gql<{ qrCode: { image: { svg: string } | null } }>(
      app,
      GET_CODE,
      { id: code.id },
      { accessToken: tokenAdminA, organizationId: tenantA.organizationId },
    );
    expect(asAdmin.data?.qrCode.image?.svg).toContain('<svg');

    const asViewer = await gql<{ qrCode: { image: unknown } }>(
      app,
      GET_CODE,
      { id: code.id },
      { accessToken: tokenViewerA, organizationId: tenantA.organizationId },
    );
    // Null rather than an error: the rest of the code is legitimately readable.
    expect(asViewer.errors).toBeNull();
    expect(asViewer.data?.qrCode.image).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Public redirect
// ---------------------------------------------------------------------------

describe.skipIf(!available)('public QR redirect', () => {
  it('redirects an active code to its destination with UTM parameters', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Redirect Happy');
    const code = await makeCode(tokenAdminA, tenantA.organizationId, campaign.id, {
      destinationPath: '/work/road-development',
    });

    const response = await scan(code.code);

    expect(response.status).toBe(302);
    const location = new URL(response.headers.location as string);
    expect(location.pathname).toBe('/work/road-development');
    expect(location.searchParams.get('utm_source')).toBe('qr');
    expect(location.searchParams.get('utm_medium')).toBe('poster');
    expect(location.searchParams.get('utm_campaign')).toBe('redirect-happy');
    expect(location.searchParams.get('org')).toBe(tenantA.slug);
    expect(location.searchParams.get('rk_qr')).toBe(code.code);

    // Not indexable, and not cacheable - a cached redirect would keep working
    // after the code was paused.
    expect(response.headers['x-robots-tag']).toContain('noindex');
    expect(response.headers['cache-control']).toContain('no-store');
  });

  it('requires no authentication', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Redirect Anon');
    const code = await makeCode(tokenAdminA, tenantA.organizationId, campaign.id);

    // No token, no cookie, no tenant header - exactly what a phone sends.
    const response = await request(app).get(`/q/${code.code}`).redirects(0);
    expect(response.status).toBe(302);
  });

  it('returns a safe message for an unknown code, without leaking anything', async () => {
    const response = await request(app).get('/q/RK-QR-00000000').redirects(0);

    expect(response.status).toBe(404);
    expect(response.text).toContain('QR code not found');
    // No identifiers, no stack, no driver text.
    expect(response.text).not.toMatch(/prisma|postgres|select |stack|Error:/i);
  });

  it('returns a safe message for a malformed code without querying', async () => {
    for (const bad of ['nonsense', '../../etc/passwd', 'RK-QR-!!!!', '%00']) {
      const response = await request(app)
        .get(`/q/${encodeURIComponent(bad)}`)
        .redirects(0);
      expect(response.status).toBe(404);
    }
  });

  it('shows an inactive notice for a paused code, and does not redirect', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Redirect Paused');
    const code = await makeCode(tokenAdminA, tenantA.organizationId, campaign.id);

    await gql(
      app,
      TRANSITION_CODE,
      { id: code.id, action: 'PAUSE' },
      { accessToken: tokenAdminA, organizationId: tenantA.organizationId },
    );

    const response = await scan(code.code);
    expect(response.status).toBe(200);
    expect(response.headers.location).toBeUndefined();
    expect(response.text).toContain('currently inactive');
  });

  it('shows a retired notice for an archived code', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Redirect Archived');
    const code = await makeCode(tokenAdminA, tenantA.organizationId, campaign.id);

    await gql(
      app,
      TRANSITION_CODE,
      { id: code.id, action: 'ARCHIVE' },
      { accessToken: tokenAdminA, organizationId: tenantA.organizationId },
    );

    const response = await scan(code.code);
    expect(response.status).toBe(410);
    expect(response.text).toContain('no longer active');
  });

  it('stops redirecting when the owning organisation is suspended', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    await addMembership(admin.id, tenant.organizationId, 'CAMPAIGN_ADMIN');
    const token = (await login(app, admin.email, admin.password)).accessToken;

    const campaign = await makeCampaign(token, tenant.organizationId, 'Suspended Tenant');
    const code = await makeCode(token, tenant.organizationId, campaign.id);

    expect((await scan(code.code)).status).toBe(302);

    await prisma.organization.update({
      where: { id: tenant.organizationId },
      data: { status: 'SUSPENDED' },
    });

    const response = await scan(code.code);
    // NOT_FOUND rather than a distinct status, so the endpoint cannot be used
    // to learn that a tenant was suspended.
    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Scan recording
// ---------------------------------------------------------------------------

describe.skipIf(!available)('scan events', () => {
  it('records one event per scan, scoped to the owning tenant', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Scan Counting');
    const code = await makeCode(tokenAdminA, tenantA.organizationId, campaign.id);

    await scan(code.code);
    await scan(code.code);
    await scan(code.code);

    const rows = await prisma.qrScanEvent.findMany({
      where: { qrCodeId: code.id },
      select: { organizationId: true, campaignId: true, landingPath: true },
    });

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.organizationId).toBe(tenantA.organizationId);
      expect(row.campaignId).toBe(campaign.id);
      expect(row.landingPath).toBe('/work');
    }
  });

  it('does not record a scan of a paused or unknown code', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Scan Not Counted');
    const code = await makeCode(tokenAdminA, tenantA.organizationId, campaign.id);

    await gql(
      app,
      TRANSITION_CODE,
      { id: code.id, action: 'PAUSE' },
      { accessToken: tokenAdminA, organizationId: tenantA.organizationId },
    );

    await scan(code.code);
    await request(app).get('/q/RK-QR-ZZZZZZZZ').redirects(0);
    await flushPendingScans();

    // A dead poster is not a working channel; counting it would inflate the
    // campaign's numbers with traffic that reached nothing.
    expect(await prisma.qrScanEvent.count({ where: { qrCodeId: code.id } })).toBe(0);
  });

  it('classifies device and operating system without storing the User-Agent', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Scan Devices');
    const code = await makeCode(tokenAdminA, tenantA.organizationId, campaign.id);

    const iphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const android =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
    const ipad =
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const desktop =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

    await scan(code.code, { 'user-agent': iphone });
    await scan(code.code, { 'user-agent': android });
    await scan(code.code, { 'user-agent': ipad });
    await scan(code.code, { 'user-agent': desktop });

    const rows = await prisma.qrScanEvent.findMany({
      where: { qrCodeId: code.id },
      select: { deviceCategory: true, osCategory: true },
      orderBy: { scannedAt: 'asc' },
    });

    const devices = rows.map((row) => row.deviceCategory);
    expect(devices).toContain('MOBILE');
    expect(devices).toContain('TABLET');
    expect(devices).toContain('DESKTOP');

    const systems = rows.map((row) => row.osCategory);
    expect(systems).toContain('IOS');
    expect(systems).toContain('ANDROID');
    expect(systems).toContain('WINDOWS');

    // Nothing in the stored row resembles the raw agent string.
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain('AppleWebKit');
    expect(serialized).not.toContain('Pixel 8');
  });

  it('flags link-preview crawlers as automated rather than counting them as people', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Scan Bots');
    const code = await makeCode(tokenAdminA, tenantA.organizationId, campaign.id);

    await scan(code.code, { 'user-agent': 'WhatsApp/2.23' });
    await scan(code.code, { 'user-agent': 'facebookexternalhit/1.1' });
    await scan(code.code, {
      'user-agent':
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36',
    });

    const automated = await prisma.qrScanEvent.count({
      where: { qrCodeId: code.id, isAutomated: true },
    });
    const human = await prisma.qrScanEvent.count({
      where: { qrCodeId: code.id, isAutomated: false },
    });

    expect(automated).toBe(2);
    expect(human).toBe(1);
  });

  it('buckets the referrer without storing the referrer URL', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Scan Referrers');
    const code = await makeCode(tokenAdminA, tenantA.organizationId, campaign.id);

    await scan(code.code, { referer: 'https://www.google.com/search?q=private+medical+query' });

    const row = await prisma.qrScanEvent.findFirstOrThrow({
      where: { qrCodeId: code.id },
      select: { referrerCategory: true },
    });

    expect(row.referrerCategory).toBe('SEARCH');

    // The search TERM in particular must never survive: it is about the person,
    // not the channel.
    const all = await prisma.qrScanEvent.findMany({ where: { qrCodeId: code.id } });
    expect(JSON.stringify(all)).not.toContain('private+medical+query');
    expect(JSON.stringify(all)).not.toContain('google.com');
  });

  it('stores no IP address anywhere on the scan row', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Scan Privacy');
    const code = await makeCode(tokenAdminA, tenantA.organizationId, campaign.id);

    await scan(code.code, { 'x-forwarded-for': '203.0.113.42' });

    const rows = await prisma.qrScanEvent.findMany({ where: { qrCodeId: code.id } });
    const serialized = JSON.stringify(rows);

    expect(serialized).not.toContain('203.0.113.42');
    // Nor any other dotted quad.
    expect(serialized).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
  });
});

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

describe.skipIf(!available)('QR analytics', () => {
  it('aggregates totals, sources, wards, devices and codes', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    await addMembership(admin.id, tenant.organizationId, 'CAMPAIGN_ADMIN');
    const token = (await login(app, admin.email, admin.password)).accessToken;

    const campaign = await makeCampaign(token, tenant.organizationId, 'Analytics Fixture');

    const poster = await makeCode(token, tenant.organizationId, campaign.id, {
      name: 'Poster QR',
      source: 'Poster',
      ward: 'Ward 12',
    });
    const pamphlet = await makeCode(token, tenant.organizationId, campaign.id, {
      name: 'Pamphlet QR',
      source: 'Pamphlet',
      ward: 'Ward 8',
    });

    const android =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';

    await scan(poster.code, { 'user-agent': android });
    await scan(poster.code, { 'user-agent': android });
    await scan(poster.code, { 'user-agent': android });
    await scan(pamphlet.code, { 'user-agent': android });

    const result = await gql<{
      qrAnalytics: {
        totalScans: number;
        activeQrCodes: number;
        totalQrCodes: number;
        bySource: Array<{ label: string; scans: number }>;
        byWard: Array<{ label: string; scans: number }>;
        byDevice: Array<{ key: string; scans: number }>;
        byQrCode: Array<{ key: string; scans: number }>;
        trend: Array<{ scans: number }>;
      };
    }>(
      app,
      ANALYTICS,
      { filter: { range: 'LAST_30_DAYS', campaignId: campaign.id } },
      { accessToken: token, organizationId: tenant.organizationId },
    );

    const analytics = result.data?.qrAnalytics;
    expect(analytics?.totalScans).toBe(4);
    expect(analytics?.totalQrCodes).toBe(2);
    expect(analytics?.activeQrCodes).toBe(2);

    const sources = Object.fromEntries(
      (analytics?.bySource ?? []).map((bucket) => [bucket.label, bucket.scans]),
    );
    expect(sources.Poster).toBe(3);
    expect(sources.Pamphlet).toBe(1);

    const wards = Object.fromEntries(
      (analytics?.byWard ?? []).map((bucket) => [bucket.label, bucket.scans]),
    );
    expect(wards['Ward 12']).toBe(3);
    expect(wards['Ward 8']).toBe(1);

    const devices = Object.fromEntries(
      (analytics?.byDevice ?? []).map((bucket) => [bucket.key, bucket.scans]),
    );
    expect(devices.MOBILE).toBe(4);

    const codes = Object.fromEntries(
      (analytics?.byQrCode ?? []).map((bucket) => [bucket.key, bucket.scans]),
    );
    expect(codes[poster.id]).toBe(3);
    expect(codes[pamphlet.id]).toBe(1);

    // One day of scans, so one trend point.
    expect(analytics?.trend.reduce((sum, point) => sum + point.scans, 0)).toBe(4);
  });

  it('excludes automated traffic when asked, and counts it otherwise', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    await addMembership(admin.id, tenant.organizationId, 'CAMPAIGN_ADMIN');
    const token = (await login(app, admin.email, admin.password)).accessToken;

    const campaign = await makeCampaign(token, tenant.organizationId, 'Automated Filter');
    const code = await makeCode(token, tenant.organizationId, campaign.id);

    await scan(code.code, { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Mobile Safari/537.36' });
    await scan(code.code, { 'user-agent': 'Slackbot-LinkExpanding 1.0' });

    const all = await gql<{ qrAnalytics: { totalScans: number; automatedScans: number } }>(
      app,
      ANALYTICS,
      { filter: { range: 'LAST_30_DAYS', campaignId: campaign.id } },
      { accessToken: token, organizationId: tenant.organizationId },
    );
    expect(all.data?.qrAnalytics.totalScans).toBe(2);
    expect(all.data?.qrAnalytics.automatedScans).toBe(1);

    const filtered = await gql<{ qrAnalytics: { totalScans: number } }>(
      app,
      ANALYTICS,
      { filter: { range: 'LAST_30_DAYS', campaignId: campaign.id, excludeAutomated: true } },
      { accessToken: token, organizationId: tenant.organizationId },
    );
    expect(filtered.data?.qrAnalytics.totalScans).toBe(1);
  });

  it('honours the date range, excluding scans outside it', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    await addMembership(admin.id, tenant.organizationId, 'CAMPAIGN_ADMIN');
    const token = (await login(app, admin.email, admin.password)).accessToken;

    const campaign = await makeCampaign(token, tenant.organizationId, 'Date Filter');
    const code = await makeCode(token, tenant.organizationId, campaign.id);

    await scan(code.code);

    // A scan backdated well outside every preset window.
    const old = new Date(Date.now() - 120 * 86_400_000);
    await prisma.qrScanEvent.create({
      data: {
        organizationId: tenant.organizationId,
        campaignId: campaign.id,
        qrCodeId: code.id,
        scannedAt: old,
        scanDate: new Date(Date.UTC(old.getUTCFullYear(), old.getUTCMonth(), old.getUTCDate())),
        scanHour: old.getUTCHours(),
        scanDayOfWeek: old.getUTCDay(),
        landingPath: '/work',
      },
    });

    const today = await gql<{ qrAnalytics: { totalScans: number; range: { days: number } } }>(
      app,
      ANALYTICS,
      { filter: { range: 'TODAY', campaignId: campaign.id } },
      { accessToken: token, organizationId: tenant.organizationId },
    );
    expect(today.data?.qrAnalytics.totalScans).toBe(1);
    expect(today.data?.qrAnalytics.range.days).toBe(1);

    const month = await gql<{ qrAnalytics: { totalScans: number } }>(
      app,
      ANALYTICS,
      { filter: { range: 'LAST_30_DAYS', campaignId: campaign.id } },
      { accessToken: token, organizationId: tenant.organizationId },
    );
    expect(month.data?.qrAnalytics.totalScans).toBe(1);

    // A custom range wide enough to include the backdated scan finds both.
    const wide = await gql<{ qrAnalytics: { totalScans: number } }>(
      app,
      ANALYTICS,
      {
        filter: {
          range: 'CUSTOM',
          from: new Date(Date.now() - 200 * 86_400_000).toISOString(),
          to: new Date().toISOString(),
          campaignId: campaign.id,
        },
      },
      { accessToken: token, organizationId: tenant.organizationId },
    );
    expect(wide.data?.qrAnalytics.totalScans).toBe(2);
  });

  it('refuses an unbounded custom range rather than scanning the table', async () => {
    const result = await gql(
      app,
      ANALYTICS,
      {
        filter: {
          range: 'CUSTOM',
          from: '2000-01-01T00:00:00.000Z',
          to: new Date().toISOString(),
        },
      },
      { accessToken: tokenAdminA, organizationId: tenantA.organizationId },
    );
    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });

  it('exports aggregate CSV with no personal data', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    await addMembership(admin.id, tenant.organizationId, 'CAMPAIGN_ADMIN');
    const token = (await login(app, admin.email, admin.password)).accessToken;

    const campaign = await makeCampaign(token, tenant.organizationId, 'Csv Export');
    const code = await makeCode(token, tenant.organizationId, campaign.id, { source: 'Poster' });
    await scan(code.code, { 'x-forwarded-for': '198.51.100.7' });

    const result = await gql<{ qrAnalyticsCsv: string }>(
      app,
      /* GraphQL */ `
        query Csv($filter: AnalyticsFilter) {
          qrAnalyticsCsv(filter: $filter)
        }
      `,
      { filter: { range: 'LAST_30_DAYS', campaignId: campaign.id } },
      { accessToken: token, organizationId: tenant.organizationId },
    );

    const csv = result.data?.qrAnalyticsCsv ?? '';
    expect(csv).toContain('Date,Campaign,QR code,QR name,Source,Area,Ward,Scans');
    expect(csv).toContain('Poster');
    expect(csv).toContain(code.code);

    // The export is a daily total per channel - never a row per scan, never an
    // address, never a hash.
    expect(csv).not.toContain('198.51.100.7');
    expect(csv).not.toMatch(/visitHash|visit_hash/i);
  });
});

// ---------------------------------------------------------------------------
// Resilience
// ---------------------------------------------------------------------------

describe.skipIf(!available)('scan tracking failure does not block the citizen', () => {
  it('still redirects when recording the scan fails', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Failure Path');
    const code = await makeCode(tokenAdminA, tenantA.organizationId, campaign.id);

    // The insert is made to fail outright. This is the property that matters
    // most on the public path: a citizen holding a phone up to a poster must
    // reach the website whatever state the analytics pipeline is in.
    const spy = vi
      .spyOn(prisma.qrScanEvent, 'create')
      .mockRejectedValue(new Error('simulated analytics outage'));

    try {
      const response = await scan(code.code);

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('/work');
      // No internal detail reaches the citizen.
      expect(response.text).not.toContain('simulated analytics outage');
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }

    // Nothing was written, and the failure did not poison later scans.
    expect(await prisma.qrScanEvent.count({ where: { qrCodeId: code.id } })).toBe(0);

    const recovered = await scan(code.code);
    expect(recovered.status).toBe(302);
    expect(await prisma.qrScanEvent.count({ where: { qrCodeId: code.id } })).toBe(1);
  });

  it('redirects fast enough not to be waiting on the analytics write', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Latency Check');
    const code = await makeCode(tokenAdminA, tenantA.organizationId, campaign.id);

    // Warm the connection so this measures the redirect rather than a cold
    // start of a scale-to-zero database.
    await scan(code.code);

    const started = Date.now();
    const response = await request(app).get(`/q/${code.code}`).redirects(0);
    const elapsed = Date.now() - started;
    await flushPendingScans();

    expect(response.status).toBe(302);
    // Deliberately loose: this asserts the redirect does NOT await the insert,
    // not a production latency figure. Against a remote database an awaited
    // write would routinely blow past this.
    expect(elapsed).toBeLessThan(2000);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe.skipIf(!available)('scan endpoint rate limiting', () => {
  it('is not capped by the lower global limiter', async () => {
    const campaign = await makeCampaign(tokenAdminA, tenantA.organizationId, 'Rate Limit Layering');
    const code = await makeCode(tokenAdminA, tenantA.organizationId, campaign.id);

    // A second app whose GLOBAL limiter is deliberately tiny and whose SCAN
    // limiter is generous. Without the exemption the global limiter - which
    // runs earlier in the middleware chain - would silently override the
    // scan-specific one, and a classroom or public meeting scanning the same
    // poster from behind one NAT would start getting 429s. That is exactly the
    // traffic this product exists to serve.
    //
    // Using the real defaults instead would prove nothing: 60 requests sit
    // inside both ceilings, so such a test passes whether or not the bug is
    // present.
    const throttled = await createApp(
      buildEnvForTesting({
        ...process.env,
        RATE_LIMIT_MAX: '3',
        RATE_LIMIT_WINDOW_MS: '60000',
        QR_SCAN_RATE_LIMIT_MAX: '100',
        QR_SCAN_RATE_LIMIT_WINDOW_MS: '60000',
      }),
    );

    try {
      const scans = [];
      for (let i = 0; i < 12; i += 1) {
        scans.push(await request(throttled.app).get(`/q/${code.code}`).redirects(0));
      }
      await flushPendingScans();

      // Well past the global ceiling of 3, and every one still redirects.
      expect(scans.every((response) => response.status === 302)).toBe(true);

      // The global limiter is genuinely in force for everything else, so the
      // exemption is narrow rather than the limiter being disabled.
      const others = [];
      for (let i = 0; i < 8; i += 1) {
        others.push(await request(throttled.app).get('/no-such-route'));
      }
      expect(others.some((response) => response.status === 429)).toBe(true);
    } finally {
      await throttled.apollo.stop();
    }
  }, 180_000);
});

// ---------------------------------------------------------------------------
// End to end
// ---------------------------------------------------------------------------

describe.skipIf(!available)('QR end-to-end journey', () => {
  it('creates, activates, scans, counts, pauses, and reactivates', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    await addMembership(admin.id, tenant.organizationId, 'CAMPAIGN_ADMIN');
    const token = (await login(app, admin.email, admin.password)).accessToken;
    const options = { accessToken: token, organizationId: tenant.organizationId };

    // 1-2. Create a campaign, and activate it.
    const campaign = await makeCampaign(token, tenant.organizationId, 'End To End');

    const activated = await gql<{ transitionQrCampaign: { status: string } }>(
      app,
      TRANSITION_CAMPAIGN,
      { id: campaign.id, action: 'ACTIVATE' },
      options,
    );
    expect(activated.data?.transitionQrCampaign.status).toBe('ACTIVE');

    // 3-4. Create a QR code with a configured destination.
    const code = await makeCode(token, tenant.organizationId, campaign.id, {
      name: 'Ward 12 Poster',
      destinationPath: '/work/road-development',
      source: 'Poster',
      ward: 'Ward 12',
    });
    expect(code.status).toBe('ACTIVE');

    // 5. The printable asset exists and encodes the scan URL.
    const asset = await gql<{
      qrCode: { image: { scanUrl: string; svg: string; pngDataUrl: string } };
    }>(app, GET_CODE, { id: code.id }, options);
    expect(asset.data?.qrCode.image.scanUrl).toContain(`/q/${code.code}`);
    expect(asset.data?.qrCode.image.svg).toContain('<svg');
    expect(asset.data?.qrCode.image.pngDataUrl).toMatch(/^data:image\/png;base64,/);

    // 6-8. Scan, and verify the redirect destination.
    const first = await scan(code.code);
    expect(first.status).toBe(302);
    expect(first.headers.location).toContain('/work/road-development');

    // 9-10. Analytics reports exactly one scan.
    const afterOne = await gql<{ qrAnalytics: { totalScans: number } }>(
      app,
      ANALYTICS,
      { filter: { range: 'TODAY', campaignId: campaign.id } },
      options,
    );
    expect(JSON.stringify(afterOne.errors ?? null)).toBe('null');
    expect(afterOne.data?.qrAnalytics.totalScans).toBe(1);

    // 11-12. Scan again; the count increments.
    await scan(code.code);
    const afterTwo = await gql<{ qrAnalytics: { totalScans: number } }>(
      app,
      ANALYTICS,
      { filter: { range: 'TODAY', campaignId: campaign.id } },
      options,
    );
    expect(afterTwo.data?.qrAnalytics.totalScans).toBe(2);

    // The campaign's own totals agree with the analytics service.
    const campaignRow = await gql<{ qrCampaign: { totalScans: number; qrCodeCount: number } }>(
      app,
      GET_CAMPAIGN,
      { id: campaign.id },
      options,
    );
    expect(campaignRow.data?.qrCampaign.totalScans).toBe(2);
    expect(campaignRow.data?.qrCampaign.qrCodeCount).toBe(1);

    // 13-14. Pause, and confirm the citizen sees the inactive notice.
    const paused = await gql<{ transitionQrCode: { status: string } }>(
      app,
      TRANSITION_CODE,
      { id: code.id, action: 'PAUSE' },
      options,
    );
    expect(paused.data?.transitionQrCode.status).toBe('PAUSED');

    const whilePaused = await scan(code.code);
    expect(whilePaused.status).toBe(200);
    expect(whilePaused.text).toContain('currently inactive');

    // A paused scan is not counted.
    const afterPause = await gql<{ qrAnalytics: { totalScans: number } }>(
      app,
      ANALYTICS,
      { filter: { range: 'TODAY', campaignId: campaign.id } },
      options,
    );
    expect(afterPause.data?.qrAnalytics.totalScans).toBe(2);

    // 15-16. Reactivate, and confirm the redirect works again.
    const reactivated = await gql<{ transitionQrCode: { status: string } }>(
      app,
      TRANSITION_CODE,
      { id: code.id, action: 'ACTIVATE' },
      options,
    );
    expect(reactivated.data?.transitionQrCode.status).toBe('ACTIVE');

    const afterReactivation = await scan(code.code);
    expect(afterReactivation.status).toBe(302);
    expect(afterReactivation.headers.location).toContain('/work/road-development');

    const final = await gql<{ qrAnalytics: { totalScans: number } }>(
      app,
      ANALYTICS,
      { filter: { range: 'TODAY', campaignId: campaign.id } },
      options,
    );
    expect(final.data?.qrAnalytics.totalScans).toBe(3);
  }, 180_000);
});

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

describe.skipIf(!available)('QR audit trail', () => {
  it('records administrative actions but never individual scans', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    await addMembership(admin.id, tenant.organizationId, 'CAMPAIGN_ADMIN');
    const token = (await login(app, admin.email, admin.password)).accessToken;
    const options = { accessToken: token, organizationId: tenant.organizationId };

    const campaign = await makeCampaign(token, tenant.organizationId, 'Audit Trail');
    const code = await makeCode(token, tenant.organizationId, campaign.id);
    await gql(app, TRANSITION_CODE, { id: code.id, action: 'PAUSE' }, options);

    await scan(code.code);
    await scan(code.code);

    const entries = await prisma.auditLog.findMany({
      where: { organizationId: tenant.organizationId },
      select: { action: true, entityType: true, entityId: true },
    });

    const actions = entries.map((entry) => entry.action);
    expect(actions).toContain('QR_CAMPAIGN_CREATED');
    expect(actions).toContain('QR_CODE_CREATED');
    expect(actions).toContain('QR_CODE_STATUS_CHANGED');

    // Scans are analytics, not administration. Writing millions of them here
    // would drown the security record the audit trail exists to protect.
    expect(actions.filter((action) => action.includes('SCAN'))).toHaveLength(0);
    expect(entries.filter((entry) => entry.entityType === 'QrScanEvent')).toHaveLength(0);
  });
});
