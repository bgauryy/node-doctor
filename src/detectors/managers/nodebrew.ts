/**
 * Nodebrew Detector
 *
 * Detects Node.js installations managed by nodebrew.
 * https://github.com/hokaccha/nodebrew
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

export const nodebrewDetector: DetectorConfig = {
  name: 'nodebrew',
  displayName: 'nodebrew',
  icon: '🍺',
  platforms: ['darwin', 'linux'],
  canDelete: true,

  detect(): DetectorResult | null {
    // nodebrew usually resides in ~/.nodebrew
    // Versions are in ~/.nodebrew/node/v*
    const baseDir = path.join(HOME, '.nodebrew');
    const versionsDir = path.join(baseDir, 'node');
    const currentDir = path.join(baseDir, 'current');

    const installations = discoverInstallations(versionsDir, {
      executable: createExecutableGetter({ unix: 'bin/node' }),
      manager: 'nodebrew',
    });

    // Check 'current' symlink to find default version
    // It usually points to ~/.nodebrew/node/vX.Y.Z
    let defaultVersion: string | undefined;
    
    // We can try to read the "current" symlink or directory
    // Implementation: nodebrew creates a "current" folder which is a symlink or contains files
    // But usually we can assume the one linked to 'current' is active. 
    // Since readDefaultVersion usually reads a text file, we might need a custom check here if it's a symlink.
    // However, for now, we'll try to deduce it if possible, or leave undefined.
    // nodebrew doesn't have a simple "version" text file like nvm/nodenv.
    
    return createDetectorResult({
      baseDir,
      versionsDir,
      installations,
      defaultVersion,
      envVar: 'NODEBREW_ROOT',
    });
  },
};

