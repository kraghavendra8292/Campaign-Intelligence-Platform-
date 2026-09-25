/**
 * Kampli constituency works seed (roads, water, education, health, welfare, etc.).
 *
 * Budget figures are as provided for MLA-linked sanctions and works.
 * Cover / before / after photographs are AI-generated illustrations so the
 * public site can show media — they are not site photographs of each stretch.
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
  category:
    | 'INFRASTRUCTURE'
    | 'WATER'
    | 'EDUCATION'
    | 'PUBLIC_SERVICES'
    | 'HEALTHCARE'
    | 'AGRICULTURE'
    | 'ENVIRONMENT';
  projectStatus: 'COMPLETED' | 'IN_PROGRESS' | 'PLANNED';
  featured: boolean;
  /** Sanctioned / approved budget in INR (whole rupees). Null when amount not published. */
  budget: number | null;
  /** Amount spent in INR. Null for sanctioned-only works (not started). */
  spent: number | null;
  department: string;
  agency: string;
  startDaysAgo: number | null;
  completionDaysAgo: number | null;
  /** Basename prefix under seed-assets/works → work-{prefix}-{cover|before|after}.webp */
  imagePrefix: string;
  areaEn: string;
  areaKn: string;
  en: Omit<WorkLocaleCopy, 'area' | 'descriptionHtml'>;
  kn: Omit<WorkLocaleCopy, 'area' | 'descriptionHtml'>;
}

function crore(n: number): number {
  return Math.round(n * 10_000_000);
}

function lakh(n: number): number {
  return Math.round(n * 100_000);
}

function spentNinetyPercent(budget: number): number {
  return Math.round(budget * 0.9);
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(9, 0, 0, 0);
  return date;
}

function explanationEn(body: string, spent: number | null, budget: number | null): string {
  let spentLine: string;
  if (budget === null) {
    spentLine =
      '<p><strong>Sanction status:</strong> Proposal submitted / sanctioned; published budget amount not available.</p>';
  } else if (spent === null) {
    spentLine = `<p><strong>Sanctioned budget:</strong> ₹${budget.toLocaleString('en-IN')}.</p>`;
  } else {
    spentLine = `<p><strong>Approved budget:</strong> ₹${budget.toLocaleString('en-IN')}. <strong>Amount spent:</strong> ₹${spent.toLocaleString('en-IN')}.</p>`;
  }
  return `<!--spent:${spent ?? 0}--><p>${body}</p>${spentLine}`;
}

function explanationKn(body: string, spent: number | null, budget: number | null): string {
  let spentLine: string;
  if (budget === null) {
    spentLine =
      '<p><strong>ಮಂಜೂರಾತಿ ಸ್ಥಿತಿ:</strong> ಪ್ರಸ್ತಾವನೆ ಸಲ್ಲಿಸಲಾಗಿದೆ / ಮಂಜೂರಾಗಿದೆ; ಪ್ರಕಟಿತ ಬಜೆಟ್ ಮೊತ್ತ ಲಭ್ಯವಿಲ್ಲ.</p>';
  } else if (spent === null) {
    spentLine = `<p><strong>ಮಂಜೂರಾದ ಅನುದಾನ:</strong> ₹${budget.toLocaleString('en-IN')}.</p>`;
  } else {
    spentLine = `<p><strong>ಅನುಮೋದಿತ ಬಜೆಟ್:</strong> ₹${budget.toLocaleString('en-IN')}. <strong>ಖರ್ಚು ಮೊತ್ತ:</strong> ₹${spent.toLocaleString('en-IN')}.</p>`;
  }
  return `<!--spent:${spent ?? 0}--><p>${body}</p>${spentLine}`;
}

/**
 * Road batch: status split of ten (6 completed, 2 in progress, 2 sanctioned).
 * Water / irrigation batch: all completed and featured (per request).
 * Shridharagadde school is listed twice (WATER + EDUCATION) with shared media.
 */
const WORKS: readonly WorkDefinition[] = [
  {
    slug: 'taluru-road-development',
    category: 'INFRASTRUCTURE',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: crore(67),
    spent: spentNinetyPercent(crore(67)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 520,
    completionDaysAgo: 90,
    imagePrefix: 'taluru',
    areaEn: 'Taluru, Kampli Constituency',
    areaKn: 'ತಾಳೂರು, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Taluru road development',
      shortDescription:
        'Major PWD road development package for the Taluru stretch, with ₹67 crore sanctioned.',
      locationName: 'Taluru road corridor',
    },
    kn: {
      title: 'ತಾಳೂರು ರಸ್ತೆ ಅಭಿವೃದ್ಧಿ',
      shortDescription:
        'ತಾಳೂರು ರಸ್ತೆ ಅಭಿವೃದ್ಧಿ ಕಾಮಗಾರಿಗೆ ₹67 ಕೋಟಿ ಅನುದಾನ ನೀಡಲಾಗಿದೆ.',
      locationName: 'ತಾಳೂರು ರಸ್ತೆ ಮಾರ್ಗ',
    },
  },
  {
    slug: 'somappanakere-muddapur-hosakheti-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: crore(20),
    spent: spentNinetyPercent(crore(20)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 480,
    completionDaysAgo: 75,
    imagePrefix: 'muddapur',
    areaEn: 'Kampli town',
    areaKn: 'ಕಂಪ್ಲಿ ಪಟ್ಟಣ',
    en: {
      title: 'Somappanakere to Muddapur Cross (Hosakheti) road',
      shortDescription:
        'Road development from Somappanakere in Kampli town to No. 10 Muddapur Cross on the Hosakheti road — ₹20 crore sanctioned.',
      locationName: 'Somappanakere → No. 10 Muddapur Cross (Hosakheti road)',
    },
    kn: {
      title: 'ಸೋಮಪ್ಪನಕೆರೆ–ಮುದ್ದಾಪುರ ಕ್ರಾಸ್ (ಹೊಸಖೇಟಿ) ರಸ್ತೆ',
      shortDescription:
        'ಕಂಪ್ಲಿ ಪಟ್ಟಣದ ಸೋಮಪ್ಪನಕೆರೆಯಿಂದ ನಂ.10 ಮುದ್ದಾಪುರ ಕ್ರಾಸ್ (ಹೊಸಖೇಟಿ ರಸ್ತೆ) ವರೆಗೆ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹20 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ಸೋಮಪ್ಪನಕೆರೆ → ನಂ.10 ಮುದ್ದಾಪುರ ಕ್ರಾಸ್ (ಹೊಸಖೇಟಿ ರಸ್ತೆ)',
    },
  },
  {
    slug: 'emmiganur-dual-carriageway',
    category: 'INFRASTRUCTURE',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(8),
    spent: spentNinetyPercent(crore(8)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 450,
    completionDaysAgo: 60,
    imagePrefix: 'emmiganur-dual',
    areaEn: 'Emmiganur, Kampli taluk',
    areaKn: 'ಎಮ್ಮಿಗನೂರು, ಕಂಪ್ಲಿ ತಾಲೂಕು',
    en: {
      title: 'Emmiganur dual-carriageway development',
      shortDescription:
        'Dual-carriageway road development within Emmiganur village limits in Kampli taluk — ₹8 crore sanctioned.',
      locationName: 'Emmiganur village limits',
    },
    kn: {
      title: 'ಎಮ್ಮಿಗನೂರು ದ್ವಿಮುಖ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿ',
      shortDescription:
        'ಕಂಪ್ಲಿ ತಾಲೂಕಿನ ಎಮ್ಮಿಗನೂರು ಗ್ರಾಮ ವ್ಯಾಪ್ತಿಯಲ್ಲಿ ದ್ವಿಮುಖ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹8 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ಎಮ್ಮಿಗನೂರು ಗ್ರಾಮ ವ್ಯಾಪ್ತಿ',
    },
  },
  {
    slug: 'mudgal-kuditini-welcome-board-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(6.7),
    spent: spentNinetyPercent(crore(6.7)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 430,
    completionDaysAgo: 55,
    imagePrefix: 'mudgal-kuditini',
    areaEn: 'Kampli town — Mudgal–Kuditini road',
    areaKn: 'ಕಂಪ್ಲಿ ಪಟ್ಟಣ — ಮುದಗಲ್–ಕುಡಿತಿನಿ ರಸ್ತೆ',
    en: {
      title: 'Mudgal–Kuditini road (Somappanakere front to welcome board)',
      shortDescription:
        'Dual-carriageway development on the Mudgal–Kuditini road from in front of Somappanakere to the welcome board — ₹6.70 crore sanctioned.',
      locationName: 'Somappanakere front → welcome board (Mudgal–Kuditini road)',
    },
    kn: {
      title: 'ಮುದಗಲ್–ಕುಡಿತಿನಿ ರಸ್ತೆ (ಸೋಮಪ್ಪಕೆರೆ–ಸ್ವಾಗತ ಬೋರ್ಡ್)',
      shortDescription:
        'ಕಂಪ್ಲಿ ಪಟ್ಟಣದ ಮುದಗಲ್–ಕುಡಿತಿನಿ ರಸ್ತೆಯ ಸೋಮಪ್ಪಕೆರೆ ಮುಂಭಾಗದಿಂದ ಸ್ವಾಗತ ಬೋರ್ಡ್‌ವರೆಗೆ ದ್ವಿಮುಖ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹6.70 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ಸೋಮಪ್ಪಕೆರೆ ಮುಂಭಾಗ → ಸ್ವಾಗತ ಬೋರ್ಡ್ (ಮುದಗಲ್–ಕುಡಿತಿನಿ ರಸ್ತೆ)',
    },
  },
  {
    slug: 'badasahatti-dual-carriageway',
    category: 'INFRASTRUCTURE',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(6.5),
    spent: spentNinetyPercent(crore(6.5)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 410,
    completionDaysAgo: 50,
    imagePrefix: 'badasahatti',
    areaEn: 'Badasahatti GP, Kurugodu taluk',
    areaKn: 'ಬಾದಸಹಟ್ಟಿ ಗ್ರಾಪಂ, ಕುರುಗೋಡು ತಾಲೂಕು',
    en: {
      title: 'Badasahatti dual-carriageway development',
      shortDescription:
        'Dual-carriageway road development in Badasahatti gram panchayat limits, Kurugodu taluk — ₹6.50 crore sanctioned.',
      locationName: 'Badasahatti GP limits, Kurugodu taluk',
    },
    kn: {
      title: 'ಬಾದಸಹಟ್ಟಿ ದ್ವಿಮುಖ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿ',
      shortDescription:
        'ಕುರುಗೋಡು ತಾಲೂಕಿನ ಬಾದಸಹಟ್ಟಿ ಗ್ರಾಪಂ ವ್ಯಾಪ್ತಿಯಲ್ಲಿ ದ್ವಿಮುಖ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹6.50 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ಬಾದಸಹಟ್ಟಿ ಗ್ರಾಪಂ ವ್ಯಾಪ್ತಿ, ಕುರುಗೋಡು ತಾಲೂಕು',
    },
  },
  {
    slug: 'emmiganur-itagi-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(6.1),
    spent: spentNinetyPercent(crore(6.1)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 390,
    completionDaysAgo: 40,
    imagePrefix: 'emmiganur-itagi',
    areaEn: 'Emmiganur–Itagi',
    areaKn: 'ಎಮ್ಮಿಗನೂರು–ಇಟಗಿ',
    en: {
      title: 'Emmiganur–Itagi road development',
      shortDescription:
        'Road development on the Emmiganur–Itagi corridor — ₹6.10 crore sanctioned.',
      locationName: 'Emmiganur → Itagi',
    },
    kn: {
      title: 'ಎಮ್ಮಿಗನೂರು–ಇಟಗಿ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿ',
      shortDescription: 'ಎಮ್ಮಿಗನೂರು–ಇಟಗಿ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹6.10 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ಎಮ್ಮಿಗನೂರು → ಇಟಗಿ',
    },
  },
  {
    slug: 'olvayi-marutipura-camp-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'IN_PROGRESS',
    featured: false,
    budget: crore(5.813),
    spent: spentNinetyPercent(crore(5.813)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 120,
    completionDaysAgo: null,
    imagePrefix: 'olvayi',
    areaEn: 'Olvayi–Marutipura Camp',
    areaKn: 'ಓಲ್ವಾಯಿ–ಮಾರುತಿಪುರ ಕ್ಯಾಂಪ್',
    en: {
      title: 'Olvayi to Marutipura Camp road development',
      shortDescription:
        'Road development from Olvayi to Marutipura Camp — ₹5.813 crore sanctioned; work is under way.',
      locationName: 'Olvayi → Marutipura Camp',
    },
    kn: {
      title: 'ಓಲ್ವಾಯಿ–ಮಾರುತಿಪುರ ಕ್ಯಾಂಪ್ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿ',
      shortDescription:
        'ಓಲ್ವಾಯಿಯಿಂದ ಮಾರುತಿಪುರ ಕ್ಯಾಂಪ್‌ವರೆಗೆ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹5.813 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ — ಕಾಮಗಾರಿ ಪ್ರಗತಿಯಲ್ಲಿದೆ.',
      locationName: 'ಓಲ್ವಾಯಿ → ಮಾರುತಿಪುರ ಕ್ಯಾಂಪ್',
    },
  },
  {
    slug: 'kamplikote-ramasagar-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'IN_PROGRESS',
    featured: false,
    budget: crore(5.099),
    spent: spentNinetyPercent(crore(5.099)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 100,
    completionDaysAgo: null,
    imagePrefix: 'kamplikote',
    areaEn: 'Kamplikote–Ramasagar',
    areaKn: 'ಕಂಪ್ಲಿಕೋಟೆ–ರಾಮಸಾಗರ',
    en: {
      title: 'Kamplikote to Ramasagar road development',
      shortDescription:
        'Road development from Kamplikote to Ramasagar — ₹5.099 crore sanctioned; work is under way.',
      locationName: 'Kamplikote → Ramasagar',
    },
    kn: {
      title: 'ಕಂಪ್ಲಿಕೋಟೆ–ರಾಮಸಾಗರ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿ',
      shortDescription:
        'ಕಂಪ್ಲಿಕೋಟೆಯಿಂದ ರಾಮಸಾಗರವರೆಗೆ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹5.099 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ — ಕಾಮಗಾರಿ ಪ್ರಗತಿಯಲ್ಲಿದೆ.',
      locationName: 'ಕಂಪ್ಲಿಕೋಟೆ → ರಾಮಸಾಗರ',
    },
  },
  {
    slug: 'kurugodu-apmc-saibaba-temple-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'PLANNED',
    featured: false,
    budget: crore(5),
    spent: null,
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: null,
    completionDaysAgo: null,
    imagePrefix: 'kurugodu-apmc',
    areaEn: 'Kampli town — Kurugodu road',
    areaKn: 'ಕಂಪ್ಲಿ ಪಟ್ಟಣ — ಕುರುಗೋಡು ರಸ್ತೆ',
    en: {
      title: 'Kurugodu road (APMC front to Sri Sai Baba temple)',
      shortDescription:
        'Road development on Kurugodu road in Kampli town from in front of the APMC to Sri Sai Baba temple — ₹5 crore sanctioned.',
      locationName: 'APMC front → Sri Sai Baba temple (Kurugodu road)',
    },
    kn: {
      title: 'ಕುರುಗೋಡು ರಸ್ತೆ (ಎಪಿಎಂಸಿ–ಶ್ರೀ ಸಾಯಿಬಾಬಾ ದೇವಸ್ಥಾನ)',
      shortDescription:
        'ಕಂಪ್ಲಿ ಪಟ್ಟಣದ ಕುರುಗೋಡು ರಸ್ತೆಯ ಎಪಿಎಂಸಿ ಮುಂಭಾಗದಿಂದ ಶ್ರೀ ಸಾಯಿಬಾಬಾ ದೇವಸ್ಥಾನದವರೆಗೆ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹5 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ಎಪಿಎಂಸಿ ಮುಂಭಾಗ → ಶ್ರೀ ಸಾಯಿಬಾಬಾ ದೇವಸ್ಥಾನ (ಕುರುಗೋಡು ರಸ್ತೆ)',
    },
  },
  {
    slug: 'yellapur-sriramarangapur-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'PLANNED',
    featured: false,
    budget: crore(5),
    spent: null,
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: null,
    completionDaysAgo: null,
    imagePrefix: 'yellapur',
    areaEn: 'Yellapur–Sriramarangapur, Kurugodu taluk',
    areaKn: 'ಯಲ್ಲಾಪುರ–ಶ್ರೀರಾಮರಂಗಾಪುರ, ಕುರುಗೋಡು ತಾಲೂಕು',
    en: {
      title: 'Yellapur to Sriramarangapur road development',
      shortDescription:
        'Road development from Yellapur to Sriramarangapur in Kurugodu taluk — ₹5 crore sanctioned.',
      locationName: 'Yellapur → Sriramarangapur',
    },
    kn: {
      title: 'ಯಲ್ಲಾಪುರ–ಶ್ರೀರಾಮರಂಗಾಪುರ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿ',
      shortDescription:
        'ಕುರುಗೋಡು ತಾಲೂಕಿನ ಯಲ್ಲಾಪುರದಿಂದ ಶ್ರೀರಾಮರಂಗಾಪುರದವರೆಗೆ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹5 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ಯಲ್ಲಾಪುರ → ಶ್ರೀರಾಮರಂಗಾಪುರ',
    },
  },
  // --- Batch 2 (10 more PWD road packages) ---
  {
    slug: 'devasamudra-javaku-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(4.727),
    spent: spentNinetyPercent(crore(4.727)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 380,
    completionDaysAgo: 45,
    imagePrefix: 'devasamudra-javaku',
    areaEn: 'Devasamudra–Javaku',
    areaKn: 'ದೇವಸಮುದ್ರ–ಜವಕು',
    en: {
      title: 'Devasamudra to Javaku road development',
      shortDescription:
        'Road development from Devasamudra to Javaku — ₹4.727 crore sanctioned.',
      locationName: 'Devasamudra → Javaku',
    },
    kn: {
      title: 'ದೇವಸಮುದ್ರ–ಜವಕು ರಸ್ತೆ ಅಭಿವೃದ್ಧಿ',
      shortDescription: 'ದೇವಸಮುದ್ರದಿಂದ ಜವಕು ವರೆಗೆ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹4.727 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ದೇವಸಮುದ್ರ → ಜವಕು',
    },
  },
  {
    slug: 'madile-somasamudra-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(4.171),
    spent: spentNinetyPercent(crore(4.171)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 370,
    completionDaysAgo: 42,
    imagePrefix: 'madile-somasamudra',
    areaEn: 'Madile–Somasamudra',
    areaKn: 'ಮದಿಲೆ–ಸೋಮಸಮುದ್ರ',
    en: {
      title: 'Madile to Somasamudra road development',
      shortDescription:
        'Road development from Madile to Somasamudra — ₹4.171 crore sanctioned.',
      locationName: 'Madile → Somasamudra',
    },
    kn: {
      title: 'ಮದಿಲೆ–ಸೋಮಸಮುದ್ರ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿ',
      shortDescription: 'ಮದಿಲೆಯಿಂದ ಸೋಮಸಮುದ್ರವರೆಗೆ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹4.171 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ಮದಿಲೆ → ಸೋಮಸಮುದ್ರ',
    },
  },
  {
    slug: 'bekkajayiganur-sugar-factory-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(4),
    spent: spentNinetyPercent(crore(4)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 360,
    completionDaysAgo: 38,
    imagePrefix: 'bekkajayiganur',
    areaEn: 'Bekkajayiganur — sugar factory road',
    areaKn: 'ಬೆಕ್ಕಜಾಯಿಗನೂರು — ಸಕ್ಕರೆ ಕಾರ್ಖಾನೆ ರಸ್ತೆ',
    en: {
      title: 'Bekkajayiganur to sugar factory road development',
      shortDescription:
        'Road development from Bekkajayiganur village to the sugar factory — ₹4 crore sanctioned.',
      locationName: 'Bekkajayiganur → sugar factory',
    },
    kn: {
      title: 'ಬೆಕ್ಕಜಾಯಿಗನೂರು–ಸಕ್ಕರೆ ಕಾರ್ಖಾನೆ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿ',
      shortDescription:
        'ಬೆಕ್ಕಜಾಯಿಗನೂರು ಗ್ರಾಮದಿಂದ ಸಕ್ಕರೆ ಕಾರ್ಖಾನೆಯವರೆಗೆ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹4 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ಬೆಕ್ಕಜಾಯಿಗನೂರು → ಸಕ್ಕರೆ ಕಾರ್ಖಾನೆ',
    },
  },
  {
    slug: 'metri-sriramarangapur-chavuku-jeeriganur-gonalu-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(4),
    spent: spentNinetyPercent(crore(4)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 350,
    completionDaysAgo: 35,
    imagePrefix: 'metri-gonalu',
    areaEn: 'Metri–Sriramarangapur–Chavuku–Jeeriganur–Gonalu',
    areaKn: 'ಮೆಟ್ರಿ–ಶ್ರೀರಾಮರಂಗಾಪುರ–ಚೌಕು–ಜೀರಿಗನೂರು–ಗೋನಾಳು',
    en: {
      title: 'Metri–Gonalu corridor road (km 4.50–7.50)',
      shortDescription:
        'Road development on the Metri–Sriramarangapur–Chavuku–Jeeriganur–Gonalu road from km 4.50 to 7.50 — ₹4 crore sanctioned.',
      locationName: 'Metri–Gonalu road, km 4.50 → 7.50',
    },
    kn: {
      title: 'ಮೆಟ್ರಿ–ಗೋನಾಳು ರಸ್ತೆ (ಕಿ.ಮೀ. 4.50–7.50)',
      shortDescription:
        'ಮೆಟ್ರಿ–ಶ್ರೀರಾಮರಂಗಾಪುರ–ಚೌಕು–ಜೀರಿಗನೂರು–ಗೋನಾಳು ರಸ್ತೆಯ ಕಿ.ಮೀ. 4.50ರಿಂದ 7.50ರವರೆಗೆ ಅಭಿವೃದ್ಧಿಗೆ ₹4 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ಮೆಟ್ರಿ–ಗೋನಾಳು ರಸ್ತೆ, ಕಿ.ಮೀ. 4.50 → 7.50',
    },
  },
  {
    slug: 'orvai-orvai-cross-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(4),
    spent: spentNinetyPercent(crore(4)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 340,
    completionDaysAgo: 32,
    imagePrefix: 'orvai-cross',
    areaEn: 'Orvai, Kurugodu taluk',
    areaKn: 'ಓರ್ವಾಯಿ, ಕುರುಗೋಡು ತಾಲೂಕು',
    en: {
      title: 'Orvai village to Orvai Cross road development',
      shortDescription:
        'Road development from Orvai village to Orvai Cross in Kurugodu taluk — ₹4 crore sanctioned.',
      locationName: 'Orvai village → Orvai Cross',
    },
    kn: {
      title: 'ಓರ್ವಾಯಿ–ಓರ್ವಾಯಿ ಕ್ರಾಸ್ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿ',
      shortDescription:
        'ಕುರುಗೋಡು ತಾಲೂಕಿನ ಓರ್ವಾಯಿ ಗ್ರಾಮದಿಂದ ಓರ್ವಾಯಿ ಕ್ರಾಸ್‌ವರೆಗೆ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹4 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ಓರ್ವಾಯಿ ಗ್ರಾಮ → ಓರ್ವಾಯಿ ಕ್ರಾಸ್',
    },
  },
  {
    slug: 'muddapur-cross-hosakampli-new-bus-stand-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(4),
    spent: spentNinetyPercent(crore(4)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 330,
    completionDaysAgo: 28,
    imagePrefix: 'hosakampli-bus',
    areaEn: 'Kampli town — Hosakampli new bus stand',
    areaKn: 'ಕಂಪ್ಲಿ ಪಟ್ಟಣ — ಹೊಸಕಂಪ್ಲಿ ಹೊಸ ಬಸ್ ನಿಲ್ದಾಣ',
    en: {
      title: 'Muddapur Cross to Hosakampli new bus stand road',
      shortDescription:
        'Road development from No. 10 Muddapur Cross to the Hosakampli new bus stand — ₹4 crore sanctioned.',
      locationName: 'No. 10 Muddapur Cross → Hosakampli new bus stand',
    },
    kn: {
      title: 'ಮುದ್ದಾಪುರ ಕ್ರಾಸ್–ಹೊಸಕಂಪ್ಲಿ ಹೊಸ ಬಸ್ ನಿಲ್ದಾಣ ರಸ್ತೆ',
      shortDescription:
        'ನಂ.10 ಮುದ್ದಾಪುರ ಕ್ರಾಸ್‌ನಿಂದ ಹೊಸಕಂಪ್ಲಿ ಹೊಸ ಬಸ್‌ ನಿಲ್ದಾಣದವರೆಗೆ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹4 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ನಂ.10 ಮುದ್ದಾಪುರ ಕ್ರಾಸ್ → ಹೊಸಕಂಪ್ಲಿ ಹೊಸ ಬಸ್ ನಿಲ್ದಾಣ',
    },
  },
  {
    slug: 'devasamudra-chikkajayiganur-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'IN_PROGRESS',
    featured: false,
    budget: crore(4.9),
    spent: spentNinetyPercent(crore(4.9)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 95,
    completionDaysAgo: null,
    imagePrefix: 'devasamudra-chikka',
    areaEn: 'Devasamudra–Chikkajayiganur, Kampli taluk',
    areaKn: 'ದೇವಸಮುದ್ರ–ಚಿಕ್ಕಜಾಯಿಗನೂರು, ಕಂಪ್ಲಿ ತಾಲೂಕು',
    en: {
      title: 'Devasamudra to Chikkajayiganur road development',
      shortDescription:
        'Road development from Devasamudra to Chikkajayiganur in Kampli taluk — ₹4.90 crore sanctioned; work is under way.',
      locationName: 'Devasamudra → Chikkajayiganur',
    },
    kn: {
      title: 'ದೇವಸಮುದ್ರ–ಚಿಕ್ಕಜಾಯಿಗನೂರು ರಸ್ತೆ ಅಭಿವೃದ್ಧಿ',
      shortDescription:
        'ಕಂಪ್ಲಿ ತಾಲೂಕಿನ ದೇವಸಮುದ್ರದಿಂದ ಚಿಕ್ಕಜಾಯಿಗನೂರುವರೆಗೆ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹4.90 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ — ಕಾಮಗಾರಿ ಪ್ರಗತಿಯಲ್ಲಿದೆ.',
      locationName: 'ದೇವಸಮುದ್ರ → ಚಿಕ್ಕಜಾಯಿಗನೂರು',
    },
  },
  {
    slug: 'gangavathi-bridge-new-bus-stand-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'IN_PROGRESS',
    featured: false,
    budget: crore(3),
    spent: spentNinetyPercent(crore(3)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 85,
    completionDaysAgo: null,
    imagePrefix: 'gangavathi-bridge',
    areaEn: 'Kampli town — Gangavathi Bridge to new bus stand',
    areaKn: 'ಕಂಪ್ಲಿ ಪಟ್ಟಣ — ಗಂಗಾವತಿ ಬ್ರಿಡ್ಜ್–ಹೊಸ ಬಸ್ ನಿಲ್ದಾಣ',
    en: {
      title: 'Gangavathi Bridge to new bus stand road',
      shortDescription:
        'Road development in Kampli town from Gangavathi Bridge to the new bus stand — ₹3 crore sanctioned; work is under way.',
      locationName: 'Gangavathi Bridge → new bus stand',
    },
    kn: {
      title: 'ಗಂಗಾವತಿ ಬ್ರಿಡ್ಜ್–ಹೊಸ ಬಸ್ ನಿಲ್ದಾಣ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿ',
      shortDescription:
        'ಕಂಪ್ಲಿ ಪಟ್ಟಣದ ಗಂಗಾವತಿ ಬ್ರಿಡ್ಜ್‌ನಿಂದ ಹೊಸ ಬಸ್‌ ನಿಲ್ದಾಣದವರೆಗೆ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹3 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ — ಕಾಮಗಾರಿ ಪ್ರಗತಿಯಲ್ಲಿದೆ.',
      locationName: 'ಗಂಗಾವತಿ ಬ್ರಿಡ್ಜ್ → ಹೊಸ ಬಸ್ ನಿಲ್ದಾಣ',
    },
  },
  {
    slug: 'koluru-korlagundi-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'PLANNED',
    featured: false,
    budget: crore(3.2101),
    spent: null,
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: null,
    completionDaysAgo: null,
    imagePrefix: 'koluru-korlagundi',
    areaEn: 'Koluru–Korlagundi',
    areaKn: 'ಕೋಳೂರು–ಕೊರ್ಲಗುಂದಿ',
    en: {
      title: 'Koluru to Korlagundi road development',
      shortDescription:
        'Road development from Koluru village to Korlagundi — ₹3.2101 crore sanctioned.',
      locationName: 'Koluru → Korlagundi',
    },
    kn: {
      title: 'ಕೋಳೂರು–ಕೊರ್ಲಗುಂದಿ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿ',
      shortDescription: 'ಕೋಳೂರು ಗ್ರಾಮದಿಂದ ಕೊರ್ಲಗುಂದಿವರೆಗೆ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹3.2101 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ಕೋಳೂರು → ಕೊರ್ಲಗುಂದಿ',
    },
  },
  {
    slug: 'kuditini-sh132-guttiganur-orvai-cross-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'PLANNED',
    featured: false,
    budget: crore(2.52),
    spent: null,
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: null,
    completionDaysAgo: null,
    imagePrefix: 'kuditini-guttiganur',
    areaEn: 'Kuditini SH-132 — Guttiganur–Orvai Cross',
    areaKn: 'ಕುಡಿತಿನಿ SH-132 — ಗುತ್ತಿಗನೂರು–ಓರ್ವಾಯಿ ಕ್ರಾಸ್',
    en: {
      title: 'Kuditini SH-132 to Guttiganur–Orvai Cross road',
      shortDescription:
        'Road development from Kuditini SH-132 to Guttiganur–Orvai Cross — ₹2.52 crore sanctioned.',
      locationName: 'Kuditini SH-132 → Guttiganur–Orvai Cross',
    },
    kn: {
      title: 'ಕುಡಿತಿನಿ SH-132–ಗುತ್ತಿಗನೂರು–ಓರ್ವಾಯಿ ಕ್ರಾಸ್ ರಸ್ತೆ',
      shortDescription:
        'ಕುಡಿತಿನಿ SH-132ರಿಂದ ಗುತ್ತಿಗನೂರು–ಓರ್ವಾಯಿ ಕ್ರಾಸ್‌ವರೆಗೆ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹2.52 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ಕುಡಿತಿನಿ SH-132 → ಗುತ್ತಿಗನೂರು–ಓರ್ವಾಯಿ ಕ್ರಾಸ್',
    },
  },
  // --- Batch 3 (10 more PWD / major road packages) ---
  {
    slug: 'basarakodu-gudadooru-allansumangalamma-camp-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: crore(2.489),
    spent: spentNinetyPercent(crore(2.489)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 320,
    completionDaysAgo: 25,
    imagePrefix: 'basarakodu-gudadooru',
    areaEn: 'Basarakodu–Gudadooru, Kampli Constituency',
    areaKn: 'ಬಸರಕೊಡು–ಗುಡದೂರು, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Basarakodu to Gudadooru (Allansumangalamma Camp) road',
      shortDescription:
        'Road development from Basarakodu village toward Gudadooru up to Allansumangalamma Camp — ₹2.489 crore sanctioned.',
      locationName: 'Basarakodu → Gudadooru / Allansumangalamma Camp',
    },
    kn: {
      title: 'ಬಸರಕೊಡು–ಗುಡದೂರು (ಅಲ್ಲಂಸುಮಂಗಳಮ್ಮ ಕ್ಯಾಂಪ್) ರಸ್ತೆ',
      shortDescription:
        'ಬಸರಕೊಡು ಗ್ರಾಮದಿಂದ ಗುಡದೂರು ಮಾರ್ಗದ ಅಲ್ಲಂಸುಮಂಗಳಮ್ಮ ಕ್ಯಾಂಪ್‌ವರೆಗೆ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹2.489 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ಬಸರಕೊಡು → ಗುಡದೂರು / ಅಲ್ಲಂಸುಮಂಗಳಮ್ಮ ಕ್ಯಾಂಪ್',
    },
  },
  {
    slug: 'kurugodu-mushkagatte-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: crore(2.5),
    spent: spentNinetyPercent(crore(2.5)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 310,
    completionDaysAgo: 22,
    imagePrefix: 'kurugodu-mushkagatte',
    areaEn: 'Kurugodu–Mushkagatte',
    areaKn: 'ಕುರುಗೋಡು–ಮುಷ್ಕಗಟ್ಟೆ',
    en: {
      title: 'Kurugodu to Mushkagatte road development',
      shortDescription:
        'Road development from Kurugodu to Mushkagatte village — ₹2.50 crore sanctioned.',
      locationName: 'Kurugodu → Mushkagatte',
    },
    kn: {
      title: 'ಕುರುಗೋಡು–ಮುಷ್ಕಗಟ್ಟೆ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿ',
      shortDescription:
        'ಕುರುಗೋಡಿನಿಂದ ಮುಷ್ಕಗಟ್ಟೆ ಗ್ರಾಮಕ್ಕೆ ಹೋಗುವ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹2.50 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ಕುರುಗೋಡು → ಮುಷ್ಕಗಟ್ಟೆ',
    },
  },
  {
    slug: 'errangali-vaddatti-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(2.3911),
    spent: spentNinetyPercent(crore(2.3911)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 300,
    completionDaysAgo: 20,
    imagePrefix: 'errangali-vaddatti',
    areaEn: 'Errangali–Vaddatti',
    areaKn: 'ಎರ್ರಂಗಳಿ–ವದ್ದಟ್ಟಿ',
    en: {
      title: 'Errangali to Vaddatti road development',
      shortDescription:
        'Road development from Errangali to Vaddatti — ₹2.3911 crore sanctioned.',
      locationName: 'Errangali → Vaddatti',
    },
    kn: {
      title: 'ಎರ್ರಂಗಳಿ–ವದ್ದಟ್ಟಿ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿ',
      shortDescription:
        'ಎರ್ರಂಗಳಿಯಿಂದ ವದ್ದಟ್ಟಿವರೆಗೆ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹2.3911 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ಎರ್ರಂಗಳಿ → ವದ್ದಟ್ಟಿ',
    },
  },
  {
    slug: 'bogikaluve-gangavathi-bypass-widening',
    category: 'INFRASTRUCTURE',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(2),
    spent: spentNinetyPercent(crore(2)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 290,
    completionDaysAgo: 18,
    imagePrefix: 'bogikaluve-gangavathi',
    areaEn: 'Bogikaluve — Gangavathi bypass',
    areaKn: 'ಬೋಗಿಕಾಲುವೆ — ಗಂಗಾವತಿ ಬೈಪಾಸ್',
    en: {
      title: 'Bogikaluve to Gangavathi bypass road widening',
      shortDescription:
        'Road widening via Bogikaluve up to the Gangavathi bypass — ₹2 crore sanctioned.',
      locationName: 'Bogikaluve → Gangavathi bypass',
    },
    kn: {
      title: 'ಬೋಗಿಕಾಲುವೆ–ಗಂಗಾವತಿ ಬೈಪಾಸ್ ರಸ್ತೆ ಅಗಲೀಕರಣ',
      shortDescription:
        'ಬೋಗಿಕಾಲುವೆ ಮುಖಾಂತರ ಗಂಗಾವತಿ ಬೈಪಾಸ್‌ವರೆಗೆ ರಸ್ತೆ ಅಗಲೀಕರಣಕ್ಕೆ ₹2 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ಬೋಗಿಕಾಲುವೆ → ಗಂಗಾವತಿ ಬೈಪಾಸ್',
    },
  },
  {
    slug: 'kampli-kuditini-sh23-km-91-93-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(2),
    spent: spentNinetyPercent(crore(2)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 280,
    completionDaysAgo: 15,
    imagePrefix: 'kampli-sh23-kuditini',
    areaEn: 'Kampli town — Kuditini SH-23',
    areaKn: 'ಕಂಪ್ಲಿ ಪಟ್ಟಣ — ಕುಡಿತಿನಿ SH-23',
    en: {
      title: 'Kampli Kuditini SH-23 road (km 91.90–93.00)',
      shortDescription:
        'Road development on Kuditini SH-23 in Kampli town from km 91.90 to 93.00 — ₹2 crore sanctioned.',
      locationName: 'Kuditini SH-23, km 91.90 → 93.00',
    },
    kn: {
      title: 'ಕಂಪ್ಲಿ ಕುಡಿತಿನಿ SH-23 ರಸ್ತೆ (ಕಿ.ಮೀ. 91.90–93.00)',
      shortDescription:
        'ಕಂಪ್ಲಿ ಪಟ್ಟಣದ ಕುಡಿತಿನಿ SH-23ರ ಕಿ.ಮೀ. 91.90ರಿಂದ 93.00ರವರೆಗೆ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹2 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ಕುಡಿತಿನಿ SH-23, ಕಿ.ಮೀ. 91.90 → 93.00',
    },
  },
  {
    slug: 'saibaba-temple-nelludi-kottal-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(2),
    spent: spentNinetyPercent(crore(2)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 270,
    completionDaysAgo: 12,
    imagePrefix: 'saibaba-nelludi-kottal',
    areaEn: 'Sri Sai Baba temple — Nelludi–Kottal road',
    areaKn: 'ಶ್ರೀ ಸಾಯಿಬಾಬಾ ದೇವಸ್ಥಾನ — ನೆಲ್ಲೂಡಿ–ಕೊಟ್ಟಾಲ್ ರಸ್ತೆ',
    en: {
      title: 'Sri Sai Baba temple front to Nelludi–Kottal road',
      shortDescription:
        'Road development from in front of Sri Sai Baba temple up to the Nelludi–Kottal road — ₹2 crore sanctioned.',
      locationName: 'Sri Sai Baba temple front → Nelludi–Kottal road',
    },
    kn: {
      title: 'ಶ್ರೀ ಸಾಯಿಬಾಬಾ ದೇವಸ್ಥಾನ–ನೆಲ್ಲೂಡಿ–ಕೊಟ್ಟಾಲ್ ರಸ್ತೆ',
      shortDescription:
        'ಶ್ರೀ ಸಾಯಿಬಾಬಾ ದೇವಸ್ಥಾನದ ಮುಂಭಾಗದಿಂದ ನೆಲ್ಲೂಡಿ–ಕೊಟ್ಟಾಲ್ ರಸ್ತೆಯವರೆಗೆ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹2 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ಶ್ರೀ ಸಾಯಿಬಾಬಾ ದೇವಸ್ಥಾನ ಮುಂಭಾಗ → ನೆಲ್ಲೂಡಿ–ಕೊಟ್ಟಾಲ್ ರಸ್ತೆ',
    },
  },
  {
    slug: 'kurugodu-dodda-basaveshwara-circle',
    category: 'INFRASTRUCTURE',
    projectStatus: 'IN_PROGRESS',
    featured: false,
    budget: crore(2),
    spent: spentNinetyPercent(crore(2)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 80,
    completionDaysAgo: null,
    imagePrefix: 'kurugodu-basaveshwara-circle',
    areaEn: 'Kurugodu town — Dodda Basaveshwara circle',
    areaKn: 'ಕುರುಗೋಡು ಪಟ್ಟಣ — ದೊಡ್ಡ ಬಸವೇಶ್ವರ ವೃತ್ತ',
    en: {
      title: 'Kurugodu Dodda Basaveshwara circle development',
      shortDescription:
        'Development of Dodda Basaveshwara circle in Kurugodu town — ₹2 crore sanctioned; work is under way.',
      locationName: 'Dodda Basaveshwara circle, Kurugodu town',
    },
    kn: {
      title: 'ಕುರುಗೋಡು ದೊಡ್ಡ ಬಸವೇಶ್ವರ ವೃತ್ತ ಅಭಿವೃದ್ಧಿ',
      shortDescription:
        'ಕುರುಗೋಡು ಪಟ್ಟಣದ ದೊಡ್ಡ ಬಸವೇಶ್ವರ ವೃತ್ತದ ಅಭಿವೃದ್ಧಿಗೆ ₹2 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ — ಕಾಮಗಾರಿ ಪ್ರಗತಿಯಲ್ಲಿದೆ.',
      locationName: 'ದೊಡ್ಡ ಬಸವೇಶ್ವರ ವೃತ್ತ, ಕುರುಗೋಡು ಪಟ್ಟಣ',
    },
  },
  {
    slug: 'kurugodu-ayyappa-temple-petrol-bank-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'IN_PROGRESS',
    featured: false,
    budget: crore(2),
    spent: spentNinetyPercent(crore(2)),
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: 70,
    completionDaysAgo: null,
    imagePrefix: 'kurugodu-ayyappa-petrol',
    areaEn: 'Kurugodu town — Ayyappa temple to petrol bunk',
    areaKn: 'ಕುರುಗೋಡು ಪಟ್ಟಣ — ಅಯ್ಯಪ್ಪಸ್ವಾಮಿ ದೇವಸ್ಥಾನ–ಪೆಟ್ರೋಲ್ ಬಂಕ್',
    en: {
      title: 'Kurugodu Ayyappa temple to petrol bunk road',
      shortDescription:
        'Road development in Kurugodu town from Sri Ayyappa Swamy temple to the petrol bunk — ₹2 crore sanctioned; work is under way.',
      locationName: 'Sri Ayyappa Swamy temple → petrol bunk',
    },
    kn: {
      title: 'ಕುರುಗೋಡು ಅಯ್ಯಪ್ಪಸ್ವಾಮಿ ದೇವಸ್ಥಾನ–ಪೆಟ್ರೋಲ್ ಬಂಕ್ ರಸ್ತೆ',
      shortDescription:
        'ಕುರುಗೋಡು ಪಟ್ಟಣದ ಶ್ರೀ ಅಯ್ಯಪ್ಪಸ್ವಾಮಿ ದೇವಸ್ಥಾನದಿಂದ ಪೆಟ್ರೋಲ್ ಬಂಕ್‌ವರೆಗೆ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹2 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ — ಕಾಮಗಾರಿ ಪ್ರಗತಿಯಲ್ಲಿದೆ.',
      locationName: 'ಶ್ರೀ ಅಯ್ಯಪ್ಪಸ್ವಾಮಿ ದೇವಸ್ಥಾನ → ಪೆಟ್ರೋಲ್ ಬಂಕ್',
    },
  },
  {
    slug: 'devalapura-suggenahalli-main-road',
    category: 'INFRASTRUCTURE',
    projectStatus: 'PLANNED',
    featured: false,
    budget: crore(1.5),
    spent: null,
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: null,
    completionDaysAgo: null,
    imagePrefix: 'devalapura-suggenahalli',
    areaEn: 'Devalapura–Suggenahalli',
    areaKn: 'ದೇವಲಾಪುರ–ಸುಗ್ಗೇನಹಳ್ಳಿ',
    en: {
      title: 'Devalapura to Suggenahalli main road development',
      shortDescription:
        'Main road development from Devalapura to Suggenahalli — ₹1.50 crore sanctioned.',
      locationName: 'Devalapura → Suggenahalli main road',
    },
    kn: {
      title: 'ದೇವಲಾಪುರ–ಸುಗ್ಗೇನಹಳ್ಳಿ ಮುಖ್ಯರಸ್ತೆ ಅಭಿವೃದ್ಧಿ',
      shortDescription:
        'ದೇವಲಾಪುರದಿಂದ ಸುಗ್ಗೇನಹಳ್ಳಿ ಮುಖ್ಯರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹1.50 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ದೇವಲಾಪುರ → ಸುಗ್ಗೇನಹಳ್ಳಿ ಮುಖ್ಯರಸ್ತೆ',
    },
  },
  {
    slug: 'kurugodu-area-road-development',
    category: 'INFRASTRUCTURE',
    projectStatus: 'PLANNED',
    featured: false,
    budget: crore(1.5),
    spent: null,
    department: 'Public Works Department',
    agency: 'Lokopayogi Ilakhe (PWD)',
    startDaysAgo: null,
    completionDaysAgo: null,
    imagePrefix: 'kurugodu-area-road',
    areaEn: 'Kurugodu area, Kampli Constituency',
    areaKn: 'ಕುರುಗೋಡು ಭಾಗ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Kurugodu area road development',
      shortDescription:
        'Additional road development package in the Kurugodu area — ₹1.50 crore sanctioned.',
      locationName: 'Kurugodu area road stretch',
    },
    kn: {
      title: 'ಕುರುಗೋಡು ಭಾಗದ ರಸ್ತೆ ಅಭಿವೃದ್ಧಿ',
      shortDescription:
        'ಕುರುಗೋಡು ಭಾಗದ ಮತ್ತೊಂದು ರಸ್ತೆ ಅಭಿವೃದ್ಧಿಗೆ ₹1.50 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ಕುರುಗೋಡು ಭಾಗದ ರಸ್ತೆ ಮಾರ್ಗ',
    },
  },

  // --- Water & irrigation (all completed + featured) ---
  {
    slug: 'kanithimadapura-shridharagadde-irrigation',
    category: 'WATER',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: crore(87),
    spent: spentNinetyPercent(crore(87)),
    department: 'Drinking Water / Irrigation',
    agency: 'Drinking Water / Irrigation',
    startDaysAgo: 540,
    completionDaysAgo: 75,
    imagePrefix: 'kanithimadapura-irrigation',
    areaEn: 'Kanithimadapura–Shridharagadde, Kampli Constituency',
    areaKn: 'ಕಣಿತಿಮದಾಪುರ–ಶ್ರೀಧರಗಡ್ಡೆ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Kanithimadapura–Shridharagadde irrigation project',
      shortDescription:
        'Irrigation project for the Kanithimadapura–Shridharagadde area — ₹87 crore sanctioned.',
      locationName: 'Kanithimadapura–Shridharagadde irrigation corridor',
    },
    kn: {
      title: 'ಕಣಿತಿಮದಾಪುರ–ಶ್ರೀಧರಗಡ್ಡೆ ನೀರಾವರಿ ಯೋಜನೆ',
      shortDescription:
        'ಕಣಿತಿಮದಾಪುರ–ಶ್ರೀಧರಗಡ್ಡೆ ಭಾಗದ ನೀರಾವರಿ ಯೋಜನೆಗೆ ₹87 ಕೋಟಿ ಮಂಜೂರಾಗಿದೆ.',
      locationName: 'ಕಣಿತಿಮದಾಪುರ–ಶ್ರೀಧರಗಡ್ಡೆ ನೀರಾವರಿ ಮಾರ್ಗ',
    },
  },
  {
    slug: 'kurugodu-household-drinking-water',
    category: 'WATER',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: crore(79),
    spent: spentNinetyPercent(crore(79)),
    department: 'Drinking Water / Irrigation',
    agency: 'Drinking Water / Irrigation',
    startDaysAgo: 500,
    completionDaysAgo: 60,
    imagePrefix: 'kurugodu-drinking-water',
    areaEn: 'Kurugodu town, Kampli Constituency',
    areaKn: 'ಕುರುಗೋಡು ಪಟ್ಟಣ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Kurugodu household drinking water supply',
      shortDescription:
        'Drinking water supply scheme to every house in Kurugodu town — estimated cost ₹79 crore.',
      locationName: 'Kurugodu town water supply network',
    },
    kn: {
      title: 'ಕುರುಗೋಡು ಮನೆಗೆ ಕುಡಿಯುವ ನೀರು ಸರಬರಾಜು',
      shortDescription:
        'ಕುರುಗೋಡು ಪಟ್ಟಣದ ಪ್ರತಿಯೊಂದು ಮನೆಗೆ ಕುಡಿಯುವ ನೀರು ಸರಬರಾಜು ಮಾಡುವ ಯೋಜನೆಗೆ ₹79 ಕೋಟಿ ಅಂದಾಜು ವೆಚ್ಚ.',
      locationName: 'ಕುರುಗೋಡು ಪಟ್ಟಣ ನೀರು ಸರಬರಾಜು ಜಾಲ',
    },
  },
  {
    slug: 'somappakere-development',
    category: 'WATER',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: crore(5),
    spent: spentNinetyPercent(crore(5)),
    department: 'Drinking Water / Irrigation',
    agency: 'Drinking Water / Irrigation',
    startDaysAgo: 420,
    completionDaysAgo: 55,
    imagePrefix: 'somappakere-development',
    areaEn: 'Somappakere, Kampli Constituency',
    areaKn: 'ಸೋಮಪ್ಪಕೆರೆ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Somappakere development works',
      shortDescription:
        'Development works at Somappakere tank and surrounds — estimated cost about ₹5 crore.',
      locationName: 'Somappakere tank area',
    },
    kn: {
      title: 'ಸೋಮಪ್ಪಕೆರೆ ಅಭಿವೃದ್ಧಿ ಕಾಮಗಾರಿ',
      shortDescription:
        'ಸೋಮಪ್ಪಕೆರೆ ಅಭಿವೃದ್ಧಿಗೆ ಸುಮಾರು ₹5 ಕೋಟಿ ಅಂದಾಜು ಮೊತ್ತದ ಕಾಮಗಾರಿ.',
      locationName: 'ಸೋಮಪ್ಪಕೆರೆ ಕೆರೆ ಪ್ರದೇಶ',
    },
  },
  {
    slug: 'somappakere-amrut-2-development',
    category: 'WATER',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: crore(2.8),
    spent: spentNinetyPercent(crore(2.8)),
    department: 'Drinking Water / Irrigation',
    agency: 'Drinking Water / Irrigation',
    startDaysAgo: 380,
    completionDaysAgo: 45,
    imagePrefix: 'somappakere-amrut',
    areaEn: 'Somappakere, Kampli Constituency',
    areaKn: 'ಸೋಮಪ್ಪಕೆರೆ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Somappakere AMRUT 2.0 development',
      shortDescription:
        'Somappakere development under the AMRUT 2.0 scheme — ₹2.80 crore grant.',
      locationName: 'Somappakere AMRUT 2.0 works',
    },
    kn: {
      title: 'ಸೋಮಪ್ಪಕೆರೆ ಅಮೃತ್ 2.0 ಅಭಿವೃದ್ಧಿ',
      shortDescription:
        'ಸೋಮಪ್ಪಕೆರೆ ಅಮೃತ್‌ 2.0 ಯೋಜನೆಯಡಿ ಅಭಿವೃದ್ಧಿಗೆ ₹2.80 ಕೋಟಿ ಅನುದಾನ.',
      locationName: 'ಸೋಮಪ್ಪಕೆರೆ ಅಮೃತ್ 2.0 ಕಾಮಗಾರಿ',
    },
  },
  {
    slug: 'somappakere-park-development',
    category: 'WATER',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: crore(1),
    spent: spentNinetyPercent(crore(1)),
    department: 'Drinking Water / Irrigation',
    agency: 'Drinking Water / Irrigation',
    startDaysAgo: 360,
    completionDaysAgo: 40,
    imagePrefix: 'somappakere-park',
    areaEn: 'Somappakere, Kampli Constituency',
    areaKn: 'ಸೋಮಪ್ಪಕೆರೆ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Somappakere park development',
      shortDescription:
        'Park development at Somappakere — ₹1 crore grant.',
      locationName: 'Somappakere park',
    },
    kn: {
      title: 'ಸೋಮಪ್ಪಕೆರೆ ಪಾರ್ಕ್ ಅಭಿವೃದ್ಧಿ',
      shortDescription:
        'ಸೋಮಪ್ಪಕೆರೆ ಪಾರ್ಕ್‌ ಅಭಿವೃದ್ಧಿಗೆ ₹1 ಕೋಟಿ ಅನುದಾನ.',
      locationName: 'ಸೋಮಪ್ಪಕೆರೆ ಪಾರ್ಕ್',
    },
  },
  {
    slug: 'constituency-schools-drinking-water-units',
    category: 'WATER',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: crore(5.3668),
    spent: spentNinetyPercent(crore(5.3668)),
    department: 'Drinking Water / Irrigation',
    agency: 'Drinking Water / Irrigation',
    startDaysAgo: 400,
    completionDaysAgo: 50,
    imagePrefix: 'schools-water-units',
    areaEn: 'Kampli Constituency (156 government schools)',
    areaKn: 'ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ (156 ಸರ್ಕಾರಿ ಶಾಲೆಗಳು)',
    en: {
      title: 'Pure drinking water units in 156 government schools',
      shortDescription:
        'Installation of pure drinking water machines in 156 government schools across the constituency — ₹5.3668 crore.',
      locationName: 'Government schools across Kampli Constituency',
    },
    kn: {
      title: '156 ಸರ್ಕಾರಿ ಶಾಲೆಗಳಿಗೆ ಶುದ್ಧ ಕುಡಿಯುವ ನೀರಿನ ಯಂತ್ರಗಳು',
      shortDescription:
        'ಕ್ಷೇತ್ರದ 156 ಸರ್ಕಾರಿ ಶಾಲೆಗಳಿಗೆ ಶುದ್ಧ ಕುಡಿಯುವ ನೀರಿನ ಯಂತ್ರಗಳ ಅಳವಡಿಕೆಗೆ ₹5.3668 ಕೋಟಿ.',
      locationName: 'ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರದ ಸರ್ಕಾರಿ ಶಾಲೆಗಳು',
    },
  },
  {
    slug: 'shridharagadde-school-drinking-water',
    category: 'WATER',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: lakh(37.48),
    spent: spentNinetyPercent(lakh(37.48)),
    department: 'Drinking Water / Irrigation',
    agency: 'Drinking Water / Irrigation',
    startDaysAgo: 320,
    completionDaysAgo: 35,
    imagePrefix: 'shridharagadde-school',
    areaEn: 'Shridharagadde, Kampli Constituency',
    areaKn: 'ಶ್ರೀಧರಗಡ್ಡೆ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Shridharagadde school — pure drinking water works',
      shortDescription:
        'Pure drinking water works at Shridharagadde Government Higher Primary School (with two new rooms) — ₹37.48 lakh.',
      locationName: 'Shridharagadde Government Higher Primary School',
    },
    kn: {
      title: 'ಶ್ರೀಧರಗಡ್ಡೆ ಶಾಲೆ — ಶುದ್ಧ ಕುಡಿಯುವ ನೀರಿನ ಕಾಮಗಾರಿ',
      shortDescription:
        'ಶ್ರೀಧರಗಡ್ಡೆ ಸರ್ಕಾರಿ ಹಿರಿಯ ಪ್ರಾಥಮಿಕ ಶಾಲೆಗೆ ಎರಡು ಕೊಠಡಿಗಳ ಜೊತೆಗೆ ಶುದ್ಧ ಕುಡಿಯುವ ನೀರಿನ ಕಾಮಗಾರಿಗೆ ₹37.48 ಲಕ್ಷ.',
      locationName: 'ಶ್ರೀಧರಗಡ್ಡೆ ಸರ್ಕಾರಿ ಹಿರಿಯ ಪ್ರಾಥಮಿಕ ಶಾಲೆ',
    },
  },
  {
    slug: 'shridharagadde-school-classrooms',
    category: 'EDUCATION',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: lakh(37.48),
    spent: spentNinetyPercent(lakh(37.48)),
    department: 'Drinking Water / Irrigation',
    agency: 'Drinking Water / Irrigation',
    startDaysAgo: 320,
    completionDaysAgo: 35,
    imagePrefix: 'shridharagadde-school',
    areaEn: 'Shridharagadde, Kampli Constituency',
    areaKn: 'ಶ್ರೀಧರಗಡ್ಡೆ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Shridharagadde school — two new classrooms',
      shortDescription:
        'Two new classrooms plus pure drinking water works at Shridharagadde Government Higher Primary School — ₹37.48 lakh.',
      locationName: 'Shridharagadde Government Higher Primary School',
    },
    kn: {
      title: 'ಶ್ರೀಧರಗಡ್ಡೆ ಶಾಲೆ — ಎರಡು ಹೊಸ ಕೊಠಡಿಗಳು',
      shortDescription:
        'ಶ್ರೀಧರಗಡ್ಡೆ ಸರ್ಕಾರಿ ಹಿರಿಯ ಪ್ರಾಥಮಿಕ ಶಾಲೆಗೆ ಎರಡು ಕೊಠಡಿಗಳ ಜೊತೆಗೆ ಶುದ್ಧ ಕುಡಿಯುವ ನೀರಿನ ಕಾಮಗಾರಿಗೆ ₹37.48 ಲಕ್ಷ.',
      locationName: 'ಶ್ರೀಧರಗಡ್ಡೆ ಸರ್ಕಾರಿ ಹಿರಿಯ ಪ್ರಾಥಮಿಕ ಶಾಲೆ',
    },
  },

  // --- Education / schools & hostels (6 completed, 2 in progress, 2 sanctioned) ---
  {
    slug: 'constituency-137-schools-kmrc-classrooms',
    category: 'EDUCATION',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: crore(110),
    spent: spentNinetyPercent(crore(110)),
    department: 'Education',
    agency: 'Education',
    startDaysAgo: 560,
    completionDaysAgo: 80,
    imagePrefix: 'kmrc-schools-classrooms',
    areaEn: 'Kampli Constituency (137 schools)',
    areaKn: 'ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ (137 ಶಾಲೆಗಳು)',
    en: {
      title: 'New classrooms in 137 schools (KMRC)',
      shortDescription:
        'Construction of new classrooms in 137 schools across the constituency under the KMRC scheme — ₹110 crore.',
      locationName: 'Government schools across Kampli Constituency',
    },
    kn: {
      title: '137 ಶಾಲೆಗಳಿಗೆ ಹೊಸ ಕೊಠಡಿಗಳು (ಕೆಎಂಆರ್‌ಸಿ)',
      shortDescription:
        'ಕ್ಷೇತ್ರದ 137 ಶಾಲೆಗಳಿಗೆ ಹೊಸ ಕೊಠಡಿಗಳ ನಿರ್ಮಾಣಕ್ಕೆ ₹110 ಕೋಟಿ ಕೆಎಂಆರ್‌ಸಿ ಯೋಜನೆಯಡಿ.',
      locationName: 'ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರದ ಸರ್ಕಾರಿ ಶಾಲೆಗಳು',
    },
  },
  {
    slug: 'aralihalli-thanda-morarji-desai-school',
    category: 'EDUCATION',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(25),
    spent: spentNinetyPercent(crore(25)),
    department: 'Education',
    agency: 'Education',
    startDaysAgo: 500,
    completionDaysAgo: 70,
    imagePrefix: 'aralihalli-morarji',
    areaEn: 'Aralihalli Thanda, Kampli Constituency',
    areaKn: 'ಅರಳಿಹಳ್ಳಿ ತಾಂಡಾ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Morarji Desai residential school — Aralihalli Thanda',
      shortDescription:
        'Minority Morarji Desai residential school at Aralihalli Thanda — ₹25 crore.',
      locationName: 'Aralihalli Thanda Morarji Desai residential school',
    },
    kn: {
      title: 'ಮೊರಾರ್ಜಿ ದೇಸಾಯಿ ವಸತಿ ಶಾಲೆ — ಅರಳಿಹಳ್ಳಿ ತಾಂಡಾ',
      shortDescription:
        'ಅರಳಿಹಳ್ಳಿ ತಾಂಡಾದಲ್ಲಿ ಅಲ್ಪಸಂಖ್ಯಾತ ಮೊರಾರ್ಜಿ ದೇಸಾಯಿ ವಸತಿ ಶಾಲೆಗೆ ₹25 ಕೋಟಿ.',
      locationName: 'ಅರಳಿಹಳ್ಳಿ ತಾಂಡಾ ಮೊರಾರ್ಜಿ ದೇಸಾಯಿ ವಸತಿ ಶಾಲೆ',
    },
  },
  {
    slug: 'bailuru-morarji-desai-school',
    category: 'EDUCATION',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(25),
    spent: spentNinetyPercent(crore(25)),
    department: 'Education',
    agency: 'Education',
    startDaysAgo: 480,
    completionDaysAgo: 65,
    imagePrefix: 'bailuru-morarji',
    areaEn: 'Bailuru, Kampli Constituency',
    areaKn: 'ಬೈಲೂರು, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Morarji Desai residential school — Bailuru',
      shortDescription:
        'Minority Morarji Desai residential school in Bailuru village — ₹25 crore.',
      locationName: 'Bailuru Morarji Desai residential school',
    },
    kn: {
      title: 'ಮೊರಾರ್ಜಿ ದೇಸಾಯಿ ವಸತಿ ಶಾಲೆ — ಬೈಲೂರು',
      shortDescription:
        'ಬೈಲೂರು ಗ್ರಾಮದಲ್ಲಿ ಅಲ್ಪಸಂಖ್ಯಾತ ಮೊರಾರ್ಜಿ ದೇಸಾಯಿ ವಸತಿ ಶಾಲೆಗೆ ₹25 ಕೋಟಿ.',
      locationName: 'ಬೈಲೂರು ಮೊರಾರ್ಜಿ ದೇಸಾಯಿ ವಸತಿ ಶಾಲೆ',
    },
  },
  {
    slug: 'minority-colonies-development',
    category: 'PUBLIC_SERVICES',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(5),
    spent: spentNinetyPercent(crore(5)),
    department: 'Education',
    agency: 'Education',
    startDaysAgo: 420,
    completionDaysAgo: 55,
    imagePrefix: 'minority-colonies',
    areaEn: 'Minority colonies, Kampli Constituency',
    areaKn: 'ಅಲ್ಪಸಂಖ್ಯಾತರ ಕಾಲೊನಿಗಳು, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Minority colonies development',
      shortDescription:
        'Development works in minority colonies across the constituency — ₹5 crore.',
      locationName: 'Minority colonies, Kampli Constituency',
    },
    kn: {
      title: 'ಅಲ್ಪಸಂಖ್ಯಾತರ ಕಾಲೊನಿಗಳ ಅಭಿವೃದ್ಧಿ',
      shortDescription:
        'ಅಲ್ಪಸಂಖ್ಯಾತರ ಕಾಲೊನಿಗಳ ಅಭಿವೃದ್ಧಿಗೆ ₹5 ಕೋಟಿ.',
      locationName: 'ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರದ ಅಲ್ಪಸಂಖ್ಯಾತರ ಕಾಲೊನಿಗಳು',
    },
  },
  {
    slug: 'kampli-maulana-azad-school',
    category: 'EDUCATION',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(5.5),
    spent: spentNinetyPercent(crore(5.5)),
    department: 'Education',
    agency: 'Education',
    startDaysAgo: 400,
    completionDaysAgo: 50,
    imagePrefix: 'kampli-maulana-azad',
    areaEn: 'Kampli town, Kampli Constituency',
    areaKn: 'ಕಂಪ್ಲಿ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Maulana Azad school — Kampli',
      shortDescription:
        'Development works for Maulana Azad school in Kampli — ₹5.50 crore.',
      locationName: 'Maulana Azad school, Kampli',
    },
    kn: {
      title: 'ಮೌಲಾನಾ ಆಜಾದ್ ಶಾಲೆ — ಕಂಪ್ಲಿ',
      shortDescription:
        'ಕಂಪ್ಲಿಯಲ್ಲಿ ಮೌಲಾನಾ ಆಜಾದ್‌ ಶಾಲೆಗೆ ₹5.50 ಕೋಟಿ.',
      locationName: 'ಮೌಲಾನಾ ಆಜಾದ್ ಶಾಲೆ, ಕಂಪ್ಲಿ',
    },
  },
  {
    slug: 'minority-post-metric-boys-hostel',
    category: 'EDUCATION',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(4),
    spent: spentNinetyPercent(crore(4)),
    department: 'Education',
    agency: 'Education',
    startDaysAgo: 380,
    completionDaysAgo: 45,
    imagePrefix: 'minority-boys-hostel',
    areaEn: 'Kampli Constituency',
    areaKn: 'ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Minority post-metric boys hostel',
      shortDescription:
        'Boys hostel for minority post-metric students — ₹4 crore.',
      locationName: 'Minority post-metric boys hostel',
    },
    kn: {
      title: 'ಅಲ್ಪಸಂಖ್ಯಾತ ಮೆಟ್ರಿಕ್ ನಂತರದ ಬಾಲಕರ ವಸತಿ ನಿಲಯ',
      shortDescription:
        'ಅಲ್ಪಸಂಖ್ಯಾತ ಮೆಟ್ರಿಕ್‌ ನಂತರದ ವಿದ್ಯಾರ್ಥಿಗಳ ಬಾಲಕರ ವಸತಿ ನಿಲಯಕ್ಕೆ ₹4 ಕೋಟಿ.',
      locationName: 'ಅಲ್ಪಸಂಖ್ಯಾತ ಮೆಟ್ರಿಕ್ ನಂತರದ ಬಾಲಕರ ವಸತಿ ನಿಲಯ',
    },
  },
  {
    slug: 'constituency-53-anganwadi-rooms',
    category: 'EDUCATION',
    projectStatus: 'IN_PROGRESS',
    featured: true,
    budget: crore(20),
    spent: spentNinetyPercent(crore(20)),
    department: 'Education',
    agency: 'Education',
    startDaysAgo: 200,
    completionDaysAgo: null,
    imagePrefix: 'anganwadi-rooms',
    areaEn: 'Kampli Constituency (53 Anganwadi centres)',
    areaKn: 'ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ (53 ಅಂಗನವಾಡಿ ಕೇಂದ್ರಗಳು)',
    en: {
      title: 'New rooms in 53 Anganwadi centres',
      shortDescription:
        'Construction of new rooms in 53 Anganwadi centres across the constituency — ₹20 crore.',
      locationName: 'Anganwadi centres across Kampli Constituency',
    },
    kn: {
      title: '53 ಅಂಗನವಾಡಿ ಕೇಂದ್ರಗಳಿಗೆ ಹೊಸ ಕೊಠಡಿಗಳು',
      shortDescription:
        '53 ಅಂಗನವಾಡಿ ಕೇಂದ್ರಗಳಿಗೆ ಹೊಸ ಕೊಠಡಿಗಳ ನಿರ್ಮಾಣಕ್ಕೆ ₹20 ಕೋಟಿ.',
      locationName: 'ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರದ ಅಂಗನವಾಡಿ ಕೇಂದ್ರಗಳು',
    },
  },
  {
    slug: 'errangali-school-10-classrooms',
    category: 'EDUCATION',
    projectStatus: 'IN_PROGRESS',
    featured: true,
    budget: crore(1.78),
    spent: spentNinetyPercent(crore(1.78)),
    department: 'Education',
    agency: 'Education',
    startDaysAgo: 150,
    completionDaysAgo: null,
    imagePrefix: 'errangali-school-rooms',
    areaEn: 'Errangali, Kampli Constituency',
    areaKn: 'ಎರ್ರಂಗಳಿ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Ten school classrooms — Errangali',
      shortDescription:
        'Construction of 10 school classrooms in Errangali village — ₹1.78 crore.',
      locationName: 'Errangali school campus',
    },
    kn: {
      title: '10 ಶಾಲಾ ಕೊಠಡಿಗಳು — ಎರ್ರಂಗಳಿ',
      shortDescription:
        'ಎರ್ರಂಗಳಿ ಗ್ರಾಮದಲ್ಲಿ 10 ಶಾಲಾ ಕೊಠಡಿಗಳ ನಿರ್ಮಾಣಕ್ಕೆ ₹1.78 ಕೋಟಿ.',
      locationName: 'ಎರ್ರಂಗಳಿ ಶಾಲಾ ಆವರಣ',
    },
  },
  {
    slug: 'devalapura-govt-high-school-classrooms',
    category: 'EDUCATION',
    projectStatus: 'PLANNED',
    featured: true,
    budget: crore(1.7589),
    spent: null,
    department: 'Education',
    agency: 'Education',
    startDaysAgo: null,
    completionDaysAgo: null,
    imagePrefix: 'devalapura-school-rooms',
    areaEn: 'Devalapura, Kampli Constituency',
    areaKn: 'ದೇವಲಾಪುರ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Ten new classrooms — Devalapura Government High School',
      shortDescription:
        'Ten new classrooms at Devalapura Government High School — ₹1.7589 crore sanctioned.',
      locationName: 'Devalapura Government High School',
    },
    kn: {
      title: '10 ಹೊಸ ಕೊಠಡಿಗಳು — ದೇವಲಾಪುರ ಸರ್ಕಾರಿ ಪ್ರೌಢಶಾಲೆ',
      shortDescription:
        'ದೇವಲಾಪುರ ಸರ್ಕಾರಿ ಪ್ರೌಢಶಾಲೆಯಲ್ಲಿ 10 ಹೊಸ ಕೊಠಡಿಗಳಿಗೆ ₹1.7589 ಕೋಟಿ.',
      locationName: 'ದೇವಲಾಪುರ ಸರ್ಕಾರಿ ಪ್ರೌಢಶಾಲೆ',
    },
  },
  {
    slug: 'handihalu-govt-high-school-classrooms',
    category: 'EDUCATION',
    projectStatus: 'PLANNED',
    featured: true,
    budget: lakh(82.53),
    spent: null,
    department: 'Education',
    agency: 'Education',
    startDaysAgo: null,
    completionDaysAgo: null,
    imagePrefix: 'handihalu-school-rooms',
    areaEn: 'Handihalu, Kampli Constituency',
    areaKn: 'ಹಂದಿಹಾಳು, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'New classrooms — Handihalu Government High School',
      shortDescription:
        'New classrooms at Handihalu Government High School — ₹82.53 lakh sanctioned.',
      locationName: 'Handihalu Government High School',
    },
    kn: {
      title: 'ಹೊಸ ಕೊಠಡಿಗಳು — ಹಂದಿಹಾಳು ಸರ್ಕಾರಿ ಪ್ರೌಢಶಾಲೆ',
      shortDescription:
        'ಹಂದಿಹಾಳು ಸರ್ಕಾರಿ ಪ್ರೌಢಶಾಲೆಯಲ್ಲಿ ಹೊಸ ಕೊಠಡಿಗಳಿಗೆ ₹82.53 ಲಕ್ಷ.',
      locationName: 'ಹಂದಿಹಾಳು ಸರ್ಕಾರಿ ಪ್ರೌಢಶಾಲೆ',
    },
  },

  // --- Additional school classrooms (9 works: 6 completed, 2 in progress, 1 sanctioned;
  //     Shridharagadde ₹37.48L rooms+water already seeded above — skipped) ---
  {
    slug: 'somasamudra-ghps-j1-rooms-wall',
    category: 'EDUCATION',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: lakh(61.89),
    spent: spentNinetyPercent(lakh(61.89)),
    department: 'Education',
    agency: 'Education',
    startDaysAgo: 340,
    completionDaysAgo: 40,
    imagePrefix: 'somasamudra-school-rooms',
    areaEn: 'Somasamudra, Kampli Constituency',
    areaKn: 'ಸೋಮಸಮುದ್ರ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Four J1 classrooms and protection wall — Somasamudra GHPS',
      shortDescription:
        'Four J1-model classrooms and a protection wall at Somasamudra Government Higher Primary School — ₹61.89 lakh.',
      locationName: 'Somasamudra Government Higher Primary School',
    },
    kn: {
      title: '4 J1 ಕೊಠಡಿಗಳು ಮತ್ತು ರಕ್ಷಣಾ ಗೋಡೆ — ಸೋಮಸಮುದ್ರ ಸರ್ಕಾರಿ ಹಿರಿಯ ಪ್ರಾಥಮಿಕ ಶಾಲೆ',
      shortDescription:
        'ಸೋಮಸಮುದ್ರ ಸರ್ಕಾರಿ ಹಿರಿಯ ಪ್ರಾಥಮಿಕ ಶಾಲೆಯಲ್ಲಿ 4 J1 ಮಾದರಿ ಕೊಠಡಿಗಳು ಮತ್ತು ರಕ್ಷಣಾ ಗೋಡೆಗೆ ₹61.89 ಲಕ್ಷ.',
      locationName: 'ಸೋಮಸಮುದ್ರ ಸರ್ಕಾರಿ ಹಿರಿಯ ಪ್ರಾಥಮಿಕ ಶಾಲೆ',
    },
  },
  {
    slug: 'bailuru-govt-high-school-classrooms',
    category: 'EDUCATION',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: lakh(47.83),
    spent: spentNinetyPercent(lakh(47.83)),
    department: 'Education',
    agency: 'Education',
    startDaysAgo: 310,
    completionDaysAgo: 38,
    imagePrefix: 'bailuru-govt-high-school',
    areaEn: 'Bailuru, Kampli Constituency',
    areaKn: 'ಬೈಲೂರು, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Two new classrooms — Bailuru Government High School',
      shortDescription:
        'Two new classrooms at Bailuru Government High School — ₹47.83 lakh.',
      locationName: 'Bailuru Government High School',
    },
    kn: {
      title: '2 ಹೊಸ ಕೊಠಡಿಗಳು — ಬೈಲೂರು ಸರ್ಕಾರಿ ಪ್ರೌಢಶಾಲೆ',
      shortDescription:
        'ಬೈಲೂರು ಸರ್ಕಾರಿ ಪ್ರೌಢಶಾಲೆಯಲ್ಲಿ 2 ಹೊಸ ಕೊಠಡಿಗಳಿಗೆ ₹47.83 ಲಕ್ಷ.',
      locationName: 'ಬೈಲೂರು ಸರ್ಕಾರಿ ಪ್ರೌಢಶಾಲೆ',
    },
  },
  {
    slug: 'shridharagadde-ghps-j1-rooms',
    category: 'EDUCATION',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: lakh(43.01),
    spent: spentNinetyPercent(lakh(43.01)),
    department: 'Education',
    agency: 'Education',
    startDaysAgo: 300,
    completionDaysAgo: 36,
    imagePrefix: 'shridharagadde-j1-rooms',
    areaEn: 'Shridharagadde, Kampli Constituency',
    areaKn: 'ಶ್ರೀಧರಗಡ್ಡೆ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Three J1 classrooms — Shridharagadde GHPS',
      shortDescription:
        'Three J1-model classrooms at Shridharagadde Government Higher Primary School — ₹43.01 lakh.',
      locationName: 'Shridharagadde Government Higher Primary School',
    },
    kn: {
      title: '3 J1 ಕೊಠಡಿಗಳು — ಶ್ರೀಧರಗಡ್ಡೆ ಸರ್ಕಾರಿ ಹಿರಿಯ ಪ್ರಾಥಮಿಕ ಶಾಲೆ',
      shortDescription:
        'ಶ್ರೀಧರಗಡ್ಡೆ ಸರ್ಕಾರಿ ಹಿರಿಯ ಪ್ರಾಥಮಿಕ ಶಾಲೆಯಲ್ಲಿ 3 J1 ಮಾದರಿ ಕೊಠಡಿಗಳಿಗೆ ₹43.01 ಲಕ್ಷ.',
      locationName: 'ಶ್ರೀಧರಗಡ್ಡೆ ಸರ್ಕಾರಿ ಹಿರಿಯ ಪ್ರಾಥಮಿಕ ಶಾಲೆ',
    },
  },
  {
    slug: 'kappagallu-govt-high-school-classrooms',
    category: 'EDUCATION',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: lakh(43),
    spent: spentNinetyPercent(lakh(43)),
    department: 'Education',
    agency: 'Education',
    startDaysAgo: 290,
    completionDaysAgo: 34,
    imagePrefix: 'kappagallu-school-rooms',
    areaEn: 'Kappagallu, Kampli Constituency',
    areaKn: 'ಕಪ್ಪಗಲ್ಲು, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'New classrooms — Kappagallu Government High School',
      shortDescription:
        'New classrooms at Kappagallu Government High School — ₹43 lakh.',
      locationName: 'Kappagallu Government High School',
    },
    kn: {
      title: 'ಹೊಸ ಕೊಠಡಿಗಳು — ಕಪ್ಪಗಲ್ಲು ಸರ್ಕಾರಿ ಪ್ರೌಢಶಾಲೆ',
      shortDescription:
        'ಕಪ್ಪಗಲ್ಲು ಸರ್ಕಾರಿ ಪ್ರೌಢಶಾಲೆಯ ಹೊಸ ಕೊಠಡಿಗಳಿಗೆ ₹43 ಲಕ್ಷ.',
      locationName: 'ಕಪ್ಪಗಲ್ಲು ಸರ್ಕಾರಿ ಪ್ರೌಢಶಾಲೆ',
    },
  },
  {
    slug: 'genikehalu-school-two-classrooms',
    category: 'EDUCATION',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: lakh(36),
    spent: spentNinetyPercent(lakh(36)),
    department: 'Education',
    agency: 'Education',
    startDaysAgo: 280,
    completionDaysAgo: 32,
    imagePrefix: 'genikehalu-school-rooms',
    areaEn: 'Genikehalu, Kampli Constituency',
    areaKn: 'ಗೆಣಿಕೆಹಾಳು, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Two new school classrooms — Genikehalu',
      shortDescription:
        'Two new school classrooms in Genikehalu village — ₹36 lakh.',
      locationName: 'Genikehalu village school',
    },
    kn: {
      title: '2 ಹೊಸ ಶಾಲಾ ಕೊಠಡಿಗಳು — ಗೆಣಿಕೆಹಾಳು',
      shortDescription:
        'ಗೆಣಿಕೆಹಾಳು ಗ್ರಾಮದಲ್ಲಿ 2 ಹೊಸ ಶಾಲಾ ಕೊಠಡಿಗಳಿಗೆ ₹36 ಲಕ್ಷ.',
      locationName: 'ಗೆಣಿಕೆಹಾಳು ಗ್ರಾಮದ ಶಾಲೆ',
    },
  },
  {
    slug: 'guttiganuru-school-two-classrooms',
    category: 'EDUCATION',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: lakh(36),
    spent: spentNinetyPercent(lakh(36)),
    department: 'Education',
    agency: 'Education',
    startDaysAgo: 270,
    completionDaysAgo: 30,
    imagePrefix: 'guttiganuru-school-rooms',
    areaEn: 'Guttiganuru, Kampli Constituency',
    areaKn: 'ಗುತ್ತಿಗನೂರು, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Two new school classrooms — Guttiganuru',
      shortDescription:
        'Two new school classrooms in Guttiganuru village — ₹36 lakh.',
      locationName: 'Guttiganuru village school',
    },
    kn: {
      title: '2 ಹೊಸ ಶಾಲಾ ಕೊಠಡಿಗಳು — ಗುತ್ತಿಗನೂರು',
      shortDescription:
        'ಗುತ್ತಿಗನೂರು ಗ್ರಾಮದಲ್ಲಿ 2 ಹೊಸ ಶಾಲಾ ಕೊಠಡಿಗಳಿಗೆ ₹36 ಲಕ್ಷ.',
      locationName: 'ಗುತ್ತಿಗನೂರು ಗ್ರಾಮದ ಶಾಲೆ',
    },
  },
  {
    slug: 'jalibenchi-school-two-classrooms',
    category: 'EDUCATION',
    projectStatus: 'IN_PROGRESS',
    featured: false,
    budget: lakh(33.06),
    spent: spentNinetyPercent(lakh(33.06)),
    department: 'Education',
    agency: 'Education',
    startDaysAgo: 120,
    completionDaysAgo: null,
    imagePrefix: 'jalibenchi-school-rooms',
    areaEn: 'Jalibenchi, Kampli Constituency',
    areaKn: 'ಜಾಲಿಬೆಂಚಿ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Two classrooms — Jalibenchi school',
      shortDescription:
        'Two classrooms at Jalibenchi school — ₹33.06 lakh.',
      locationName: 'Jalibenchi school',
    },
    kn: {
      title: '2 ಕೊಠಡಿಗಳು — ಜಾಲಿಬೆಂಚಿ ಶಾಲೆ',
      shortDescription:
        'ಜಾಲಿಬೆಂಚಿ ಶಾಲೆಯಲ್ಲಿ 2 ಕೊಠಡಿಗಳಿಗೆ ₹33.06 ಲಕ್ಷ.',
      locationName: 'ಜಾಲಿಬೆಂಚಿ ಶಾಲೆ',
    },
  },
  {
    slug: 'metti-shivapura-school-classrooms',
    category: 'EDUCATION',
    projectStatus: 'IN_PROGRESS',
    featured: false,
    budget: lakh(28.7),
    spent: spentNinetyPercent(lakh(28.7)),
    department: 'Education',
    agency: 'Education',
    startDaysAgo: 90,
    completionDaysAgo: null,
    imagePrefix: 'metti-shivapura-school-rooms',
    areaEn: 'Metti–Shivapura, Kampli Constituency',
    areaKn: 'ಮೆಟ್ಟಿ–ಶಿವಪುರ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'New school classrooms — Metti–Shivapura',
      shortDescription:
        'New school classrooms in Metti–Shivapura village — ₹28.70 lakh.',
      locationName: 'Metti–Shivapura village school',
    },
    kn: {
      title: 'ಹೊಸ ಶಾಲಾ ಕೊಠಡಿಗಳು — ಮೆಟ್ಟಿ–ಶಿವಪುರ',
      shortDescription:
        'ಮೆಟ್ಟಿ–ಶಿವಪುರ ಗ್ರಾಮದಲ್ಲಿ ಹೊಸ ಶಾಲಾ ಕೊಠಡಿಗಳಿಗೆ ₹28.70 ಲಕ್ಷ.',
      locationName: 'ಮೆಟ್ಟಿ–ಶಿವಪುರ ಗ್ರಾಮದ ಶಾಲೆ',
    },
  },
  {
    slug: 'genikehalu-ghps-new-classrooms',
    category: 'EDUCATION',
    projectStatus: 'PLANNED',
    featured: false,
    budget: lakh(28.69),
    spent: null,
    department: 'Education',
    agency: 'Education',
    startDaysAgo: null,
    completionDaysAgo: null,
    imagePrefix: 'genikehalu-ghps-rooms',
    areaEn: 'Genikehalu, Kampli Constituency',
    areaKn: 'ಗೆಣಿಕೆಹಾಳು, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'New classrooms — Genikehalu Government Higher Primary School',
      shortDescription:
        'New classrooms at Genikehalu Government Higher Primary School — ₹28.69 lakh sanctioned.',
      locationName: 'Genikehalu Government Higher Primary School',
    },
    kn: {
      title: 'ಹೊಸ ಕೊಠಡಿಗಳು — ಗೆಣಿಕೆಹಾಳು ಸರ್ಕಾರಿ ಹಿರಿಯ ಪ್ರಾಥಮಿಕ ಶಾಲೆ',
      shortDescription:
        'ಗೆಣಿಕೆಹಾಳು ಸರ್ಕಾರಿ ಹಿರಿಯ ಪ್ರಾಥಮಿಕ ಶಾಲೆಯಲ್ಲಿ ಹೊಸ ಕೊಠಡಿಗಳಿಗೆ ₹28.69 ಲಕ್ಷ.',
      locationName: 'ಗೆಣಿಕೆಹಾಳು ಸರ್ಕಾರಿ ಹಿರಿಯ ಪ್ರಾಥಮಿಕ ಶಾಲೆ',
    },
  },

  // --- Healthcare (hospitals & PHCs) ---
  {
    slug: 'kampli-100-bed-public-hospital',
    category: 'HEALTHCARE',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: crore(20),
    spent: spentNinetyPercent(crore(20)),
    department: 'Health Department',
    agency: 'Health & Family Welfare',
    startDaysAgo: 540,
    completionDaysAgo: 70,
    imagePrefix: 'kampli-100-bed-hospital',
    areaEn: 'Kampli town, Kampli Constituency',
    areaKn: 'ಕಂಪ್ಲಿ ಪಟ್ಟಣ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: '100-bed public hospital — Kampli',
      shortDescription:
        'Fully equipped 100-bed public hospital with medical equipment in Kampli town — ₹20 crore (share of the ₹40 crore Kampli–Kurugodu package).',
      locationName: 'Public hospital, Kampli town',
    },
    kn: {
      title: '100 ಹಾಸಿಗೆಗಳ ಸಾರ್ವಜನಿಕ ಆಸ್ಪತ್ರೆ — ಕಂಪ್ಲಿ',
      shortDescription:
        'ಕಂಪ್ಲಿ ಪಟ್ಟಣದಲ್ಲಿ 100 ಹಾಸಿಗೆಗಳ ಸುಸಜ್ಜಿತ ಸಾರ್ವಜನಿಕ ಆಸ್ಪತ್ರೆ ಹಾಗೂ ವೈದ್ಯಕೀಯ ಪೀಠೋಪಕರಣಗಳಿಗೆ ₹20 ಕೋಟಿ (ಕಂಪ್ಲಿ–ಕುರುಗೋಡು ₹40 ಕೋಟಿ ಪ್ಯಾಕೇಜ್‌ನ ಪಾಲು).',
      locationName: 'ಸಾರ್ವಜನಿಕ ಆಸ್ಪತ್ರೆ, ಕಂಪ್ಲಿ ಪಟ್ಟಣ',
    },
  },
  {
    slug: 'kurugodu-100-bed-public-hospital',
    category: 'HEALTHCARE',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: crore(20),
    spent: spentNinetyPercent(crore(20)),
    department: 'Health Department',
    agency: 'Health & Family Welfare',
    startDaysAgo: 520,
    completionDaysAgo: 65,
    imagePrefix: 'kurugodu-100-bed-hospital',
    areaEn: 'Kurugodu town, Kampli Constituency',
    areaKn: 'ಕುರುಗೋಡು ಪಟ್ಟಣ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: '100-bed public hospital — Kurugodu',
      shortDescription:
        'Fully equipped 100-bed public hospital with medical equipment in Kurugodu town — ₹20 crore (share of the ₹40 crore Kampli–Kurugodu package).',
      locationName: 'Public hospital, Kurugodu town',
    },
    kn: {
      title: '100 ಹಾಸಿಗೆಗಳ ಸಾರ್ವಜನಿಕ ಆಸ್ಪತ್ರೆ — ಕುರುಗೋಡು',
      shortDescription:
        'ಕುರುಗೋಡು ಪಟ್ಟಣದಲ್ಲಿ 100 ಹಾಸಿಗೆಗಳ ಸುಸಜ್ಜಿತ ಸಾರ್ವಜನಿಕ ಆಸ್ಪತ್ರೆ ಹಾಗೂ ವೈದ್ಯಕೀಯ ಪೀಠೋಪಕರಣಗಳಿಗೆ ₹20 ಕೋಟಿ (ಕಂಪ್ಲಿ–ಕುರುಗೋಡು ₹40 ಕೋಟಿ ಪ್ಯಾಕೇಜ್‌ನ ಪಾಲು).',
      locationName: 'ಸಾರ್ವಜನಿಕ ಆಸ್ಪತ್ರೆ, ಕುರುಗೋಡು ಪಟ್ಟಣ',
    },
  },
  {
    slug: 'metti-primary-health-centre',
    category: 'HEALTHCARE',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(4.09),
    spent: spentNinetyPercent(crore(4.09)),
    department: 'Health Department',
    agency: 'Health & Family Welfare',
    startDaysAgo: 400,
    completionDaysAgo: 55,
    imagePrefix: 'metti-phc',
    areaEn: 'Metti village, Kampli Constituency',
    areaKn: 'ಮೆಟ್ಟಿ ಗ್ರಾಮ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Primary Health Centre — Metti',
      shortDescription:
        'Primary Health Centre works in Metti village — estimated cost ₹4.09 crore.',
      locationName: 'Primary Health Centre, Metti',
    },
    kn: {
      title: 'ಪ್ರಾಥಮಿಕ ಆರೋಗ್ಯ ಕೇಂದ್ರ — ಮೆಟ್ಟಿ',
      shortDescription:
        'ಮೆಟ್ಟಿ ಗ್ರಾಮದಲ್ಲಿ ಪ್ರಾಥಮಿಕ ಆರೋಗ್ಯ ಕೇಂದ್ರಕ್ಕೆ ₹4.09 ಕೋಟಿ ಅಂದಾಜು ವೆಚ್ಚ.',
      locationName: 'ಪ್ರಾಥಮಿಕ ಆರೋಗ್ಯ ಕೇಂದ್ರ, ಮೆಟ್ಟಿ',
    },
  },
  {
    slug: 'sriramarangapur-phc-medical-equipment',
    category: 'HEALTHCARE',
    projectStatus: 'IN_PROGRESS',
    featured: false,
    budget: lakh(29.5),
    spent: spentNinetyPercent(lakh(29.5)),
    department: 'Health Department',
    agency: 'Health & Family Welfare',
    startDaysAgo: 120,
    completionDaysAgo: null,
    imagePrefix: 'sriramarangapur-phc-equipment',
    areaEn: 'Sriramarangapur, Kampli Constituency',
    areaKn: 'ಶ್ರೀರಾಮರಂಗಾಪುರ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Medical equipment — Sriramarangapur PHC',
      shortDescription:
        'Medical equipment for the Primary Health Centre at Sriramarangapur — ₹29.5 lakh (share of the ₹59 lakh Sriramarangapur–Orvai package).',
      locationName: 'Primary Health Centre, Sriramarangapur',
    },
    kn: {
      title: 'ವೈದ್ಯಕೀಯ ಪೀಠೋಪಕರಣಗಳು — ಶ್ರೀರಾಮರಂಗಾಪುರ ಪ್ರಾ.ಆ.ಕೇ.',
      shortDescription:
        'ಶ್ರೀರಾಮರಂಗಾಪುರ ಪ್ರಾಥಮಿಕ ಆರೋಗ್ಯ ಕೇಂದ್ರಕ್ಕೆ ವೈದ್ಯಕೀಯ ಪೀಠೋಪಕರಣಗಳಿಗೆ ₹29.5 ಲಕ್ಷ (ಶ್ರೀರಾಮರಂಗಾಪುರ–ಓರ್ವಾಯಿ ₹59 ಲಕ್ಷ ಪ್ಯಾಕೇಜ್‌ನ ಪಾಲು).',
      locationName: 'ಪ್ರಾಥಮಿಕ ಆರೋಗ್ಯ ಕೇಂದ್ರ, ಶ್ರೀರಾಮರಂಗಾಪುರ',
    },
  },
  {
    slug: 'orvai-phc-medical-equipment',
    category: 'HEALTHCARE',
    projectStatus: 'PLANNED',
    featured: false,
    budget: lakh(29.5),
    spent: null,
    department: 'Health Department',
    agency: 'Health & Family Welfare',
    startDaysAgo: null,
    completionDaysAgo: null,
    imagePrefix: 'orvai-phc-equipment',
    areaEn: 'Orvai, Kampli Constituency',
    areaKn: 'ಓರ್ವಾಯಿ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Medical equipment — Orvai PHC',
      shortDescription:
        'Medical equipment for the Primary Health Centre at Orvai — ₹29.5 lakh sanctioned (share of the ₹59 lakh Sriramarangapur–Orvai package).',
      locationName: 'Primary Health Centre, Orvai',
    },
    kn: {
      title: 'ವೈದ್ಯಕೀಯ ಪೀಠೋಪಕರಣಗಳು — ಓರ್ವಾಯಿ ಪ್ರಾ.ಆ.ಕೇ.',
      shortDescription:
        'ಓರ್ವಾಯಿ ಪ್ರಾಥಮಿಕ ಆರೋಗ್ಯ ಕೇಂದ್ರಕ್ಕೆ ವೈದ್ಯಕೀಯ ಪೀಠೋಪಕರಣಗಳಿಗೆ ₹29.5 ಲಕ್ಷ ಮಂಜೂರು (ಶ್ರೀರಾಮರಂಗಾಪುರ–ಓರ್ವಾಯಿ ₹59 ಲಕ್ಷ ಪ್ಯಾಕೇಜ್‌ನ ಪಾಲು).',
      locationName: 'ಪ್ರಾಥಮಿಕ ಆರೋಗ್ಯ ಕೇಂದ್ರ, ಓರ್ವಾಯಿ',
    },
  },

  // --- Social welfare / SC-ST development ---
  {
    slug: 'sc-post-metric-student-hostel',
    category: 'PUBLIC_SERVICES',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: crore(5.5),
    spent: spentNinetyPercent(crore(5.5)),
    department: 'Social Welfare Department',
    agency: 'Kalyana Karnataka Region Development Board',
    startDaysAgo: 480,
    completionDaysAgo: 60,
    imagePrefix: 'sc-post-metric-hostel',
    areaEn: 'Kampli Constituency',
    areaKn: 'ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'SC post-metric student hostel',
      shortDescription:
        'Post-metric student hostel for Scheduled Castes — ₹5.50 crore from the Kalyana Karnataka Region Development Board.',
      locationName: 'SC post-metric student hostel',
    },
    kn: {
      title: 'ಪರಿಶಿಷ್ಟ ವರ್ಗಗಳ ಮೆಟ್ರಿಕ್ ನಂತರದ ವಿದ್ಯಾರ್ಥಿ ನಿಲಯ',
      shortDescription:
        'ಪರಿಶಿಷ್ಟ ವರ್ಗಗಳ ಮೆಟ್ರಿಕ್‌ ನಂತರದ ವಿದ್ಯಾರ್ಥಿ ನಿಲಯಕ್ಕೆ ₹5.50 ಕೋಟಿ ಕಲ್ಯಾಣ ಕರ್ನಾಟಕ ಪ್ರದೇಶ ಅಭಿವೃದ್ಧಿ ಮಂಡಳಿಯಿಂದ.',
      locationName: 'ಪರಿಶಿಷ್ಟ ವರ್ಗಗಳ ಮೆಟ್ರಿಕ್ ನಂತರದ ವಿದ್ಯಾರ್ಥಿ ನಿಲಯ',
    },
  },
  {
    slug: 'sc-st-colonies-electricity-infrastructure',
    category: 'PUBLIC_SERVICES',
    projectStatus: 'IN_PROGRESS',
    featured: false,
    budget: crore(2),
    spent: spentNinetyPercent(crore(2)),
    department: 'Social Welfare Department',
    agency: 'Social Welfare Department',
    startDaysAgo: 180,
    completionDaysAgo: null,
    imagePrefix: 'sc-st-colonies-infra',
    areaEn: 'SC/ST colonies, Kampli Constituency',
    areaKn: 'ಪರಿಶಿಷ್ಟ ವರ್ಗಗಳ ಕಾಲೊನಿಗಳು, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Electricity & infrastructure — SC/ST colonies',
      shortDescription:
        'Electricity and basic infrastructure works in SC/ST colonies across the constituency — ₹2 crore grant.',
      locationName: 'SC/ST colonies, Kampli Constituency',
    },
    kn: {
      title: 'ವಿದ್ಯುತ್/ಮೂಲಸೌಕರ್ಯ — ಪರಿಶಿಷ್ಟ ವರ್ಗಗಳ ಕಾಲೊನಿಗಳು',
      shortDescription:
        'ಕ್ಷೇತ್ರದ ವಿವಿಧ SC/ST ಕಾಲೊನಿಗಳಲ್ಲಿ ವಿದ್ಯುತ್/ಮೂಲಸೌಕರ್ಯ ಕಾಮಗಾರಿಗಳಿಗೆ ₹2 ಕೋಟಿ ಅನುದಾನ.',
      locationName: 'ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರದ ಪರಿಶಿಷ್ಟ ವರ್ಗಗಳ ಕಾಲೊನಿಗಳು',
    },
  },
  {
    slug: 'kampli-valmiki-community-hall',
    category: 'PUBLIC_SERVICES',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(1.5),
    spent: spentNinetyPercent(crore(1.5)),
    department: 'Social Welfare Department',
    agency: 'Social Welfare Department',
    startDaysAgo: 360,
    completionDaysAgo: 50,
    imagePrefix: 'kampli-valmiki-hall',
    areaEn: 'Kampli town, Kampli Constituency',
    areaKn: 'ಕಂಪ್ಲಿ ಪಟ್ಟಣ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Valmiki community hall — Kampli',
      shortDescription:
        'Valmiki community hall in Kampli town — ₹1.50 crore.',
      locationName: 'Valmiki community hall, Kampli',
    },
    kn: {
      title: 'ವಾಲ್ಮೀಕಿ ಸಮುದಾಯ ಭವನ — ಕಂಪ್ಲಿ',
      shortDescription:
        'ಕಂಪ್ಲಿಯಲ್ಲಿ ವಾಲ್ಮೀಕಿ ಸಮುದಾಯ ಭವನಕ್ಕೆ ₹1.50 ಕೋಟಿ.',
      locationName: 'ವಾಲ್ಮೀಕಿ ಸಮುದಾಯ ಭವನ, ಕಂಪ್ಲಿ',
    },
  },
  {
    slug: 'kurugodu-valmiki-community-hall',
    category: 'PUBLIC_SERVICES',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(2),
    spent: spentNinetyPercent(crore(2)),
    department: 'Social Welfare Department',
    agency: 'Social Welfare Department',
    startDaysAgo: 350,
    completionDaysAgo: 48,
    imagePrefix: 'kurugodu-valmiki-hall',
    areaEn: 'Kurugodu town, Kampli Constituency',
    areaKn: 'ಕುರುಗೋಡು ಪಟ್ಟಣ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Valmiki community hall — Kurugodu',
      shortDescription:
        'Valmiki community hall in Kurugodu town — ₹2 crore.',
      locationName: 'Valmiki community hall, Kurugodu',
    },
    kn: {
      title: 'ವಾಲ್ಮೀಕಿ ಸಮುದಾಯ ಭವನ — ಕುರುಗೋಡು',
      shortDescription:
        'ಕುರುಗೋಡು ಪಟ್ಟಣದಲ್ಲಿ ವಾಲ್ಮೀಕಿ ಸಮುದಾಯ ಭವನಕ್ಕೆ ₹2 ಕೋಟಿ.',
      locationName: 'ವಾಲ್ಮೀಕಿ ಸಮುದಾಯ ಭವನ, ಕುರುಗೋಡು',
    },
  },
  {
    slug: 'kampli-ambedkar-community-hall',
    category: 'PUBLIC_SERVICES',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(1.59),
    spent: spentNinetyPercent(crore(1.59)),
    department: 'Social Welfare Department',
    agency: 'Social Welfare Department',
    startDaysAgo: 340,
    completionDaysAgo: 45,
    imagePrefix: 'kampli-ambedkar-hall',
    areaEn: 'Kampli town, Kampli Constituency',
    areaKn: 'ಕಂಪ್ಲಿ ಪಟ್ಟಣ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Dr. B.R. Ambedkar community hall — Kampli',
      shortDescription:
        'Taluk-level Dr. B.R. Ambedkar community hall in Kampli — about ₹1.59 crore.',
      locationName: 'Dr. B.R. Ambedkar community hall, Kampli',
    },
    kn: {
      title: 'ಡಾ.ಬಿ.ಆರ್. ಅಂಬೇಡ್ಕರ್ ಸಮುದಾಯ ಭವನ — ಕಂಪ್ಲಿ',
      shortDescription:
        'ಕಂಪ್ಲಿಯಲ್ಲಿ ತಾಲೂಕು ಮಟ್ಟದ ಡಾ.ಬಿ.ಆರ್. ಅಂಬೇಡ್ಕರ್ ಸಮುದಾಯ ಭವನಕ್ಕೆ ಸುಮಾರು ₹1.59 ಕೋಟಿ.',
      locationName: 'ಡಾ.ಬಿ.ಆರ್. ಅಂಬೇಡ್ಕರ್ ಸಮುದಾಯ ಭವನ, ಕಂಪ್ಲಿ',
    },
  },
  {
    slug: 'kurugodu-ambedkar-community-hall',
    category: 'PUBLIC_SERVICES',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(2.9),
    spent: spentNinetyPercent(crore(2.9)),
    department: 'Social Welfare Department',
    agency: 'Social Welfare Department',
    startDaysAgo: 330,
    completionDaysAgo: 42,
    imagePrefix: 'kurugodu-ambedkar-hall',
    areaEn: 'Kurugodu town, Kampli Constituency',
    areaKn: 'ಕುರುಗೋಡು ಪಟ್ಟಣ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Dr. B.R. Ambedkar community hall — Kurugodu',
      shortDescription:
        'Dr. B.R. Ambedkar community hall in Kurugodu — about ₹2.90 crore.',
      locationName: 'Dr. B.R. Ambedkar community hall, Kurugodu',
    },
    kn: {
      title: 'ಡಾ.ಬಿ.ಆರ್. ಅಂಬೇಡ್ಕರ್ ಸಮುದಾಯ ಭವನ — ಕುರುಗೋಡು',
      shortDescription:
        'ಕುರುಗೋಡಿನಲ್ಲಿ ಡಾ.ಬಿ.ಆರ್. ಅಂಬೇಡ್ಕರ್ ಸಮುದಾಯ ಭವನಕ್ಕೆ ಸುಮಾರು ₹2.90 ಕೋಟಿ.',
      locationName: 'ಡಾ.ಬಿ.ಆರ್. ಅಂಬೇಡ್ಕರ್ ಸಮುದಾಯ ಭವನ, ಕುರುಗೋಡು',
    },
  },
  {
    slug: 'mosque-kabristan-development',
    category: 'PUBLIC_SERVICES',
    projectStatus: 'PLANNED',
    featured: false,
    budget: crore(4),
    spent: null,
    department: 'Minority Welfare Department',
    agency: 'Minority Welfare Department',
    startDaysAgo: null,
    completionDaysAgo: null,
    imagePrefix: 'mosque-kabristan',
    areaEn: 'Kampli Constituency',
    areaKn: 'ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Mosque and kabristan development',
      shortDescription:
        'Development grant for mosques and kabristans across the constituency — ₹4 crore sanctioned.',
      locationName: 'Mosques and kabristans, Kampli Constituency',
    },
    kn: {
      title: 'ಮಸೀದಿ ಮತ್ತು ಖಬರಸ್ತಾನಗಳ ಅಭಿವೃದ್ಧಿ',
      shortDescription:
        'ಮಸೀದಿ ಮತ್ತು ಖಬರಸ್ತಾನಗಳ ಅಭಿವೃದ್ಧಿಗೆ ₹4 ಕೋಟಿ ಅನುದಾನ ಮಂಜೂರು.',
      locationName: 'ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರದ ಮಸೀದಿ ಮತ್ತು ಖಬರಸ್ತಾನಗಳು',
    },
  },

  // --- Backward classes welfare / community halls ---
  {
    slug: 'kurugodu-community-hall',
    category: 'PUBLIC_SERVICES',
    projectStatus: 'IN_PROGRESS',
    featured: false,
    budget: crore(2.5),
    spent: spentNinetyPercent(crore(2.5)),
    department: 'Backward Classes Welfare Department',
    agency: 'Backward Classes Welfare Department',
    startDaysAgo: 160,
    completionDaysAgo: null,
    imagePrefix: 'kurugodu-community-hall',
    areaEn: 'Kurugodu town, Kampli Constituency',
    areaKn: 'ಕುರುಗೋಡು ಪಟ್ಟಣ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Community hall — Kurugodu',
      shortDescription:
        'Community hall in Kurugodu town — ₹2.50 crore.',
      locationName: 'Community hall, Kurugodu town',
    },
    kn: {
      title: 'ಸಮುದಾಯ ಭವನ — ಕುರುಗೋಡು',
      shortDescription:
        'ಕುರುಗೋಡು ಪಟ್ಟಣದಲ್ಲಿ ಒಂದು ಸಮುದಾಯ ಭವನಕ್ಕೆ ₹2.50 ಕೋಟಿ.',
      locationName: 'ಸಮುದಾಯ ಭವನ, ಕುರುಗೋಡು ಪಟ್ಟಣ',
    },
  },
  {
    slug: 'kampli-gangamata-community-hall',
    category: 'PUBLIC_SERVICES',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(1),
    spent: spentNinetyPercent(crore(1)),
    department: 'Backward Classes Welfare Department',
    agency: 'Backward Classes Welfare Department',
    startDaysAgo: 300,
    completionDaysAgo: 40,
    imagePrefix: 'kampli-gangamata-hall',
    areaEn: 'Kampli town, Kampli Constituency',
    areaKn: 'ಕಂಪ್ಲಿ ಪಟ್ಟಣ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Gangamata community hall — Kampli',
      shortDescription:
        'Gangamata community hall in Kampli town — ₹1 crore.',
      locationName: 'Gangamata community hall, Kampli',
    },
    kn: {
      title: 'ಗಂಗಮತ ಸಮುದಾಯ ಭವನ — ಕಂಪ್ಲಿ',
      shortDescription:
        'ಕಂಪ್ಲಿ ಪಟ್ಟಣದಲ್ಲಿ ಗಂಗಮತ ಸಮುದಾಯ ಭವನಕ್ಕೆ ₹1 ಕೋಟಿ.',
      locationName: 'ಗಂಗಮತ ಸಮುದಾಯ ಭವನ, ಕಂಪ್ಲಿ',
    },
  },
  {
    slug: 'kurugodu-bhovi-community-hall',
    category: 'PUBLIC_SERVICES',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(2),
    spent: spentNinetyPercent(crore(2)),
    department: 'Backward Classes Welfare Department',
    agency: 'Backward Classes Welfare Department',
    startDaysAgo: 290,
    completionDaysAgo: 38,
    imagePrefix: 'kurugodu-bhovi-hall',
    areaEn: 'Kurugodu town, Kampli Constituency',
    areaKn: 'ಕುರುಗೋಡು ಪಟ್ಟಣ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Bhovi community hall — Kurugodu',
      shortDescription:
        'Bhovi community hall in Kurugodu town — ₹2 crore.',
      locationName: 'Bhovi community hall, Kurugodu',
    },
    kn: {
      title: 'ಭೋವಿ ಸಮುದಾಯ ಭವನ — ಕುರುಗೋಡು',
      shortDescription:
        'ಕುರುಗೋಡು ಪಟ್ಟಣದಲ್ಲಿ ಭೋವಿ ಸಮುದಾಯ ಭವನಕ್ಕೆ ₹2 ಕೋಟಿ.',
      locationName: 'ಭೋವಿ ಸಮುದಾಯ ಭವನ, ಕುರುಗೋಡು',
    },
  },
  {
    slug: 'kurugodu-golla-community-hall',
    category: 'PUBLIC_SERVICES',
    projectStatus: 'PLANNED',
    featured: false,
    budget: lakh(50),
    spent: null,
    department: 'Backward Classes Welfare Department',
    agency: 'Backward Classes Welfare Department',
    startDaysAgo: null,
    completionDaysAgo: null,
    imagePrefix: 'kurugodu-golla-hall',
    areaEn: 'Kurugodu town, Kampli Constituency',
    areaKn: 'ಕುರುಗೋಡು ಪಟ್ಟಣ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Golla community hall — Kurugodu',
      shortDescription:
        'Golla community hall in Kurugodu town — ₹50 lakh sanctioned.',
      locationName: 'Golla community hall, Kurugodu',
    },
    kn: {
      title: 'ಗೊಲ್ಲ ಸಮುದಾಯ ಭವನ — ಕುರುಗೋಡು',
      shortDescription:
        'ಕುರುಗೋಡು ಪಟ್ಟಣದಲ್ಲಿ ಗೊಲ್ಲ ಸಮುದಾಯ ಭವನಕ್ಕೆ ₹50 ಲಕ್ಷ ಮಂಜೂರು.',
      locationName: 'ಗೊಲ್ಲ ಸಮುದಾಯ ಭವನ, ಕುರುಗೋಡು',
    },
  },
  {
    slug: 'kurugodu-nekar-community-hall',
    category: 'PUBLIC_SERVICES',
    projectStatus: 'PLANNED',
    featured: false,
    budget: lakh(50),
    spent: null,
    department: 'Backward Classes Welfare Department',
    agency: 'Backward Classes Welfare Department',
    startDaysAgo: null,
    completionDaysAgo: null,
    imagePrefix: 'kurugodu-nekar-hall',
    areaEn: 'Kurugodu town, Kampli Constituency',
    areaKn: 'ಕುರುಗೋಡು ಪಟ್ಟಣ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Nekar (weavers) community hall — Kurugodu',
      shortDescription:
        'Nekar (weavers) community hall in Kurugodu town — ₹50 lakh sanctioned.',
      locationName: 'Nekar community hall, Kurugodu',
    },
    kn: {
      title: 'ನೇಕಾರ ಸಮುದಾಯ ಭವನ — ಕುರುಗೋಡು',
      shortDescription:
        'ಕುರುಗೋಡು ಪಟ್ಟಣದಲ್ಲಿ ನೇಕಾರ ಸಮುದಾಯ ಭವನಕ್ಕೆ ₹50 ಲಕ್ಷ ಮಂಜೂರು.',
      locationName: 'ನೇಕಾರ ಸಮುದಾಯ ಭವನ, ಕುರುಗೋಡು',
    },
  },

  // --- Agriculture / APMC ---
  {
    slug: 'kurugodu-apmc-cc-road',
    category: 'AGRICULTURE',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(2.5),
    spent: spentNinetyPercent(crore(2.5)),
    department: 'Agriculture Marketing',
    agency: 'APMC Kurugodu',
    startDaysAgo: 280,
    completionDaysAgo: 35,
    imagePrefix: 'kurugodu-apmc-cc-road',
    areaEn: 'Kurugodu APMC yard, Kampli Constituency',
    areaKn: 'ಕುರುಗೋಡು ಎಪಿಎಂಸಿ ಆವರಣ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'CC road — Kurugodu APMC yard',
      shortDescription:
        'Cement-concrete road construction inside the Kurugodu Agricultural Produce Market Committee yard — about ₹2.50 crore.',
      locationName: 'Kurugodu APMC yard',
    },
    kn: {
      title: 'ಸಿಸಿ ರಸ್ತೆ — ಕುರುಗೋಡು ಎಪಿಎಂಸಿ ಆವರಣ',
      shortDescription:
        'ಕುರುಗೋಡು ಕೃಷಿ ಉತ್ಪನ್ನ ಮಾರುಕಟ್ಟೆ ಸಮಿತಿ ಆವರಣದಲ್ಲಿ ಸುಮಾರು ₹2.50 ಕೋಟಿ ವೆಚ್ಚದಲ್ಲಿ ಸಿಸಿ ರಸ್ತೆ ನಿರ್ಮಾಣ.',
      locationName: 'ಕುರುಗೋಡು ಎಪಿಎಂಸಿ ಆವರಣ',
    },
  },

  // --- Public library ---
  {
    slug: 'constituency-12-digital-libraries',
    category: 'PUBLIC_SERVICES',
    projectStatus: 'IN_PROGRESS',
    featured: true,
    budget: crore(6),
    spent: spentNinetyPercent(crore(6)),
    department: 'Public Libraries',
    agency: 'Department of Public Libraries',
    startDaysAgo: 200,
    completionDaysAgo: null,
    imagePrefix: 'digital-libraries',
    areaEn: 'Gram Panchayat headquarters, Kampli Constituency',
    areaKn: 'ಗ್ರಾಮ ಪಂಚಾಯಿತಿ ಕೇಂದ್ರಗಳು, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: '12 digital libraries at Gram Panchayat centres',
      shortDescription:
        'Construction of 12 digital libraries at Gram Panchayat headquarters across the constituency — ₹6 crore grant.',
      locationName: 'Gram Panchayat centres, Kampli Constituency',
    },
    kn: {
      title: '12 ಡಿಜಿಟಲ್ ಗ್ರಂಥಾಲಯಗಳು — ಗ್ರಾಮ ಪಂಚಾಯಿತಿ ಕೇಂದ್ರಗಳು',
      shortDescription:
        'ಗ್ರಾಮ ಪಂಚಾಯಿತಿ ಕೇಂದ್ರ ಸ್ಥಾನಗಳಲ್ಲಿ 12 ಡಿಜಿಟಲ್ ಗ್ರಂಥಾಲಯಗಳ ನಿರ್ಮಾಣಕ್ಕೆ ₹6 ಕೋಟಿ ಅನುದಾನ.',
      locationName: 'ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರದ ಗ್ರಾಮ ಪಂಚಾಯಿತಿ ಕೇಂದ್ರಗಳು',
    },
  },

  // --- Police / Home Department ---
  {
    slug: 'kampli-fire-station',
    category: 'PUBLIC_SERVICES',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: crore(4),
    spent: spentNinetyPercent(crore(4)),
    department: 'Home Department',
    agency: 'Karnataka Fire & Emergency Services',
    startDaysAgo: 420,
    completionDaysAgo: 55,
    imagePrefix: 'kampli-fire-station',
    areaEn: 'Kampli town, Kampli Constituency',
    areaKn: 'ಕಂಪ್ಲಿ ಪಟ್ಟಣ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Fire station — Kampli',
      shortDescription:
        'Construction of a fire station in Kampli — estimated cost about ₹4 crore.',
      locationName: 'Fire station, Kampli',
    },
    kn: {
      title: 'ಅಗ್ನಿಶಾಮಕ ಠಾಣೆ — ಕಂಪ್ಲಿ',
      shortDescription:
        'ಕಂಪ್ಲಿಯಲ್ಲಿ ಅಗ್ನಿಶಾಮಕ ಠಾಣೆ ನಿರ್ಮಾಣಕ್ಕೆ ಸುಮಾರು ₹4 ಕೋಟಿ ಅಂದಾಜು ವೆಚ್ಚ.',
      locationName: 'ಅಗ್ನಿಶಾಮಕ ಠಾಣೆ, ಕಂಪ್ಲಿ',
    },
  },
  {
    slug: 'kampli-police-housing',
    category: 'PUBLIC_SERVICES',
    projectStatus: 'PLANNED',
    featured: false,
    budget: null,
    spent: null,
    department: 'Home Department',
    agency: 'Karnataka State Police',
    startDaysAgo: null,
    completionDaysAgo: null,
    imagePrefix: 'kampli-police-housing',
    areaEn: 'Kampli town, Kampli Constituency',
    areaKn: 'ಕಂಪ್ಲಿ ಪಟ್ಟಣ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Police staff housing — Kampli',
      shortDescription:
        'Proposal submitted for construction of police staff housing in Kampli; published sanction amount not available.',
      locationName: 'Police housing, Kampli',
    },
    kn: {
      title: 'ಪೊಲೀಸ್ ವಸತಿ ಗೃಹಗಳು — ಕಂಪ್ಲಿ',
      shortDescription:
        'ಕಂಪ್ಲಿಯಲ್ಲಿ ಪೊಲೀಸ್ ವಸತಿ ಗೃಹಗಳ ನಿರ್ಮಾಣಕ್ಕೆ ಪ್ರಸ್ತಾವನೆ ಸಲ್ಲಿಸಲಾಗಿದೆ; ಪ್ರಕಟಿತ ಅನುದಾನ ಮೊತ್ತ ಲಭ್ಯವಿಲ್ಲ.',
      locationName: 'ಪೊಲೀಸ್ ವಸತಿ, ಕಂಪ್ಲಿ',
    },
  },

  // --- Taluk Panchayat / government buildings ---
  {
    slug: 'kampli-taluk-panchayat-building',
    category: 'INFRASTRUCTURE',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(1.6),
    spent: spentNinetyPercent(crore(1.6)),
    department: 'Rural Development & Panchayat Raj',
    agency: 'Taluk Panchayat',
    startDaysAgo: 380,
    completionDaysAgo: 50,
    imagePrefix: 'kampli-taluk-panchayat',
    areaEn: 'Kampli taluk headquarters',
    areaKn: 'ಕಂಪ್ಲಿ ತಾಲೂಕು ಕೇಂದ್ರ',
    en: {
      title: 'Taluk Panchayat building — Kampli',
      shortDescription:
        'Taluk Panchayat building at the new Kampli taluk centre — ₹1.60 crore (share of the ₹3.20 crore Kampli–Kurugodu package).',
      locationName: 'Taluk Panchayat, Kampli',
    },
    kn: {
      title: 'ತಾಲೂಕು ಪಂಚಾಯಿತಿ ಕಟ್ಟಡ — ಕಂಪ್ಲಿ',
      shortDescription:
        'ಕಂಪ್ಲಿ ನೂತನ ತಾಲೂಕು ಕೇಂದ್ರದಲ್ಲಿ ತಾಲೂಕು ಪಂಚಾಯಿತಿ ಕಟ್ಟಡ ನಿರ್ಮಾಣಕ್ಕೆ ₹1.60 ಕೋಟಿ (ಕಂಪ್ಲಿ–ಕುರುಗೋಡು ₹3.20 ಕೋಟಿ ಪ್ಯಾಕೇಜ್‌ನ ಪಾಲು).',
      locationName: 'ತಾಲೂಕು ಪಂಚಾಯಿತಿ, ಕಂಪ್ಲಿ',
    },
  },
  {
    slug: 'kurugodu-taluk-panchayat-building',
    category: 'INFRASTRUCTURE',
    projectStatus: 'PLANNED',
    featured: false,
    budget: crore(1.6),
    spent: null,
    department: 'Rural Development & Panchayat Raj',
    agency: 'Taluk Panchayat',
    startDaysAgo: null,
    completionDaysAgo: null,
    imagePrefix: 'kurugodu-taluk-panchayat',
    areaEn: 'Kurugodu taluk headquarters',
    areaKn: 'ಕುರುಗೋಡು ತಾಲೂಕು ಕೇಂದ್ರ',
    en: {
      title: 'Taluk Panchayat building — Kurugodu',
      shortDescription:
        'Taluk Panchayat building at the new Kurugodu taluk centre — ₹1.60 crore sanctioned (share of the ₹3.20 crore Kampli–Kurugodu package).',
      locationName: 'Taluk Panchayat, Kurugodu',
    },
    kn: {
      title: 'ತಾಲೂಕು ಪಂಚಾಯಿತಿ ಕಟ್ಟಡ — ಕುರುಗೋಡು',
      shortDescription:
        'ಕುರುಗೋಡು ನೂತನ ತಾಲೂಕು ಕೇಂದ್ರದಲ್ಲಿ ತಾಲೂಕು ಪಂಚಾಯಿತಿ ಕಟ್ಟಡ ನಿರ್ಮಾಣಕ್ಕೆ ₹1.60 ಕೋಟಿ ಮಂಜೂರು (ಕಂಪ್ಲಿ–ಕುರುಗೋಡು ₹3.20 ಕೋಟಿ ಪ್ಯಾಕೇಜ್‌ನ ಪಾಲು).',
      locationName: 'ತಾಲೂಕು ಪಂಚಾಯಿತಿ, ಕುರುಗೋಡು',
    },
  },

  // --- Tourism ---
  {
    slug: 'kampli-somappa-temple-community-hall',
    category: 'PUBLIC_SERVICES',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(1),
    spent: spentNinetyPercent(crore(1)),
    department: 'Tourism Department',
    agency: 'Tourism Department',
    startDaysAgo: 310,
    completionDaysAgo: 40,
    imagePrefix: 'somappa-temple-hall',
    areaEn: 'Somappa temple, Kampli town',
    areaKn: 'ಸೋಮಪ್ಪ ದೇವಸ್ಥಾನ, ಕಂಪ್ಲಿ ಪಟ್ಟಣ',
    en: {
      title: 'Community hall — historic Somappa temple, Kampli',
      shortDescription:
        'Community hall at the historic Somappa temple in Kampli — ₹1 crore grant.',
      locationName: 'Somappa temple campus, Kampli',
    },
    kn: {
      title: 'ಸಮುದಾಯ ಭವನ — ಐತಿಹಾಸಿಕ ಸೋಮಪ್ಪ ದೇವಸ್ಥಾನ, ಕಂಪ್ಲಿ',
      shortDescription:
        'ಕಂಪ್ಲಿಯ ಐತಿಹಾಸಿಕ ಸೋಮಪ್ಪ ದೇವಸ್ಥಾನಕ್ಕೆ ಸಮುದಾಯ ಭವನ ನಿರ್ಮಾಣಕ್ಕೆ ₹1 ಕೋಟಿ ಅನುದಾನ.',
      locationName: 'ಸೋಮಪ್ಪ ದೇವಸ್ಥಾನ ಆವರಣ, ಕಂಪ್ಲಿ',
    },
  },

  // --- Labour welfare ---
  {
    slug: 'kurugodu-labour-welfare-residential-school',
    category: 'EDUCATION',
    projectStatus: 'IN_PROGRESS',
    featured: true,
    budget: crore(44),
    spent: spentNinetyPercent(crore(44)),
    department: 'Labour Department',
    agency: 'Labour Welfare Department',
    startDaysAgo: 220,
    completionDaysAgo: null,
    imagePrefix: 'labour-residential-school',
    areaEn: 'Kurugodu area, Kampli Constituency',
    areaKn: 'ಕುರುಗೋಡು ವ್ಯಾಪ್ತಿ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Labour welfare residential school — Kurugodu',
      shortDescription:
        'Residential school under the Labour Welfare Department in the Kurugodu area — 4.50 acres reserved, about ₹44 crore sanctioned.',
      locationName: 'Labour welfare residential school, Kurugodu area',
    },
    kn: {
      title: 'ಕಾರ್ಮಿಕ ಕಲ್ಯಾಣ ವಸತಿ ಶಾಲೆ — ಕುರುಗೋಡು',
      shortDescription:
        'ಕುರುಗೋಡು ವ್ಯಾಪ್ತಿಯಲ್ಲಿ ಕಾರ್ಮಿಕ ಕಲ್ಯಾಣ ಇಲಾಖೆಯಿಂದ ವಸತಿ ಶಾಲೆ ನಿರ್ಮಾಣಕ್ಕಾಗಿ 4.50 ಎಕರೆ ಜಾಗ ಕಾಯ್ದಿರಿಸಿ, ಸುಮಾರು ₹44 ಕೋಟಿ ಅನುದಾನ ಮಂಜೂರು.',
      locationName: 'ಕಾರ್ಮಿಕ ಕಲ್ಯಾಣ ವಸತಿ ಶಾಲೆ, ಕುರುಗೋಡು ವ್ಯಾಪ್ತಿ',
    },
  },

  // --- Municipal / urban infrastructure ---
  {
    slug: 'kurugodu-municipality-infrastructure',
    category: 'PUBLIC_SERVICES',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: crore(76.09),
    spent: spentNinetyPercent(crore(76.09)),
    department: 'Urban Development',
    agency: 'Kurugodu Municipality',
    startDaysAgo: 480,
    completionDaysAgo: 50,
    imagePrefix: 'kurugodu-municipality',
    areaEn: 'Kurugodu Municipality, Kampli Constituency',
    areaKn: 'ಕುರುಗೋಡು ಪುರಸಭೆ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Kurugodu municipality infrastructure development',
      shortDescription:
        'Infrastructure development within Kurugodu Municipality limits — ₹76.09 crore.',
      locationName: 'Kurugodu Municipality limits',
    },
    kn: {
      title: 'ಕುರುಗೋಡು ಪುರಸಭೆ ಮೂಲಸೌಕರ್ಯ ಅಭಿವೃದ್ಧಿ',
      shortDescription: 'ಕುರುಗೋಡು ಪುರಸಭೆ ವ್ಯಾಪ್ತಿಯ ಮೂಲಸೌಕರ್ಯ ಅಭಿವೃದ್ಧಿಗೆ ₹76.09 ಕೋಟಿ.',
      locationName: 'ಕುರುಗೋಡು ಪುರಸಭೆ ವ್ಯಾಪ್ತಿ',
    },
  },
  {
    slug: 'kampli-municipality-infrastructure',
    category: 'PUBLIC_SERVICES',
    projectStatus: 'COMPLETED',
    featured: true,
    budget: crore(43.79),
    spent: spentNinetyPercent(crore(43.79)),
    department: 'Urban Development',
    agency: 'Kampli Municipality',
    startDaysAgo: 460,
    completionDaysAgo: 45,
    imagePrefix: 'kampli-municipality',
    areaEn: 'Kampli Municipality, Kampli Constituency',
    areaKn: 'ಕಂಪ್ಲಿ ಪುರಸಭೆ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Kampli municipality infrastructure development',
      shortDescription:
        'Infrastructure development within Kampli Municipality limits — ₹43.79 crore.',
      locationName: 'Kampli Municipality limits',
    },
    kn: {
      title: 'ಕಂಪ್ಲಿ ಪುರಸಭೆ ಮೂಲಸೌಕರ್ಯ ಅಭಿವೃದ್ಧಿ',
      shortDescription: 'ಕಂಪ್ಲಿ ಪುರಸಭೆ ವ್ಯಾಪ್ತಿಯ ಮೂಲಸೌಕರ್ಯ ಅಭಿವೃದ್ಧಿಗೆ ₹43.79 ಕೋಟಿ.',
      locationName: 'ಕಂಪ್ಲಿ ಪುರಸಭೆ ವ್ಯಾಪ್ತಿ',
    },
  },

  // --- Drainage / sewerage ---
  {
    slug: 'kampli-sewage-treatment-plant',
    category: 'ENVIRONMENT',
    projectStatus: 'IN_PROGRESS',
    featured: true,
    budget: crore(35),
    spent: spentNinetyPercent(crore(35)),
    department: 'Urban Development',
    agency: 'Kampli Municipality',
    startDaysAgo: 180,
    completionDaysAgo: null,
    imagePrefix: 'kampli-stp',
    areaEn: 'Kampli town, Kampli Constituency',
    areaKn: 'ಕಂಪ್ಲಿ ಪಟ್ಟಣ, ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ',
    en: {
      title: 'Sewage treatment plant (STP) — Kampli',
      shortDescription: 'Sewage treatment plant (STP) in Kampli — ₹35 crore.',
      locationName: 'Sewage treatment plant, Kampli',
    },
    kn: {
      title: 'ಒಳಚರಂಡಿ ನೀರು ಸಂಸ್ಕರಣಾ ಘಟಕ (STP) — ಕಂಪ್ಲಿ',
      shortDescription: 'ಕಂಪ್ಲಿಯಲ್ಲಿ ಒಳಚರಂಡಿ ನೀರು ಸಂಸ್ಕರಣಾ ಘಟಕ (STP) ನಿರ್ಮಾಣಕ್ಕೆ ₹35 ಕೋಟಿ.',
      locationName: 'ಒಳಚರಂಡಿ ನೀರು ಸಂಸ್ಕರಣಾ ಘಟಕ, ಕಂಪ್ಲಿ',
    },
  },

  // --- Forest / environment ---
  {
    slug: 'kampli-tree-park',
    category: 'ENVIRONMENT',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(1),
    spent: spentNinetyPercent(crore(1)),
    department: 'Forest Department',
    agency: 'Forest Department',
    startDaysAgo: 260,
    completionDaysAgo: 30,
    imagePrefix: 'kampli-tree-park',
    areaEn: 'Kampli taluk',
    areaKn: 'ಕಂಪ್ಲಿ ತಾಲೂಕು',
    en: {
      title: 'Tree park development — Kampli taluk',
      shortDescription:
        'Tree park development in Kampli taluk — ₹1 crore (share of the ₹2 crore Kampli–Kurugodu grant).',
      locationName: 'Tree park, Kampli taluk',
    },
    kn: {
      title: 'ಟ್ರೀ ಪಾರ್ಕ್ ಅಭಿವೃದ್ಧಿ — ಕಂಪ್ಲಿ ತಾಲೂಕು',
      shortDescription:
        'ಕಂಪ್ಲಿ ತಾಲೂಕಿನಲ್ಲಿ ಟ್ರೀ ಪಾರ್ಕ್ ಅಭಿವೃದ್ಧಿಗೆ ₹1 ಕೋಟಿ (ಕಂಪ್ಲಿ–ಕುರುಗೋಡು ₹2 ಕೋಟಿ ಅನುದಾನದ ಪಾಲು).',
      locationName: 'ಟ್ರೀ ಪಾರ್ಕ್, ಕಂಪ್ಲಿ ತಾಲೂಕು',
    },
  },
  {
    slug: 'kurugodu-tree-park',
    category: 'ENVIRONMENT',
    projectStatus: 'COMPLETED',
    featured: false,
    budget: crore(1),
    spent: spentNinetyPercent(crore(1)),
    department: 'Forest Department',
    agency: 'Forest Department',
    startDaysAgo: 250,
    completionDaysAgo: 28,
    imagePrefix: 'kurugodu-tree-park',
    areaEn: 'Kurugodu taluk',
    areaKn: 'ಕುರುಗೋಡು ತಾಲೂಕು',
    en: {
      title: 'Tree park development — Kurugodu taluk',
      shortDescription:
        'Tree park development in Kurugodu taluk — ₹1 crore (share of the ₹2 crore Kampli–Kurugodu grant).',
      locationName: 'Tree park, Kurugodu taluk',
    },
    kn: {
      title: 'ಟ್ರೀ ಪಾರ್ಕ್ ಅಭಿವೃದ್ಧಿ — ಕುರುಗೋಡು ತಾಲೂಕು',
      shortDescription:
        'ಕುರುಗೋಡು ತಾಲೂಕಿನಲ್ಲಿ ಟ್ರೀ ಪಾರ್ಕ್ ಅಭಿವೃದ್ಧಿಗೆ ₹1 ಕೋಟಿ (ಕಂಪ್ಲಿ–ಕುರುಗೋಡು ₹2 ಕೋಟಿ ಅನುದಾನದ ಪಾಲು).',
      locationName: 'ಟ್ರೀ ಪಾರ್ಕ್, ಕುರುಗೋಡು ತಾಲೂಕು',
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

  const project = await prisma.project.upsert({
    where: {
      organizationId_slug_locale: {
        organizationId,
        slug: work.slug,
        locale,
      },
    },
    create: {
      organizationId,
      locale,
      slug: work.slug,
      title: copy.title,
      shortDescription: copy.shortDescription,
      descriptionHtml: copy.descriptionHtml,
      category: work.category,
      area: copy.area,
      locationName: copy.locationName,
      startDate: work.startDaysAgo === null ? null : daysAgo(work.startDaysAgo),
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
      costCurrency: work.budget === null ? null : 'INR',
      beneficiaryCount: null,
      coverImageId,
      featured: work.featured,
      displayOrder,
      status: 'PUBLISHED',
      publishedAt: daysAgo(Math.max(1, 40 - displayOrder)),
      metaTitle: copy.title,
      metaDescription: copy.shortDescription.slice(0, 300),
    },
    update: {
      title: copy.title,
      shortDescription: copy.shortDescription,
      descriptionHtml: copy.descriptionHtml,
      category: work.category,
      area: copy.area,
      locationName: copy.locationName,
      startDate: work.startDaysAgo === null ? null : daysAgo(work.startDaysAgo),
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
      costCurrency: work.budget === null ? null : 'INR',
      coverImageId,
      featured: work.featured,
      displayOrder,
      status: 'PUBLISHED',
      publishedAt: daysAgo(Math.max(1, 40 - displayOrder)),
      metaTitle: copy.title,
      metaDescription: copy.shortDescription.slice(0, 300),
    },
    select: { id: true },
  });

  await prisma.projectMedia.deleteMany({ where: { projectId: project.id } });
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
 * Deletes every project row, then seeds Kampli works (roads, water, education,
 * health, welfare, agriculture, environment, etc.; EN + KN) with AI cover /
 * before / after images for each organisation.
 */
export async function replaceDemoWorks(prisma: Prisma, orgs: readonly DemoOrgRef[]): Promise<void> {
  // Media join rows first — avoids FK issues if cascade is not configured.
  const mediaDeleted = await prisma.projectMedia.deleteMany({});
  console.log(`Removed ${mediaDeleted.count} project media row(s).`);
  const deleted = await prisma.project.deleteMany({});
  console.log(`Removed ${deleted.count} existing project row(s).`);

  for (const org of orgs) {
    for (const [index, work] of WORKS.entries()) {
      console.log(`[${org.slug}] ${index + 1}/${WORKS.length} ${work.slug}`);
      const prefix = work.imagePrefix;
      const coverImageId = await uploadImage(
        prisma,
        org.id,
        `work-${prefix}-cover`,
        `${work.en.title} cover`,
      );
      const beforeImageId = await uploadImage(
        prisma,
        org.id,
        `work-${prefix}-before`,
        `${work.en.title} before`,
      );
      const afterImageId = await uploadImage(
        prisma,
        org.id,
        `work-${prefix}-after`,
        `${work.en.title} after`,
      );

      await createLocaleProject(prisma, {
        organizationId: org.id,
        locale: 'en',
        work,
        copy: {
          ...work.en,
          area: work.areaEn,
          descriptionHtml: explanationEn(
            `${work.en.shortDescription} Compare the before and after photographs above.`,
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
          area: work.areaKn,
          descriptionHtml: explanationKn(
            `${work.kn.shortDescription} ಮೇಲಿನ ಮೊದಲು ಮತ್ತು ನಂತರದ ಛಾಯಾಚಿತ್ರಗಳನ್ನು ಹೋಲಿಸಬಹುದು.`,
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

    console.log(`Seeded ${WORKS.length} works (en + kn) with media for "${org.slug}".`);
  }
}

async function main(): Promise<void> {
  await import('dotenv/config');
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

    console.log(
      `Seeding ${WORKS.length} works × 2 locales for ${orgs.length} org(s): ${orgs.map((o) => o.slug).join(', ')}`,
    );

    const areaBySlug: Record<string, { area: string; areaKn: string }> = {
      'demo-campaign': { area: 'Kampli Constituency', areaKn: 'ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ' },
      'demo-campaign-two': { area: 'Kampli Constituency', areaKn: 'ಕಂಪ್ಲಿ ಕ್ಷೇತ್ರ' },
    };

    await replaceDemoWorks(
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

if (process.argv[1] && /seedWorks\.(ts|js|mts|cjs)$/.test(process.argv[1])) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
