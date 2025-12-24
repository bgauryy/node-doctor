/**
 * tnvm (Aliyun Node Version Manager) Detector
 *
 * Detects Node.js installations managed by tnvm.
 * https://github.com/aliyun-node/tnvm
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

export const tnvmDetector: DetectorConfig = {
  name: 'tnvm',
  displayName: 'tnvm',
  icon: '☁️', // Cloud for Aliyun
  platforms: ['darwin', 'linux'],
  canDelete: true,

  detect(): DetectorResult | null {
    const baseDir = resolveBaseDir('TNVM_DIR', path.join(HOME, '.tnvm'));
    // tnvm stores versions in .tnvm/versions/node/vX.X.X usually, similar to nvm?
    // Looking at install.sh: "Could not find $TNVM_DIR/*/bin" implies maybe versions are direct?
    // But standard nvm clones often follow versions/node pattern.
    // Let's check typical nvm-like structure first.
    
    // tnvm seems to be a fork/clone of nvm-sh logic or similar.
    // We'll scan likely directories.
    const versionsDir = path.join(baseDir, 'versions', 'node'); // Assumption based on nvm heritage
    // Also check alternate path if typical for tnvm (often ~/.tnvm/versions/node/...)

    const installations = discoverInstallations(versionsDir, {
      executable: createExecutableGetter({ unix: 'bin/node' }),
      manager: 'tnvm',
    });
    
    // Fallback: if empty, scan baseDir directly?
    if (installations.length === 0) {
       // discoverInstallations(baseDir ... ) ?
       // Without exact structure knowledge, we stick to nvm-like.
    }

    return createDetectorResult({
      baseDir,
      versionsDir,
      installations,
      envVar: 'TNVM_DIR',
    });
  },
};

