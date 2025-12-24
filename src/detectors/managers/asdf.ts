/**
 * asdf Detector
 *
 * Detects Node.js installations managed by asdf version manager.
 * https://asdf-vm.com/
 */

import path from 'node:path';
import {
  discoverInstallations,
  createExecutableGetter,
  createDetectorResult,
  resolveBaseDir,
  HOME,
} from '../core/helpers.js';
import type { DetectorConfig, DetectorResult } from '../../types/index.js';

export const asdfDetector: DetectorConfig = {
  name: 'asdf',
  displayName: 'asdf (version manager)',
  icon: '🔧',
  platforms: ['darwin', 'linux'],
  canDelete: true,

  detect(): DetectorResult | null {
    const asdfDir = resolveBaseDir('ASDF_DATA_DIR', path.join(HOME, '.asdf'));
    const nodeDir = path.join(asdfDir, 'installs', 'nodejs');

    const installations = discoverInstallations(nodeDir, {
      executable: createExecutableGetter({ unix: 'bin/node' }),
      manager: 'asdf',
    });

    return createDetectorResult({
      baseDir: asdfDir,
      versionsDir: nodeDir,
      installations,
      envVar: 'ASDF_DATA_DIR',
    });
  },
};
