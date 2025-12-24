/**
 * GNVM (Go Node Version Manager) Detector
 *
 * Detects Node.js installations managed by GNVM on Windows.
 * https://github.com/Kenshin/gnvm
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

export const gnvmDetector: DetectorConfig = {
  name: 'gnvm',
  displayName: 'GNVM',
  icon: '🔷', // Go colorish or generic
  platforms: ['win32'],
  canDelete: true,

  detect(): DetectorResult | null {
    // GNVM uses NODE_HOME or installs where gnvm.exe is.
    // Versions are often in %APPDATA%\gnvm or a subdirectory of where gnvm is.
    // A common pattern is having versions in the same dir as folders.
    // But gnvm is known for being a single binary that downloads node.exe.
    
    // NOTE: GNVM doesn't always strictly organize versions in a 'versions' folder.
    // It might download them as 'x.x.x' folders in its root.
    // We'll try to look in typical locations.
    
    // Default to a likely location if env var is missing, though gnvm usually needs NODE_HOME
    const baseDir = resolveBaseDir('GNVM_HOME') || resolveBaseDir('NODE_HOME') || path.join(HOME, 'AppData', 'Roaming', 'gnvm');
    
    // gnvm might not use a 'versions' subdir, but stores version folders in its root.
    // We scan the baseDir itself for versions? Or is there a specific folder?
    // Looking at docs: "gnvm.exe save to the same Node.js folder".
    // It seems versions might be downloaded to folders named after version.
    
    const installations = discoverInstallations(baseDir, {
      executable: createExecutableGetter({ win32: 'node.exe' }),
      manager: 'gnvm',
    });

    return createDetectorResult({
      baseDir,
      versionsDir: baseDir, // Scanning root for version folders
      installations,
      envVar: 'NODE_HOME',
    });
  },
};

