/**
 * Phase 3 demo content.
 *
 * ALL OF THIS IS FICTIONAL. The organisations, candidates, projects, figures
 * and dates are invented for development and demonstration. Nothing here
 * describes a real person, a real public work or a real political claim, and
 * none of it should ever be presented as fact.
 *
 * Two organisations are seeded on purpose: a single-tenant fixture cannot
 * demonstrate isolation, and the tenant-isolation test needs two populated
 * sites to prove that neither leaks into the other.
 */
import type { PrismaClient } from '../src/generated/prisma/client';
import { replaceDemoAchievements } from './seedAchievements';
import { replaceDemoWorks } from './seedWorks';

type Prisma = PrismaClient;

interface DemoOrg {
  slug: string;
  name: string;
  candidate: string;
  designation: string;
  headline: string;
  area: string;
  accent: string;
  /** Kannada counterparts, used to seed the `kn` sibling rows. */
  candidateKn: string;
  designationKn: string;
  headlineKn: string;
  areaKn: string;
}

const DEMO_ORGS: readonly DemoOrg[] = [
  {
    slug: 'demo-campaign',
    name: 'Demo Campaign Organisation',
    candidate: 'R. K. Demo',
    designation: 'Candidate, North District (DEMO)',
    headline: 'Together, let us build a better tomorrow',
    area: 'North District',
    accent: 'north',
    candidateKn: 'ಆರ್. ಕೆ. ಡೆಮೋ',
    designationKn: 'ಅಭ್ಯರ್ಥಿ, ಉತ್ತರ ಜಿಲ್ಲೆ (ಡೆಮೋ)',
    headlineKn: 'ಒಟ್ಟಾಗಿ, ಉತ್ತಮ ನಾಳೆಯನ್ನು ಕಟ್ಟೋಣ',
    areaKn: 'ಉತ್ತರ ಜಿಲ್ಲೆ',
  },
  {
    slug: 'demo-campaign-two',
    name: 'Second Demo Organisation',
    candidate: 'S. M. Sample',
    designation: 'Candidate, South Ward (DEMO)',
    headline: 'A stronger neighbourhood, built together',
    area: 'South Ward',
    accent: 'south',
    candidateKn: 'ಎಸ್. ಎಂ. ಸ್ಯಾಂಪಲ್',
    designationKn: 'ಅಭ್ಯರ್ಥಿ, ದಕ್ಷಿಣ ವಾರ್ಡ್ (ಡೆಮೋ)',
    headlineKn: 'ಬಲಿಷ್ಠ ನೆರೆಹೊರೆ, ಒಟ್ಟಾಗಿ ಕಟ್ಟಿದ್ದು',
    areaKn: 'ದಕ್ಷಿಣ ವಾರ್ಡ್',
  },
];

const PRIORITY_TEMPLATES = [
  {
    slug: 'roads-and-infrastructure',
    title: 'Roads & Infrastructure',
    icon: 'road',
    category: 'INFRASTRUCTURE' as const,
    description: 'Better roads, drains and street lighting across every ward. (Demo content.)',
  },
  {
    slug: 'water',
    title: 'Water',
    icon: 'water',
    category: 'WATER' as const,
    description: 'Reliable drinking water and maintained supply lines. (Demo content.)',
  },
  {
    slug: 'education',
    title: 'Education',
    icon: 'school',
    category: 'EDUCATION' as const,
    description: 'Well-equipped schools and support for students. (Demo content.)',
  },
  {
    slug: 'healthcare',
    title: 'Healthcare',
    icon: 'health',
    category: 'HEALTHCARE' as const,
    description: 'Accessible primary health centres and regular camps. (Demo content.)',
  },
  {
    slug: 'employment',
    title: 'Employment',
    icon: 'work',
    category: 'EMPLOYMENT' as const,
    description: 'Skills training and support for local enterprise. (Demo content.)',
  },
];

/** Deterministic offsets so re-seeding produces stable, sensible dates. */
function daysAgo(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(9, 0, 0, 0);
  return date;
}

function daysAhead(days: number): Date {
  return daysAgo(-days);
}

export async function seedDemoContent(prisma: Prisma): Promise<void> {
  const seededOrgs: Array<{ id: string; slug: string; area: string; areaKn: string }> = [];

  for (const org of DEMO_ORGS) {
    const organization = await prisma.organization.upsert({
      where: { slug: org.slug },
      update: { name: org.name },
      create: { slug: org.slug, name: org.name, status: 'ACTIVE' },
      select: { id: true, slug: true },
    });

    const organizationId = organization.id;
    seededOrgs.push({
      id: organizationId,
      slug: org.slug,
      area: org.area,
      areaKn: org.areaKn,
    });

    // --- Candidate profile -------------------------------------------------
    await prisma.candidateProfile.upsert({
      where: { organizationId_locale: { organizationId, locale: 'en' } },
      update: {},
      create: {
        organizationId,
        locale: 'en',
        fullName: org.candidate,
        displayName: org.candidate,
        designation: org.designation,
        shortBio:
          'DEMO CONTENT. A fictional candidate profile used to develop and demonstrate the platform.',
        fullBioHtml:
          '<p><strong>This is demo content.</strong> It describes a fictional candidate and exists only to exercise the content management system.</p><p>Replace it from the CMS before using this site publicly.</p>',
        experienceHtml:
          '<ul><li>Fictional community role (demo)</li><li>Fictional civic committee (demo)</li></ul>',
        publicServiceHtml: '<p>Illustrative public-service summary. Demo content only.</p>',
        focusAreas: ['INFRASTRUCTURE', 'WATER', 'EDUCATION'],
        status: 'PUBLISHED',
        publishedAt: daysAgo(60),
        metaTitle: `${org.candidate} — ${org.name}`,
        metaDescription: 'Demo candidate profile for the RK Campaign Intelligence Platform.',
      },
    });

    // --- Vision ------------------------------------------------------------
    await prisma.vision.upsert({
      where: { organizationId_locale: { organizationId, locale: 'en' } },
      update: {},
      create: {
        organizationId,
        locale: 'en',
        headline: org.headline,
        summary:
          'DEMO CONTENT. An illustrative vision statement showing how the CMS drives the public site.',
        statementHtml:
          '<p>This vision statement is <strong>demo content</strong>. It is stored in the CMS and rendered dynamically on the public website.</p>',
        status: 'PUBLISHED',
        publishedAt: daysAgo(60),
      },
    });

    // --- Priorities --------------------------------------------------------
    for (const [index, priority] of PRIORITY_TEMPLATES.entries()) {
      await prisma.priority.upsert({
        where: {
          organizationId_slug_locale: { organizationId, slug: priority.slug, locale: 'en' },
        },
        update: {},
        create: {
          organizationId,
          locale: 'en',
          slug: priority.slug,
          title: priority.title,
          description: priority.description,
          iconKey: priority.icon,
          category: priority.category,
          displayOrder: index,
          status: 'PUBLISHED',
          publishedAt: daysAgo(59),
        },
      });
    }

    // Projects + achievements are seeded once after every org exists —
    // see replaceDemoWorks / replaceDemoAchievements below.

    // --- News --------------------------------------------------------------
    for (let index = 0; index < 5; index += 1) {
      const slug = `demo-update-${index + 1}`;
      await prisma.newsArticle.upsert({
        where: { organizationId_slug_locale: { organizationId, slug, locale: 'en' } },
        update: {},
        create: {
          organizationId,
          locale: 'en',
          slug,
          title: `Demo update ${index + 1}: campaign news item`,
          summary: 'DEMO CONTENT. An illustrative news item managed through the CMS.',
          contentHtml:
            '<p>This is <strong>demo content</strong> for a news article. Rich text is sanitised on write, so only safe markup is ever stored.</p><ul><li>Illustrative point one</li><li>Illustrative point two</li></ul>',
          category: 'OTHER',
          tags: ['demo', 'update'],
          authorName: 'Demo Campaign Team',
          featured: index === 0,
          status: 'PUBLISHED',
          publishedAt: daysAgo(index * 7 + 2),
        },
      });
    }

    // --- Events ------------------------------------------------------------
    const events = [
      { slug: 'demo-ward-meeting', title: 'Ward meeting (demo)', inDays: 12 },
      { slug: 'demo-health-camp', title: 'Health camp (demo)', inDays: 26 },
      { slug: 'demo-past-gathering', title: 'Community gathering (demo, past)', inDays: -40 },
    ];

    for (const event of events) {
      const startsAt = event.inDays >= 0 ? daysAhead(event.inDays) : daysAgo(-event.inDays);

      await prisma.event.upsert({
        where: {
          organizationId_slug_locale: { organizationId, slug: event.slug, locale: 'en' },
        },
        update: {},
        create: {
          organizationId,
          locale: 'en',
          slug: event.slug,
          title: event.title,
          summary: 'DEMO CONTENT. An illustrative public event listing.',
          descriptionHtml: '<p>This is <strong>demo content</strong> for an event listing.</p>',
          startsAt,
          endsAt: new Date(startsAt.getTime() + 3 * 60 * 60 * 1000),
          locationName: `${org.area} community hall (demo)`,
          organizer: org.name,
          eventStatus: event.inDays >= 0 ? 'UPCOMING' : 'COMPLETED',
          featured: event.inDays === 12,
          status: 'PUBLISHED',
          publishedAt: daysAgo(20),
        },
      });
    }

    // --- Gallery -----------------------------------------------------------
    await prisma.galleryAlbum.upsert({
      where: {
        organizationId_slug_locale: { organizationId, slug: 'demo-album', locale: 'en' },
      },
      update: {},
      create: {
        organizationId,
        locale: 'en',
        slug: 'demo-album',
        title: 'Demo album',
        description:
          'DEMO CONTENT. Upload photographs through the CMS media library to populate this album.',
        category: 'OTHER',
        displayOrder: 0,
        status: 'PUBLISHED',
        publishedAt: daysAgo(30),
      },
    });

    // --- Contact -----------------------------------------------------------
    await prisma.contactInformation.upsert({
      where: { organizationId_locale: { organizationId, locale: 'en' } },
      update: {},
      create: {
        organizationId,
        locale: 'en',
        officeName: `${org.name} office (demo)`,
        addressLine1: '1 Demo Street',
        city: 'Demo City',
        state: 'Karnataka',
        postalCode: '000000',
        phone: '+91 00000 00000',
        email: `contact@${org.slug}.example`,
        officeHours: 'Mon-Sat, 10:00-18:00 (demo)',
        status: 'PUBLISHED',
        publishedAt: daysAgo(60),
      },
    });

    for (const [index, platform] of ['facebook', 'instagram', 'x', 'youtube'].entries()) {
      await prisma.socialLink.upsert({
        where: { organizationId_platform: { organizationId, platform } },
        update: {
          label: `${platform} (demo)`,
          url: `https://example.com/${org.slug}/${platform}`,
          displayOrder: index,
          isActive: true,
        },
        create: {
          organizationId,
          platform,
          label: `${platform} (demo)`,
          url: `https://example.com/${org.slug}/${platform}`,
          displayOrder: index,
          isActive: true,
        },
      });
    }

    // --- Kannada translations ---------------------------------------------
    await seedKannada(prisma, organizationId, org);

    console.log(`Seeded DEMO content for "${org.slug}" (en + kn).`);
  }

  await replaceDemoWorks(prisma, seededOrgs);
  await replaceDemoAchievements(prisma, seededOrgs);
}

/**
 * Kannada versions of the demo content.
 *
 * A translation is a SIBLING ROW, not a field: each record below shares the
 * slug of its English counterpart but carries `locale: 'kn'` and its own
 * publishing status. That is what lets a campaign publish a page in one
 * language while the other is still being written.
 *
 * Only a subset is translated, and deliberately so. The public site must be
 * exercised in the state a real campaign is actually in - some pages
 * translated, some not - rather than a tidy fiction where every record exists
 * in both languages.
 *
 * As with everything else in this file, the text is invented demo content.
 */
async function seedKannada(prisma: Prisma, organizationId: string, org: DemoOrg): Promise<void> {
  await prisma.candidateProfile.upsert({
    where: { organizationId_locale: { organizationId, locale: 'kn' } },
    update: {},
    create: {
      organizationId,
      locale: 'kn',
      fullName: org.candidateKn,
      displayName: org.candidateKn,
      designation: org.designationKn,
      shortBio: 'ಡೆಮೋ ವಿಷಯ. ಇದು ಕಾಲ್ಪನಿಕ ಮಾಹಿತಿ.',
      fullBioHtml:
        '<p><strong>ಇದು ಡೆಮೋ ವಿಷಯ.</strong> ವಿಷಯ ನಿರ್ವಹಣಾ ವ್ಯವಸ್ಥೆಯನ್ನು ಪರೀಕ್ಷಿಸಲು ಮಾತ್ರ ಇದೆ.</p>',
      focusAreas: ['INFRASTRUCTURE', 'WATER', 'EDUCATION'],
      status: 'PUBLISHED',
      publishedAt: daysAgo(58),
      metaDescription: 'ಡೆಮೋ ಮಾಹಿತಿ.',
    },
  });

  await prisma.vision.upsert({
    where: { organizationId_locale: { organizationId, locale: 'kn' } },
    update: {},
    create: {
      organizationId,
      locale: 'kn',
      headline: org.headlineKn,
      summary: 'ಡೆಮೋ ವಿಷಯ. ಸಾರ್ವಜನಿಕ ತಾಣದ ಉದಾಹರಣೆ.',
      statementHtml: '<p>ಈ ದೂರದೃಷ್ಟಿ ಹೇಳಿಕೆ <strong>ಡೆಮೋ ವಿಷಯ</strong>ವಾಗಿದೆ.</p>',
      status: 'PUBLISHED',
      publishedAt: daysAgo(58),
    },
  });

  const priorities = [
    {
      slug: 'roads-and-infrastructure',
      title: 'ರಸ್ತೆ ಮತ್ತು ಮೂಲಸೌಕರ್ಯ',
      icon: 'road',
      category: 'INFRASTRUCTURE' as const,
      description: 'ಪ್ರತಿ ವಾರ್ಡಿನಲ್ಲಿ ಉತ್ತಮ ರಸ್ತೆಗಳು, ಒಳಚರಂಡಿ ಮತ್ತು ಬೀದಿ ದೀಪಗಳು.',
    },
    {
      slug: 'water',
      title: 'ನೀರು',
      icon: 'water',
      category: 'WATER' as const,
      description: 'ವಿಶ್ವಾಸಾರ್ಹ ಕುಡಿಯುವ ನೀರು ಮತ್ತು ನಿರಂತರ ಪೂರೈಕೆ ವ್ಯವಸ್ಥೆ.',
    },
    {
      slug: 'education',
      title: 'ಶಿಕ್ಷಣ',
      icon: 'school',
      category: 'EDUCATION' as const,
      description: 'ಸುಸಜ್ಜಿತ ಶಾಲೆಗಳು ಮತ್ತು ವಿದ್ಯಾರ್ಥಿಗಳಿಗೆ ಬೆಂಬಲ.',
    },
    {
      slug: 'healthcare',
      title: 'ಆರೋಗ್ಯ',
      icon: 'health',
      category: 'HEALTHCARE' as const,
      description: 'ಸುಲಭವಾಗಿ ತಲುಪುವ ಪ್ರಾಥಮಿಕ ಆರೋಗ್ಯ ಕೇಂದ್ರಗಳು ಮತ್ತು ಆರೋಗ್ಯ ಶಿಬಿರಗಳು.',
    },
    {
      slug: 'employment',
      title: 'ಉದ್ಯೋಗ',
      icon: 'work',
      category: 'EMPLOYMENT' as const,
      description: 'ಕೌಶಲ್ಯ ತರಬೇತಿ ಮತ್ತು ಸ್ಥಳೀಯ ಉದ್ಯಮಕ್ಕೆ ಬೆಂಬಲ.',
    },
  ];

  for (const [index, priority] of priorities.entries()) {
    await prisma.priority.upsert({
      where: { organizationId_slug_locale: { organizationId, slug: priority.slug, locale: 'kn' } },
      update: {
        title: priority.title,
        description: priority.description,
        iconKey: priority.icon,
        category: priority.category,
        displayOrder: index,
      },
      create: {
        organizationId,
        locale: 'kn',
        slug: priority.slug,
        title: priority.title,
        description: priority.description,
        iconKey: priority.icon,
        category: priority.category,
        displayOrder: index,
        status: 'PUBLISHED',
        publishedAt: daysAgo(57),
      },
    });
  }

  // Kannada project rows are created by replaceDemoWorks (published siblings).

  await prisma.newsArticle.upsert({
    where: { organizationId_slug_locale: { organizationId, slug: 'demo-update-1', locale: 'kn' } },
    update: {
      title: 'ಡೆಮೋ ಸುದ್ದಿ: ಪ್ರಚಾರ ನವೀಕರಣ',
      summary: 'ಕ್ಷೇತ್ರ ಅಭಿವೃದ್ಧಿ ಕೆಲಸಗಳ ಇತ್ತೀಚಿನ ನವೀಕರಣ.',
    },
    create: {
      organizationId,
      locale: 'kn',
      slug: 'demo-update-1',
      title: 'ಡೆಮೋ ಸುದ್ದಿ: ಪ್ರಚಾರ ನವೀಕರಣ',
      summary: 'ಕ್ಷೇತ್ರ ಅಭಿವೃದ್ಧಿ ಕೆಲಸಗಳ ಇತ್ತೀಚಿನ ನವೀಕರಣ.',
      contentHtml: '<p>ಇದು ಡೆಮೋ ಸುದ್ದಿ ಲೇಖನ.</p>',
      category: 'PUBLIC_SERVICES' as const,
      status: 'PUBLISHED',
      publishedAt: daysAgo(20),
    },
  });

  await prisma.contactInformation.upsert({
    where: { organizationId_locale: { organizationId, locale: 'kn' } },
    update: {
      officeName: `${org.candidateKn} ಕಚೇರಿ (ಡೆಮೋ)`,
      phone: '+91 00000 00000',
      email: `contact@${org.slug}.example`,
      officeHours: 'ಸೋಮ-ಶನಿ, 10:00-18:00 (ಡೆಮೋ)',
    },
    create: {
      organizationId,
      locale: 'kn',
      officeName: `${org.candidateKn} ಕಚೇರಿ (ಡೆಮೋ)`,
      addressLine1: '1 ಡೆಮೋ ರಸ್ತೆ',
      city: 'ಡೆಮೋ ನಗರ',
      state: 'ಕರ್ನಾಟಕ',
      postalCode: '000000',
      phone: '+91 00000 00000',
      email: `contact@${org.slug}.example`,
      officeHours: 'ಸೋಮ-ಶನಿ, 10:00-18:00 (ಡೆಮೋ)',
      status: 'PUBLISHED',
      publishedAt: daysAgo(60),
    },
  });
}
