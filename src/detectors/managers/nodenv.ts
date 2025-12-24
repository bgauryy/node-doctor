/**
 * nodenv Detector
 *
 * Detects Node.js installations managed by nodenv.
 * https://github.com/nodenv/nodenv
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

export const nodenvDetector: DetectorConfig = {
  name: 'nodenv',
  displayName: 'nodenv',
  icon: '💎',
  platforms: ['darwin', 'linux'],
  canDelete: true,

  detect(): DetectorResult | null {
    const nodenvRoot = resolveBaseDir('NODENV_ROOT', path.join(HOME, '.nodenv'));
    const versionsDir = path.join(nodenvRoot, 'versions');

    const installations = discoverInstallations(versionsDir, {
      executable: createExecutableGetter({ unix: 'bin/node' }),
      manager: 'nodenv',
    });

    const defaultVersion = readDefaultVersion(path.join(nodenvRoot, 'version'));

    return createDetectorResult({
      baseDir: nodenvRoot,
      versionsDir,
      installations,
      defaultVersion,
      envVar: 'NODENV_ROOT',
    });
  },
};
