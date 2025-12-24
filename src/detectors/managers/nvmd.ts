/**
 * nvmd (nvm-desktop) Detector
 *
 * Detects Node.js installations managed by nvm-desktop.
 * https://github.com/1111mp/nvm-desktop
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

export const nvmdDetector: DetectorConfig = {
  name: 'nvmd',
  displayName: 'nvm-desktop',
  icon: '🖥️',
  platforms: ['darwin', 'linux', 'win32'],
  canDelete: true,

  detect(): DetectorResult | null {
    const baseDir = resolveBaseDir('NVMD_DIR', path.join(HOME, '.nvmd'));
    const versionsDir = path.join(baseDir, 'versions');

    const installations = discoverInstallations(versionsDir, {
      executable: createExecutableGetter({ unix: 'bin/node', windows: 'node.exe' }),
      manager: 'nvmd',
    });

    // From README: "default"(file) The file contains the version number of the node that is set globally
    const defaultVersion = readDefaultVersion(path.join(baseDir, 'default'));

    return createDetectorResult({
      baseDir,
      versionsDir,
      installations,
      defaultVersion,
      envVar: 'NVMD_DIR',
    });
  },
};

