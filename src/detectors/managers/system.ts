/**
 * System Installation Detector
 *
 * Detects Node.js installed at system-level paths (not via version managers).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileExists, getNodeVersion, isWindows } from '../core/helpers.js';
import type { DetectorConfig, DetectorResult, Installation } from '../../types/index.js';

export const systemDetector: DetectorConfig = {
  name: 'system',
  displayName: 'System Installation',
  icon: '💻',
  platforms: ['darwin', 'linux', 'win32'],
  canDelete: false, // System installations shouldn't be deleted via this tool

  detect(): DetectorResult | null {
    const installations: Installation[] = [];

    const systemPaths = isWindows
      ? ['C:\\Program Files\\nodejs\\node.exe', 'C:\\Program Files (x86)\\nodejs\\node.exe']
      : ['/usr/bin/node', '/usr/local/bin/node'];

    for (const nodePath of systemPaths) {
      if (fileExists(nodePath)) {
        try {
          const realPath = fs.realpathSync(nodePath);

          // Skip if this is actually a version manager symlink
          const isVersionManager =
            realPath.includes('.nvm') ||
            realPath.includes('fnm') ||
            realPath.includes('.volta') ||
            realPath.includes('.asdf') ||
            realPath.includes('/n/versions') ||
            realPath.includes('Cellar');

          if (!isVersionManager) {
            installations.push({
              version: 'system',
              path: path.dirname(nodePath),
              executable: nodePath,
              realPath: realPath !== nodePath ? realPath : null,
              verified: getNodeVersion(nodePath),
              manager: 'system',
              size: 0, // Don't calculate size for system installations
            });
          }
        } catch {
          // If symlink resolution fails, still add the installation
          installations.push({
            version: 'system',
            path: path.dirname(nodePath),
            executable: nodePath,
            verified: getNodeVersion(nodePath),
            manager: 'system',
            size: 0,
          });
        }
      }
    }

    if (installations.length === 0) {
      return null;
    }

    return { baseDir: systemPaths[0], installations };
  },
};
