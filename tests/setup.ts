/**
 * Vitest test setup
 * Common utilities and global configuration
 */

import { beforeAll, afterAll, vi } from 'vitest';

// Ensure consistent environment
beforeAll(() => {
  // Suppress console output during tests unless needed
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

/**
 * Test fixture helpers
 */
export const fixtures = {
  /**
   * Create a mock Installation object
   */
  createInstallation(overrides = {}) {
    return {
      version: '20.0.0',
      path: '/test/.nvm/versions/node/v20.0.0',
      executable: '/test/.nvm/versions/node/v20.0.0/bin/node',
      size: 150 * 1024 * 1024,
      verified: 'v20.0.0',
      manager: 'nvm',
      ...overrides,
    };
  },

  /**
   * Create a mock DetectorResult object
   */
  createDetectorResult(overrides = {}) {
    return {
      baseDir: '/test/.nvm',
      versionsDir: '/test/.nvm/versions/node',
      installations: [fixtures.createInstallation()],
      defaultVersion: 'v20.0.0',
      envVar: 'NVM_DIR',
      envVarSet: true,
      ...overrides,
    };
  },

  /**
   * Create mock ScanResults
   */
  createScanResults(managers: Record<string, unknown> = {}) {
    return {
      nvm: null,
      fnm: null,
      volta: null,
      asdf: null,
      n: null,
      mise: null,
      homebrew: null,
      system: null,
      path: null,
      ...managers,
    };
  },
};

/**
 * Wait for all promises to settle
 */
export function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Create a mock file system structure
 */
export function createMockFs(structure: Record<string, string | null>) {
  return {
    existsSync: vi.fn((p: string) => p in structure),
    readFileSync: vi.fn((p: string) => {
      if (p in structure && structure[p] !== null) {
        return structure[p];
      }
      throw new Error(`ENOENT: no such file: ${p}`);
    }),
    statSync: vi.fn((p: string) => {
      if (!(p in structure)) {
        throw new Error(`ENOENT: no such file: ${p}`);
      }
      return {
        isFile: () => structure[p] !== null,
        isDirectory: () => structure[p] === null,
        isSymbolicLink: () => false,
        size: structure[p]?.length ?? 0,
      };
    }),
    readdirSync: vi.fn((p: string) => {
      const entries: string[] = [];
      const prefix = p.endsWith('/') ? p : p + '/';
      for (const key of Object.keys(structure)) {
        if (key.startsWith(prefix) && key !== p) {
          const rest = key.slice(prefix.length);
          const nextSlash = rest.indexOf('/');
          const entry = nextSlash === -1 ? rest : rest.slice(0, nextSlash);
          if (!entries.includes(entry)) {
            entries.push(entry);
          }
        }
      }
      return entries;
    }),
    lstatSync: vi.fn((p: string) => {
      if (!(p in structure)) {
        throw new Error(`ENOENT: no such file: ${p}`);
      }
      return {
        isFile: () => structure[p] !== null,
        isDirectory: () => structure[p] === null,
        isSymbolicLink: () => false,
        size: structure[p]?.length ?? 0,
      };
    }),
  };
}
