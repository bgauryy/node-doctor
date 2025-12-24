/**
 * Proto Detector
 *
 * Detects Node.js installations managed by proto toolchain.
 * https://moonrepo.dev/proto
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

export const protoDetector: DetectorConfig = {
  name: 'proto',
  displayName: 'proto (moonrepo)',
  icon: '🌙',
  platforms: ['darwin', 'linux', 'win32'],
  canDelete: true,

  detect(): DetectorResult | null {
    const protoHome = resolveBaseDir('PROTO_HOME', path.join(HOME, '.proto'));
    const nodeDir = path.join(protoHome, 'tools', 'node');

    const installations = discoverInstallations(nodeDir, {
      executable: createExecutableGetter({
        windows: 'node.exe',
        unix: 'bin/node',
      }),
      manager: 'proto',
    });

    return createDetectorResult({
      baseDir: protoHome,
      versionsDir: nodeDir,
      installations,
      envVar: 'PROTO_HOME',
    });
  },
};
