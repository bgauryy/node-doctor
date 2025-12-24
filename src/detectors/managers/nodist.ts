/**
 * Nodist Detector
 *
 * Detects Node.js installations managed by Nodist (Windows only).
 * https://github.com/nullivex/nodist
 */

import path from 'node:path';
import {
  createDetectorResult,
  getEnv,
  dirExists,
  fileExists,
  getDirSize,
  getNodeVersion,
  listSubdirs,
} from '../core/helpers.js';
import type { DetectorConfig, DetectorResult, Installation } from '../../types/index.js';

export const nodistDetector: DetectorConfig = {
  name: 'nodist',
  displayName: 'Nodist',
  icon: '🎯',
  platforms: ['win32'],
  canDelete: true,

  detect(): DetectorResult | null {
    const nodistPrefix = getEnv('NODIST_PREFIX');

    if (!nodistPrefix || !dirExists(nodistPrefix)) {
      return null;
    }

    const nodeDir = path.join(nodistPrefix, 'v');

    if (!dirExists(nodeDir)) {
      return null;
    }

    const installations: Installation[] = [];

    // Nodist stores versions with arch: v/20.10.0/x64/
    const versions = listSubdirs(nodeDir);

    for (const version of versions) {
      const versionDir = path.join(nodeDir, version);
      const archs = listSubdirs(versionDir);

      for (const arch of archs) {
        const archDir = path.join(versionDir, arch);
        const nodePath = path.join(archDir, 'node.exe');

        if (fileExists(nodePath)) {
          installations.push({
            version: version.replace(/^v/, ''),
            path: archDir,
            executable: nodePath,
            size: getDirSize(archDir),
            verified: getNodeVersion(nodePath),
            manager: 'nodist',
            arch,
          });
        }
      }
    }

    return createDetectorResult({
      baseDir: nodistPrefix,
      versionsDir: nodeDir,
      installations,
      envVar: 'NODIST_PREFIX',
    });
  },
};
