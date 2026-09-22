import { describe, expect, it } from 'vitest';
import { EnvValidationError } from '@rk/config';
import { buildEnvForTesting } from '../config/env';
import { buildRedirectUrl } from '../modules/qr/public/qrResolution.service';

const PROD_BASE = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@db.example.com/rk?sslmode=require',
  JWT_SECRET: 'x'.repeat(48),
  COOKIE_SECURE: 'true',
  CORS_ORIGINS: 'https://campaign.example.com',
  GRAPHQL_INTROSPECTION: 'false',
  AUTH_DEV_EXPOSE_TOKENS: 'false',
  PUBLIC_SITE_URL: 'https://campaign.example.com',
  PUBLIC_WEB_URL: 'https://campaign.example.com',
  QR_SCAN_BASE_URL: 'https://campaign.example.com',
  NOTIFICATION_LINK_BASE_URL: 'https://campaign.example.com',
  AI_ENABLED: 'false',
  NOTIFICATIONS_ENABLED: 'false',
} as const;

describe('buildRedirectUrl', () => {
  it('adds org and rk_qr for shared-host tenant resolution and attribution', () => {
    const url = new URL(
      buildRedirectUrl(
        'https://campaign.example.com',
        '/',
        { source: 'qr', medium: 'poster', campaign: 'ward-12', content: null },
        'RK-QR-7F3K9XQ2',
        'demo-campaign',
      ),
    );

    expect(url.origin).toBe('https://campaign.example.com');
    expect(url.pathname).toBe('/');
    expect(url.searchParams.get('org')).toBe('demo-campaign');
    expect(url.searchParams.get('rk_qr')).toBe('RK-QR-7F3K9XQ2');
    expect(url.searchParams.get('utm_source')).toBe('qr');
  });

  it('does not override an explicit org already on the destination path', () => {
    const url = new URL(
      buildRedirectUrl('https://campaign.example.com', '/?org=other', null, 'RK-QR-7F3K9XQ2', 'demo-campaign'),
    );
    expect(url.searchParams.get('org')).toBe('other');
  });
});

describe('production public URL hardening', () => {
  it('accepts a fully configured production env', () => {
    expect(() => buildEnvForTesting({ ...PROD_BASE })).not.toThrow();
  });

  it('rejects localhost QR_SCAN_BASE_URL in production', () => {
    expect(() =>
      buildEnvForTesting({
        ...PROD_BASE,
        QR_SCAN_BASE_URL: 'http://localhost:4000',
      }),
    ).toThrow(EnvValidationError);
  });

  it('uses RENDER_EXTERNAL_URL when QR_SCAN_BASE_URL is unset', () => {
    const env = buildEnvForTesting({
      ...PROD_BASE,
      QR_SCAN_BASE_URL: undefined,
      RENDER_EXTERNAL_URL: 'https://rk-api.onrender.com',
    });
    expect(env.QR_SCAN_BASE_URL).toBe('https://rk-api.onrender.com');
  });
});
