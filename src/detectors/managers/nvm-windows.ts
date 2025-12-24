/**
 * NVM for Windows Detector
 *
 * Detects Node.js installations managed by nvm-windows.
 * https://github.com/coreybutler/nvm-windows
 */

import path from 'node:path';
import {
  getEnv,
  dirExists,
  listSubdirs,
  fileExists,
  getDirSize,
  getNodeVersion,
} from '../core/helpers.js';
import type { DetectorConfig, DetectorResult, Installation } from '../../types/index.js';

interface NvmWindowsResult extends DetectorResult {
  symlink: string | null;
}

export const nvmWindowsDetector: DetectorConfig = {
  name: 'nvm-windows',
  displayName: 'NVM for Windows',
  icon: '🪟',
  platforms: ['win32'],
  canDelete: true,

  detect(): NvmWindowsResult | null {
    const nvmHome = getEnv('NVM_HOME');
    const nvmSymlink = getEnv('NVM_SYMLINK');

    if (!nvmHome || !dirExists(nvmHome)) {
      return null;
    }

    // Filter to only version directories (v20.10.0 or 20.10.0 format)
    const versions = listSubdirs(nvmHome).filter((v) => /^v?\d+/.test(v));

    const installations: Installation[] = [];

    for (const version of versions) {
      const versionDir = path.join(nvmHome, version);
      const nodePath = path.join(versionDir, 'node.exe');

      if (fileExists(nodePath)) {
        installations.push({
          version: version.replace(/^v/, ''),
          path: versionDir,
          executable: nodePath,
          size: getDirSize(versionDir),
          verified: getNodeVersion(nodePath),
          manager: 'nvm-windows',
        });
      }
    }

    if (installations.length === 0) {
      return null;
    }

    return {
      baseDir: nvmHome,
      symlink: nvmSymlink,
      installations,
      envVar: 'NVM_HOME',
      envVarSet: true,
    };
  },
};
