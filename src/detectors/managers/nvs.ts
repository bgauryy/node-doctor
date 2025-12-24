/**
 * NVS (Node Version Switcher) Detector
 *
 * Detects Node.js installations managed by nvs.
 * https://github.com/jasongin/nvs
 */

import path from 'node:path';
import {
  readDefaultVersion,
  getWindowsAppDataPaths,
  getXdgDataDir,
  getEnv,
  dirExists,
  fileExists,
  getDirSize,
  getNodeVersion,
  listSubdirs,
  isWindows,
  HOME,
} from '../core/helpers.js';
import type { DetectorConfig, DetectorResult, Installation } from '../../types/index.js';

export const nvsDetector: DetectorConfig = {
  name: 'nvs',
  displayName: 'NVS (Node Version Switcher)',
  icon: '🔄',
  platforms: ['darwin', 'linux', 'win32'],
  canDelete: true,

  detect(): DetectorResult | null {
    let nvsHome: string | null = getEnv('NVS_HOME');

    if (!nvsHome) {
      if (isWindows) {
        const { local, roaming } = getWindowsAppDataPaths('nvs');
        nvsHome = dirExists(local) ? local : dirExists(roaming) ? roaming : null;
      } else {
        nvsHome = path.join(HOME, '.nvs');
        if (!dirExists(nvsHome)) {
          nvsHome = getXdgDataDir('nvs');
        }
      }
    }

    if (!nvsHome || !dirExists(nvsHome)) {
      return null;
    }

    // NVS has a different structure: nvs/node/{version}/{arch}/
    const nodeDir = path.join(nvsHome, 'node');

    if (!dirExists(nodeDir)) {
      return null;
    }

    const installations: Installation[] = [];

    // NVS stores versions in node/{version}/{arch}/ structure
    const versions = listSubdirs(nodeDir);

    for (const version of versions) {
      const versionDir = path.join(nodeDir, version);
      const archs = listSubdirs(versionDir);

      for (const arch of archs) {
        const archDir = path.join(versionDir, arch);
        const nodePath = isWindows ? path.join(archDir, 'node.exe') : path.join(archDir, 'bin', 'node');

        if (fileExists(nodePath)) {
          installations.push({
            version: version.replace(/^v/, ''),
            path: archDir,
            executable: nodePath,
            size: getDirSize(archDir),
            verified: getNodeVersion(nodePath),
            manager: 'nvs',
            arch,
          });
        }
      }
    }

    if (installations.length === 0) {
      return null;
    }

    const defaultVersion = readDefaultVersion(path.join(nvsHome, 'default'));

    return {
      baseDir: nvsHome,
      versionsDir: nodeDir,
      installations,
      defaultVersion,
      envVar: 'NVS_HOME',
      envVarSet: !!getEnv('NVS_HOME'),
    };
  },
};
