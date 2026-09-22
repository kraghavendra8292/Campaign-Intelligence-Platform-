#!/usr/bin/env node
/**
 * Environment doctor.
 *
 * Checks the things that most often stop a new developer from getting the
 * stack running, and prints the exact command to fix each one. Read-only: it
 * never modifies the working tree.
 *
 *   npm run doctor
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import net from 'node:net';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const results = [];

function record(status, label, detail) {
  results.push({ status, label, detail });
}

function ok(label, detail = '') {
  record('ok', label, detail);
}
function warn(label, detail) {
  record('warn', label, detail);
}
function fail(label, detail) {
  record('fail', label, detail);
}

/** Node version must satisfy the engines range in package.json. */
function checkNode() {
  const required = 20;
  const major = Number.parseInt(process.versions.node.split('.')[0], 10);

  if (major >= required) {
    ok(`Node.js ${process.versions.node}`);
  } else {
    fail(
      `Node.js ${process.versions.node}`,
      `Node ${required}+ is required. See .nvmrc for the version this repo targets.`,
    );
  }
}

/** Each app needs its own .env; the examples are committed, the .env files are not. */
function checkEnvFiles() {
  const targets = [
    ['.env', 'Docker Compose credentials'],
    ['apps/api/.env', 'API configuration'],
    ['apps/web/.env', 'Web configuration'],
    ['apps/mobile/.env', 'Mobile configuration'],
  ];

  for (const [relative, purpose] of targets) {
    const full = join(repoRoot, relative);
    if (existsSync(full)) {
      ok(`${relative} present`, purpose);
    } else {
      fail(`${relative} missing`, `Run: cp ${relative}.example ${relative}`);
    }
  }
}

/** The Prisma client is generated output and is not committed. */
function checkPrismaClient() {
  const generated = join(repoRoot, 'apps/api/src/generated/prisma');
  if (existsSync(generated)) {
    ok('Prisma client generated');
  } else {
    fail('Prisma client missing', 'Run: npm run db:generate');
  }
}

/** The token stylesheet is generated from tokens.ts and must not be stale. */
function checkDesignTokens() {
  const css = join(repoRoot, 'packages/design-tokens/src/tokens.generated.css');
  if (existsSync(css)) {
    ok('Design token CSS generated');
  } else {
    fail('Design token CSS missing', 'Run: npm run tokens:build');
  }
}

/**
 * Docker is optional: it only provisions the offline local database.
 * The project's PostgreSQL is hosted on Neon.
 */
function checkDocker() {
  try {
    const version = execFileSync('docker', ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    ok(`${version} (optional: only needed for the offline local database)`);
  } catch {
    ok('Docker not installed (optional - not needed when using Neon)');
  }
}

/** Reads a single variable out of apps/api/.env without loading dotenv. */
function readApiEnvVar(name) {
  const envPath = join(repoRoot, 'apps/api/.env');
  if (!existsSync(envPath)) return null;

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    if (trimmed.slice(0, separator).trim() === name) {
      return trimmed.slice(separator + 1).trim();
    }
  }
  return null;
}

function parseDbUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', 'host.docker.internal']);

/**
 * Validates the shape of the Neon configuration.
 *
 * Deliberately never prints the connection string, a password or a full
 * hostname - `npm run doctor` output gets pasted into issues and chat.
 */
function checkDatabaseConfig() {
  const pooled = readApiEnvVar('DATABASE_URL');
  const direct = readApiEnvVar('DATABASE_URL_UNPOOLED');

  if (!pooled) {
    fail('DATABASE_URL not set', 'Add your Neon connection string to apps/api/.env');
    return null;
  }

  const url = parseDbUrl(pooled);
  if (!url) {
    fail('DATABASE_URL is not a valid URL', 'Re-copy the connection string from the Neon console.');
    return null;
  }

  if (pooled.includes('USER:PASSWORD') || pooled.includes('ep-example-')) {
    fail(
      'DATABASE_URL is still the placeholder',
      'Replace it with your real Neon connection string in apps/api/.env',
    );
    return null;
  }

  const isLocal = LOCAL_HOSTS.has(url.hostname.toLowerCase());

  if (isLocal) {
    ok('DATABASE_URL points at a local database', 'Neon-specific checks skipped.');
    return url;
  }

  // TLS
  if (url.searchParams.has('sslmode')) {
    const mode = url.searchParams.get('sslmode');
    if (mode === 'verify-full') {
      ok('TLS: sslmode=verify-full');
    } else {
      warn(`TLS: sslmode=${mode}`, 'Prefer sslmode=verify-full - see apps/api/.env.example.');
    }
  } else {
    fail('DATABASE_URL has no sslmode', 'Append ?sslmode=verify-full&channel_binding=require');
  }

  // Pooled vs direct
  if (url.hostname.includes('-pooler')) {
    ok('DATABASE_URL uses the pooled endpoint');
  } else {
    warn(
      'DATABASE_URL is not the pooled endpoint',
      'Application traffic should use the Neon "-pooler" host.',
    );
  }

  if (!direct) {
    warn(
      'DATABASE_URL_UNPOOLED not set',
      'Migrations will fall back to DATABASE_URL. On Neon, set the direct (non "-pooler") string, or Prisma Migrate can fail.',
    );
  } else if (direct.includes('-pooler')) {
    fail(
      'DATABASE_URL_UNPOOLED points at the pooled endpoint',
      'It must be the DIRECT string - the hostname must not contain "-pooler".',
    );
  } else {
    ok('DATABASE_URL_UNPOOLED uses the direct endpoint');
  }

  return url;
}

/** TCP reachability of whatever host the connection string names. */
async function checkDatabaseReachable(url) {
  if (!url) return;

  const port = url.port ? Number.parseInt(url.port, 10) : 5432;
  const host = url.hostname;

  const reachable = await new Promise((resolveCheck) => {
    const socket = net.createConnection({ host, port, timeout: 5000 });
    socket.on('connect', () => {
      socket.destroy();
      resolveCheck(true);
    });
    socket.on('error', () => resolveCheck(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolveCheck(false);
    });
  });

  const isLocal = LOCAL_HOSTS.has(host.toLowerCase());
  // Only the port is shown; the hostname can identify a customer's project.
  const label = isLocal ? `${host}:${port}` : `the configured host on port ${port}`;

  if (reachable) {
    // TCP only. Neon's proxy accepts connections for any hostname under its
    // domain, so this proves the network path - not that the endpoint exists or
    // the credentials work. `npm run db:migrate` is the real check.
    ok(`Database host accepts TCP connections (${label})`, 'Credentials are not verified here.');
  } else if (isLocal) {
    warn(`Nothing listening on ${label}`, 'Run: npm run db:up   (then: npm run db:migrate)');
  } else {
    warn(
      `Could not open a TCP connection to ${label}`,
      'Check your network, the Neon project status, and any IP allow list.',
    );
  }
}

checkNode();
checkEnvFiles();
checkPrismaClient();
checkDesignTokens();
checkDocker();
await checkDatabaseReachable(checkDatabaseConfig());

const symbols = { ok: 'PASS', warn: 'WARN', fail: 'FAIL' };

console.log('\nRK Campaign Intelligence Platform - environment check\n');
for (const { status, label, detail } of results) {
  console.log(`  [${symbols[status]}] ${label}${detail ? `\n         ${detail}` : ''}`);
}

const failures = results.filter((entry) => entry.status === 'fail').length;
const warnings = results.filter((entry) => entry.status === 'warn').length;

console.log(`\n${failures} blocking issue(s), ${warnings} warning(s).\n`);

// Warnings alone must not fail the command: a developer running only the unit
// tests legitimately has no database up.
process.exitCode = failures > 0 ? 1 : 0;
