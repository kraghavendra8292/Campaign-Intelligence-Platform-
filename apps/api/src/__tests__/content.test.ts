import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { ApolloServer } from '@apollo/server';
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
 * Phase 3: CMS, publishing and public-site tests.
 *
 * The three properties under test are the ones that would be most damaging to
 * get wrong: content must not cross tenants, unpublished content must not be
 * publicly reachable, and publishing must require the right permission.
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

/** Slugs are unique per run so parallel runs cannot collide. */
const suffix = Math.random().toString(36).slice(2, 8);

async function seedTenantContent(tenant: TestTenant, label: string) {
  const base = {
    organizationId: tenant.organizationId,
    locale: 'en' as const,
    area: label,
  };

  await prisma.project.createMany({
    data: [
      {
        ...base,
        slug: `published-project-${suffix}`,
        title: `${label} published project`,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
      {
        ...base,
        slug: `draft-project-${suffix}`,
        title: `${label} draft project`,
        status: 'DRAFT',
      },
      {
        ...base,
        slug: `archived-project-${suffix}`,
        title: `${label} archived project`,
        status: 'ARCHIVED',
        publishedAt: new Date(),
      },
    ],
  });

  await prisma.newsArticle.create({
    data: {
      organizationId: tenant.organizationId,
      locale: 'en',
      slug: `published-news-${suffix}`,
      title: `${label} published update`,
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });
}

beforeAll(async () => {
  if (!available) return;

  ({ app, apollo } = await createApp());

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

  await seedTenantContent(tenantA, 'Tenant A');
  await seedTenantContent(tenantB, 'Tenant B');
}, 180_000);

afterAll(async () => {
  if (!available) return;
  await apollo.stop();
  await cleanupFixtures();
  await prisma.$disconnect();
}, 180_000);

const PUBLIC_PROJECTS = /* GraphQL */ `
  query PublicProjects($input: PublicSiteInput) {
    publicProjects(input: $input, first: 50) {
      nodes {
        id
        slug
        title
      }
      totalCount
    }
  }
`;

const CMS_PROJECTS = /* GraphQL */ `
  query CmsProjects {
    cmsProjects(first: 50) {
      nodes {
        id
        slug
        title
        status
      }
      totalCount
    }
  }
`;

const CREATE_PROJECT = /* GraphQL */ `
  mutation CreateProject($input: ProjectInput!) {
    createProject(input: $input) {
      id
      slug
      title
      status
    }
  }
`;

const TRANSITION_PROJECT = /* GraphQL */ `
  mutation Transition($id: ID!, $action: PublishAction!) {
    transitionProject(id: $id, action: $action) {
      id
      status
      publishedAt
    }
  }
`;

describe.skipIf(!available)('public site: publishing boundary', () => {
  it('returns published projects only', async () => {
    const result = await gql<{ publicProjects: { nodes: Array<{ slug: string }> } }>(
      app,
      PUBLIC_PROJECTS,
      { input: { organizationSlug: tenantA.slug } },
    );

    const slugs = result.data?.publicProjects.nodes.map((n) => n.slug) ?? [];
    expect(slugs).toContain(`published-project-${suffix}`);
    expect(slugs).not.toContain(`draft-project-${suffix}`);
    expect(slugs).not.toContain(`archived-project-${suffix}`);
  });

  it('cannot reach a draft directly by slug', async () => {
    const result = await gql(
      app,
      /* GraphQL */ `
        query P($input: PublicSiteInput, $slug: String!) {
          publicProject(input: $input, slug: $slug) {
            id
          }
        }
      `,
      { input: { organizationSlug: tenantA.slug }, slug: `draft-project-${suffix}` },
    );

    expect(result.errorCode).toBe('NOT_FOUND');
  });

  it('cannot reach archived content directly by slug', async () => {
    const result = await gql(
      app,
      /* GraphQL */ `
        query P($input: PublicSiteInput, $slug: String!) {
          publicProject(input: $input, slug: $slug) {
            id
          }
        }
      `,
      { input: { organizationSlug: tenantA.slug }, slug: `archived-project-${suffix}` },
    );

    expect(result.errorCode).toBe('NOT_FOUND');
  });

  it('serves the public site without any authentication', async () => {
    const result = await gql<{ publicHomepage: { organization: { slug: string } } }>(
      app,
      /* GraphQL */ `
        query Home($input: PublicSiteInput) {
          publicHomepage(input: $input) {
            organization {
              slug
            }
            featuredProjects {
              slug
            }
            latestNews {
              slug
            }
          }
        }
      `,
      { input: { organizationSlug: tenantA.slug } },
    );

    expect(result.errors).toBeNull();
    expect(result.data?.publicHomepage.organization.slug).toBe(tenantA.slug);
  });
});

describe.skipIf(!available)('public site: tenant isolation', () => {
  it('tenant A site shows none of tenant B content', async () => {
    const result = await gql<{ publicProjects: { nodes: Array<{ title: string }> } }>(
      app,
      PUBLIC_PROJECTS,
      { input: { organizationSlug: tenantA.slug } },
    );

    const titles = result.data?.publicProjects.nodes.map((n) => n.title) ?? [];
    expect(titles.some((t) => t.startsWith('Tenant A'))).toBe(true);
    expect(titles.some((t) => t.startsWith('Tenant B'))).toBe(false);
  });

  it('tenant B site shows none of tenant A content', async () => {
    const result = await gql<{ publicProjects: { nodes: Array<{ title: string }> } }>(
      app,
      PUBLIC_PROJECTS,
      { input: { organizationSlug: tenantB.slug } },
    );

    const titles = result.data?.publicProjects.nodes.map((n) => n.title) ?? [];
    expect(titles.some((t) => t.startsWith('Tenant B'))).toBe(true);
    expect(titles.some((t) => t.startsWith('Tenant A'))).toBe(false);
  });

  it('search is scoped to one tenant', async () => {
    const result = await gql<{
      publicSearch: { projects: Array<{ title: string }>; totalCount: number };
    }>(
      app,
      /* GraphQL */ `
        query S($input: PublicSiteInput, $term: String!) {
          publicSearch(input: $input, term: $term) {
            projects {
              title
            }
            totalCount
          }
        }
      `,
      { input: { organizationSlug: tenantA.slug }, term: 'published project' },
    );

    const titles = result.data?.publicSearch.projects.map((p) => p.title) ?? [];
    expect(titles.every((t) => t.startsWith('Tenant A'))).toBe(true);
  });

  it('an unknown site slug is not found', async () => {
    const result = await gql(app, PUBLIC_PROJECTS, {
      input: { organizationSlug: 'no-such-campaign-site' },
    });
    expect(result.errorCode).toBe('NOT_FOUND');
  });

  it('a suspended organisation stops serving its public site', async () => {
    const tenant = await createTenant();
    await prisma.organization.update({
      where: { id: tenant.organizationId },
      data: { status: 'SUSPENDED' },
    });

    const result = await gql(app, PUBLIC_PROJECTS, {
      input: { organizationSlug: tenant.slug },
    });
    expect(result.errorCode).toBe('NOT_FOUND');
  });
});

describe.skipIf(!available)('CMS: tenant isolation', () => {
  it('an admin sees only their own tenant content, including drafts', async () => {
    const session = await login(app, adminA.email, adminA.password);

    const result = await gql<{ cmsProjects: { nodes: Array<{ title: string; status: string }> } }>(
      app,
      CMS_PROJECTS,
      {},
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    const nodes = result.data?.cmsProjects.nodes ?? [];
    expect(nodes.some((n) => n.status === 'DRAFT')).toBe(true);
    expect(nodes.every((n) => n.title.startsWith('Tenant A'))).toBe(true);
  });

  it('an admin cannot edit another tenant project', async () => {
    const sessionA = await login(app, adminA.email, adminA.password);

    const foreign = await prisma.project.findFirstOrThrow({
      where: { organizationId: tenantB.organizationId },
      select: { id: true },
    });

    const result = await gql(
      app,
      /* GraphQL */ `
        mutation U($id: ID!, $input: ProjectInput!) {
          updateProject(id: $id, input: $input) {
            id
          }
        }
      `,
      { id: foreign.id, input: { title: 'Hijacked' } },
      { accessToken: sessionA.accessToken, organizationId: tenantA.organizationId },
    );

    expect(result.errorCode).toBe('NOT_FOUND');

    const untouched = await prisma.project.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(untouched.title).not.toBe('Hijacked');
  });

  it('an admin cannot publish another tenant project', async () => {
    const sessionA = await login(app, adminA.email, adminA.password);

    const foreign = await prisma.project.findFirstOrThrow({
      where: { organizationId: tenantB.organizationId, status: 'DRAFT' },
      select: { id: true },
    });

    const result = await gql(
      app,
      TRANSITION_PROJECT,
      { id: foreign.id, action: 'PUBLISH' },
      { accessToken: sessionA.accessToken, organizationId: tenantA.organizationId },
    );

    expect(result.errorCode).toBe('NOT_FOUND');

    const untouched = await prisma.project.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(untouched.status).toBe('DRAFT');
  });

  it('tenant B admin sees only tenant B content', async () => {
    const sessionB = await login(app, adminB.email, adminB.password);

    const result = await gql<{ cmsProjects: { nodes: Array<{ title: string }> } }>(
      app,
      CMS_PROJECTS,
      {},
      { accessToken: sessionB.accessToken, organizationId: tenantB.organizationId },
    );

    const titles = result.data?.cmsProjects.nodes.map((n) => n.title) ?? [];
    expect(titles.every((t) => t.startsWith('Tenant B'))).toBe(true);
  });
});

describe.skipIf(!available)('CMS: RBAC', () => {
  it('a VIEWER cannot read drafts', async () => {
    const session = await login(app, viewerA.email, viewerA.password);

    const result = await gql(
      app,
      CMS_PROJECTS,
      {},
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    expect(result.errorCode).toBe('FORBIDDEN');
  });

  it('a VIEWER cannot create content', async () => {
    const session = await login(app, viewerA.email, viewerA.password);

    const result = await gql(
      app,
      CREATE_PROJECT,
      { input: { title: 'Viewer project' } },
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    expect(result.errorCode).toBe('FORBIDDEN');
  });

  it('a CONTENT_MANAGER can create a draft', async () => {
    const session = await login(app, editorA.email, editorA.password);

    const result = await gql<{ createProject: { id: string; status: string } }>(
      app,
      CREATE_PROJECT,
      { input: { title: `Editor project ${suffix}` } },
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    expect(result.errors).toBeNull();
    // New content is always a draft: there is no "create published" path.
    expect(result.data?.createProject.status).toBe('DRAFT');
  });

  it('a CONTENT_MANAGER cannot publish', async () => {
    const session = await login(app, editorA.email, editorA.password);

    const draft = await prisma.project.findFirstOrThrow({
      where: { organizationId: tenantA.organizationId, status: 'DRAFT' },
      select: { id: true },
    });

    const result = await gql(
      app,
      TRANSITION_PROJECT,
      { id: draft.id, action: 'PUBLISH' },
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    expect(result.errorCode).toBe('FORBIDDEN');
  });

  it('a CONTENT_MANAGER may submit for review', async () => {
    const session = await login(app, editorA.email, editorA.password);

    const created = await gql<{ createProject: { id: string } }>(
      app,
      CREATE_PROJECT,
      { input: { title: `Review candidate ${suffix}` } },
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    const result = await gql<{ transitionProject: { status: string } }>(
      app,
      TRANSITION_PROJECT,
      { id: created.data?.createProject.id, action: 'SUBMIT_FOR_REVIEW' },
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    expect(result.data?.transitionProject.status).toBe('IN_REVIEW');
  });

  it('a CAMPAIGN_ADMIN can publish, and the item then appears publicly', async () => {
    const session = await login(app, adminA.email, adminA.password);

    const created = await gql<{ createProject: { id: string; slug: string } }>(
      app,
      CREATE_PROJECT,
      { input: { title: `Admin publishes this ${suffix}` } },
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );
    const id = created.data?.createProject.id;
    const slug = created.data?.createProject.slug;

    const published = await gql<{ transitionProject: { status: string; publishedAt: string } }>(
      app,
      TRANSITION_PROJECT,
      { id, action: 'PUBLISH' },
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    expect(published.data?.transitionProject.status).toBe('PUBLISHED');
    expect(published.data?.transitionProject.publishedAt).toBeTruthy();

    const publicView = await gql<{ publicProject: { slug: string } }>(
      app,
      /* GraphQL */ `
        query P($input: PublicSiteInput, $slug: String!) {
          publicProject(input: $input, slug: $slug) {
            slug
          }
        }
      `,
      { input: { organizationSlug: tenantA.slug }, slug },
    );

    expect(publicView.data?.publicProject.slug).toBe(slug);

    // Unpublishing removes it again.
    await gql(
      app,
      TRANSITION_PROJECT,
      { id, action: 'UNPUBLISH' },
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    const afterUnpublish = await gql(
      app,
      /* GraphQL */ `
        query P($input: PublicSiteInput, $slug: String!) {
          publicProject(input: $input, slug: $slug) {
            slug
          }
        }
      `,
      { input: { organizationSlug: tenantA.slug }, slug },
    );

    expect(afterUnpublish.errorCode).toBe('NOT_FOUND');
  });

  it('unauthenticated callers cannot reach the CMS at all', async () => {
    const read = await gql(app, CMS_PROJECTS);
    expect(read.errorCode).toBe('UNAUTHENTICATED');

    const write = await gql(app, CREATE_PROJECT, { input: { title: 'Anonymous' } });
    expect(write.errorCode).toBe('UNAUTHENTICATED');
  });
});

describe.skipIf(!available)('CMS: validation and slugs', () => {
  it('slugs are unique per tenant but reusable across tenants', async () => {
    const sessionA = await login(app, adminA.email, adminA.password);
    const sessionB = await login(app, adminB.email, adminB.password);
    const title = `Shared slug title ${suffix}`;

    const first = await gql<{ createProject: { slug: string } }>(
      app,
      CREATE_PROJECT,
      { input: { title } },
      { accessToken: sessionA.accessToken, organizationId: tenantA.organizationId },
    );
    expect(first.errors).toBeNull();

    // Same slug, same tenant: rejected.
    const duplicate = await gql(
      app,
      CREATE_PROJECT,
      { input: { title } },
      { accessToken: sessionA.accessToken, organizationId: tenantA.organizationId },
    );
    expect(duplicate.errorCode).toBe('CONFLICT');

    // Same slug, different tenant: allowed - slugs are per-tenant URLs.
    const otherTenant = await gql<{ createProject: { slug: string } }>(
      app,
      CREATE_PROJECT,
      { input: { title } },
      { accessToken: sessionB.accessToken, organizationId: tenantB.organizationId },
    );
    expect(otherTenant.errors).toBeNull();
    expect(otherTenant.data?.createProject.slug).toBe(first.data?.createProject.slug);
  });

  it('rejects a blank title', async () => {
    const session = await login(app, adminA.email, adminA.password);

    const result = await gql(
      app,
      CREATE_PROJECT,
      { input: { title: '   ' } },
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });

  it('rejects a completion date before the start date', async () => {
    const session = await login(app, adminA.email, adminA.password);

    const result = await gql(
      app,
      CREATE_PROJECT,
      {
        input: {
          title: `Bad dates ${suffix}`,
          startDate: '2024-06-01T00:00:00.000Z',
          completionDate: '2024-01-01T00:00:00.000Z',
        },
      },
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });

  it('refuses to delete published content before it is unpublished', async () => {
    const session = await login(app, adminA.email, adminA.password);

    const published = await prisma.project.findFirstOrThrow({
      where: { organizationId: tenantA.organizationId, status: 'PUBLISHED' },
      select: { id: true },
    });

    const result = await gql(
      app,
      /* GraphQL */ `
        mutation D($id: ID!) {
          deleteProject(id: $id)
        }
      `,
      { id: published.id },
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    expect(result.errorCode).toBe('CONFLICT');
  });
});

describe.skipIf(!available)('CMS: rich text sanitisation', () => {
  it('strips script tags and event handlers before storing', async () => {
    const session = await login(app, adminA.email, adminA.password);

    const hostile =
      '<p>Safe text</p><script>alert(1)</script><img src=x onerror="alert(2)"><a href="javascript:alert(3)">click</a>';

    const result = await gql<{ createProject: { id: string } }>(
      app,
      /* GraphQL */ `
        mutation C($input: ProjectInput!) {
          createProject(input: $input) {
            id
            descriptionHtml
          }
        }
      `,
      { input: { title: `Sanitisation test ${suffix}`, descriptionHtml: hostile } },
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    const stored = await prisma.project.findUniqueOrThrow({
      where: { id: result.data?.createProject.id },
      select: { descriptionHtml: true },
    });

    const html = stored.descriptionHtml ?? '';
    expect(html).toContain('Safe text');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
  });

  it('rejects a video URL outside the host allow-list', async () => {
    const session = await login(app, adminA.email, adminA.password);

    const result = await gql(
      app,
      /* GraphQL */ `
        mutation V($input: VideoInput!) {
          createVideo(input: $input) {
            id
          }
        }
      `,
      {
        input: {
          title: `Bad video ${suffix}`,
          videoUrl: 'https://evil.example/player',
          platform: 'YOUTUBE',
        },
      },
      { accessToken: session.accessToken, organizationId: tenantA.organizationId },
    );

    expect(result.errorCode).toBe('VALIDATION_ERROR');
  });
});

describe.skipIf(!available)('achievements: verification is separate from publishing', () => {
  it('a CONTENT_MANAGER cannot mark an achievement verified', async () => {
    const admin = await login(app, adminA.email, adminA.password);
    const editor = await login(app, editorA.email, editorA.password);

    const created = await gql<{ createAchievement: { id: string } }>(
      app,
      /* GraphQL */ `
        mutation A($input: AchievementInput!) {
          createAchievement(input: $input) {
            id
            verification
          }
        }
      `,
      { input: { title: `Verify test ${suffix}` } },
      { accessToken: admin.accessToken, organizationId: tenantA.organizationId },
    );

    const id = created.data?.createAchievement.id;

    const denied = await gql(
      app,
      /* GraphQL */ `
        mutation V($id: ID!, $verification: VerificationStatus!) {
          setAchievementVerification(id: $id, verification: $verification) {
            verification
          }
        }
      `,
      { id, verification: 'VERIFIED' },
      { accessToken: editor.accessToken, organizationId: tenantA.organizationId },
    );

    expect(denied.errorCode).toBe('FORBIDDEN');

    const allowed = await gql<{ setAchievementVerification: { verification: string } }>(
      app,
      /* GraphQL */ `
        mutation V($id: ID!, $verification: VerificationStatus!) {
          setAchievementVerification(id: $id, verification: $verification) {
            verification
          }
        }
      `,
      { id, verification: 'VERIFIED' },
      { accessToken: admin.accessToken, organizationId: tenantA.organizationId },
    );

    expect(allowed.data?.setAchievementVerification.verification).toBe('VERIFIED');
  });

  it('editing a verified achievement resets it to IN_REVIEW', async () => {
    const admin = await login(app, adminA.email, adminA.password);

    const created = await gql<{ createAchievement: { id: string } }>(
      app,
      /* GraphQL */ `
        mutation A($input: AchievementInput!) {
          createAchievement(input: $input) {
            id
          }
        }
      `,
      { input: { title: `Reset test ${suffix}` } },
      { accessToken: admin.accessToken, organizationId: tenantA.organizationId },
    );
    const id = created.data?.createAchievement.id;

    await gql(
      app,
      /* GraphQL */ `
        mutation V($id: ID!) {
          setAchievementVerification(id: $id, verification: VERIFIED) {
            verification
          }
        }
      `,
      { id },
      { accessToken: admin.accessToken, organizationId: tenantA.organizationId },
    );

    const edited = await gql<{ updateAchievement: { verification: string } }>(
      app,
      /* GraphQL */ `
        mutation U($id: ID!, $input: AchievementInput!) {
          updateAchievement(id: $id, input: $input) {
            verification
          }
        }
      `,
      { id, input: { title: `Reset test edited ${suffix}` } },
      { accessToken: admin.accessToken, organizationId: tenantA.organizationId },
    );

    // A verified badge must not survive an edit to the claim it vouches for.
    expect(edited.data?.updateAchievement.verification).toBe('IN_REVIEW');
  });

  it('never exposes internal evidence notes publicly', async () => {
    const admin = await login(app, adminA.email, adminA.password);

    const created = await gql<{ createAchievement: { id: string; slug: string } }>(
      app,
      /* GraphQL */ `
        mutation A($input: AchievementInput!) {
          createAchievement(input: $input) {
            id
            slug
          }
        }
      `,
      { input: { title: `Evidence test ${suffix}` } },
      { accessToken: admin.accessToken, organizationId: tenantA.organizationId },
    );
    const id = created.data?.createAchievement.id;
    const slug = created.data?.createAchievement.slug;

    await gql(
      app,
      /* GraphQL */ `
        mutation E($id: ID!, $evidence: [EvidenceInput!]!) {
          setAchievementEvidence(id: $id, evidence: $evidence) {
            id
          }
        }
      `,
      {
        id,
        evidence: [
          {
            title: 'Public evidence item',
            sourceNote: 'Public provenance note',
            internalNote: 'SECRET-INTERNAL-REASONING',
            isPublic: true,
          },
          { title: 'Private evidence item', internalNote: 'ALSO-SECRET', isPublic: false },
        ],
      },
      { accessToken: admin.accessToken, organizationId: tenantA.organizationId },
    );

    await gql(
      app,
      /* GraphQL */ `
        mutation T($id: ID!) {
          transitionAchievement(id: $id, action: PUBLISH) {
            id
          }
        }
      `,
      { id },
      { accessToken: admin.accessToken, organizationId: tenantA.organizationId },
    );

    const publicView = await gql<{
      publicAchievement: { evidence: Array<{ title: string; sourceNote: string | null }> };
    }>(
      app,
      /* GraphQL */ `
        query A($input: PublicSiteInput, $slug: String!) {
          publicAchievement(input: $input, slug: $slug) {
            evidence {
              title
              description
              sourceNote
            }
          }
        }
      `,
      { input: { organizationSlug: tenantA.slug }, slug },
    );

    const serialized = JSON.stringify(publicView.data);
    expect(serialized).not.toContain('SECRET-INTERNAL-REASONING');
    expect(serialized).not.toContain('ALSO-SECRET');
    expect(serialized).not.toContain('Private evidence item');
    expect(serialized).toContain('Public evidence item');
  });
});

describe.skipIf(!available)('locale: translations are sibling rows', () => {
  /**
   * A Kannada translation is a separate row sharing the English slug. These
   * check the three things that separation has to buy us:
   *
   *   1. A locale returns only its own rows.
   *   2. Publishing status is independent per locale - so a translation can sit
   *      in draft while the original is live, and must not leak.
   *   3. The same slug in two locales is two records, not a collision.
   */
  const knPublished = `published-project-${suffix}`;
  const knDraft = `draft-only-in-kannada-${suffix}`;

  beforeAll(async () => {
    await prisma.project.createMany({
      data: [
        {
          organizationId: tenantA.organizationId,
          locale: 'kn',
          slug: knPublished,
          title: 'Kannada translation (test fixture)',
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
        {
          organizationId: tenantA.organizationId,
          locale: 'kn',
          slug: knDraft,
          title: 'Kannada draft (test fixture)',
          status: 'DRAFT',
        },
      ],
    });
  });

  it('serves only the requested locale', async () => {
    const kannada = await gql<{
      publicProjects: { nodes: Array<{ slug: string; title: string }> };
    }>(app, PUBLIC_PROJECTS, { input: { organizationSlug: tenantA.slug, locale: 'kn' } });

    const titles = kannada.data?.publicProjects.nodes.map((n) => n.title) ?? [];
    expect(titles).toContain('Kannada translation (test fixture)');
    expect(titles).not.toContain(`${tenantA.slug} published project`);
  });

  it('keeps publishing status independent per locale', async () => {
    const kannada = await gql<{ publicProjects: { nodes: Array<{ slug: string }> } }>(
      app,
      PUBLIC_PROJECTS,
      { input: { organizationSlug: tenantA.slug, locale: 'kn' } },
    );

    // Drafted in Kannada: absent from the Kannada site...
    expect(kannada.data?.publicProjects.nodes.map((n) => n.slug)).not.toContain(knDraft);

    // ...and requesting it by slug fails in the same indistinguishable way as
    // a slug that does not exist at all.
    const direct = await gql(
      app,
      /* GraphQL */ `
        query P($input: PublicSiteInput, $slug: String!) {
          publicProject(input: $input, slug: $slug) {
            id
          }
        }
      `,
      { input: { organizationSlug: tenantA.slug, locale: 'kn' }, slug: knDraft },
    );

    expect(direct.errorCode).toBe('NOT_FOUND');
  });

  it('treats one slug in two locales as two distinct records', async () => {
    const english = await gql<{ publicProject: { id: string; title: string } }>(
      app,
      /* GraphQL */ `
        query P($input: PublicSiteInput, $slug: String!) {
          publicProject(input: $input, slug: $slug) {
            id
            title
          }
        }
      `,
      { input: { organizationSlug: tenantA.slug, locale: 'en' }, slug: knPublished },
    );

    const kannada = await gql<{ publicProject: { id: string; title: string } }>(
      app,
      /* GraphQL */ `
        query P($input: PublicSiteInput, $slug: String!) {
          publicProject(input: $input, slug: $slug) {
            id
            title
          }
        }
      `,
      { input: { organizationSlug: tenantA.slug, locale: 'kn' }, slug: knPublished },
    );

    expect(english.data?.publicProject.id).toBeDefined();
    expect(kannada.data?.publicProject.id).toBeDefined();
    expect(english.data?.publicProject.id).not.toBe(kannada.data?.publicProject.id);
    expect(english.data?.publicProject.title).not.toBe(kannada.data?.publicProject.title);
  });

  it('does not leak a translation across tenants', async () => {
    const other = await gql<{ publicProjects: { nodes: Array<{ title: string }> } }>(
      app,
      PUBLIC_PROJECTS,
      { input: { organizationSlug: tenantB.slug, locale: 'kn' } },
    );

    const titles = other.data?.publicProjects.nodes.map((n) => n.title) ?? [];
    expect(titles).not.toContain('Kannada translation (test fixture)');
  });
});
