/**
 * Phase 5 categories and demo submissions.
 *
 * TWO DIFFERENT KINDS OF DATA LIVE HERE, and the distinction matters.
 *
 * `seedIssueCategories` is REAL configuration. Every organisation needs a
 * category vocabulary for the public form to work at all, so it runs in every
 * environment including production.
 *
 * `seedDemoIssues` is FICTION, and runs only where demo content does. Every
 * submission, name, phone number and address below is invented. None of it
 * describes a real person, a real complaint or a real place. The contact
 * details use the reserved `example.test` domain and the reserved `+91 90000
 * 00000` style number so they cannot dial or mail anybody.
 *
 * Nothing here records, implies or enables any judgement about the politics of
 * the fictional people who supposedly sent these.
 */
import { DEFAULT_ISSUE_CATEGORIES, type SubmissionType } from '@rk/types';
import type { PrismaClient } from '../src/generated/prisma/client';
import { generateReferenceNumber } from '../src/modules/issues/shared/issueGuards';

type Prisma = PrismaClient;

/**
 * Kannada labels for the default categories.
 *
 * Phase 3 established that the public site is bilingual, so the form's category
 * list has to be too - an English-only dropdown on an otherwise Kannada page is
 * where a citizen gives up.
 */
const CATEGORY_KN: Record<string, string> = {
  ROADS: 'ರಸ್ತೆಗಳು',
  WATER: 'ನೀರು ಸರಬರಾಜು',
  DRAINAGE: 'ಚರಂಡಿ',
  ELECTRICITY: 'ವಿದ್ಯುತ್',
  SANITATION: 'ನೈರ್ಮಲ್ಯ ಮತ್ತು ತ್ಯಾಜ್ಯ',
  HEALTHCARE: 'ಆರೋಗ್ಯ',
  EDUCATION: 'ಶಿಕ್ಷಣ',
  TRANSPORT: 'ಸಾರಿಗೆ',
  PUBLIC_SAFETY: 'ಸಾರ್ವಜನಿಕ ಸುರಕ್ಷತೆ',
  AGRICULTURE: 'ಕೃಷಿ',
  EMPLOYMENT: 'ಉದ್ಯೋಗ',
  GOVERNMENT_SERVICES: 'ಸರ್ಕಾರಿ ಸೇವೆಗಳು',
  ENVIRONMENT: 'ಪರಿಸರ',
  OTHER: 'ಇತರೆ',
};

/**
 * Gives every organisation the default category vocabulary.
 *
 * Idempotent by `(organizationId, key)`, and it only CREATES - an existing row
 * is left alone so a campaign that renamed or deactivated a category does not
 * have that undone by the next deploy.
 */
export async function seedIssueCategories(prisma: Prisma): Promise<void> {
  const organizations = await prisma.organization.findMany({ select: { id: true, slug: true } });

  for (const organization of organizations) {
    for (const [index, category] of DEFAULT_ISSUE_CATEGORIES.entries()) {
      await prisma.issueCategory.upsert({
        where: {
          organizationId_key: { organizationId: organization.id, key: category.key },
        },
        update: {},
        create: {
          organizationId: organization.id,
          key: category.key,
          label: category.label,
          labelKn: CATEGORY_KN[category.key] ?? null,
          displayOrder: index,
        },
      });
    }
  }

  console.log(
    `Seeded ${DEFAULT_ISSUE_CATEGORIES.length} issue categories for ${organizations.length} organisation(s).`,
  );
}

interface DemoIssue {
  readonly type: SubmissionType;
  readonly title: string;
  readonly description: string;
  readonly categoryKey: string;
  readonly ward: string;
  readonly locality: string;
  readonly status:
    'SUBMITTED' | 'UNDER_REVIEW' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  readonly priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  readonly moderationStatus: 'PENDING_REVIEW' | 'APPROVED';
  readonly daysAgo: number;
  /** Fictional contact details, or null for an anonymous submission. */
  readonly contact: { name: string; phone: string; email: string } | null;
}

const DEMO_ISSUES: readonly DemoIssue[] = [
  {
    type: 'ISSUE',
    title: 'Road damage near the 12th Main junction (DEMO)',
    description:
      'DEMO CONTENT. The road surface has broken up near the junction and water collects there after rain. Two-wheelers are having to swerve into the opposite lane.',
    categoryKey: 'ROADS',
    ward: 'Ward 12',
    locality: '12th Main Road',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    moderationStatus: 'APPROVED',
    daysAgo: 12,
    contact: {
      name: 'A. Demo Resident',
      phone: '+91 90000 00001',
      email: 'resident1@example.test',
    },
  },
  {
    type: 'ISSUE',
    title: 'Water supply interrupted for three days (DEMO)',
    description:
      'DEMO CONTENT. There has been no piped supply in our street since Monday. Neighbours are collecting from the community tap.',
    categoryKey: 'WATER',
    ward: 'Ward 12',
    locality: 'Gandhi Nagar',
    status: 'ACKNOWLEDGED',
    priority: 'URGENT',
    moderationStatus: 'APPROVED',
    daysAgo: 9,
    contact: {
      name: 'B. Demo Resident',
      phone: '+91 90000 00002',
      email: 'resident2@example.test',
    },
  },
  {
    type: 'COMPLAINT',
    title: 'Drainage overflow beside the market (DEMO)',
    description:
      'DEMO CONTENT. The drain beside the vegetable market overflows every evening and the smell is affecting the shops.',
    categoryKey: 'DRAINAGE',
    ward: 'Ward 8',
    locality: 'Market Road',
    status: 'UNDER_REVIEW',
    priority: 'HIGH',
    moderationStatus: 'APPROVED',
    daysAgo: 7,
    // Anonymous on purpose: the dashboard must show how a submission with no
    // contact details renders, and the tests assert the contact block is
    // genuinely absent rather than merely redacted.
    contact: null,
  },
  {
    type: 'ISSUE',
    title: 'Street lights not working on the approach road (DEMO)',
    description:
      'DEMO CONTENT. Four street lights on the approach road have been out for about two weeks. It is dark near the school gate.',
    categoryKey: 'ELECTRICITY',
    ward: 'Ward 8',
    locality: 'School Road',
    status: 'SUBMITTED',
    priority: 'MEDIUM',
    moderationStatus: 'PENDING_REVIEW',
    daysAgo: 4,
    contact: null,
  },
  {
    type: 'SUGGESTION',
    title: 'Add a bus shelter at the north stop (DEMO)',
    description:
      'DEMO CONTENT. Many people wait at the north stop in the sun. A simple shelter would help older passengers.',
    categoryKey: 'TRANSPORT',
    ward: 'Ward 12',
    locality: 'North Stop',
    status: 'UNDER_REVIEW',
    priority: 'LOW',
    moderationStatus: 'APPROVED',
    daysAgo: 3,
    contact: {
      name: 'C. Demo Resident',
      phone: '+91 90000 00003',
      email: 'resident3@example.test',
    },
  },
  {
    type: 'FEEDBACK',
    title: 'Thank you for the new library books (DEMO)',
    description:
      'DEMO CONTENT. The children in our area are using the new books at the school library. Wanted to share that it is appreciated.',
    categoryKey: 'EDUCATION',
    ward: 'Ward 12',
    locality: 'School Road',
    status: 'CLOSED',
    priority: 'LOW',
    moderationStatus: 'APPROVED',
    daysAgo: 20,
    contact: null,
  },
  {
    type: 'ISSUE',
    title: 'Waste not collected on the side lane (DEMO)',
    description:
      'DEMO CONTENT. Collection has missed the side lane for several days and bins are overflowing onto the footpath.',
    categoryKey: 'SANITATION',
    ward: 'Ward 5',
    locality: 'Side Lane',
    status: 'RESOLVED',
    priority: 'MEDIUM',
    moderationStatus: 'APPROVED',
    daysAgo: 16,
    contact: {
      name: 'D. Demo Resident',
      phone: '+91 90000 00004',
      email: 'resident4@example.test',
    },
  },
  {
    type: 'ISSUE',
    title: 'Broken footpath slab outside the clinic (DEMO)',
    description:
      'DEMO CONTENT. A slab outside the clinic entrance has lifted and people using walking sticks are struggling.',
    categoryKey: 'PUBLIC_SAFETY',
    ward: 'Ward 5',
    locality: 'Clinic Road',
    status: 'SUBMITTED',
    priority: 'HIGH',
    moderationStatus: 'PENDING_REVIEW',
    daysAgo: 1,
    contact: null,
  },
];

function daysAgo(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(10, 30, 0, 0);
  return date;
}

export async function seedDemoIssues(prisma: Prisma): Promise<void> {
  const organization = await prisma.organization.findUnique({
    where: { slug: 'demo-campaign' },
    select: { id: true, slug: true },
  });

  // Only the first demo organisation receives submissions. The second is left
  // empty on purpose: it is what the tenant-isolation test asserts against, and
  // it exercises the "no submissions yet" empty state.
  if (!organization) return;

  // Idempotent at the organisation level: re-running must not append a second
  // set and double every number on the demo dashboard.
  const existing = await prisma.issue.count({ where: { organizationId: organization.id } });
  if (existing > 0) {
    console.log(`Demo submissions already present for "${organization.slug}".`);
    return;
  }

  const categories = await prisma.issueCategory.findMany({
    where: { organizationId: organization.id },
    select: { id: true, key: true },
  });
  const categoryByKey = new Map(categories.map((row) => [row.key, row.id]));

  // Attributes a few submissions to a seeded QR code, so the source breakdown
  // has something in it and the Phase 4 → Phase 5 link is visible in the demo.
  const qrCode = await prisma.qrCode.findFirst({
    where: { organizationId: organization.id },
    select: { id: true, campaignId: true },
  });

  for (const [index, demo] of DEMO_ISSUES.entries()) {
    const submittedAt = daysAgo(demo.daysAgo);
    const viaQr = qrCode !== null && index % 3 === 0;
    const hasContact = demo.contact !== null;

    const issue = await prisma.issue.create({
      data: {
        organizationId: organization.id,
        referenceNumber: generateReferenceNumber(demo.type, submittedAt),
        type: demo.type,
        title: demo.title,
        description: demo.description,
        categoryId: categoryByKey.get(demo.categoryKey) ?? null,
        status: demo.status,
        priority: demo.priority,
        moderationStatus: demo.moderationStatus,
        source: viaQr ? 'QR' : 'DIRECT_WEBSITE',
        campaignId: viaQr ? qrCode.campaignId : null,
        qrCodeId: viaQr ? qrCode.id : null,
        ward: demo.ward,
        locality: demo.locality,
        area: 'North District',
        isAnonymous: !hasContact,
        contactName: demo.contact?.name ?? null,
        contactPhone: demo.contact?.phone ?? null,
        contactEmail: demo.contact?.email ?? null,
        consentGiven: hasContact,
        consentAt: hasContact ? submittedAt : null,
        submittedAt,
        createdAt: submittedAt,
        resolvedAt: demo.status === 'RESOLVED' ? daysAgo(Math.max(0, demo.daysAgo - 4)) : null,
        closedAt: demo.status === 'CLOSED' ? daysAgo(Math.max(0, demo.daysAgo - 6)) : null,
      },
      select: { id: true },
    });

    // Every submission opens its timeline with the citizen's own event, so the
    // demo history looks like a real one rather than starting mid-story.
    await prisma.issueHistory.create({
      data: {
        organizationId: organization.id,
        issueId: issue.id,
        action: 'SUBMITTED',
        newStatus: 'SUBMITTED',
        createdAt: submittedAt,
      },
    });

    if (demo.status !== 'SUBMITTED') {
      await prisma.issueHistory.create({
        data: {
          organizationId: organization.id,
          issueId: issue.id,
          action: 'STATUS_CHANGED',
          previousStatus: 'SUBMITTED',
          newStatus: demo.status,
          createdAt: daysAgo(Math.max(0, demo.daysAgo - 1)),
        },
      });
    }
  }

  console.log(`Seeded ${DEMO_ISSUES.length} DEMO submissions for "${organization.slug}".`);
}
