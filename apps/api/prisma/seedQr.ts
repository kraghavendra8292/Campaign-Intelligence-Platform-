/**
 * Phase 4 demo QR campaigns.
 *
 * ALL OF THIS IS FICTIONAL. The campaigns, codes, wards and scan events are
 * invented so the dashboard has something to draw. None of it describes a real
 * campaign, a real location, or - most importantly - a real person.
 *
 * THE SCAN EVENTS ARE SYNTHETIC. They are generated from a seeded pseudo-random
 * distribution, not collected from anyone. Nothing here is evidence of how any
 * real outreach performed, and the demo data is labelled so it cannot be
 * mistaken for a measurement.
 *
 * Every generated row carries only what a real scan would: coarse device class,
 * a UTC time bucket, and a foreign key to the code. No visit hash is generated,
 * because there is no visitor to hash - which also means the demo dashboard
 * honestly reports its unique estimate as unavailable rather than inventing one.
 */
import type { PrismaClient } from '../src/generated/prisma/client';
import { generateQrCodeIdentifier } from '../src/modules/qr/shared/qrGuards';

type Prisma = PrismaClient;

interface DemoCode {
  readonly name: string;
  readonly destinationPath: string;
  readonly source: string;
  readonly placement: string;
  readonly ward: string;
  readonly area: string;
  /** Relative popularity, used to shape the synthetic distribution. */
  readonly weight: number;
  readonly status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
}

interface DemoCampaign {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly campaignType:
    | 'POSTER'
    | 'PAMPHLET'
    | 'BANNER'
    | 'EVENT'
    | 'SOCIAL_MEDIA'
    | 'OFFICE'
    | 'DOOR_TO_DOOR'
    | 'OTHER';
  readonly status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
  readonly codes: readonly DemoCode[];
}

const DEMO_CAMPAIGNS: readonly DemoCampaign[] = [
  {
    slug: 'ward-12-development-awareness',
    name: 'Ward 12 Development Awareness (DEMO)',
    description:
      'DEMO CONTENT. Fictional QR campaign used to demonstrate channel analytics. Not a real campaign.',
    campaignType: 'POSTER',
    status: 'ACTIVE',
    codes: [
      {
        name: '12th Main Road Poster (DEMO)',
        destinationPath: '/work',
        source: 'Poster',
        placement: 'Bus shelter, 12th Main Road',
        ward: 'Ward 12',
        area: 'North District',
        weight: 38,
        status: 'ACTIVE',
      },
      {
        name: '12th Main Road Pamphlet (DEMO)',
        destinationPath: '/achievements',
        source: 'Pamphlet',
        placement: 'Door-to-door distribution',
        ward: 'Ward 12',
        area: 'North District',
        weight: 27,
        status: 'ACTIVE',
      },
      {
        name: 'Public Meeting QR (DEMO)',
        destinationPath: '/events',
        source: 'Event',
        placement: 'Community hall entrance',
        ward: 'Ward 12',
        area: 'North District',
        weight: 21,
        status: 'ACTIVE',
      },
      {
        name: 'Community Office QR (DEMO)',
        destinationPath: '/contact',
        source: 'Office',
        placement: 'Reception desk',
        ward: 'Ward 8',
        area: 'North District',
        weight: 14,
        status: 'ACTIVE',
      },
      {
        // Paused on purpose: the demo dashboard should show the inactive state,
        // and the redirect tests need a code that does not redirect.
        name: 'Old Banner QR — paused (DEMO)',
        destinationPath: '/',
        source: 'Banner',
        placement: 'Retired banner site',
        ward: 'Ward 8',
        area: 'North District',
        weight: 0,
        status: 'PAUSED',
      },
    ],
  },
  {
    slug: 'water-supply-information-drive',
    name: 'Water Supply Information Drive (DEMO)',
    description: 'DEMO CONTENT. A second fictional campaign, so campaigns can be compared.',
    campaignType: 'PAMPHLET',
    status: 'ACTIVE',
    codes: [
      {
        name: 'Water Points Pamphlet (DEMO)',
        destinationPath: '/work',
        source: 'Pamphlet',
        placement: 'Distributed at water points',
        ward: 'Ward 5',
        area: 'South Ward',
        weight: 22,
        status: 'ACTIVE',
      },
      {
        name: 'Water Office Notice (DEMO)',
        destinationPath: '/news',
        source: 'Office',
        placement: 'Notice board',
        ward: 'Ward 5',
        area: 'South Ward',
        weight: 9,
        status: 'ACTIVE',
      },
    ],
  },
];

/**
 * Deterministic pseudo-random generator.
 *
 * Seeded so re-running the seed produces the same demo dashboard. A dashboard
 * whose numbers change on every seed is impossible to write documentation or a
 * screenshot against.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hours weighted towards the evening.
 *
 * Shaped so the time-of-day chart shows a plausible pattern rather than a flat
 * line - people look at a poster on the way home, not at 3am. It is a shape for
 * a demo, not a finding about anybody.
 */
const HOUR_WEIGHTS = [1, 1, 1, 1, 1, 2, 4, 7, 9, 9, 8, 8, 9, 9, 8, 8, 10, 14, 18, 17, 13, 8, 4, 2];

function weightedHour(random: () => number): number {
  const total = HOUR_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
  let target = random() * total;
  for (let hour = 0; hour < HOUR_WEIGHTS.length; hour += 1) {
    target -= HOUR_WEIGHTS[hour] as number;
    if (target <= 0) return hour;
  }
  return 18;
}

const DEVICE_MIX = [
  { device: 'MOBILE' as const, os: 'ANDROID' as const, share: 0.68 },
  { device: 'MOBILE' as const, os: 'IOS' as const, share: 0.21 },
  { device: 'TABLET' as const, os: 'ANDROID' as const, share: 0.03 },
  { device: 'DESKTOP' as const, os: 'WINDOWS' as const, share: 0.06 },
  { device: 'UNKNOWN' as const, os: 'UNKNOWN' as const, share: 0.02 },
];

function pickDevice(random: () => number) {
  let target = random();
  for (const entry of DEVICE_MIX) {
    target -= entry.share;
    if (target <= 0) return entry;
  }
  return DEVICE_MIX[0] as (typeof DEVICE_MIX)[number];
}

/** Days of synthetic history. Enough to fill a 30-day chart with shape. */
const HISTORY_DAYS = 45;

export async function seedDemoQrCampaigns(prisma: Prisma): Promise<void> {
  const organizations = await prisma.organization.findMany({
    where: { slug: { in: ['demo-campaign', 'demo-campaign-two'] } },
    select: { id: true, slug: true },
  });

  for (const organization of organizations) {
    // Only the first demo organisation gets QR campaigns. The second is left
    // empty on purpose: it is what the tenant-isolation test asserts against,
    // and it also exercises the "no campaigns yet" empty state.
    if (organization.slug !== 'demo-campaign') continue;

    for (const [campaignIndex, demo] of DEMO_CAMPAIGNS.entries()) {
      const campaign = await prisma.qrCampaign.upsert({
        where: { organizationId_slug: { organizationId: organization.id, slug: demo.slug } },
        update: {},
        create: {
          organizationId: organization.id,
          slug: demo.slug,
          name: demo.name,
          description: demo.description,
          campaignType: demo.campaignType,
          status: demo.status,
          startDate: new Date(Date.now() - HISTORY_DAYS * 86_400_000),
        },
        select: { id: true, slug: true },
      });

      // Idempotency is by campaign: re-running must not append a second set of
      // codes and double every number on the demo dashboard.
      const existing = await prisma.qrCode.count({ where: { campaignId: campaign.id } });
      if (existing > 0) continue;

      const random = mulberry32(1000 + campaignIndex);

      for (const code of demo.codes) {
        const created = await prisma.qrCode.create({
          data: {
            organizationId: organization.id,
            campaignId: campaign.id,
            code: generateQrCodeIdentifier(),
            name: code.name,
            description: 'DEMO CONTENT.',
            destinationPath: code.destinationPath,
            status: code.status,
            activatedAt: new Date(Date.now() - HISTORY_DAYS * 86_400_000),
            source: code.source,
            placement: code.placement,
            ward: code.ward,
            area: code.area,
            utmSource: 'qr',
            utmMedium: demo.campaignType.toLowerCase(),
            utmCampaign: demo.slug,
            utmContent: code.source.toLowerCase(),
          },
          select: { id: true, destinationPath: true },
        });

        if (code.weight === 0) continue;

        const events: Array<{
          organizationId: string;
          campaignId: string;
          qrCodeId: string;
          scannedAt: Date;
          scanDate: Date;
          scanHour: number;
          scanDayOfWeek: number;
          deviceCategory: 'MOBILE' | 'TABLET' | 'DESKTOP' | 'BOT' | 'UNKNOWN';
          osCategory: 'IOS' | 'ANDROID' | 'WINDOWS' | 'MACOS' | 'LINUX' | 'OTHER' | 'UNKNOWN';
          referrerCategory: 'DIRECT' | 'SEARCH' | 'SOCIAL' | 'MESSAGING' | 'OTHER';
          isAutomated: boolean;
          landingPath: string;
        }> = [];

        for (let dayOffset = HISTORY_DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
          // Weight plus noise, with a mild upward drift towards the present so
          // the trend line is not flat.
          const drift = 1 + (HISTORY_DAYS - dayOffset) / (HISTORY_DAYS * 2);
          const base = (code.weight / 10) * drift;
          const count = Math.max(0, Math.round(base + (random() - 0.4) * base));

          for (let i = 0; i < count; i += 1) {
            const hour = weightedHour(random);
            const day = new Date(Date.now() - dayOffset * 86_400_000);
            const scannedAt = new Date(
              Date.UTC(
                day.getUTCFullYear(),
                day.getUTCMonth(),
                day.getUTCDate(),
                hour,
                Math.floor(random() * 60),
              ),
            );

            const mix = pickDevice(random);
            // About one scan in twenty-five is a link-preview crawler, which is
            // realistic and lets the "exclude automated" toggle do something.
            const automated = random() < 0.04;

            events.push({
              organizationId: organization.id,
              campaignId: campaign.id,
              qrCodeId: created.id,
              scannedAt,
              scanDate: new Date(
                Date.UTC(
                  scannedAt.getUTCFullYear(),
                  scannedAt.getUTCMonth(),
                  scannedAt.getUTCDate(),
                ),
              ),
              scanHour: scannedAt.getUTCHours(),
              scanDayOfWeek: scannedAt.getUTCDay(),
              deviceCategory: automated ? 'BOT' : mix.device,
              osCategory: automated ? 'UNKNOWN' : mix.os,
              referrerCategory: 'DIRECT',
              isAutomated: automated,
              landingPath: created.destinationPath,
              // No visitHash: there is no visitor. The demo dashboard therefore
              // reports its unique estimate as unavailable, which is honest.
            });
          }
        }

        // Chunked so a large synthetic history does not exceed the parameter
        // limit of a single statement.
        for (let offset = 0; offset < events.length; offset += 500) {
          await prisma.qrScanEvent.createMany({ data: events.slice(offset, offset + 500) });
        }
      }
    }

    console.log(`Seeded DEMO QR campaigns for "${organization.slug}".`);
  }
}
