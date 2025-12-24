/**
 * PATH Environment Detector
 *
 * Scans PATH environment variable to find all Node.js executables.
 * This is used for PATH priority analysis in the doctor feature.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileExists, getNodeVersion, runCommand, isWindows } from '../core/helpers.js';
import type { DetectorConfig, DetectorResult } from '../../types/index.js';

/**
 * Node found in PATH
 */
interface PathNodeInfo {
  pathDir: string;
  executable: string;
  realPath: string | null;
  verified: string | null;
}

interface PathDetectorResult extends DetectorResult {
  totalPathDirs: number;
  foundNodes: PathNodeInfo[];
  activeNode: string | null;
  pathDirs: string[];
}

export const pathDetector: DetectorConfig = {
  name: 'path',
  displayName: 'PATH Environment',
  icon: '🛤️',
  platforms: ['darwin', 'linux', 'win32'],
  canDelete: false, // This is an analysis detector, not for deletion

  detect(): PathDetectorResult {
    const pathEnv = process.env.PATH || '';
    const separator = isWindows ? ';' : ':';
    const pathDirs = pathEnv.split(separator).filter(Boolean);

    const nodeExecutable = isWindows ? 'node.exe' : 'node';

    const foundNodes: PathNodeInfo[] = [];

    for (const dir of pathDirs) {
      const nodePath = path.join(dir, nodeExecutable);

      if (fileExists(nodePath)) {
        let realPath: string = nodePath;
        try {
          realPath = fs.realpathSync(nodePath);
        } catch {
          // Ignore symlink resolution errors
        }

        foundNodes.push({
          pathDir: dir,
          executable: nodePath,
          realPath: realPath !== nodePath ? realPath : null,
          verified: getNodeVersion(nodePath),
        });
      }
    }

    // Get active node location
    const activeNode = runCommand(isWindows ? 'where' : 'which', ['node']);

    return {
      baseDir: '',
      installations: [],
      totalPathDirs: pathDirs.length,
      foundNodes,
      activeNode,
      pathDirs: pathDirs.slice(0, 20), // Limit to first 20 for display
    };
  },
};
