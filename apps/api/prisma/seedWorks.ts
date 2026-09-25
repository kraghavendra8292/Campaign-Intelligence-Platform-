/**
 * Kampli constituency works seed (roads, water & irrigation, education).
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
  category: 'INFRASTRUCTURE' | 'WATER' | 'EDUCATION';
  projectStatus: 'COMPLETED' | 'IN_PROGRESS' | 'PLANNED';
  featured: boolean;
  /** Sanctioned / approved budget in INR (whole rupees). */
  budget: number;
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

function explanationEn(body: string, spent: number | null, budget: number): string {
  const spentLine =
    spent === null
      ? `<p><strong>Sanctioned budget:</strong> ₹${budget.toLocaleString('en-IN')}.</p>`
      : `<p><strong>Approved budget:</strong> ₹${budget.toLocaleString('en-IN')}. <strong>Amount spent:</strong> ₹${spent.toLocaleString('en-IN')}.</p>`;
  return `<!--spent:${spent ?? 0}--><p>${body}</p>${spentLine}`;
}

function explanationKn(body: string, spent: number | null, budget: number): string {
  const spentLine =
    spent === null
      ? `<p><strong>ಮಂಜೂರಾದ ಅನುದಾನ:</strong> ₹${budget.toLocaleString('en-IN')}.</p>`
      : `<p><strong>ಅನುಮೋದಿತ ಬಜೆಟ್:</strong> ₹${budget.toLocaleString('en-IN')}. <strong>ಖರ್ಚು ಮೊತ್ತ:</strong> ₹${spent.toLocaleString('en-IN')}.</p>`;
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
      costCurrency: 'INR',
      beneficiaryCount: null,
      coverImageId,
      featured: work.featured,
      displayOrder,
      status: 'PUBLISHED',
      publishedAt: daysAgo(40 - displayOrder),
      metaTitle: copy.title,
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
 * Deletes every project row, then seeds Kampli works (roads, water, education;
 * EN + KN) with AI cover / before / after images for each organisation.
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
