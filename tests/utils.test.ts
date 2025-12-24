/**
 * Tests for utility functions
 * @module tests/utils.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Mock child_process
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(() => ({
    unref: vi.fn(),
  })),
}));

describe('utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatSize', () => {
    // Import dynamically to avoid module initialization issues
    it('should format bytes', async () => {
      const { formatSize } = await import('../src/utils.js');
      expect(formatSize(0)).toBe('0 B');
      expect(formatSize(512)).toBe('512 B');
      expect(formatSize(1023)).toBe('1023 B');
    });

    it('should format kilobytes', async () => {
      const { formatSize } = await import('../src/utils.js');
      expect(formatSize(1024)).toBe('1.0 KB');
      expect(formatSize(1536)).toBe('1.5 KB');
      expect(formatSize(1024 * 1024 - 1)).toBe('1024.0 KB');
    });

    it('should format megabytes', async () => {
      const { formatSize } = await import('../src/utils.js');
      expect(formatSize(1024 * 1024)).toBe('1.0 MB');
      expect(formatSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
      expect(formatSize(500 * 1024 * 1024)).toBe('500.0 MB');
    });

    it('should format gigabytes', async () => {
      const { formatSize } = await import('../src/utils.js');
      expect(formatSize(1024 * 1024 * 1024)).toBe('1.00 GB');
      expect(formatSize(2.5 * 1024 * 1024 * 1024)).toBe('2.50 GB');
    });
  });

  describe('getEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return environment variable value', async () => {
      const { getEnv } = await import('../src/utils.js');
      process.env.TEST_VAR = 'test_value';
      expect(getEnv('TEST_VAR')).toBe('test_value');
    });

    it('should return null for undefined variable', async () => {
      const { getEnv } = await import('../src/utils.js');
      delete process.env.UNDEFINED_VAR;
      expect(getEnv('UNDEFINED_VAR')).toBeNull();
    });

    it('should return empty string if set to empty', async () => {
      const { getEnv } = await import('../src/utils.js');
      process.env.EMPTY_VAR = '';
      expect(getEnv('EMPTY_VAR')).toBe('');
    });
  });

  describe('runCommand', () => {
    it('should return stdout on successful command', async () => {
      const { runCommand } = await import('../src/utils.js');
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: '  result  \n',
        stderr: '',
        pid: 1234,
        output: [],
        signal: null,
      });

      expect(runCommand('echo', ['hello'])).toBe('result');
      expect(spawnSync).toHaveBeenCalledWith('echo', ['hello'], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });
    });

    it('should return null on non-zero exit', async () => {
      const { runCommand } = await import('../src/utils.js');
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'error',
        pid: 1234,
        output: [],
        signal: null,
      });

      expect(runCommand('failing-command', [])).toBeNull();
    });

    it('should return null on exception', async () => {
      const { runCommand } = await import('../src/utils.js');
      vi.mocked(spawnSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      expect(runCommand('nonexistent', [])).toBeNull();
    });

    it('should handle command with no args', async () => {
      const { runCommand } = await import('../src/utils.js');
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: 'v20.0.0',
        stderr: '',
        pid: 1234,
        output: [],
        signal: null,
      });

      expect(runCommand('node')).toBe('v20.0.0');
      expect(spawnSync).toHaveBeenCalledWith('node', [], expect.any(Object));
    });
  });

  describe('dirExists', () => {
    it('should return true for existing directory', async () => {
      const { dirExists } = await import('../src/utils.js');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);

      expect(dirExists('/some/path')).toBe(true);
    });

    it('should return false for non-existing path', async () => {
      const { dirExists } = await import('../src/utils.js');
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      expect(dirExists('/nonexistent')).toBe(false);
    });

    it('should return false for file (not directory)', async () => {
      const { dirExists } = await import('../src/utils.js');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);

      expect(dirExists('/some/file.txt')).toBe(false);
    });

    it('should return false on error', async () => {
      const { dirExists } = await import('../src/utils.js');
      vi.spyOn(fs, 'existsSync').mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(dirExists('/protected/path')).toBe(false);
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const { fileExists } = await import('../src/utils.js');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true } as fs.Stats);

      expect(fileExists('/some/file.txt')).toBe(true);
    });

    it('should return false for directory', async () => {
      const { fileExists } = await import('../src/utils.js');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => false } as fs.Stats);

      expect(fileExists('/some/directory')).toBe(false);
    });

    it('should return false for non-existing path', async () => {
      const { fileExists } = await import('../src/utils.js');
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      expect(fileExists('/nonexistent.txt')).toBe(false);
    });
  });

  describe('getDirSize', () => {
    it('should calculate directory size', async () => {
      const { getDirSize } = await import('../src/utils.js');
      vi.spyOn(fs, 'readdirSync').mockReturnValue(['file1.txt', 'file2.txt'] as unknown as fs.Dirent[]);
      vi.spyOn(fs, 'lstatSync').mockImplementation((p) => {
        const filePath = p as string;
        if (filePath.endsWith('file1.txt')) {
          return { isDirectory: () => false, isSymbolicLink: () => false, size: 100 } as fs.Stats;
        }
        return { isDirectory: () => false, isSymbolicLink: () => false, size: 200 } as fs.Stats;
      });

      expect(getDirSize('/test/dir')).toBe(300);
    });

    it('should skip symlinks', async () => {
      const { getDirSize } = await import('../src/utils.js');
      vi.spyOn(fs, 'readdirSync').mockReturnValue(['link', 'file.txt'] as unknown as fs.Dirent[]);
      vi.spyOn(fs, 'lstatSync').mockImplementation((p) => {
        const filePath = p as string;
        if (filePath.endsWith('link')) {
          return { isDirectory: () => false, isSymbolicLink: () => true, size: 1000 } as fs.Stats;
        }
        return { isDirectory: () => false, isSymbolicLink: () => false, size: 100 } as fs.Stats;
      });

      expect(getDirSize('/test/dir')).toBe(100);
    });

    it('should return 0 on error', async () => {
      const { getDirSize } = await import('../src/utils.js');
      vi.spyOn(fs, 'readdirSync').mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(getDirSize('/protected/dir')).toBe(0);
    });
  });

  describe('listSubdirs', () => {
    it('should filter hidden directories', async () => {
      const { listSubdirs } = await import('../src/utils.js');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);
      vi.spyOn(fs, 'readdirSync').mockReturnValue(['visible', '.hidden'] as unknown as fs.Dirent[]);

      const result = listSubdirs('/test');
      expect(result).toContain('visible');
      expect(result).not.toContain('.hidden');
    });

    it('should return empty array on error', async () => {
      const { listSubdirs, dirExists } = await import('../src/utils.js');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);
      vi.spyOn(fs, 'readdirSync').mockImplementation(() => {
        throw new Error('Access denied');
      });

      expect(listSubdirs('/protected')).toEqual([]);
    });
  });

  describe('isPathSafeForDeletion', () => {
    it('should allow paths within nvm directory', async () => {
      const { isPathSafeForDeletion, HOME } = await import('../src/utils.js');
      vi.spyOn(fs, 'lstatSync').mockReturnValue({ isSymbolicLink: () => false } as fs.Stats);

      const nvmPath = path.join(HOME, '.nvm', 'versions', 'node', 'v18.0.0');
      expect(isPathSafeForDeletion(nvmPath)).toBe(true);
    });

    it('should allow paths within fnm directory', async () => {
      const { isPathSafeForDeletion, HOME } = await import('../src/utils.js');
      vi.spyOn(fs, 'lstatSync').mockReturnValue({ isSymbolicLink: () => false } as fs.Stats);

      const fnmPath = path.join(HOME, '.fnm', 'node-versions', 'v20.0.0');
      expect(isPathSafeForDeletion(fnmPath)).toBe(true);
    });

    it('should allow paths within volta directory', async () => {
      const { isPathSafeForDeletion, HOME } = await import('../src/utils.js');
      vi.spyOn(fs, 'lstatSync').mockReturnValue({ isSymbolicLink: () => false } as fs.Stats);

      const voltaPath = path.join(HOME, '.volta', 'tools', 'node', '18.0.0');
      expect(isPathSafeForDeletion(voltaPath)).toBe(true);
    });

    it('should reject paths outside allowed directories', async () => {
      const { isPathSafeForDeletion } = await import('../src/utils.js');
      expect(isPathSafeForDeletion('/usr/local/bin/node')).toBe(false);
      expect(isPathSafeForDeletion('/etc/passwd')).toBe(false);
    });

    it('should reject symlinks', async () => {
      const { isPathSafeForDeletion, HOME } = await import('../src/utils.js');
      vi.spyOn(fs, 'lstatSync').mockReturnValue({ isSymbolicLink: () => true } as fs.Stats);

      const nvmPath = path.join(HOME, '.nvm', 'versions', 'node', 'v18.0.0');
      expect(isPathSafeForDeletion(nvmPath)).toBe(false);
    });

    it('should reject on stat error', async () => {
      const { isPathSafeForDeletion, HOME } = await import('../src/utils.js');
      vi.spyOn(fs, 'lstatSync').mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const nvmPath = path.join(HOME, '.nvm', 'versions', 'node', 'v18.0.0');
      expect(isPathSafeForDeletion(nvmPath)).toBe(false);
    });

    it('should reject base directory itself', async () => {
      const { isPathSafeForDeletion, HOME } = await import('../src/utils.js');
      vi.spyOn(fs, 'lstatSync').mockReturnValue({ isSymbolicLink: () => false } as fs.Stats);

      // Can't delete .nvm itself, only paths within it
      const nvmBase = path.join(HOME, '.nvm');
      expect(isPathSafeForDeletion(nvmBase)).toBe(false);
    });
  });

  describe('readFileContent', () => {
    it('should read file content', async () => {
      const { readFileContent } = await import('../src/utils.js');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('file content');

      expect(readFileContent('/test/file.txt')).toBe('file content');
    });

    it('should return null for non-existent file', async () => {
      const { readFileContent } = await import('../src/utils.js');
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      expect(readFileContent('/nonexistent.txt')).toBeNull();
    });

    it('should return null on read error', async () => {
      const { readFileContent } = await import('../src/utils.js');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('Read error');
      });

      expect(readFileContent('/error.txt')).toBeNull();
    });
  });
});
