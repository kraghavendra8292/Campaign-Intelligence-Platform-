import { describe, expect, it } from 'vitest';
import { sanitizeCorrelationId } from './ids';
import { slugify, truncate } from './strings';
import { REDACTED, isSensitiveKey, redactSensitive } from './redaction';
import { withTimeout } from './time';

describe('slugify', () => {
  it('produces url-safe tenant slugs', () => {
    expect(slugify('North District Campaign')).toBe('north-district-campaign');
    expect(slugify('  Rao & Co.  ')).toBe('rao-co');
  });

  it('strips diacritics rather than dropping the letter', () => {
    expect(slugify('Café Ward')).toBe('cafe-ward');
  });
});

describe('truncate', () => {
  it('leaves short strings untouched and ellipsises long ones', () => {
    expect(truncate('hello', 10)).toBe('hello');
    // The ellipsis occupies the final slot, so the result is exactly maxLength.
    expect(truncate('hello world', 8)).toBe('hello w…');
    expect(truncate('hello world', 8)).toHaveLength(8);
  });

  it('does not leave a dangling space before the ellipsis', () => {
    expect(truncate('hello world', 7)).toBe('hello…');
  });
});

describe('sanitizeCorrelationId', () => {
  it('accepts safe ids and rejects injection attempts', () => {
    expect(sanitizeCorrelationId('abc-123_XYZ')).toBe('abc-123_XYZ');
    expect(sanitizeCorrelationId('bad\nvalue')).toBeNull();
    expect(sanitizeCorrelationId('x'.repeat(200))).toBeNull();
    expect(sanitizeCorrelationId(42)).toBeNull();
  });
});

describe('redaction', () => {
  it('flags sensitive keys regardless of casing or separators', () => {
    expect(isSensitiveKey('DATABASE_URL')).toBe(true);
    expect(isSensitiveKey('X-Api-Key')).toBe(true);
    expect(isSensitiveKey('accessToken')).toBe(true);
    expect(isSensitiveKey('displayName')).toBe(false);
  });

  it('redacts nested secrets but keeps safe fields', () => {
    const redacted = redactSensitive({
      email: 'person@example.com',
      password: 'placeholder-value',
      nested: { accessToken: 'placeholder-value', label: 'keep' },
    });

    expect(redacted.password).toBe(REDACTED);
    expect(redacted.nested.accessToken).toBe(REDACTED);
    expect(redacted.nested.label).toBe('keep');
    expect(redacted.email).toBe('person@example.com');
  });

  it('survives circular references', () => {
    const node: Record<string, unknown> = { name: 'root' };
    node.self = node;
    expect(() => redactSensitive(node)).not.toThrow();
  });
});

describe('withTimeout', () => {
  it('rejects when the inner promise never settles', async () => {
    await expect(withTimeout(new Promise(() => {}), 10, 'too slow')).rejects.toThrow('too slow');
  });

  it('resolves when the inner promise wins', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok');
  });
});
