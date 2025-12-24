/**
 * NVM (Node Version Manager) Detector
 *
 * Detects Node.js installations managed by nvm on macOS and Linux.
 * https://github.com/nvm-sh/nvm
 */

import path from 'node:path';
import {
  discoverInstallations,
  createExecutableGetter,
  readDefaultVersion,
  resolveBaseDir,
  createDetectorResult,
  HOME,
} from '../core/helpers.js';
import type { DetectorConfig, DetectorResult } from '../../types/index.js';

export const nvmDetector: DetectorConfig = {
  name: 'nvm',
  displayName: 'NVM (Node Version Manager)',
  icon: '🌿',
  platforms: ['darwin', 'linux'],
  canDelete: true,

  detect(): DetectorResult | null {
    const nvmDir = resolveBaseDir('NVM_DIR', path.join(HOME, '.nvm'));
    const versionsDir = path.join(nvmDir, 'versions', 'node');

    const installations = discoverInstallations(versionsDir, {
      executable: createExecutableGetter({ unix: 'bin/node' }),
      manager: 'nvm',
    });

    const defaultVersion = readDefaultVersion(path.join(nvmDir, 'alias', 'default'));

    return createDetectorResult({
      baseDir: nvmDir,
      versionsDir,
      installations,
      defaultVersion,
      envVar: 'NVM_DIR',
    });
  },
};
