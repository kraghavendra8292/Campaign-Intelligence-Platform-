/**
 * Demo works with cover + before/after images.
 *
 * ALL FIGURES AND PHOTOGRAPHS ARE FICTIONAL / AI-GENERATED DEMO CONTENT.
 * They exist so the public site can exercise budget facts, stretch labels and
 * before/after media — never as a claim about a real public work.
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '../src/generated/prisma/client';
import { LocalDiskStorage, type MediaStorage } from '../src/modules/content/media/storage';
import { S3CompatibleStorage } from '../src/modules/content/media/s3Storage';
import { validateUpload } from '../src/modules/content/media/fileValidation';

type Prisma = PrismaClient;

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, 'seed-assets', 'works');

function seedMediaStorage(): MediaStorage {
  // Avoid getEnv() — production hardening rejects localhost .env when NODE_ENV
  // is production in the shell. Seed only needs the MEDIA_* values.
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

export interface DemoOrgRef {
  id: string;
  slug: string;
  area: string;
  areaKn: string;
}

interface WorkLocaleCopy {
  title: string;
  shortDescription: string;
  descriptionHtml: string;
  locationName: string;
  area: string;
}

interface WorkDefinition {
  slug: string;
  category: 'INFRASTRUCTURE' | 'WATER' | 'EDUCATION' | 'PUBLIC_SERVICES';
  projectStatus: 'COMPLETED' | 'IN_PROGRESS';
  featured: boolean;
  budget: number;
  spent: number;
  beneficiaries: number;
  department: string;
  agency: string;
  startDaysAgo: number;
  completionDaysAgo: number | null;
  imagePrefix: 'road' | 'water' | 'school' | 'drain' | 'park';
  en: Omit<WorkLocaleCopy, 'area' | 'descriptionHtml'>;
  kn: Omit<WorkLocaleCopy, 'area' | 'descriptionHtml'>;
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(9, 0, 0, 0);
  return date;
}

function explanationEn(body: string, spent: number, budget: number): string {
  return `<!--spent:${spent}--><p>${body}</p><p><strong>Approved budget:</strong> ₹${budget.toLocaleString('en-IN')}. <strong>Amount spent:</strong> ₹${spent.toLocaleString('en-IN')}.</p><p><em>Demo content only — figures and photographs are illustrative.</em></p>`;
}

function explanationKn(body: string, spent: number, budget: number): string {
  return `<!--spent:${spent}--><p>${body}</p><p><strong>ಅನುಮೋದಿತ ಬಜೆಟ್:</strong> ₹${budget.toLocaleString('en-IN')}. <strong>ಖರ್ಚು ಮೊತ್ತ:</strong> ₹${spent.toLocaleString('en-IN')}.</p><p><em>ಡೆಮೋ ವಿಷಯ — ಅಂಕಿಅಂಶಗಳು ಮತ್ತು ಚಿತ್ರಗಳು ಉದಾಹರಣೆ ಮಾತ್ರ.</em></p>`;
}

const WORKS: readonly WorkDefinition[] = [
  {
    slug: 'ward-road-resurfacing',
    category: 'INFRASTRUCTURE',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: 4_800_000,
    spent: 4_520_000,
    beneficiaries: 12_400,
    department: 'Public Works',
    agency: 'Ward Engineering Wing (demo)',
    startDaysAgo: 400,
    completionDaysAgo: 120,
    imagePrefix: 'road',
    en: {
      title: 'Ward road resurfacing',
      shortDescription:
        'Full resurfacing of the ward arterial road from Main Market Circle to the North Bus Stand.',
      locationName: 'Main Market Circle → North Bus Stand (1.2 km)',
    },
    kn: {
      title: 'ವಾರ್ಡ್ ರಸ್ತೆ ನವೀಕರಣ',
      shortDescription:
        'ಮುಖ್ಯ ಮಾರುಕಟ್ಟೆ ವೃತ್ತದಿಂದ ಉತ್ತರ ಬಸ್ ನಿಲ್ದಾಣದವರೆಗೆ ವಾರ್ಡ್ ಮುಖ್ಯ ರಸ್ತೆಯ ಪೂರ್ಣ ನವೀಕರಣ.',
      locationName: 'ಮುಖ್ಯ ಮಾರುಕಟ್ಟೆ ವೃತ್ತ → ಉತ್ತರ ಬಸ್ ನಿಲ್ದಾಣ (1.2 ಕಿ.ಮೀ.)',
    },
  },
  {
    slug: 'community-water-centres',
    category: 'WATER',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: 2_100_000,
    spent: 1_980_000,
    beneficiaries: 8_600,
    department: 'Water Supply',
    agency: 'Municipal Water Cell (demo)',
    startDaysAgo: 320,
    completionDaysAgo: 90,
    imagePrefix: 'water',
    en: {
      title: 'Community water centres',
      shortDescription:
        'Three neighbourhood drinking-water kiosks restored with new tanks, taps and a clean platform.',
      locationName: 'Ward 4 community tank → three neighbourhood taps',
    },
    kn: {
      title: 'ಸಮುದಾಯ ನೀರಿನ ಕೇಂದ್ರಗಳು',
      shortDescription:
        'ಹೊಸ ಟ್ಯಾಂಕ್‌ಗಳು, ನಲ್ಲಿಗಳು ಮತ್ತು ಸ್ವಚ್ಛ ವೇದಿಕೆಯೊಂದಿಗೆ ಮೂರು ನೆರೆಹೊರೆ ಕುಡಿಯುವ ನೀರಿನ ಕೇಂದ್ರಗಳನ್ನು ನವೀಕರಿಸಲಾಗಿದೆ.',
      locationName: 'ವಾರ್ಡ್ 4 ಸಮುದಾಯ ಟ್ಯಾಂಕ್ → ಮೂರು ನೆರೆಹೊರೆ ನಲ್ಲಿಗಳು',
    },
  },
  {
    slug: 'school-building-renovation',
    category: 'EDUCATION',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: 6_500_000,
    spent: 6_120_000,
    beneficiaries: 940,
    department: 'Education',
    agency: 'District School Board (demo)',
    startDaysAgo: 280,
    completionDaysAgo: 45,
    imagePrefix: 'school',
    en: {
      title: 'School building renovation',
      shortDescription:
        'Structural repair, new windows and a full exterior renovation of the Government Higher Primary School.',
      locationName: 'Government Higher Primary School, Ward 7',
    },
    kn: {
      title: 'ಶಾಲಾ ಕಟ್ಟಡ ನವೀಕರಣ',
      shortDescription:
        'ಸರ್ಕಾರಿ ಹಿರಿಯ ಪ್ರಾಥಮಿಕ ಶಾಲೆಯ ರಚನಾತ್ಮಕ ದುರಸ್ತಿ, ಹೊಸ ಕಿಟಕಿಗಳು ಮತ್ತು ಪೂರ್ಣ ಬಾಹ್ಯ ನವೀಕರಣ.',
      locationName: 'ಸರ್ಕಾರಿ ಹಿರಿಯ ಪ್ರಾಥಮಿಕ ಶಾಲೆ, ವಾರ್ಡ್ 7',
    },
  },
  {
    slug: 'drain-and-streetlights',
    category: 'INFRASTRUCTURE',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: 3_200_000,
    spent: 3_050_000,
    beneficiaries: 6_200,
    department: 'Public Works',
    agency: 'Ward Engineering Wing (demo)',
    startDaysAgo: 210,
    completionDaysAgo: 60,
    imagePrefix: 'drain',
    en: {
      title: 'Covered drains and street lighting',
      shortDescription:
        'Open drains covered with concrete slabs and new LED street lights installed along the lane.',
      locationName: 'Temple Road → School Cross (0.8 km)',
    },
    kn: {
      title: 'ಒಳಚರಂಡಿ ಮತ್ತು ಬೀದಿ ದೀಪಗಳು',
      shortDescription:
        'ತೆರೆದ ಒಳಚರಂಡಿಗಳನ್ನು ಕಾಂಕ್ರೀಟ್ ಹಲಗೆಗಳಿಂದ ಮುಚ್ಚಿ ಹೊಸ LED ಬೀದಿ ದೀಪಗಳನ್ನು ಅಳವಡಿಸಲಾಗಿದೆ.',
      locationName: 'ದೇವಾಲಯ ರಸ್ತೆ → ಶಾಲಾ ಕ್ರಾಸ್ (0.8 ಕಿ.ಮೀ.)',
    },
  },
  {
    slug: 'neighbourhood-park-upgrade',
    category: 'PUBLIC_SERVICES',
    projectStatus: 'IN_PROGRESS',
    featured: false,
    budget: 1_800_000,
    spent: 900_000,
    beneficiaries: 3_100,
    department: 'Parks & Recreation',
    agency: 'Ward Amenities Cell (demo)',
    startDaysAgo: 70,
    completionDaysAgo: null,
    imagePrefix: 'park',
    en: {
      title: 'Neighbourhood park upgrade',
      shortDescription:
        'New play equipment, soft flooring and walking paths for the Ward 2 children’s park — work is ongoing.',
      locationName: 'Ward 2 children’s park',
    },
    kn: {
      title: 'ನೆರೆಹೊರೆಯ ಉದ್ಯಾನ ನವೀಕರಣ',
      shortDescription:
        'ವಾರ್ಡ್ 2 ಮಕ್ಕಳ ಉದ್ಯಾನಕ್ಕೆ ಹೊಸ ಆಟದ ಸಲಕರಣೆ, ಮೃದು ನೆಲ ಮತ್ತು ನಡಿಗೆ ಮಾರ್ಗಗಳು — ಕೆಲಸ ನಡೆಯುತ್ತಿದೆ.',
      locationName: 'ವಾರ್ಡ್ 2 ಮಕ್ಕಳ ಉದ್ಯಾನ',
    },
  },
];

async function uploadImage(
  prisma: Prisma,
  organizationId: string,
  basename: string,
  altText: string,
): Promise<string> {
  // Seed bytes are WebP only. Runtime always loads via MediaAsset id → S3/local
  // storage (`GET /media/:id`), never from this seed-assets folder.
  const filename = `${basename}.webp`;
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

async function createLocaleProject(
  prisma: Prisma,
  input: {
    organizationId: string;
    locale: 'en' | 'kn';
    work: WorkDefinition;
    copy: WorkLocaleCopy;
    coverImageId: string;
    beforeImageId: string;
    afterImageId: string;
    displayOrder: number;
  },
): Promise<void> {
  const {
    organizationId,
    locale,
    work,
    copy,
    coverImageId,
    beforeImageId,
    afterImageId,
    displayOrder,
  } = input;

  const project = await prisma.project.create({
    data: {
      organizationId,
      locale,
      slug: work.slug,
      title: copy.title,
      shortDescription: copy.shortDescription,
      descriptionHtml: copy.descriptionHtml,
      category: work.category,
      area: copy.area,
      locationName: copy.locationName,
      startDate: daysAgo(work.startDaysAgo),
      completionDate: work.completionDaysAgo === null ? null : daysAgo(work.completionDaysAgo),
      projectStatus: work.projectStatus,
      verification: work.projectStatus === 'COMPLETED' ? 'VERIFIED' : 'UNVERIFIED',
      verifiedAt:
        work.projectStatus === 'COMPLETED'
          ? daysAgo((work.completionDaysAgo ?? 30) - 5)
          : null,
      department: work.department,
      agency: work.agency,
      costAmount: work.budget,
      costCurrency: 'INR',
      beneficiaryCount: work.beneficiaries,
      coverImageId,
      featured: work.featured,
      displayOrder,
      status: 'PUBLISHED',
      publishedAt: daysAgo(40 - displayOrder),
      metaTitle: `${copy.title} (Demo)`,
      metaDescription: copy.shortDescription.slice(0, 300),
    },
    select: { id: true },
  });

  await prisma.projectMedia.createMany({
    data: [
      {
        projectId: project.id,
        mediaId: beforeImageId,
        role: 'BEFORE',
        caption: locale === 'en' ? 'Before' : 'ಮೊದಲು',
        sortOrder: 0,
      },
      {
        projectId: project.id,
        mediaId: afterImageId,
        role: 'AFTER',
        caption: locale === 'en' ? 'After' : 'ನಂತರ',
        sortOrder: 1,
      },
    ],
  });
}

/**
 * Deletes every project row, then seeds five clear demo works (EN + KN) with
 * AI cover / before / after images for each demo organisation.
 */
export async function replaceDemoWorks(prisma: Prisma, orgs: readonly DemoOrgRef[]): Promise<void> {
  const deleted = await prisma.project.deleteMany({});
  console.log(`Removed ${deleted.count} existing project row(s).`);

  for (const org of orgs) {
    for (const [index, work] of WORKS.entries()) {
      const prefix = work.imagePrefix;
      const coverImageId = await uploadImage(
        prisma,
        org.id,
        `work-${prefix}-cover`,
        `${work.en.title} cover (demo)`,
      );
      const beforeImageId = await uploadImage(
        prisma,
        org.id,
        `work-${prefix}-before`,
        `${work.en.title} before (demo)`,
      );
      const afterImageId = await uploadImage(
        prisma,
        org.id,
        `work-${prefix}-after`,
        `${work.en.title} after (demo)`,
      );

      await createLocaleProject(prisma, {
        organizationId: org.id,
        locale: 'en',
        work,
        copy: {
          ...work.en,
          area: org.area,
          descriptionHtml: explanationEn(
            `${work.en.shortDescription} Compare the before and after photographs below.`,
            work.spent,
            work.budget,
          ),
        },
        coverImageId,
        beforeImageId,
        afterImageId,
        displayOrder: index,
      });

      await createLocaleProject(prisma, {
        organizationId: org.id,
        locale: 'kn',
        work,
        copy: {
          ...work.kn,
          area: org.areaKn,
          descriptionHtml: explanationKn(
            `${work.kn.shortDescription} ಕೆಳಗಿನ ಮೊದಲು ಮತ್ತು ನಂತರದ ಛಾಯಾಚಿತ್ರಗಳನ್ನು ಹೋಲಿಸಬಹುದು.`,
            work.spent,
            work.budget,
          ),
        },
        coverImageId,
        beforeImageId,
        afterImageId,
        displayOrder: index,
      });
    }

    console.log(`Seeded 5 demo works (en + kn) with media for "${org.slug}".`);
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
      'demo-campaign': { area: 'North District', areaKn: 'ಉತ್ತರ ಜಿಲ್ಲೆ' },
      'demo-campaign-two': { area: 'South Ward', areaKn: 'ದಕ್ಷಿಣ ವಾರ್ಡ್' },
    };

    await replaceDemoWorks(
      prisma,
      orgs.map((org) => ({
        id: org.id,
        slug: org.slug,
        area: areaBySlug[org.slug]?.area ?? 'Demo area',
        areaKn: areaBySlug[org.slug]?.areaKn ?? 'ಡೆಮೋ ಪ್ರದೇಶ',
      })),
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && /seedWorks\.(ts|js|mts|cjs)$/.test(process.argv[1])) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
