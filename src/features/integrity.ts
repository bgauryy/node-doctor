/**
 * Integrity Verification Feature
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import https from 'node:https';
import os from 'node:os';
import { c, bold, dim } from '../colors.js';
import { clearScreen, isWindows } from '../utils.js';
import { select } from '../prompts.js';
import { printHeader } from '../ui.js';
import type { AggregatedInstallation, IntegrityResult } from '../types/index.js';

const checksumCache: Record<string, string> = {};
const HTTPS_TIMEOUT_MS = 10000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

// Allow URL override via environment variable for testing or corporate proxies
const CHECKSUMS_BASE_URL = process.env.NODE_DOCTOR_CHECKSUMS_URL || 'https://nodejs.org/dist';

/**
 * Fetch checksums with retry logic and exponential backoff
 */
async function fetchChecksums(version: string): Promise<string> {
  if (checksumCache[version]) return checksumCache[version];

  const v = version.startsWith('v') ? version : `v${version}`;
  const url = `${CHECKSUMS_BASE_URL}/${v}/SHASUMS256.txt`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const data = await fetchChecksumsOnce(url);
      checksumCache[version] = data;
      return data;
    } catch (err) {
      lastError = err as Error;

      // Don't retry on 404 (version not found)
      if (lastError.message.includes('Status: 404')) {
        throw lastError;
      }

      // Wait with exponential backoff before retrying
      if (attempt < MAX_RETRIES - 1) {
        const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Single fetch attempt for checksums
 */
function fetchChecksumsOnce(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Failed to fetch checksums (Status: ${res.statusCode})`));
      }

      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', (err) => reject(err));
    });

    // Set request timeout
    req.setTimeout(HTTPS_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(`Request timed out after ${HTTPS_TIMEOUT_MS}ms`));
    });

    req.on('error', (err) => reject(err));
  });
}

function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

export async function checkIntegrity(inst: AggregatedInstallation): Promise<IntegrityResult> {
  try {
    const version = inst.verified || inst.version;
    const v = version.startsWith('v') ? version : `v${version}`;

    const shasums = await fetchChecksums(version);
    const localHash = await calculateFileHash(inst.executable);

    let expectedFilename: string;
    const arch = os.arch();
    const plat = os.platform();

    if (plat === 'win32') {
      expectedFilename = `win-${arch}/node.exe`;
    } else if (plat === 'darwin') {
      expectedFilename = `node-${v}-darwin-${arch}.tar.gz`;
    } else {
      expectedFilename = `node-${v}-linux-${arch}.tar.gz`;
    }

    let expectedHash: string | null = null;
    let matchType: 'binary' | 'archive' | 'unknown' = 'unknown';

    const lines = shasums.split('\n');
    for (const line of lines) {
      const [hash, filename] = line.trim().split(/\s+/);
      if (!filename) continue;

      if (plat === 'win32' && filename === expectedFilename) {
        expectedHash = hash;
        matchType = 'binary';
        break;
      } else if (filename === expectedFilename) {
        expectedHash = hash;
        matchType = 'archive';
        break;
      }
    }

    return {
      status: matchType === 'binary' && localHash === expectedHash ? 'ok' : (matchType === 'archive' ? 'archive' : 'mismatch'),
      localHash,
      expectedHash,
      matchType,
      error: matchType === 'unknown' ? 'Entry not found' : undefined
    };
  } catch (err) {
    return { status: 'error', error: (err as Error).message };
  }
}

export async function verifyIntegrity(inst: AggregatedInstallation): Promise<void> {
  const version = inst.verified || inst.version;
  const v = version.startsWith('v') ? version : `v${version}`;

  clearScreen();
  printHeader();

  console.log(c('cyan', '━'.repeat(66)));
  console.log(`  🛡️  ${bold('Integrity Check')}: ${v}`);
  console.log(c('cyan', '━'.repeat(66)));
  console.log();

  // On macOS/Linux, Node.js doesn't publish binary checksums
  if (!isWindows) {
    console.log(`  ${c('cyan', 'ℹ Note:')} Binary verification is only available on Windows.`);
    console.log();
    console.log(`  ${dim('On macOS/Linux, Node.js publishes archive checksums instead of')}`);
    console.log(`  ${dim('binary checksums. We can still confirm this is an official version.')}`);
    console.log();
    console.log(`  ${bold('Version Verification:')}`);

    try {
      await fetchChecksums(version);
      console.log(`  ${c('green', '✓')} ${bold(v)} is a valid official Node.js release`);
      console.log(`  ${c('green', '✓')} Release checksums fetched from nodejs.org`);
    } catch {
      console.log(`  ${c('red', '✗')} Could not confirm ${v} in official releases`);
      console.log(`  ${dim('This may be a custom build or the version was not found.')}`);
    }

    console.log();
    console.log(`  ${dim('What does this mean?')}`);
    console.log(`  ${dim('Your installation is from a recognized official version.')}`);
    console.log(`  ${dim('Direct binary hash verification requires the original archive.')}`);

    console.log();
    await select({
      message: 'Press Enter to continue...',
      choices: [{ name: '← Back', value: 'back' }],
      theme: { prefix: '  ' },
    });
    return;
  }

  console.log(`  ${dim('Verifying integrity...')}`);

  const result = await checkIntegrity(inst);

  console.log(`  ${bold('Results:')}`);
  if (result.status === 'error') {
     console.log(`  ${c('red', '❌ Error:')} ${result.error}`);
  } else {
     console.log(`  Local Binary Hash:  ${dim(result.localHash || 'unknown')}`);

     if (result.matchType === 'binary') {
       console.log(`  Official Hash:      ${dim(result.expectedHash || 'unknown')}`);
       console.log();
       if (result.status === 'ok') {
          console.log(`  ${c('green', '✅ VERIFIED')} - The binary perfectly matches the official release.`);
       } else {
          console.log(`  ${c('red', '❌ MISMATCH')} - The binary hash differs from official record!`);
          console.log(`     ${c('yellow', 'Warning:')} This could indicate a corrupted or modified binary.`);
       }
     } else {
       console.log(`  ${c('red', '❌ Error:')} Could not find a matching entry in SHASUMS256.txt`);
     }
  }

  console.log();
  await select({
    message: 'Press Enter to continue...',
    choices: [{ name: '← Back', value: 'back' }],
    theme: { prefix: '  ' },
  });
}
