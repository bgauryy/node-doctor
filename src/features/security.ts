import * as semver from '../semver.js';
import type { EOLStatus, SecurityStatus } from '../types/index.js';

export interface ReleaseSchedule {
  [version: string]: {
    start: string;
    end: string;
    lts?: string;
    maintenance?: string;
    codename?: string;
  };
}

export interface DistRelease {
  version: string;
  date: string;
  files: string[];
  npm?: string;
  v8: string;
  uv?: string;
  zlib?: string;
  openssl?: string;
  modules?: string;
  lts: boolean | string;
  security: boolean;
}

let cachedSchedule: ReleaseSchedule | null = null;
let cachedDist: DistRelease[] | null = null;

// Allow URL overrides via environment variables for testing or corporate proxies
const SCHEDULE_URL = process.env.NODE_DOCTOR_SCHEDULE_URL ||
  'https://raw.githubusercontent.com/nodejs/Release/main/schedule.json';
const DIST_URL = process.env.NODE_DOCTOR_DIST_URL ||
  'https://nodejs.org/dist/index.json';
const FETCH_TIMEOUT_MS = 10000;

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(url: string, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch with retry logic and exponential backoff
 * @param url - URL to fetch
 * @param options - Fetch options
 * @param retries - Number of retries (default: 3)
 * @param backoffMs - Initial backoff in milliseconds (default: 1000)
 * @returns Response object
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries: number = 3,
  backoffMs: number = 1000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);

      // Success or client error (4xx) - don't retry
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      // Server error (5xx) - retry with backoff
      if (response.status >= 500 && attempt < retries - 1) {
        const delay = backoffMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (err) {
      lastError = err as Error;

      // Last attempt - throw the error
      if (attempt === retries - 1) {
        throw lastError;
      }

      // Wait with exponential backoff before retrying
      const delay = backoffMs * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Fetch Node.js Release Schedule (with retry logic)
 */
export async function fetchReleaseSchedule(): Promise<ReleaseSchedule | null> {
  if (cachedSchedule) return cachedSchedule;

  try {
    const response = await fetchWithRetry(SCHEDULE_URL);
    if (!response.ok) throw new Error(`Failed to fetch schedule: ${response.statusText}`);
    cachedSchedule = await response.json() as ReleaseSchedule;
    return cachedSchedule;
  } catch (error) {
    // Fail silently in production, just return null so we don't crash
    return null;
  }
}

/**
 * Fetch Node.js Distribution Index (with retry logic)
 */
export async function fetchDistIndex(): Promise<DistRelease[] | null> {
  if (cachedDist) return cachedDist;

  try {
    const response = await fetchWithRetry(DIST_URL);
    if (!response.ok) throw new Error(`Failed to fetch dist index: ${response.statusText}`);
    cachedDist = await response.json() as DistRelease[];
    return cachedDist;
  } catch (error) {
    return null;
  }
}

/**
 * Check if a Node.js version is EOL
 */
export function checkEOL(version: string, schedule: ReleaseSchedule): EOLStatus {
  const major = semver.major(version);
  const versionKey = `v${major}`;
  const release = schedule[versionKey];

  if (!release) {
    return { status: 'unknown' };
  }

  const now = new Date();
  const endDate = new Date(release.end);
  const maintenanceDate = release.maintenance ? new Date(release.maintenance) : null;

  if (now > endDate) {
    return {
      status: 'eol',
      eolDate: release.end,
      isLTS: !!release.lts
    };
  }

  if (maintenanceDate && now > maintenanceDate) {
    return {
      status: 'maintenance',
      maintenanceDate: release.maintenance,
      eolDate: release.end,
      isLTS: !!release.lts
    };
  }

  return {
    status: 'active',
    eolDate: release.end,
    isLTS: !!release.lts
  };
}

/**
 * Check if a version has known security vulnerabilities based on release index
 * Logic: If there is a newer version in the same major/minor line that is flagged as 'security',
 * then the current version is likely missing that fix.
 */
export function checkSecurity(version: string, allReleases: DistRelease[]): SecurityStatus {
  if (!semver.valid(version)) {
    return { vulnerable: false };
  }

  // Filter releases that are newer than current version
  const newerReleases = allReleases.filter(r => 
    semver.gt(r.version, version)
  );

  // Find if any newer release in the same major line is a security release
  const major = semver.major(version);
  
  // Find the closest security release that is newer than us
  // We sort by version ascending so we find the *next* security release
  const securityReleases = newerReleases
    .filter(r => semver.major(r.version) === major && r.security)
    .sort((a, b) => semver.compare(a.version, b.version));

  if (securityReleases.length > 0) {
    const next = securityReleases[0];
    
    return {
      vulnerable: true,
      latestSecurityRelease: next.version, // The immediate next fix
      details: `Newer security release available: ${next.version}`
    };
  }

  return { vulnerable: false };
}
