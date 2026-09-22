import { hash, verify, type Algorithm } from '@node-rs/argon2';
import { getEnv } from '../../config/env';
import { AppError } from '../../errors/AppError';

/**
 * Password hashing and policy.
 *
 * Argon2id is used rather than bcrypt: it is memory-hard, so an attacker with
 * GPUs gains far less than against bcrypt, and it is the current OWASP
 * recommendation. `@node-rs/argon2` ships prebuilt binaries, so there is no
 * node-gyp toolchain requirement on developer machines or in CI.
 *
 * Parameters follow OWASP's recommended Argon2id baseline (19 MiB, t=2, p=1).
 */
/**
 * `Algorithm` is an ambient const enum, which `verbatimModuleSyntax` forbids
 * reading at runtime, so the value is written literally. 2 is Argon2id
 * (0 = Argon2d, 1 = Argon2i) and the type annotation keeps it honest.
 */
const ARGON2ID: Algorithm = 2;

const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * A dummy hash used to equalise timing when an account does not exist.
 *
 * Without it, "unknown email" returns markedly faster than "wrong password",
 * which lets an attacker enumerate accounts despite an identical message.
 * Generated once at first use, from a value that is never a real password.
 */
let dummyHashPromise: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hash('not-a-real-password-used-only-to-equalise-timing', ARGON2_OPTIONS);
  return dummyHashPromise;
}

export const passwordService = {
  /** Hashes a plaintext password. The plaintext is never retained or logged. */
  async hashPassword(plaintext: string): Promise<string> {
    return hash(plaintext, ARGON2_OPTIONS);
  },

  /**
   * Verifies a password against a stored digest.
   *
   * Returns false rather than throwing on a malformed digest, so a corrupted
   * row cannot turn into a 500 that distinguishes it from a wrong password.
   */
  async verifyPassword(digest: string, plaintext: string): Promise<boolean> {
    try {
      return await verify(digest, plaintext, ARGON2_OPTIONS);
    } catch {
      return false;
    }
  },

  /**
   * Burns roughly the same time as a real verification.
   *
   * Called on the "no such user" and "user has no password set" paths so the
   * response time does not reveal which case occurred.
   */
  async simulateVerification(plaintext: string): Promise<void> {
    try {
      await verify(await getDummyHash(), plaintext, ARGON2_OPTIONS);
    } catch {
      // Intentionally ignored: this call exists only to consume time.
    }
  },

  /**
   * Applies the configured password policy.
   *
   * Deliberately length-first rather than a character-class maze: NIST 800-63B
   * found composition rules push users toward predictable substitutions while
   * length is what actually resists guessing. An upper bound exists because
   * Argon2 cost scales with input and an unbounded password is a cheap DoS.
   */
  assertPolicy(plaintext: string): void {
    const env = getEnv();
    const problems: string[] = [];

    if (plaintext.length < env.PASSWORD_MIN_LENGTH) {
      problems.push(`must be at least ${env.PASSWORD_MIN_LENGTH} characters`);
    }

    if (plaintext.length > env.PASSWORD_MAX_LENGTH) {
      problems.push(`must be at most ${env.PASSWORD_MAX_LENGTH} characters`);
    }

    if (plaintext.trim().length === 0) {
      problems.push('must not be blank');
    }

    if (/^(.)\1*$/.test(plaintext)) {
      problems.push('must not be a single repeated character');
    }

    if (problems.length > 0) {
      // `details` carries the rule that failed, never the submitted value.
      throw AppError.validation(`Password ${problems.join(', ')}.`, {
        details: { field: 'password', rules: problems },
      });
    }
  },
};
