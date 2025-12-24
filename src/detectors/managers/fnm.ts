/**
 * FNM (Fast Node Manager) Detector
 *
 * Detects Node.js installations managed by fnm.
 * https://github.com/Schniz/fnm
 */

import path from 'node:path';
import {
  discoverInstallations,
  readDefaultVersion,
  createDetectorResult,
  getWindowsAppDataPaths,
  getMacAppSupportDir,
  getXdgDataDir,
  getEnv,
  dirExists,
  isWindows,
  HOME,
} from '../core/helpers.js';
import type { DetectorConfig, DetectorResult } from '../../types/index.js';

export const fnmDetector: DetectorConfig = {
  name: 'fnm',
  displayName: 'FNM (Fast Node Manager)',
  icon: '⚡',
  platforms: ['darwin', 'linux', 'win32'],
  canDelete: true,

  detect(): DetectorResult | null {
    // Try to find fnm directory with platform-specific fallbacks
    let fnmDir: string | null = getEnv('FNM_DIR');

    if (!fnmDir) {
      if (isWindows) {
        const { local, roaming } = getWindowsAppDataPaths('fnm');
        fnmDir = dirExists(local) ? local : dirExists(roaming) ? roaming : null;
      } else {
        // macOS: Application Support, then XDG
        const macPath = getMacAppSupportDir('fnm');
        const xdgPath = getXdgDataDir('fnm');
        const dotPath = path.join(HOME, '.fnm');

        fnmDir = dirExists(macPath) ? macPath : dirExists(xdgPath) ? xdgPath : dirExists(dotPath) ? dotPath : null;
      }
    }

    if (!fnmDir || !dirExists(fnmDir)) {
      return null;
    }

    const versionsDir = path.join(fnmDir, 'node-versions');

    const installations = discoverInstallations(versionsDir, {
      executable: (versionDir: string) => {
        const installDir = path.join(versionDir, 'installation');
        return isWindows ? path.join(installDir, 'node.exe') : path.join(installDir, 'bin', 'node');
      },
      manager: 'fnm',
    });

    const defaultVersion = readDefaultVersion(path.join(fnmDir, 'aliases', 'default'));

    return createDetectorResult({
      baseDir: fnmDir,
      versionsDir,
      installations,
      defaultVersion,
      envVar: 'FNM_DIR',
    });
  },
};
