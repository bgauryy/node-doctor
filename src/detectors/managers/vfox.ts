/**
 * vfox Detector
 *
 * Detects Node.js installations managed by vfox.
 * https://vfox.lhan.me/
 */

import path from 'node:path';
import {
  discoverInstallations,
  createExecutableGetter,
  createDetectorResult,
  getWindowsAppDataPaths,
  getMacAppSupportDir,
  getXdgDataDir,
  getEnv,
  dirExists,
  isWindows,
  isMac,
  HOME,
} from '../core/helpers.js';
import type { DetectorConfig, DetectorResult } from '../../types/index.js';

export const vfoxDetector: DetectorConfig = {
  name: 'vfox',
  displayName: 'vfox (version manager)',
  icon: '🦊',
  platforms: ['darwin', 'linux', 'win32'],
  canDelete: true,

  detect(): DetectorResult | null {
    let vfoxHome: string | null = getEnv('VFOX_HOME');

    if (!vfoxHome) {
      if (isWindows) {
        const { local } = getWindowsAppDataPaths('vfox');
        vfoxHome = dirExists(local) ? local : null;
      } else if (isMac) {
        vfoxHome = getMacAppSupportDir('vfox');
        if (!dirExists(vfoxHome)) {
          vfoxHome = getXdgDataDir('vfox');
        }
      } else {
        vfoxHome = getXdgDataDir('vfox');
        if (!dirExists(vfoxHome)) {
          vfoxHome = path.join(HOME, '.vfox');
        }
      }
    }

    if (!vfoxHome || !dirExists(vfoxHome)) {
      return null;
    }

    const nodeDir = path.join(vfoxHome, 'cache', 'nodejs');

    const installations = discoverInstallations(nodeDir, {
      executable: createExecutableGetter({
        windows: 'node.exe',
        unix: 'bin/node',
      }),
      manager: 'vfox',
    });

    return createDetectorResult({
      baseDir: vfoxHome,
      versionsDir: nodeDir,
      installations,
      envVar: 'VFOX_HOME',
    });
  },
};
