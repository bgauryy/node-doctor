/**
 * NPM/Yarn/pnpm Registry Detection
 * Detects configured npm registries from various config files
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileExists, readFileContent, isWindows, HOME, getDirSize } from '../utils.js';
import type { RegistryInfo, RegistryStatusResult, RegistrySource, RegistrySourceConfig, ScopedRegistry, PackageManagerInfo } from '../types/index.js';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';

interface NpmrcConfig {
  registry: string | null;
  scopes: Record<string, string>;
}

interface YarnBerryConfig {
  npmRegistryServer: string | null;
  npmScopes: Record<string, string>;
}

/**
 * Get platform-specific global npmrc path
 */
function getGlobalNpmrcPath(): string {
  if (isWindows) {
    const appData = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
    return path.join(appData, 'npm', 'etc', 'npmrc');
  }
  // macOS/Linux: try common locations
  const prefixPath = process.env.npm_config_prefix || '/usr/local';
  return path.join(prefixPath, 'etc', 'npmrc');
}

/**
 * Check connectivity to a registry
 * Returns { available: boolean, latency: number, status: number }
 */
export async function checkRegistryStatus(url: string | null): Promise<RegistryStatusResult> {
  if (!url) return { available: false, latency: 0, status: 0 };

  // Normalize URL
  const targetUrl = url.endsWith('/') ? url : `${url}/`;
  const pingUrl = targetUrl; // Most registries respond to root, or we could try /ping

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

    const response = await fetch(pingUrl, {
      method: 'HEAD', // HEAD is lighter
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - start;

    return {
      available: response.ok || response.status === 401, // 401 means reachable but auth required
      latency,
      status: response.status
    };
  } catch (err) {
    return {
      available: false,
      latency: Date.now() - start,
      status: 0,
      error: (err as Error).message
    };
  }
}

/**
 * Parse .npmrc or .yarnrc file (INI format)
 * Handles both key=value and key "value" formats
 */
function parseNpmrc(filePath: string): NpmrcConfig | null {
  const content = readFileContent(filePath);
  if (!content) return null;

  const config: NpmrcConfig = {
    registry: null,
    scopes: {},
  };

  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;

    // Handle key=value format (.npmrc style)
    const eqMatch = trimmed.match(/^([^=]+)=(.+)$/);
    if (eqMatch) {
      const key = eqMatch[1].trim();
      const value = eqMatch[2].trim().replace(/^["']|["']$/g, '');

      if (key === 'registry') {
        config.registry = value;
      } else if (key.match(/^@[\w-]+:registry$/)) {
        // Scoped registry: @scope:registry=URL
        const scope = key.replace(/:registry$/, '');
        config.scopes[scope] = value;
      }
      continue;
    }

    // Handle key "value" format (.yarnrc classic style)
    const spaceMatch = trimmed.match(/^"?([^"\s]+)"?\s+"?([^"]+)"?$/);
    if (spaceMatch) {
      const key = spaceMatch[1].trim();
      const value = spaceMatch[2].trim().replace(/^["']|["']$/g, '');

      if (key === 'registry') {
        config.registry = value;
      } else if (key.match(/^@[\w-]+:registry$/)) {
        const scope = key.replace(/:registry$/, '');
        config.scopes[scope] = value;
      }
    }
  }

  return config;
}

/**
 * Parse .yarnrc.yml file (YAML format)
 * Simple regex-based extraction without YAML library
 */
function parseYarnBerryConfig(filePath: string): YarnBerryConfig | null {
  const content = readFileContent(filePath);
  if (!content) return null;

  const config: YarnBerryConfig = {
    npmRegistryServer: null,
    npmScopes: {},
  };

  // Extract npmRegistryServer
  const registryMatch = content.match(/^npmRegistryServer:\s*["']?([^"'\n]+)["']?/m);
  if (registryMatch) {
    config.npmRegistryServer = registryMatch[1].trim();
  }

  // Extract scoped registries from npmScopes section
  // Looking for pattern like:
  // npmScopes:
  //   scopename:
  //     npmRegistryServer: "url"
  const scopesMatch = content.match(/^npmScopes:\s*\n((?:\s+.+\n?)+)/m);
  if (scopesMatch) {
    const scopesContent = scopesMatch[1];
    // Match each scope block
    const scopeBlocks = scopesContent.matchAll(/^\s{2}([\w-]+):\s*\n((?:\s{4}.+\n?)+)/gm);

    for (const block of scopeBlocks) {
      const scopeName = block[1];
      const scopeContent = block[2];

      const scopeRegistryMatch = scopeContent.match(/npmRegistryServer:\s*["']?([^"'\n]+)["']?/);
      if (scopeRegistryMatch) {
        config.npmScopes[`@${scopeName}`] = scopeRegistryMatch[1].trim();
      }
    }
  }

  return config;
}

/**
 * Main registry detection function
 * Returns comprehensive registry configuration info
 */
export function detectNpmRegistry(): RegistryInfo {
  const result: RegistryInfo = {
    // Effective global registry
    global: {
      registry: DEFAULT_REGISTRY,
      source: 'default' as RegistrySource,
      path: null,
    },
    // Project-local registry (if different from global)
    local: null,
    // Scoped registries
    scopes: {},
    // All config files found
    configFiles: [],
  };

  const cwd = process.cwd();

  // Define all config file locations to check
  const configLocations = [
    { type: 'project-npmrc' as const, path: path.join(cwd, '.npmrc'), format: 'ini' },
    { type: 'user-npmrc' as const, path: path.join(HOME, '.npmrc'), format: 'ini' },
    { type: 'global-npmrc' as const, path: getGlobalNpmrcPath(), format: 'ini' },
    { type: 'project-yarnrc' as const, path: path.join(cwd, '.yarnrc'), format: 'ini' },
    { type: 'user-yarnrc' as const, path: path.join(HOME, '.yarnrc'), format: 'ini' },
    { type: 'project-yarnrc-yml' as const, path: path.join(cwd, '.yarnrc.yml'), format: 'yaml' },
  ];

  // Track which files exist
  for (const loc of configLocations) {
    result.configFiles.push({
      type: loc.type,
      path: loc.path,
      exists: fileExists(loc.path),
    });
  }

  // 1. Check environment variable first (highest priority)
  const envRegistry = process.env.npm_config_registry || process.env.NPM_CONFIG_REGISTRY;
  if (envRegistry) {
    result.global = {
      registry: envRegistry,
      source: 'environment' as RegistrySource,
      path: null,
    };
  }

  // 2. Check config files in priority order for global registry
  // Only update if not already set from environment
  if (result.global.source === 'default') {
    // Project .npmrc
    const projectNpmrc = parseNpmrc(path.join(cwd, '.npmrc'));
    if (projectNpmrc?.registry) {
      result.local = {
        registry: projectNpmrc.registry,
        source: 'project-npmrc' as RegistrySource,
        path: path.join(cwd, '.npmrc'),
      };
    }

    // User ~/.npmrc
    const userNpmrc = parseNpmrc(path.join(HOME, '.npmrc'));
    if (userNpmrc?.registry) {
      result.global = {
        registry: userNpmrc.registry,
        source: 'user-npmrc' as RegistrySource,
        path: path.join(HOME, '.npmrc'),
      };
    }

    // Global npmrc (only if user didn't set it)
    if (result.global.source === 'default') {
      const globalNpmrc = parseNpmrc(getGlobalNpmrcPath());
      if (globalNpmrc?.registry) {
        result.global = {
          registry: globalNpmrc.registry,
          source: 'global-npmrc' as RegistrySource,
          path: getGlobalNpmrcPath(),
        };
      }
    }
  }

  // 3. Also check Yarn configs
  // Yarn Classic .yarnrc
  const userYarnrc = parseNpmrc(path.join(HOME, '.yarnrc'));
  const projectYarnrc = parseNpmrc(path.join(cwd, '.yarnrc'));

  // Yarn Berry .yarnrc.yml
  const projectYarnBerry = parseYarnBerryConfig(path.join(cwd, '.yarnrc.yml'));

  // 4. Collect all scoped registries from all config files
  const collectScopes = (
    config: NpmrcConfig | YarnBerryConfig | null,
    source: RegistrySource,
    configPath: string
  ): void => {
    if (!config) return;

    // From .npmrc/.yarnrc
    if ('scopes' in config && config.scopes) {
      for (const [scope, registry] of Object.entries(config.scopes)) {
        if (!result.scopes[scope]) {
          result.scopes[scope] = { registry, source, path: configPath } as ScopedRegistry;
        }
      }
    }

    // From .yarnrc.yml
    if ('npmScopes' in config && config.npmScopes) {
      for (const [scope, registry] of Object.entries(config.npmScopes)) {
        if (!result.scopes[scope]) {
          result.scopes[scope] = { registry, source, path: configPath } as ScopedRegistry;
        }
      }
    }
  };

  // Collect scopes from all sources (project takes priority)
  const projectNpmrcScopes = parseNpmrc(path.join(cwd, '.npmrc'));
  const userNpmrcScopes = parseNpmrc(path.join(HOME, '.npmrc'));
  const globalNpmrc = parseNpmrc(getGlobalNpmrcPath());

  collectScopes(projectNpmrcScopes, 'project-npmrc' as RegistrySource, path.join(cwd, '.npmrc'));
  collectScopes(projectYarnrc, 'project-yarnrc' as RegistrySource, path.join(cwd, '.yarnrc'));
  collectScopes(projectYarnBerry, 'project-yarnrc-yml' as RegistrySource, path.join(cwd, '.yarnrc.yml'));
  collectScopes(userNpmrcScopes, 'user-npmrc' as RegistrySource, path.join(HOME, '.npmrc'));
  collectScopes(userYarnrc, 'user-yarnrc' as RegistrySource, path.join(HOME, '.yarnrc'));
  collectScopes(globalNpmrc, 'global-npmrc' as RegistrySource, getGlobalNpmrcPath());

  return result;
}

/**
 * Get a human-readable source label
 */
export function getSourceLabel(source: RegistrySource): string {
  const labels: Record<string, string> = {
    'default': 'default',
    'environment': 'env var',
    'project-npmrc': 'project .npmrc',
    'user-npmrc': '~/.npmrc',
    'global-npmrc': 'global config',
    'project-yarnrc': 'project .yarnrc',
    'user-yarnrc': '~/.yarnrc',
    'project-yarnrc-yml': '.yarnrc.yml',
    'pnpm': 'pnpm config',
  };
  return labels[source as string] || source;
}

// ═══════════════════════════════════════════════════════════════
// Package Manager Detection (npm, yarn, pnpm)
// ═══════════════════════════════════════════════════════════════

/**
 * Get npm cache location and size
 */
function getNpmCacheInfo(): { path: string | null; size: number } {
  try {
    const result = spawnSync('npm', ['config', 'get', 'cache'], {
      encoding: 'utf8',
      timeout: 5000,
      shell: isWindows,
    });
    if (result.status === 0 && result.stdout) {
      const cachePath = result.stdout.trim();
      if (cachePath && fileExists(cachePath)) {
        return { path: cachePath, size: getDirSize(cachePath) };
      }
      return { path: cachePath, size: 0 };
    }
  } catch {
    // ignore
  }
  // Default locations
  const defaultPath = isWindows
    ? path.join(HOME, 'AppData', 'Local', 'npm-cache')
    : path.join(HOME, '.npm');
  return { path: defaultPath, size: fileExists(defaultPath) ? getDirSize(defaultPath) : 0 };
}

/**
 * Get yarn cache location and size
 */
function getYarnCacheInfo(): { path: string | null; size: number; version: string | null } {
  let version: string | null = null;

  // Get yarn version first
  try {
    const vResult = spawnSync('yarn', ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      shell: isWindows,
    });
    if (vResult.status === 0 && vResult.stdout) {
      version = vResult.stdout.trim();
    }
  } catch {
    // ignore
  }

  // Get cache path
  try {
    const result = spawnSync('yarn', ['cache', 'dir'], {
      encoding: 'utf8',
      timeout: 5000,
      shell: isWindows,
    });
    if (result.status === 0 && result.stdout) {
      const cachePath = result.stdout.trim();
      if (cachePath && fileExists(cachePath)) {
        return { path: cachePath, size: getDirSize(cachePath), version };
      }
      return { path: cachePath, size: 0, version };
    }
  } catch {
    // ignore
  }
  return { path: null, size: 0, version };
}

/**
 * Get pnpm cache/store location and size
 */
function getPnpmStoreInfo(): { path: string | null; size: number; version: string | null } {
  let version: string | null = null;

  // Get pnpm version
  try {
    const vResult = spawnSync('pnpm', ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      shell: isWindows,
    });
    if (vResult.status === 0 && vResult.stdout) {
      version = vResult.stdout.trim();
    }
  } catch {
    // ignore
  }

  // Get store path
  try {
    const result = spawnSync('pnpm', ['store', 'path'], {
      encoding: 'utf8',
      timeout: 5000,
      shell: isWindows,
    });
    if (result.status === 0 && result.stdout) {
      const storePath = result.stdout.trim();
      if (storePath && fileExists(storePath)) {
        return { path: storePath, size: getDirSize(storePath), version };
      }
      return { path: storePath, size: 0, version };
    }
  } catch {
    // ignore
  }
  return { path: null, size: 0, version };
}

/**
 * Get yarn registry (checks yarn config)
 */
function getYarnRegistry(): { registry: string | null; source: string } {
  // Check yarn config
  try {
    const result = spawnSync('yarn', ['config', 'get', 'registry'], {
      encoding: 'utf8',
      timeout: 5000,
      shell: isWindows,
    });
    if (result.status === 0 && result.stdout) {
      const registry = result.stdout.trim();
      if (registry && registry !== 'undefined' && !registry.includes('Usage:')) {
        return { registry, source: 'yarn config' };
      }
    }
  } catch {
    // ignore
  }

  // Check .yarnrc file
  const yarnrcPath = path.join(HOME, '.yarnrc');
  const yarnrc = parseNpmrc(yarnrcPath);
  if (yarnrc?.registry) {
    return { registry: yarnrc.registry, source: '~/.yarnrc' };
  }

  // Check .yarnrc.yml
  const yarnrcYml = parseYarnBerryConfig(path.join(HOME, '.yarnrc.yml'));
  if (yarnrcYml?.npmRegistryServer) {
    return { registry: yarnrcYml.npmRegistryServer, source: '~/.yarnrc.yml' };
  }

  return { registry: null, source: 'default' };
}

/**
 * Get pnpm registry
 */
function getPnpmRegistry(): { registry: string | null; source: string } {
  try {
    const result = spawnSync('pnpm', ['config', 'get', 'registry'], {
      encoding: 'utf8',
      timeout: 5000,
      shell: isWindows,
    });
    if (result.status === 0 && result.stdout) {
      const registry = result.stdout.trim();
      if (registry && registry !== 'undefined' && registry !== 'null') {
        return { registry, source: 'pnpm config' };
      }
    }
  } catch {
    // ignore
  }

  // Check .npmrc (pnpm uses same config)
  const npmrc = parseNpmrc(path.join(HOME, '.npmrc'));
  if (npmrc?.registry) {
    return { registry: npmrc.registry, source: '~/.npmrc' };
  }

  return { registry: null, source: 'default' };
}

/**
 * Get npx cache info
 */
function getNpxCacheInfo(): { path: string | null; size: number } {
  // npx cache is typically in npm cache/_npx
  const npmCache = getNpmCacheInfo();
  if (npmCache.path) {
    const npxPath = path.join(npmCache.path, '_npx');
    if (fileExists(npxPath)) {
      return { path: npxPath, size: getDirSize(npxPath) };
    }
  }
  return { path: null, size: 0 };
}

/**
 * Get comprehensive package manager info
 */
export function getPackageManagersInfo(): PackageManagerInfo {
  const npmCache = getNpmCacheInfo();
  const yarnCache = getYarnCacheInfo();
  const pnpmStore = getPnpmStoreInfo();
  const npxCache = getNpxCacheInfo();
  const yarnRegistry = getYarnRegistry();
  const pnpmRegistry = getPnpmRegistry();

  // Get npm version
  let npmVersion: string | null = null;
  try {
    const result = spawnSync('npm', ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      shell: isWindows,
    });
    if (result.status === 0 && result.stdout) {
      npmVersion = result.stdout.trim();
    }
  } catch {
    // ignore
  }

  return {
    npm: {
      version: npmVersion,
      cache: npmCache,
      registry: null, // Already covered by detectNpmRegistry
    },
    yarn: {
      version: yarnCache.version,
      cache: { path: yarnCache.path, size: yarnCache.size },
      registry: yarnRegistry.registry,
      registrySource: yarnRegistry.source,
    },
    pnpm: {
      version: pnpmStore.version,
      store: { path: pnpmStore.path, size: pnpmStore.size },
      registry: pnpmRegistry.registry,
      registrySource: pnpmRegistry.source,
    },
    npx: {
      cache: npxCache,
    },
  };
}
