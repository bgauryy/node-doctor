/**
 * Volta Detector
 *
 * Detects Node.js installations managed by Volta.
 * https://volta.sh/
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

export const voltaDetector: DetectorConfig = {
  name: 'volta',
  displayName: 'Volta',
  icon: '⚡',
  platforms: ['darwin', 'linux', 'win32'],
  canDelete: true,

  detect(): DetectorResult | null {
    const voltaHome = resolveBaseDir('VOLTA_HOME', path.join(HOME, '.volta'));
    const nodeImageDir = path.join(voltaHome, 'tools', 'image', 'node');
    const nodeInventoryDir = path.join(voltaHome, 'tools', 'inventory', 'node');

    const installations = discoverInstallations(nodeImageDir, {
      executable: createExecutableGetter({
        windows: 'node.exe',
        unix: 'bin/node',
      }),
      manager: 'volta',
    });

    const result = createDetectorResult({
      baseDir: voltaHome,
      versionsDir: nodeImageDir,
      installations,
      envVar: 'VOLTA_HOME',
    });

    if (result) {
      (result as DetectorResult & { inventoryDir: string }).inventoryDir = nodeInventoryDir;
    }

    return result;
  },
};
