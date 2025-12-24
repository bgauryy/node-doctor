/**
 * mise (formerly rtx) Detector
 *
 * Detects Node.js installations managed by mise polyglot version manager.
 * https://mise.jdx.dev/
 */

import path from 'node:path';
import {
  discoverInstallations,
  createExecutableGetter,
  createDetectorResult,
  getXdgDataDir,
  getEnv,
  dirExists,
} from '../core/helpers.js';
import type { DetectorConfig, DetectorResult } from '../../types/index.js';

export const miseDetector: DetectorConfig = {
  name: 'mise',
  displayName: 'mise (polyglot version manager)',
  icon: '🛠️',
  platforms: ['darwin', 'linux', 'win32'],
  canDelete: true,

  detect(): DetectorResult | null {
    let miseDir: string | null = getEnv('MISE_DATA_DIR');

    if (!miseDir) {
      miseDir = getXdgDataDir('mise');
    }

    if (!dirExists(miseDir)) {
      return null;
    }

    const nodeDir = path.join(miseDir, 'installs', 'node');

    if (!dirExists(nodeDir)) {
      return null;
    }

    const installations = discoverInstallations(nodeDir, {
      executable: createExecutableGetter({
        windows: 'node.exe',
        unix: 'bin/node',
      }),
      manager: 'mise',
    });

    return createDetectorResult({
      baseDir: miseDir,
      versionsDir: nodeDir,
      installations,
      envVar: 'MISE_DATA_DIR',
    });
  },
};
