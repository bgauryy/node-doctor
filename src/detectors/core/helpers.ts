/**
 * Shared utilities for version manager detectors
 *
 * These helpers extract common patterns across detectors to reduce duplication.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  dirExists,
  fileExists,
  getEnv,
  getNodeVersion,
  listSubdirs,
  getDirSize,
  runCommand,
  isWindows,
  isMac,
  HOME,
} from '../../utils.js';
import type { Installation, DetectorResult } from '../../types/index.js';

/**
 * Configuration for discovering installations
 */
export interface DiscoveryConfig {
  /** Function to get node executable path */
  executable: (versionDir: string) => string;
  /** Manager name for installation objects */
  manager: string;
  /** Optional function to detect architecture */
  arch?: (versionDir: string) => string;
}

/**
 * Platform-specific fallback configuration
 */
export interface PlatformFallbacks {
  /** Windows fallback path */
  windows?: string;
  /** macOS fallback path */
  mac?: string;
  /** Linux fallback path */
  linux?: string;
  /** Default fallback for any platform */
  default?: string;
}

/**
 * Discover Node.js installations in a versions directory
 *
 * This is the most common pattern across detectors - iterate subdirs,
 * check for node executable, collect metadata.
 */
export function discoverInstallations(versionsDir: string, config: DiscoveryConfig): Installation[] {
  const { executable, manager, arch } = config;

  if (!dirExists(versionsDir)) {
    return [];
  }

  const versions = listSubdirs(versionsDir);
  const installations: Installation[] = [];

  for (const version of versions) {
    const versionDir = path.join(versionsDir, version);
    const nodePath = executable(versionDir);

    if (fileExists(nodePath)) {
      const inst: Installation = {
        version: version.replace(/^v/, ''),
        path: versionDir,
        executable: nodePath,
        size: getDirSize(versionDir),
        verified: getNodeVersion(nodePath),
        manager,
      };

      if (arch) {
        inst.arch = arch(versionDir);
      }

      installations.push(inst);
    }
  }

  return installations;
}

/**
 * Get the path to node executable based on platform
 *
 * Common pattern: Windows uses node.exe directly, Unix uses bin/node
 */
export function getExecutablePath(
  versionDir: string,
  options: { windows?: string; unix?: string } = {}
): string {
  const { windows = 'node.exe', unix = 'bin/node' } = options;
  const execPath = isWindows ? windows : unix;
  return path.join(versionDir, execPath);
}

/**
 * Create an executable path getter for a manager
 */
export function createExecutableGetter(
  options: { windows?: string; unix?: string } = {}
): (versionDir: string) => string {
  return (versionDir) => getExecutablePath(versionDir, options);
}

/**
 * Read default version from a file (alias file)
 *
 * Common pattern: nvm, fnm, nodenv store default version in a file
 */
export function readDefaultVersion(filePath: string): string | null {
  if (!fileExists(filePath)) {
    return null;
  }

  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return null;
  }
}

/**
 * Resolve base directory with environment variable fallback
 */
export function resolveBaseDir(envVar: string, fallback: string): string {
  return getEnv(envVar) || fallback;
}

/**
 * Resolve base directory with platform-specific fallbacks
 *
 * Common pattern: fnm, mise, vfox have different default locations per platform
 */
export function resolveBaseDirWithFallbacks(envVar: string, fallbacks: PlatformFallbacks): string | null {
  // Check environment variable first
  const envValue = getEnv(envVar);
  if (envValue && dirExists(envValue)) {
    return envValue;
  }

  // Get platform-specific fallback
  let fallbackPath: string | undefined;
  if (isWindows) {
    fallbackPath = fallbacks.windows;
  } else if (isMac) {
    fallbackPath = fallbacks.mac;
  } else {
    fallbackPath = fallbacks.linux;
  }

  // Try platform-specific fallback
  if (fallbackPath && dirExists(fallbackPath)) {
    return fallbackPath;
  }

  // Try default fallback
  if (fallbacks.default && dirExists(fallbacks.default)) {
    return fallbacks.default;
  }

  return null;
}

/**
 * Get Windows AppData paths
 */
export function getWindowsAppDataPaths(appName: string): { local: string; roaming: string } {
  const localAppData = getEnv('LOCALAPPDATA') || path.join(HOME, 'AppData', 'Local');
  const roamingAppData = getEnv('APPDATA') || path.join(HOME, 'AppData', 'Roaming');

  return {
    local: path.join(localAppData, appName),
    roaming: path.join(roamingAppData, appName),
  };
}

/**
 * Get XDG data directory
 */
export function getXdgDataDir(appName: string): string {
  const xdgDataHome = getEnv('XDG_DATA_HOME') || path.join(HOME, '.local', 'share');
  return path.join(xdgDataHome, appName);
}

/**
 * Get macOS Application Support directory
 */
export function getMacAppSupportDir(appName: string): string {
  return path.join(HOME, 'Library', 'Application Support', appName);
}

/**
 * Create a standard detector result object
 */
export function createDetectorResult(params: {
  baseDir: string;
  versionsDir?: string;
  installations: Installation[];
  defaultVersion?: string | null;
  envVar: string;
}): DetectorResult | null {
  const { baseDir, versionsDir, installations, defaultVersion = null, envVar } = params;

  // Return null if no installations found (common pattern)
  if (installations.length === 0) {
    return null;
  }

  return {
    baseDir,
    versionsDir: versionsDir || baseDir,
    installations,
    defaultVersion,
    envVar,
    envVarSet: !!getEnv(envVar),
  };
}

/**
 * Compare two version strings (for sorting)
 */
export function compareVersions(a: string, b: string): number {
  const va = (a || '').split('.').map(Number);
  const vb = (b || '').split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const diff = (vb[i] || 0) - (va[i] || 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

// Re-export commonly used utilities for convenience
export { dirExists, fileExists, getEnv, getNodeVersion, listSubdirs, getDirSize, runCommand, isWindows, isMac, HOME };
