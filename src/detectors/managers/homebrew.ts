/**
 * Homebrew Detector
 *
 * Detects Node.js installations managed by Homebrew on macOS.
 * https://brew.sh/
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  dirExists,
  fileExists,
  getDirSize,
  getNodeVersion,
  listSubdirs,
  runCommand,
} from '../core/helpers.js';
import type { DetectorConfig, DetectorResult, Installation } from '../../types/index.js';

interface HomebrewResult extends DetectorResult {
  cellarDir: string;
  linkedPath: string | null;
}

export const homebrewDetector: DetectorConfig = {
  name: 'homebrew',
  displayName: 'Homebrew',
  icon: '🍺',
  platforms: ['darwin', 'linux'], // Also supports Linuxbrew on Linux
  canDelete: false, // Don't allow deletion - use brew uninstall

  detect(): HomebrewResult | null {
    // Try known Homebrew prefix locations
    const brewPaths = ['/opt/homebrew', '/usr/local', '/home/linuxbrew/.linuxbrew'];

    let brewPrefix: string | null = null;
    for (const p of brewPaths) {
      if (dirExists(path.join(p, 'Cellar'))) {
        brewPrefix = p;
        break;
      }
    }

    // Fallback to brew --prefix command
    if (!brewPrefix) {
      brewPrefix = runCommand('brew', ['--prefix']);
    }

    if (!brewPrefix || !dirExists(brewPrefix)) {
      return null;
    }

    const installations: Installation[] = [];

    // Check main node formula
    const cellarDir = path.join(brewPrefix, 'Cellar', 'node');

    if (dirExists(cellarDir)) {
      const versions = listSubdirs(cellarDir);
      for (const version of versions) {
        const versionDir = path.join(cellarDir, version);
        const nodePath = path.join(versionDir, 'bin', 'node');

        if (fileExists(nodePath)) {
          installations.push({
            version: version,
            path: versionDir,
            executable: nodePath,
            size: getDirSize(versionDir),
            verified: getNodeVersion(nodePath),
            formula: 'node',
            manager: 'homebrew',
          });
        }
      }
    }

    // Check versioned formulas (node@18, node@20, etc.)
    const cellar = path.join(brewPrefix, 'Cellar');
    if (dirExists(cellar)) {
      try {
        const formulas = fs.readdirSync(cellar).filter((f) => f.startsWith('node@'));
        for (const formula of formulas) {
          const formulaDir = path.join(cellar, formula);
          const versions = listSubdirs(formulaDir);
          for (const version of versions) {
            const versionDir = path.join(formulaDir, version);
            const nodePath = path.join(versionDir, 'bin', 'node');

            if (fileExists(nodePath)) {
              installations.push({
                version: version,
                path: versionDir,
                executable: nodePath,
                size: getDirSize(versionDir),
                verified: getNodeVersion(nodePath),
                formula: formula,
                manager: 'homebrew',
              });
            }
          }
        }
      } catch {
        // Ignore errors reading cellar
      }
    }

    if (installations.length === 0) {
      return null;
    }

    // Check for linked node
    const linkedNode = path.join(brewPrefix, 'bin', 'node');
    let linkedPath: string | null = null;
    if (fileExists(linkedNode)) {
      try {
        linkedPath = fs.realpathSync(linkedNode);
      } catch {
        // Ignore symlink resolution errors
      }
    }

    return {
      baseDir: brewPrefix,
      cellarDir: cellar,
      installations,
      linkedPath,
    };
  },
};
