/**
 * Path Analysis Features
 */
import path from 'node:path';
import { detectors } from '../detectors/index.js';
import { isWindows } from '../utils.js';
import type { ScanResults, RunnerInfo } from '../types/index.js';

/**
 * Identify which version manager a Node executable belongs to
 * Uses the registered detectors to dynamically identify paths.
 */
export function identifyRunner(nodePath: string, results: ScanResults): RunnerInfo {
  const p = path.resolve(nodePath);

  // 1. Check known temp/package manager paths
  if (/[\/\\]yarn--\d+-[\d.]+/.test(p) || p.includes('/T/yarn--') || p.includes('\\Temp\\yarn--')) {
    return { name: 'yarn-temp', icon: '🧶' };
  }

  if (p.includes('.pnpm') || p.includes('/T/pnpm-') || p.includes('\\Temp\\pnpm-')) {
    return { name: 'pnpm-temp', icon: '📦' };
  }

  // Check for fnm multishell paths which might be outside the main fnm directory
  if (p.includes('fnm_multishells')) {
    return { name: 'fnm', icon: '⚡' };
  }

  // 2. Dynamic check against all registered detectors
  // This syncs with the detectors registry, avoiding hardcoded lists
  for (const detector of detectors) {
    const result = results[detector.name];
    if (result && result.baseDir) {
      const match = isWindows
        ? p.toLowerCase().startsWith(result.baseDir.toLowerCase())
        : p.startsWith(result.baseDir);

      if (match) {
        return { name: detector.name, icon: detector.icon };
      }
    }
  }

  // 3. System paths
  const isSystem = isWindows
    ? p.toLowerCase().startsWith('c:\\program files')
    : p.startsWith('/usr/bin') || p.startsWith('/usr/local/bin');

  if (isSystem) {
    return { name: 'system', icon: '💻' };
  }

  return { name: 'unknown', icon: '❓' };
}
