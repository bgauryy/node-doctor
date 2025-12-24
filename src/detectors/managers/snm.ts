/**
 * snm (Simple Node Manager) Detector
 *
 * Detects Node.js installations managed by snm.
 * https://github.com/numToStr/snm
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

export const snmDetector: DetectorConfig = {
  name: 'snm',
  displayName: 'snm',
  icon: '🦀', // Rust based
  platforms: ['darwin', 'linux'],
  canDelete: true,

  detect(): DetectorResult | null {
    const baseDir = resolveBaseDir('SNM_DIR', path.join(HOME, '.snm'));
    // Based on changelog/docs, versions are in 'releases' folder? Or just in base?
    // Docs say "$SNM_DIR/releases/..."
    const versionsDir = path.join(baseDir, 'releases');

    const installations = discoverInstallations(versionsDir, {
      executable: createExecutableGetter({ unix: 'bin/node' }),
      manager: 'snm',
    });

    // snm might use an alias for default, or a file.
    // 'snm env zsh' suggests it relies on env modifications.
    
    return createDetectorResult({
      baseDir,
      versionsDir,
      installations,
      envVar: 'SNM_DIR',
    });
  },
};

