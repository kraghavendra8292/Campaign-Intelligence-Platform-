/**
 * Top-of-category achievement highlights for ಸಾಧನೆಗಳು.
 *
 * One flagship sanction per thematic category, ordered by sanctioned amount
 * (largest first). Cover images reuse the works seed-assets pool.
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '../src/generated/prisma/client';
import { LocalDiskStorage, type MediaStorage } from '../src/modules/content/media/storage';
import { S3CompatibleStorage } from '../src/modules/content/media/s3Storage';
import { validateUpload } from '../src/modules/content/media/fileValidation';
import type { DemoOrgRef } from './seedWorks';

type Prisma = PrismaClient;
type ContentCategory =
  | 'INFRASTRUCTURE'
  | 'EDUCATION'
  | 'HEALTHCARE'
  | 'WATER'
  | 'EMPLOYMENT'
  | 'PUBLIC_SERVICES'
  | 'ENVIRONMENT'
  | 'AGRICULTURE'
  | 'OTHER';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, 'seed-assets', 'works');

function daysAgo(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(12, 0, 0, 0);
  return date;
}

function seedMediaStorage(): MediaStorage {
  if (process.env.MEDIA_STORAGE_DRIVER === 's3') {
    const bucket = process.env.MEDIA_S3_BUCKET;
    const region = process.env.MEDIA_S3_REGION;
    const endpoint = process.env.MEDIA_S3_ENDPOINT;
    const accessKeyId = process.env.MEDIA_S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.MEDIA_S3_SECRET_ACCESS_KEY;
    if (!bucket || !region || !endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error('MEDIA_STORAGE_DRIVER=s3 but one or more MEDIA_S3_* variables are missing.');
    }
    return new S3CompatibleStorage({
      bucket,
      region,
      endpoint,
      accessKeyId,
      secretAccessKey,
    });
  }

  return new LocalDiskStorage(process.env.MEDIA_STORAGE_PATH ?? join(HERE, '..', 'var', 'media'));
}

async function uploadCover(
  prisma: Prisma,
  organizationId: string,
  imagePrefix: string,
  altText: string,
): Promise<string> {
  const filename = `work-${imagePrefix}-cover.webp`;
  const buffer = await readFile(join(ASSETS, filename));
  const validated = validateUpload({
    buffer,
    declaredMimeType: 'image/webp',
    originalName: filename,
  });

  const stored = await seedMediaStorage().put({
    organizationId,
    filename,
    content: buffer,
    contentType: validated.mimeType,
  });

  const asset = await prisma.mediaAsset.create({
    data: {
      id: randomUUID(),
      organizationId,
      kind: validated.kind,
      storageKey: stored.storageKey,
      originalName: filename,
      mimeType: validated.mimeType,
      sizeBytes: stored.sizeBytes,
      checksumSha256: stored.checksumSha256,
      width: validated.width ?? null,
      height: validated.height ?? null,
      altText,
    },
    select: { id: true },
  });

  return asset.id;
}

interface AchievementDefinition {
  slug: string;
  category: ContentCategory;
  /** Basename under seed-assets/works → work-{prefix}-cover.webp */
  imagePrefix: string;
  amountKn: string;
  amountEn: string;
  areaEn: string;
  areaKn: string;
  en: { title: string; summary: string; description: string };
  kn: { title: string; summary: string; description: string };
}

/**
 * Ordered by sanctioned amount (desc) — matches “ಅಭಿವೃದ್ಧಿಯ ಪ್ರಮುಖ ಹೆಜ್ಜೆಗಳು”.
 * Summary stores amount · body so the public card can render amount first.
 */
const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    slug: 'kmrc-137-school-classrooms',
    category: 'EDUCATION',
    imagePrefix: 'kmrc-schools-classrooms',
    amountKn: '₹110 ಕೋಟಿ',
    amountEn: '₹110 crore',
    areaEn: 'Kampli Constituency (137 schools)',
    areaKn: 'ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ (137 ಶಾಲೆಗಳು)',
    en: {
      title: '🏫 New classrooms for 137 government schools',
      summary: 'Major investment in education infrastructure',
      description:
        'Construction of new classrooms in 137 schools across the constituency under the KMRC scheme — ₹110 crore sanctioned.',
    },
    kn: {
      title: '🏫 137 ಸರ್ಕಾರಿ ಶಾಲೆಗಳಿಗೆ ಹೊಸ ಕೊಠಡಿಗಳು',
      summary: 'ಶಿಕ್ಷಣ ಮೂಲಸೌಕರ್ಯ ಅಭಿವೃದ್ಧಿಗೆ ದೊಡ್ಡ ಪ್ರಮಾಣದ ಹೂಡಿಕೆ',
      description:
        'ಕ್ಷೇತ್ರದ 137 ಶಾಲೆಗಳಿಗೆ ಹೊಸ ಕೊಠಡಿಗಳ ನಿರ್ಮಾಣಕ್ಕೆ ₹110 ಕೋಟಿ ಕೆಎಂಆರ್‌ಸಿ ಯೋಜನೆಯಡಿ ಮಂಜೂರಾಗಿದೆ.',
    },
  },
  {
    slug: 'kanithimadapura-irrigation',
    category: 'WATER',
    imagePrefix: 'kanithimadapura-irrigation',
    amountKn: '₹87 ಕೋಟಿ',
    amountEn: '₹87 crore',
    areaEn: 'Kanithimadapura–Shridharagadde',
    areaKn: 'ಕಣಿತಿಮದಾಪುರ–ಶ್ರೀಧರಗಡ್ಡೆ',
    en: {
      title: '💧 Kanithimadapura–Shridharagadde irrigation project',
      summary: 'Plan to expand irrigation facilities',
      description:
        'Irrigation project for the Kanithimadapura–Shridharagadde stretch — ₹87 crore sanctioned.',
    },
    kn: {
      title: '💧 ಕಣಿತಿಮದಾಪುರ–ಶ್ರೀಧರಗಡ್ಡೆ ನೀರಾವರಿ ಯೋಜನೆ',
      summary: 'ನೀರಾವರಿ ಸೌಲಭ್ಯ ವಿಸ್ತರಣೆಗೆ ಯೋಜನೆ',
      description:
        'ಕಣಿತಿಮದಾಪುರ–ಶ್ರೀಧರಗಡ್ಡೆ ಭಾಗದ ನೀರಾವರಿ ಯೋಜನೆಗೆ ₹87 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
    },
  },
  {
    slug: 'kurugodu-household-drinking-water',
    category: 'WATER',
    imagePrefix: 'kurugodu-drinking-water',
    amountKn: '₹79 ಕೋಟಿ',
    amountEn: '₹79 crore',
    areaEn: 'Kurugodu town',
    areaKn: 'ಕುರುಗೋಡು ಪಟ್ಟಣ',
    en: {
      title: '🚰 Kurugodu household drinking water scheme',
      summary: 'Aiming to supply drinking water to every home',
      description:
        'Drinking water supply scheme to every house in Kurugodu town — ₹79 crore.',
    },
    kn: {
      title: '🚰 ಕುರುಗೋಡು ಮನೆಗಳಿಗೆ ಕುಡಿಯುವ ನೀರಿನ ಯೋಜನೆ',
      summary: 'ಮನೆಮನೆಗೆ ಕುಡಿಯುವ ನೀರು ಪೂರೈಸುವ ಉದ್ದೇಶ',
      description:
        'ಕುರುಗೋಡು ಪಟ್ಟಣದ ಪ್ರತಿಯೊಂದು ಮನೆಗೆ ಕುಡಿಯುವ ನೀರು ಪೂರೈಸುವ ಯೋಜನೆಗೆ ₹79 ಕೋಟಿ.',
    },
  },
  {
    slug: 'kurugodu-municipality-infrastructure',
    category: 'PUBLIC_SERVICES',
    imagePrefix: 'kurugodu-municipality',
    amountKn: '₹76.09 ಕೋಟಿ',
    amountEn: '₹76.09 crore',
    areaEn: 'Kurugodu Municipality',
    areaKn: 'ಕುರುಗೋಡು ಪುರಸಭೆ',
    en: {
      title: '🏙️ Kurugodu municipality infrastructure development',
      summary: 'Grant for urban infrastructure improvement',
      description:
        'Infrastructure development within Kurugodu Municipality limits — ₹76.09 crore.',
    },
    kn: {
      title: '🏙️ ಕುರುಗೋಡು ಪುರಸಭೆ ಮೂಲಸೌಕರ್ಯ ಅಭಿವೃದ್ಧಿ',
      summary: 'ನಗರದ ಮೂಲಸೌಕರ್ಯ ಸುಧಾರಣೆಗೆ ಅನುದಾನ',
      description: 'ಕುರುಗೋಡು ಪುರಸಭೆ ವ್ಯಾಪ್ತಿಯ ಮೂಲಸೌಕರ್ಯ ಅಭಿವೃದ್ಧಿಗೆ ₹76.09 ಕೋಟಿ.',
    },
  },
  {
    slug: 'taluru-road-development',
    category: 'INFRASTRUCTURE',
    imagePrefix: 'taluru',
    amountKn: '₹67 ಕೋಟಿ',
    amountEn: '₹67 crore',
    areaEn: 'Taluru, Kampli Constituency',
    areaKn: 'ತಾಳೂರು, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: '🛣️ Taluru road development',
      summary: 'Development of a major road corridor',
      description: 'Major PWD road development package for the Taluru stretch — ₹67 crore.',
    },
    kn: {
      title: '🛣️ ತಾಳೂರು ರಸ್ತೆ ಅಭಿವೃದ್ಧಿ',
      summary: 'ಪ್ರಮುಖ ರಸ್ತೆ ಸಂಪರ್ಕದ ಅಭಿವೃದ್ಧಿ',
      description: 'ತಾಳೂರು ರಸ್ತೆ ಅಭಿವೃದ್ಧಿ ಕಾಮಗಾರಿಗೆ ₹67 ಕೋಟಿ ಅನುದಾನ ನೀಡಲಾಗಿದೆ.',
    },
  },
  {
    slug: 'labour-welfare-residential-school',
    category: 'EMPLOYMENT',
    imagePrefix: 'labour-residential-school',
    amountKn: '₹44 ಕೋಟಿ',
    amountEn: '₹44 crore',
    areaEn: 'Kurugodu area',
    areaKn: 'ಕುರುಗೋಡು ವ್ಯಾಪ್ತಿ',
    en: {
      title: '👷 Labour welfare residential school',
      summary: 'Education infrastructure for children of labour families',
      description:
        'Residential school under the Labour Welfare Department — about ₹44 crore sanctioned.',
    },
    kn: {
      title: '👷 ಕಾರ್ಮಿಕ ಕಲ್ಯಾಣ ವಸತಿ ಶಾಲೆ',
      summary: 'ಕಾರ್ಮಿಕ ಕುಟುಂಬಗಳ ಮಕ್ಕಳಿಗಾಗಿ ಶಿಕ್ಷಣ ಮೂಲಸೌಕರ್ಯ',
      description:
        'ಕಾರ್ಮಿಕ ಕಲ್ಯಾಣ ಇಲಾಖೆಯ ವಸತಿ ಶಾಲೆ ನಿರ್ಮಾಣಕ್ಕೆ ಸುಮಾರು ₹44 ಕೋಟಿ ಅನುದಾನ ಮಂಜೂರು.',
    },
  },
  {
    slug: 'kampli-municipality-infrastructure',
    category: 'PUBLIC_SERVICES',
    imagePrefix: 'kampli-municipality',
    amountKn: '₹43.79 ಕೋಟಿ',
    amountEn: '₹43.79 crore',
    areaEn: 'Kampli Municipality',
    areaKn: 'ಕಂಪ್ಲಿ ಪುರಸಭೆ',
    en: {
      title: '🏙️ Kampli municipality infrastructure development',
      summary: 'Town infrastructure development',
      description: 'Infrastructure development within Kampli Municipality limits — ₹43.79 crore.',
    },
    kn: {
      title: '🏙️ ಕಂಪ್ಲಿ ಪುರಸಭೆ ಮೂಲಸೌಕರ್ಯ ಅಭಿವೃದ್ಧಿ',
      summary: 'ಪಟ್ಟಣದ ಮೂಲಸೌಕರ್ಯ ಅಭಿವೃದ್ಧಿ',
      description: 'ಕಂಪ್ಲಿ ಪುರಸಭೆ ವ್ಯಾಪ್ತಿಯ ಮೂಲಸೌಕರ್ಯ ಅಭಿವೃದ್ಧಿಗೆ ₹43.79 ಕೋಟಿ.',
    },
  },
  {
    slug: 'kampli-kurugodu-100-bed-hospitals',
    category: 'HEALTHCARE',
    imagePrefix: 'kampli-kurugodu-hospital',
    amountKn: '₹40 ಕೋಟಿ',
    amountEn: '₹40 crore',
    areaEn: 'Kampli and Kurugodu towns',
    areaKn: 'ಕಂಪ್ಲಿ ಮತ್ತು ಕುರುಗೋಡು ಪಟ್ಟಣಗಳು',
    en: {
      title: '🏥 100-bed public hospitals',
      summary: 'Expansion of public healthcare infrastructure',
      description:
        'Fully equipped 100-bed public hospitals with medical equipment in Kampli and Kurugodu — ₹40 crore package.',
    },
    kn: {
      title: '🏥 100 ಹಾಸಿಗೆಗಳ ಸಾರ್ವಜನಿಕ ಆಸ್ಪತ್ರೆ',
      summary: 'ಆರೋಗ್ಯ ಸೇವಾ ಮೂಲಸೌಕರ್ಯ ವಿಸ್ತರಣೆ',
      description:
        'ಕಂಪ್ಲಿ ಮತ್ತು ಕುರುಗೋಡಿನಲ್ಲಿ 100 ಹಾಸಿಗೆಗಳ ಸುಸಜ್ಜಿತ ಸಾರ್ವಜನಿಕ ಆಸ್ಪತ್ರೆಗೆ ₹40 ಕೋಟಿ.',
    },
  },
  {
    slug: 'kampli-sewage-treatment-plant',
    category: 'ENVIRONMENT',
    imagePrefix: 'kampli-stp',
    amountKn: '₹35 ಕೋಟಿ',
    amountEn: '₹35 crore',
    areaEn: 'Kampli town',
    areaKn: 'ಕಂಪ್ಲಿ ಪಟ್ಟಣ',
    en: {
      title: '🚰 Sewage treatment plant (STP)',
      summary: 'Infrastructure for wastewater management',
      description: 'Sewage treatment plant (STP) in Kampli — ₹35 crore.',
    },
    kn: {
      title: '🚰 ಒಳಚರಂಡಿ ನೀರು ಸಂಸ್ಕರಣಾ ಘಟಕ',
      summary: 'ತ್ಯಾಜ್ಯ ನೀರು ನಿರ್ವಹಣೆಗೆ ಮೂಲಸೌಕರ್ಯ',
      description: 'ಕಂಪ್ಲಿಯಲ್ಲಿ ಒಳಚರಂಡಿ ನೀರು ಸಂಸ್ಕರಣಾ ಘಟಕ (STP) ನಿರ್ಮಾಣಕ್ಕೆ ₹35 ಕೋಟಿ.',
    },
  },
  {
    slug: 'constituency-53-anganwadi-buildings',
    category: 'PUBLIC_SERVICES',
    imagePrefix: 'anganwadi-rooms',
    amountKn: '₹20 ಕೋಟಿ',
    amountEn: '₹20 crore',
    areaEn: 'Kampli Constituency (53 centres)',
    areaKn: 'ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ (53 ಕೇಂದ್ರಗಳು)',
    en: {
      title: '👶 New buildings for 53 anganwadi centres',
      summary: 'Women and child welfare infrastructure',
      description: 'New buildings for 53 anganwadi centres across the constituency — ₹20 crore.',
    },
    kn: {
      title: '👶 53 ಅಂಗನವಾಡಿ ಕೇಂದ್ರಗಳ ಹೊಸ ಕಟ್ಟಡಗಳು',
      summary: 'ಮಹಿಳಾ ಮತ್ತು ಮಕ್ಕಳ ಕಲ್ಯಾಣ ಮೂಲಸೌಕರ್ಯ',
      description: 'ಕ್ಷೇತ್ರದ 53 ಅಂಗನವಾಡಿ ಕೇಂದ್ರಗಳಿಗೆ ಹೊಸ ಕಟ್ಟಡಗಳ ನಿರ್ಮಾಣಕ್ಕೆ ₹20 ಕೋಟಿ.',
    },
  },
];

function summaryWithAmount(amount: string, body: string): string {
  return `${amount} · ${body}`;
}

/**
 * Replaces demo achievements with the ten category-highlight rows (en + kn)
 * and AI cover images for every demo organisation.
 */
export async function replaceDemoAchievements(
  prisma: Prisma,
  orgs: readonly DemoOrgRef[],
): Promise<void> {
  const deleted = await prisma.achievement.deleteMany({});
  console.log(`Removed ${deleted.count} existing achievement row(s).`);

  for (const org of orgs) {
    for (const [index, item] of ACHIEVEMENTS.entries()) {
      const coverImageId = await uploadCover(
        prisma,
        org.id,
        item.imagePrefix,
        `${item.en.title} cover`,
      );

      const achievedOn = daysAgo(80 + index * 5);
      const publishedAt = daysAgo(70 + index * 5);

      await prisma.achievement.create({
        data: {
          organizationId: org.id,
          locale: 'en',
          slug: item.slug,
          title: item.en.title,
          summary: summaryWithAmount(item.amountEn, item.en.summary),
          descriptionHtml: `<p>${item.en.description}</p>`,
          category: item.category,
          area: item.areaEn,
          achievedOn,
          coverImageId,
          verification: 'VERIFIED',
          verifiedAt: publishedAt,
          featured: true,
          displayOrder: index,
          status: 'PUBLISHED',
          publishedAt,
          metaTitle: `${item.amountEn} — ${item.en.title}`,
          metaDescription: item.en.summary,
        },
      });

      await prisma.achievement.create({
        data: {
          organizationId: org.id,
          locale: 'kn',
          slug: item.slug,
          title: item.kn.title,
          summary: summaryWithAmount(item.amountKn, item.kn.summary),
          descriptionHtml: `<p>${item.kn.description}</p>`,
          category: item.category,
          area: item.areaKn,
          achievedOn,
          coverImageId,
          verification: 'VERIFIED',
          verifiedAt: publishedAt,
          featured: true,
          displayOrder: index,
          status: 'PUBLISHED',
          publishedAt,
          metaTitle: `${item.amountKn} — ${item.kn.title}`,
          metaDescription: item.kn.summary,
        },
      });
    }

    console.log(`Seeded ${ACHIEVEMENTS.length} achievements (en + kn) for "${org.slug}".`);
  }
}

async function main(): Promise<void> {
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const { PrismaClient } = await import('../src/generated/prisma/client');
  const { requireDirectDatabaseUrl } = await import('../src/config/databaseUrl');

  const connectionString = requireDirectDatabaseUrl();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: ['demo-campaign', 'demo-campaign-two'] } },
      select: { id: true, slug: true },
    });

    if (orgs.length === 0) {
      throw new Error('No demo organisations found. Run the main seed first.');
    }

    const areaBySlug: Record<string, { area: string; areaKn: string }> = {
      'demo-campaign': { area: 'Kampli Constituency', areaKn: 'ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ' },
      'demo-campaign-two': { area: 'Kampli Constituency', areaKn: 'ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ' },
    };

    await replaceDemoAchievements(
      prisma,
      orgs.map((org) => ({
        id: org.id,
        slug: org.slug,
        area: areaBySlug[org.slug]?.area ?? 'Kampli Constituency',
        areaKn: areaBySlug[org.slug]?.areaKn ?? 'ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
      })),
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && /seedAchievements\.(ts|js|mts|cjs)$/.test(process.argv[1])) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
