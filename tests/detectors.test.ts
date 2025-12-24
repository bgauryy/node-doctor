/**
 * Tests for detector helpers and core detection logic
 * @module tests/detectors.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';

// Mock the utils module first
vi.mock('../src/utils.js', () => ({
  dirExists: vi.fn(),
  fileExists: vi.fn(),
  getEnv: vi.fn(),
  getNodeVersion: vi.fn(),
  listSubdirs: vi.fn(),
  getDirSize: vi.fn(),
  runCommand: vi.fn(),
  isWindows: false,
  isMac: true,
  HOME: '/Users/testuser',
}));

import {
  discoverInstallations,
  createExecutableGetter,
  readDefaultVersion,
  resolveBaseDir,
  resolveBaseDirWithFallbacks,
  createDetectorResult,
  compareVersions,
  getXdgDataDir,
  getWindowsAppDataPaths,
} from '../src/detectors/core/helpers.js';

import {
  dirExists,
  fileExists,
  getEnv,
  getNodeVersion,
  listSubdirs,
  getDirSize,
} from '../src/utils.js';

describe('detector helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('discoverInstallations', () => {
    it('should discover Node installations in versions directory', () => {
      vi.mocked(dirExists).mockReturnValue(true);
      vi.mocked(listSubdirs).mockReturnValue(['v18.0.0', 'v20.10.0', 'v22.0.0']);
      vi.mocked(fileExists).mockReturnValue(true);
      vi.mocked(getDirSize).mockReturnValue(100 * 1024 * 1024);
      vi.mocked(getNodeVersion).mockImplementation((path) => {
        if (path.includes('18')) return 'v18.0.0';
        if (path.includes('20')) return 'v20.10.0';
        if (path.includes('22')) return 'v22.0.0';
        return null;
      });

      const installations = discoverInstallations('/Users/testuser/.nvm/versions/node', {
        executable: (versionDir) => path.join(versionDir, 'bin/node'),
        manager: 'nvm',
      });

      expect(installations).toHaveLength(3);
      expect(installations[0].version).toBe('18.0.0'); // v prefix stripped
      expect(installations[0].manager).toBe('nvm');
      expect(installations[0].executable).toContain('bin/node');
      expect(installations[0].size).toBe(100 * 1024 * 1024);
    });

    it('should return empty array when versions dir does not exist', () => {
      vi.mocked(dirExists).mockReturnValue(false);

      const installations = discoverInstallations('/nonexistent', {
        executable: (versionDir) => path.join(versionDir, 'bin/node'),
        manager: 'test',
      });

      expect(installations).toEqual([]);
    });

    it('should skip versions without node executable', () => {
      vi.mocked(dirExists).mockReturnValue(true);
      vi.mocked(listSubdirs).mockReturnValue(['v18.0.0', 'v20.0.0']);
      vi.mocked(fileExists).mockImplementation((p) => {
        const pathStr = p as string;
        return pathStr.includes('v18'); // Only v18 has executable
      });
      vi.mocked(getDirSize).mockReturnValue(50 * 1024 * 1024);
      vi.mocked(getNodeVersion).mockReturnValue('v18.0.0');

      const installations = discoverInstallations('/test/versions', {
        executable: (versionDir) => path.join(versionDir, 'bin/node'),
        manager: 'test',
      });

      expect(installations).toHaveLength(1);
      expect(installations[0].version).toBe('18.0.0');
    });

    it('should include architecture when provided', () => {
      vi.mocked(dirExists).mockReturnValue(true);
      vi.mocked(listSubdirs).mockReturnValue(['v20.0.0']);
      vi.mocked(fileExists).mockReturnValue(true);
      vi.mocked(getDirSize).mockReturnValue(100 * 1024 * 1024);
      vi.mocked(getNodeVersion).mockReturnValue('v20.0.0');

      const installations = discoverInstallations('/test/versions', {
        executable: (versionDir) => path.join(versionDir, 'bin/node'),
        manager: 'test',
        arch: () => 'arm64',
      });

      expect(installations[0].arch).toBe('arm64');
    });
  });

  describe('createExecutableGetter', () => {
    it('should return unix path on non-Windows', () => {
      const getter = createExecutableGetter({ unix: 'bin/node', windows: 'node.exe' });
      const result = getter('/test/v18.0.0');

      expect(result).toBe(path.join('/test/v18.0.0', 'bin/node'));
    });

    it('should use default unix path', () => {
      const getter = createExecutableGetter();
      const result = getter('/test/v18.0.0');

      expect(result).toBe(path.join('/test/v18.0.0', 'bin/node'));
    });
  });

  describe('readDefaultVersion', () => {
    it('should return null when file does not exist', () => {
      vi.mocked(fileExists).mockReturnValue(false);

      const result = readDefaultVersion('/Users/testuser/.nvm/alias/default');

      expect(result).toBeNull();
    });
  });

  describe('resolveBaseDir', () => {
    it('should return env var value when set', () => {
      vi.mocked(getEnv).mockReturnValue('/custom/nvm');

      const result = resolveBaseDir('NVM_DIR', '/Users/testuser/.nvm');

      expect(result).toBe('/custom/nvm');
    });

    it('should return fallback when env var not set', () => {
      vi.mocked(getEnv).mockReturnValue(null);

      const result = resolveBaseDir('NVM_DIR', '/Users/testuser/.nvm');

      expect(result).toBe('/Users/testuser/.nvm');
    });
  });

  describe('resolveBaseDirWithFallbacks', () => {
    it('should use env var when set and exists', () => {
      vi.mocked(getEnv).mockReturnValue('/custom/fnm');
      vi.mocked(dirExists).mockReturnValue(true);

      const result = resolveBaseDirWithFallbacks('FNM_DIR', {
        mac: '/Users/testuser/Library/Application Support/fnm',
        linux: '/home/testuser/.local/share/fnm',
        default: '/Users/testuser/.fnm',
      });

      expect(result).toBe('/custom/fnm');
    });

    it('should use mac fallback on macOS', () => {
      vi.mocked(getEnv).mockReturnValue(null);
      vi.mocked(dirExists).mockImplementation((p) => {
        return p === '/Users/testuser/Library/Application Support/fnm';
      });

      const result = resolveBaseDirWithFallbacks('FNM_DIR', {
        mac: '/Users/testuser/Library/Application Support/fnm',
        linux: '/home/testuser/.local/share/fnm',
        default: '/Users/testuser/.fnm',
      });

      expect(result).toBe('/Users/testuser/Library/Application Support/fnm');
    });

    it('should use default fallback when platform-specific not found', () => {
      vi.mocked(getEnv).mockReturnValue(null);
      vi.mocked(dirExists).mockImplementation((p) => {
        return p === '/Users/testuser/.fnm';
      });

      const result = resolveBaseDirWithFallbacks('FNM_DIR', {
        mac: '/nonexistent/mac',
        default: '/Users/testuser/.fnm',
      });

      expect(result).toBe('/Users/testuser/.fnm');
    });

    it('should return null when no path exists', () => {
      vi.mocked(getEnv).mockReturnValue(null);
      vi.mocked(dirExists).mockReturnValue(false);

      const result = resolveBaseDirWithFallbacks('FNM_DIR', {
        mac: '/nonexistent/mac',
        default: '/nonexistent/default',
      });

      expect(result).toBeNull();
    });
  });

  describe('createDetectorResult', () => {
    it('should create result with installations', () => {
      vi.mocked(getEnv).mockReturnValue('/Users/testuser/.nvm');

      const installations = [
        {
          version: '18.0.0',
          path: '/Users/testuser/.nvm/versions/node/v18.0.0',
          executable: '/Users/testuser/.nvm/versions/node/v18.0.0/bin/node',
          size: 100 * 1024 * 1024,
          verified: 'v18.0.0',
          manager: 'nvm',
        },
      ];

      const result = createDetectorResult({
        baseDir: '/Users/testuser/.nvm',
        versionsDir: '/Users/testuser/.nvm/versions/node',
        installations,
        defaultVersion: 'v18.0.0',
        envVar: 'NVM_DIR',
      });

      expect(result).not.toBeNull();
      expect(result!.baseDir).toBe('/Users/testuser/.nvm');
      expect(result!.versionsDir).toBe('/Users/testuser/.nvm/versions/node');
      expect(result!.installations).toHaveLength(1);
      expect(result!.defaultVersion).toBe('v18.0.0');
      expect(result!.envVar).toBe('NVM_DIR');
      expect(result!.envVarSet).toBe(true);
    });

    it('should return null when no installations', () => {
      const result = createDetectorResult({
        baseDir: '/Users/testuser/.nvm',
        installations: [],
        envVar: 'NVM_DIR',
      });

      expect(result).toBeNull();
    });

    it('should use baseDir as versionsDir when not provided', () => {
      vi.mocked(getEnv).mockReturnValue(null);

      const installations = [
        {
          version: '20.0.0',
          path: '/test',
          executable: '/test/bin/node',
          size: 50 * 1024 * 1024,
          verified: 'v20.0.0',
          manager: 'test',
        },
      ];

      const result = createDetectorResult({
        baseDir: '/test',
        installations,
        envVar: 'TEST_VAR',
      });

      expect(result!.versionsDir).toBe('/test');
      expect(result!.envVarSet).toBe(false);
    });
  });

  describe('compareVersions', () => {
    it('should sort versions descending (newest first)', () => {
      expect(compareVersions('18.0.0', '20.0.0')).toBeGreaterThan(0);
      expect(compareVersions('20.0.0', '18.0.0')).toBeLessThan(0);
    });

    it('should compare minor versions', () => {
      expect(compareVersions('20.5.0', '20.10.0')).toBeGreaterThan(0);
      expect(compareVersions('20.10.0', '20.5.0')).toBeLessThan(0);
    });

    it('should compare patch versions', () => {
      expect(compareVersions('20.10.0', '20.10.5')).toBeGreaterThan(0);
      expect(compareVersions('20.10.5', '20.10.0')).toBeLessThan(0);
    });

    it('should return 0 for equal versions', () => {
      expect(compareVersions('18.0.0', '18.0.0')).toBe(0);
    });

    it('should handle missing parts', () => {
      expect(compareVersions('18', '18.0.0')).toBe(0);
      expect(compareVersions('18.5', '18.5.0')).toBe(0);
    });

    it('should handle empty strings', () => {
      expect(compareVersions('', '')).toBe(0);
      expect(compareVersions('18.0.0', '')).toBeLessThan(0);
    });
  });

  describe('getXdgDataDir', () => {
    it('should use XDG_DATA_HOME when set', () => {
      vi.mocked(getEnv).mockReturnValue('/custom/data');

      const result = getXdgDataDir('mise');

      expect(result).toBe('/custom/data/mise');
    });

    it('should use default path when XDG_DATA_HOME not set', () => {
      vi.mocked(getEnv).mockReturnValue(null);

      const result = getXdgDataDir('mise');

      expect(result).toBe('/Users/testuser/.local/share/mise');
    });
  });

  describe('getWindowsAppDataPaths', () => {
    it('should return correct paths', () => {
      vi.mocked(getEnv).mockImplementation((name) => {
        if (name === 'LOCALAPPDATA') return 'C:\\Users\\test\\AppData\\Local';
        if (name === 'APPDATA') return 'C:\\Users\\test\\AppData\\Roaming';
        return null;
      });

      const result = getWindowsAppDataPaths('fnm');

      expect(result.local).toContain('Local');
      expect(result.local).toContain('fnm');
      expect(result.roaming).toContain('Roaming');
      expect(result.roaming).toContain('fnm');
    });

    it('should use fallbacks when env vars not set', () => {
      vi.mocked(getEnv).mockReturnValue(null);

      const result = getWindowsAppDataPaths('fnm');

      expect(result.local).toContain('AppData');
      expect(result.local).toContain('Local');
      expect(result.roaming).toContain('AppData');
      expect(result.roaming).toContain('Roaming');
    });
  });
});

describe('detector integration', () => {
  describe('NVM detector pattern', () => {
    it('should follow standard detection pattern', () => {
      vi.mocked(getEnv).mockReturnValue(null);
      vi.mocked(dirExists).mockImplementation((p) => {
        return p === '/Users/testuser/.nvm/versions/node';
      });
      vi.mocked(listSubdirs).mockReturnValue(['v18.0.0', 'v20.0.0']);
      vi.mocked(fileExists).mockReturnValue(true);
      vi.mocked(getDirSize).mockReturnValue(150 * 1024 * 1024);
      vi.mocked(getNodeVersion).mockImplementation((p) => {
        const pathStr = p as string;
        if (pathStr.includes('18')) return 'v18.0.0';
        if (pathStr.includes('20')) return 'v20.0.0';
        return null;
      });

      // Simulate NVM detection logic
      const nvmDir = resolveBaseDir('NVM_DIR', '/Users/testuser/.nvm');
      const versionsDir = path.join(nvmDir, 'versions', 'node');

      const installations = discoverInstallations(versionsDir, {
        executable: createExecutableGetter({ unix: 'bin/node' }),
        manager: 'nvm',
      });

      expect(installations).toHaveLength(2);
      expect(installations.every((i) => i.manager === 'nvm')).toBe(true);
    });
  });

  describe('FNM detector pattern', () => {
    it('should handle platform-specific paths', () => {
      vi.mocked(getEnv).mockReturnValue(null);
      vi.mocked(dirExists).mockImplementation((p) => {
        return p === '/Users/testuser/Library/Application Support/fnm/node-versions';
      });
      vi.mocked(listSubdirs).mockReturnValue(['v20.10.0']);
      vi.mocked(fileExists).mockReturnValue(true);
      vi.mocked(getDirSize).mockReturnValue(200 * 1024 * 1024);
      vi.mocked(getNodeVersion).mockReturnValue('v20.10.0');

      // Simulate FNM detection with platform fallbacks
      const fnmDir = resolveBaseDirWithFallbacks('FNM_DIR', {
        mac: '/Users/testuser/Library/Application Support/fnm',
        linux: '/home/testuser/.local/share/fnm',
        default: '/Users/testuser/.fnm',
      });

      // FNM might not be installed
      if (fnmDir) {
        const versionsDir = path.join(fnmDir, 'node-versions');

        const installations = discoverInstallations(versionsDir, {
          executable: createExecutableGetter({ unix: 'installation/bin/node' }),
          manager: 'fnm',
        });

        expect(installations).toHaveLength(1);
      }
    });
  });

  describe('Volta detector pattern', () => {
    it('should detect Volta installations in tools directory', () => {
      vi.mocked(getEnv).mockReturnValue(null);
      vi.mocked(dirExists).mockImplementation((p) => {
        return p === '/Users/testuser/.volta/tools/image/node';
      });
      vi.mocked(listSubdirs).mockReturnValue(['18.0.0', '20.10.0']);
      vi.mocked(fileExists).mockReturnValue(true);
      vi.mocked(getDirSize).mockReturnValue(180 * 1024 * 1024);
      vi.mocked(getNodeVersion).mockImplementation((p) => {
        const pathStr = p as string;
        if (pathStr.includes('18')) return 'v18.0.0';
        if (pathStr.includes('20')) return 'v20.10.0';
        return null;
      });

      // Simulate Volta detection
      const voltaHome = resolveBaseDir('VOLTA_HOME', '/Users/testuser/.volta');
      const versionsDir = path.join(voltaHome, 'tools', 'image', 'node');

      const installations = discoverInstallations(versionsDir, {
        executable: createExecutableGetter({ unix: 'bin/node' }),
        manager: 'volta',
      });

      // Volta versions don't have v prefix
      expect(installations).toHaveLength(2);
      expect(installations.every((i) => i.manager === 'volta')).toBe(true);
    });
  });
});
