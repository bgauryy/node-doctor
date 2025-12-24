/**
 * n (node version manager) Detector
 *
 * Detects Node.js installations managed by n.
 * https://github.com/tj/n
 */

import path from 'node:path';
import {
  discoverInstallations,
  createExecutableGetter,
  createDetectorResult,
  resolveBaseDir,
} from '../core/helpers.js';
import type { DetectorConfig, DetectorResult } from '../../types/index.js';

export const nDetector: DetectorConfig = {
  name: 'n',
  displayName: 'n (node version manager)',
  icon: '📦',
  platforms: ['darwin', 'linux'],
  canDelete: true,

  detect(): DetectorResult | null {
    const nPrefix = resolveBaseDir('N_PREFIX', '/usr/local');
    const nodeDir = path.join(nPrefix, 'n', 'versions', 'node');

    const installations = discoverInstallations(nodeDir, {
      executable: createExecutableGetter({ unix: 'bin/node' }),
      manager: 'n',
    });

    return createDetectorResult({
      baseDir: nPrefix,
      versionsDir: nodeDir,
      installations,
      envVar: 'N_PREFIX',
    });
  },
};
