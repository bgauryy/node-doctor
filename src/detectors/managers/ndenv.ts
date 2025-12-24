/**
 * ndenv Detector
 *
 * Detects Node.js installations managed by ndenv.
 * https://github.com/riywo/ndenv
 */

import path from 'node:path';
import {
  discoverInstallations,
  createExecutableGetter,
  readDefaultVersion,
  createDetectorResult,
  resolveBaseDir,
  HOME,
} from '../core/helpers.js';
import type { DetectorConfig, DetectorResult } from '../../types/index.js';

export const ndenvDetector: DetectorConfig = {
  name: 'ndenv',
  displayName: 'ndenv',
  icon: '💎',
  platforms: ['darwin', 'linux'],
  canDelete: true,

  detect(): DetectorResult | null {
    const ndenvRoot = resolveBaseDir('NDENV_ROOT', path.join(HOME, '.ndenv'));
    const versionsDir = path.join(ndenvRoot, 'versions');

    const installations = discoverInstallations(versionsDir, {
      executable: createExecutableGetter({ unix: 'bin/node' }),
      manager: 'ndenv',
    });

    const defaultVersion = readDefaultVersion(path.join(ndenvRoot, 'version'));

    return createDetectorResult({
      baseDir: ndenvRoot,
      versionsDir,
      installations,
      defaultVersion,
      envVar: 'NDENV_ROOT',
    });
  },
};

