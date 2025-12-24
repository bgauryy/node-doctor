/**
 * Unified Health Assessment Engine
 *
 * Single source of truth for all health checks.
 * Used by both interactive Doctor and CLI commands.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileExists, getNodeVersion, isWindows } from '../utils.js';
import { detectShellConfigs } from '../shell-config.js';
import { detectors } from '../detectors/index.js';
import { identifyRunner } from './path.js';
import { detectNpmRegistry, checkRegistryStatus, getPackageManagersInfo } from './registry.js';
import { fetchReleaseSchedule, fetchDistIndex, checkEOL, checkSecurity, type ReleaseSchedule, type DistRelease } from './security.js';
import { findAllNodeProcesses } from './port-exorcist.js';
import { c, bold, dim } from '../colors.js';
import type {
  ScanResults,
  Platform,
  HealthData,
  HealthCheck,
  HealthAssessment,
  HealthCheckStatus,
  FoundNode,
  DetectedManager,
  NodeConfigEntry,
  NodeConfigEntryRaw,
  CIPortProcess,
  DuplicateVersion,
  PackageManagerInfo,
  EnvVarInfo,
  GlobalPackagesSummary,
  PermissionCheck,
  CorepackInfo,
  ShellConfigFile,
  NpmPrefixCheck,
  ShellSlowStartupCheck,
  SlowStartupPattern,
  VersionFileConflict,
  VersionFileInfo,
  NodeGypReadiness,
  NpmCacheHealth,
  GlobalNpmLocation,
  SymlinkHealth,
  StaleNodeModules,
  IDEIntegration,
  ExtendedHealthChecks,
  EngineCheck,
} from '../types/index.js';
import { listGlobalPackages } from './globals.js';
import { getDirSize } from '../utils.js';

// ═══════════════════════════════════════════════════════════════
// SECTION 1: Helper Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Get npm version
 */
function getNpmVersion(): string | null {
  try {
    const result = spawnSync('npm', ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      shell: isWindows,
    });
    if (result.status === 0 && result.stdout) {
      return result.stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get mnpm version
 */
function getMnpmVersion(): string | null {
  try {
    const result = spawnSync('mnpm', ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      shell: isWindows,
    });
    if (result.status === 0 && result.stdout) {
      return result.stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get all detected managers with their details
 */
function getAllDetectedManagers(results: ScanResults): DetectedManager[] {
  const platform = os.platform() as Platform;
  const managers: DetectedManager[] = [];

  for (const detector of detectors) {
    if (!detector.platforms.includes(platform)) continue;
    if (detector.name === 'path') continue;

    const result = results[detector.name];
    if (result && result.installations && result.installations.length > 0) {
      const totalSize = result.installations.reduce((sum, inst) => sum + (inst.size || 0), 0);
      managers.push({
        name: detector.name,
        displayName: detector.displayName,
        icon: detector.icon,
        baseDir: result.baseDir || '',
        versionCount: result.installations.length,
        totalSize,
        envVar: result.envVar,
        envVarSet: result.envVarSet,
        installations: result.installations.map(inst => ({
          version: inst.version,
          path: inst.path,
          size: inst.size || 0,
        })),
      });
    }
  }

  return managers;
}

/**
 * Aggregate raw shell config entries by file path
 */
function aggregateShellConfigs(rawEntries: NodeConfigEntryRaw[]): NodeConfigEntry[] {
  const byPath = new Map<string, { name: string; path: string; managers: Set<string> }>();

  for (const entry of rawEntries) {
    if (!byPath.has(entry.path)) {
      byPath.set(entry.path, {
        name: entry.file,
        path: entry.path,
        managers: new Set(),
      });
    }
    byPath.get(entry.path)!.managers.add(entry.manager);
  }

  return Array.from(byPath.values()).map(item => ({
    name: item.name,
    path: item.path,
    managers: Array.from(item.managers),
  }));
}

/**
 * Scan PATH for Node executables
 */
function scanPathForNodes(
  results: ScanResults,
  schedule: ReleaseSchedule | null,
  distReleases: DistRelease[] | null
): { nodesInPath: FoundNode[]; activeManagers: Set<string> } {
  const pathEnv = process.env.PATH || '';
  const separator = isWindows ? ';' : ':';
  const pathDirs = [...new Set(pathEnv.split(separator).filter(Boolean))];

  const nodeExecutable = isWindows ? 'node.exe' : 'node';
  const nodesInPath: FoundNode[] = [];
  const activeManagers = new Set<string>();

  for (const dir of pathDirs) {
    const nodePath = path.join(dir, nodeExecutable);
    if (fileExists(nodePath)) {
      let realPath = nodePath;
      try {
        realPath = fs.realpathSync(nodePath);
      } catch {}

      const runner = identifyRunner(nodePath, results);
      activeManagers.add(runner.name);
      const version = getNodeVersion(nodePath) || 'unknown';
      const isCurrent = nodePath === process.execPath || realPath === process.execPath;

      const eol = schedule ? checkEOL(version, schedule) : undefined;
      const security = distReleases ? checkSecurity(version, distReleases) : undefined;

      nodesInPath.push({
        executable: nodePath,
        realPath,
        runner,
        version,
        isCurrent,
        eol,
        security,
      });
    }
  }

  return { nodesInPath, activeManagers };
}

/**
 * Collect environment variables (no values for security)
 */
function collectEnvironmentVars(): EnvVarInfo[] {
  const NODE_ENV_VARS = [
    'NODE_ENV',
    'NODE_OPTIONS',
    'NODE_PATH',
    'NODE_EXTRA_CA_CERTS',
    'NPM_CONFIG_REGISTRY',
    'NPM_CONFIG_PREFIX',
    'npm_config_registry',
    'YARN_REGISTRY',
    'PNPM_HOME',
    'COREPACK_HOME',
    'NVM_DIR',
    'FNM_DIR',
    'VOLTA_HOME',
    'N_PREFIX',
  ];

  return NODE_ENV_VARS.map(name => ({
    name,
    isSet: !!process.env[name],
  }));
}

/**
 * Collect authentication tokens status
 */
function collectAuthTokens(): EnvVarInfo[] {
  const TOKEN_VARS = [
    'NPM_TOKEN',
    'GITHUB_TOKEN',
    'GH_TOKEN',
    'NODE_AUTH_TOKEN',
  ];

  return TOKEN_VARS.map(name => ({
    name,
    isSet: !!process.env[name],
  }));
}

/**
 * Collect global packages summary with duplicate detection
 */
function collectGlobalPackagesSummary(): GlobalPackagesSummary {
  const globals = listGlobalPackages();

  const npmSize = globals.npm.reduce((sum, pkg) => sum + (pkg.size || 0), 0);
  const yarnSize = globals.yarn.reduce((sum, pkg) => sum + (pkg.size || 0), 0);
  const pnpmSize = globals.pnpm.reduce((sum, pkg) => sum + (pkg.size || 0), 0);

  // Find packages installed in multiple managers
  const allNames = new Map<string, string[]>();
  for (const pkg of globals.npm) {
    allNames.set(pkg.name, [...(allNames.get(pkg.name) || []), 'npm']);
  }
  for (const pkg of globals.yarn) {
    allNames.set(pkg.name, [...(allNames.get(pkg.name) || []), 'yarn']);
  }
  for (const pkg of globals.pnpm) {
    allNames.set(pkg.name, [...(allNames.get(pkg.name) || []), 'pnpm']);
  }

  const duplicates = Array.from(allNames.entries())
    .filter(([_, managers]) => managers.length > 1)
    .map(([name]) => name);

  return {
    npm: { count: globals.npm.length, size: npmSize },
    yarn: { count: globals.yarn.length, size: yarnSize },
    pnpm: { count: globals.pnpm.length, size: pnpmSize },
    totalCount: globals.npm.length + globals.yarn.length + globals.pnpm.length,
    totalSize: npmSize + yarnSize + pnpmSize,
    duplicates,
  };
}

/**
 * Check permissions on critical directories
 */
function checkPermissions(): PermissionCheck[] {
  const checks: PermissionCheck[] = [];

  // npm global prefix
  try {
    const result = spawnSync('npm', ['config', 'get', 'prefix'], {
      encoding: 'utf8',
      timeout: 5000,
      shell: isWindows,
    });
    if (result.status === 0 && result.stdout) {
      const npmPrefix = result.stdout.trim();
      const libPath = isWindows
        ? path.join(npmPrefix, 'node_modules')
        : path.join(npmPrefix, 'lib', 'node_modules');
      let writable = false;
      let exists = false;
      try {
        exists = fs.existsSync(libPath);
        if (exists) {
          fs.accessSync(libPath, fs.constants.W_OK);
          writable = true;
        }
      } catch {
        writable = false;
      }
      checks.push({ name: 'npm global', path: libPath, exists, writable });
    }
  } catch {
    // ignore
  }

  // npm cache
  try {
    const result = spawnSync('npm', ['config', 'get', 'cache'], {
      encoding: 'utf8',
      timeout: 5000,
      shell: isWindows,
    });
    if (result.status === 0 && result.stdout) {
      const cachePath = result.stdout.trim();
      let writable = false;
      let exists = false;
      try {
        exists = fs.existsSync(cachePath);
        if (exists) {
          fs.accessSync(cachePath, fs.constants.W_OK);
          writable = true;
        }
      } catch {
        writable = false;
      }
      checks.push({ name: 'npm cache', path: cachePath, exists, writable });
    }
  } catch {
    // ignore
  }

  // yarn cache (if yarn is installed)
  try {
    const result = spawnSync('yarn', ['cache', 'dir'], {
      encoding: 'utf8',
      timeout: 5000,
      shell: isWindows,
    });
    if (result.status === 0 && result.stdout) {
      const cachePath = result.stdout.trim();
      let writable = false;
      let exists = false;
      try {
        exists = fs.existsSync(cachePath);
        if (exists) {
          fs.accessSync(cachePath, fs.constants.W_OK);
          writable = true;
        }
      } catch {
        writable = false;
      }
      checks.push({ name: 'yarn cache', path: cachePath, exists, writable });
    }
  } catch {
    // yarn not installed
  }

  return checks;
}

/**
 * Get corepack installation and status info
 */
function getCorepackInfo(): CorepackInfo {
  const result: CorepackInfo = {
    installed: false,
    version: null,
    enabled: false,
    managedManagers: [],
    packageManagerField: null,
  };

  // Check corepack version
  try {
    const versionResult = spawnSync('corepack', ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      shell: isWindows,
    });
    if (versionResult.status === 0 && versionResult.stdout) {
      result.installed = true;
      result.version = versionResult.stdout.trim();
    }
  } catch {
    // corepack not installed
  }

  if (!result.installed) {
    return result;
  }

  // Check if corepack is enabled by checking for shims
  // On Unix: check if yarn/pnpm in PATH point to corepack shims
  // Simpler check: see if COREPACK_HOME or ~/.corepack exists
  const corepackHome = process.env.COREPACK_HOME || path.join(os.homedir(), '.corepack');
  if (fs.existsSync(corepackHome)) {
    result.enabled = true;

    // Check which managers are managed
    try {
      const entries = fs.readdirSync(corepackHome);
      if (entries.some(e => e.startsWith('yarn'))) result.managedManagers.push('yarn');
      if (entries.some(e => e.startsWith('pnpm'))) result.managedManagers.push('pnpm');
      if (entries.some(e => e.startsWith('npm'))) result.managedManagers.push('npm');
    } catch {
      // ignore
    }
  }

  // Check packageManager field in current directory's package.json
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkgContent = fs.readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(pkgContent);
      if (pkg.packageManager) {
        result.packageManagerField = pkg.packageManager;
      }
    }
  } catch {
    // ignore
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 1b: Extended Health Check Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Check npm prefix mismatch with version manager
 */
function checkNpmPrefixMismatch(activeManagers: string[]): NpmPrefixCheck {
  const result: NpmPrefixCheck = {
    prefix: null,
    activeManager: activeManagers[0] || null,
    expectedPrefix: null,
    mismatch: false,
  };

  try {
    const prefixResult = spawnSync('npm', ['config', 'get', 'prefix'], {
      encoding: 'utf8',
      timeout: 5000,
      shell: isWindows,
    });
    if (prefixResult.status === 0 && prefixResult.stdout) {
      result.prefix = prefixResult.stdout.trim();
    }
  } catch {
    return result;
  }

  if (!result.prefix || !result.activeManager) return result;

  // Check expected prefix based on active manager
  const activeManager = result.activeManager.toLowerCase();
  const home = os.homedir();

  const expectedPrefixes: Record<string, string[]> = {
    nvm: [
      path.join(home, '.nvm', 'versions', 'node'),
      path.join(process.env.NVM_DIR || '', 'versions', 'node'),
    ],
    fnm: [
      path.join(home, '.fnm', 'node-versions'),
      path.join(home, 'Library', 'Application Support', 'fnm', 'node-versions'),
    ],
    volta: [path.join(home, '.volta')],
    n: [path.join(home, 'n'), '/usr/local'],
    asdf: [path.join(home, '.asdf', 'installs', 'nodejs')],
    mise: [path.join(home, '.local', 'share', 'mise', 'installs', 'node')],
    homebrew: ['/opt/homebrew', '/usr/local'],
  };

  const expected = expectedPrefixes[activeManager];
  if (expected) {
    result.expectedPrefix = expected[0];
    // Check if prefix contains any expected paths
    const prefixMatch = expected.some(
      exp => result.prefix!.includes(exp) || result.prefix!.startsWith(exp)
    );
    if (!prefixMatch && !result.prefix.includes(activeManager)) {
      // Additional check: npm prefix should be managed by the active manager
      result.mismatch = true;
    }
  }

  return result;
}

/**
 * Check for slow shell startup patterns
 */
function checkShellSlowStartup(shellConfigs: NodeConfigEntry[], rawEntries: NodeConfigEntryRaw[]): ShellSlowStartupCheck {
  const result: ShellSlowStartupCheck = {
    hasSlowPatterns: false,
    patterns: [],
  };

  // Known slow patterns
  const slowPatterns: Array<{ pattern: RegExp; manager: string; suggestion: string }> = [
    {
      pattern: /\$\(nvm\s+/i,
      manager: 'nvm',
      suggestion: 'Use nvm lazy loading: export NVM_LAZY=1 or defer nvm initialization',
    },
    {
      pattern: /eval\s+"\$\(fnm\s+env/i,
      manager: 'fnm',
      suggestion: 'fnm is fast by default. Check if you have redundant eval calls.',
    },
    {
      pattern: /source.*nvm\.sh/i,
      manager: 'nvm',
      suggestion: 'Consider using fnm for faster shell startup (drop-in replacement)',
    },
    {
      pattern: /eval\s+"\$\(nodenv\s+init/i,
      manager: 'nodenv',
      suggestion: 'nodenv init can be slow. Consider using shims directly or lazy loading.',
    },
    {
      pattern: /eval\s+"\$\(rbenv.*nodenv/i,
      manager: 'nodenv',
      suggestion: 'Multiple env tool initializations detected. Consider consolidating.',
    },
    {
      pattern: /n\s+--help.*>/i,
      manager: 'n',
      suggestion: 'n --help in shell config can slow startup. Remove if not needed.',
    },
  ];

  for (const entry of rawEntries) {
    for (const { pattern, manager, suggestion } of slowPatterns) {
      if (pattern.test(entry.content)) {
        result.patterns.push({
          file: entry.file,
          manager,
          line: entry.line,
          suggestion,
        });
        result.hasSlowPatterns = true;
      }
    }
  }

  // Check for multiple manager inits in same file
  const fileManagers = new Map<string, Set<string>>();
  for (const entry of rawEntries) {
    if (!fileManagers.has(entry.file)) {
      fileManagers.set(entry.file, new Set());
    }
    fileManagers.get(entry.file)!.add(entry.manager);
  }

  for (const [file, managers] of fileManagers) {
    if (managers.size > 1) {
      result.patterns.push({
        file,
        manager: Array.from(managers).join(', '),
        line: 0,
        suggestion: `Multiple version managers initialized in ${file}. Use only one.`,
      });
      result.hasSlowPatterns = true;
    }
  }

  return result;
}

/**
 * Check for version file conflicts
 */
function checkVersionFileConflicts(): VersionFileConflict {
  const result: VersionFileConflict = {
    hasConflict: false,
    files: [],
    distinctVersions: [],
  };

  const versionFiles = [
    { name: '.nvmrc', parser: (c: string) => c.trim().split('\n')[0].trim() },
    { name: '.node-version', parser: (c: string) => c.trim().split('\n')[0].trim() },
    {
      name: '.tool-versions',
      parser: (c: string) => {
        const match = c.match(/^nodejs\s+(\S+)/m);
        return match ? match[1] : null;
      },
    },
    {
      name: 'package.json',
      parser: (c: string) => {
        try {
          const pkg = JSON.parse(c);
          if (pkg.engines?.node) {
            // Extract version number from semver range if possible
            const match = pkg.engines.node.match(/(\d+)(?:\.\d+)?(?:\.\d+)?/);
            return match ? match[0] : pkg.engines.node;
          }
          return null;
        } catch {
          return null;
        }
      },
    },
  ];

  const cwd = process.cwd();
  const versions = new Set<string>();

  for (const { name, parser } of versionFiles) {
    const filePath = path.join(cwd, name);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const version = parser(content);
        if (version) {
          result.files.push({ file: name, version, path: filePath });
          // Normalize versions for comparison (strip 'v' prefix, lts/ prefix)
          const normalized = version.replace(/^v/, '').replace(/^lts\//, '');
          versions.add(normalized);
        }
      }
    } catch {
      // ignore
    }
  }

  result.distinctVersions = Array.from(versions);
  result.hasConflict = result.distinctVersions.length > 1;

  return result;
}

/**
 * Check node-gyp readiness for native compilation
 */
function checkNodeGypReadiness(): NodeGypReadiness {
  const result: NodeGypReadiness = {
    ready: true,
    python: { available: false, version: null, path: null },
    missing: [],
  };

  // Check Python
  const pythonCommands = isWindows ? ['python', 'python3', 'py'] : ['python3', 'python'];
  for (const cmd of pythonCommands) {
    try {
      const pyResult = spawnSync(cmd, ['--version'], {
        encoding: 'utf8',
        timeout: 5000,
        shell: isWindows,
      });
      if (pyResult.status === 0) {
        result.python.available = true;
        result.python.version = pyResult.stdout.trim() || pyResult.stderr.trim();
        // Get python path
        const whichResult = spawnSync(isWindows ? 'where' : 'which', [cmd], {
          encoding: 'utf8',
          timeout: 5000,
          shell: isWindows,
        });
        if (whichResult.status === 0) {
          result.python.path = whichResult.stdout.trim().split('\n')[0];
        }
        break;
      }
    } catch {
      // continue
    }
  }

  if (!result.python.available) {
    result.missing.push('Python');
    result.ready = false;
  }

  // Windows-specific checks
  if (isWindows) {
    result.buildTools = { available: false, type: null };

    // Check for Visual Studio Build Tools
    const msBuildPaths = [
      'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\BuildTools',
      'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools',
      'C:\\Program Files\\Microsoft Visual Studio\\2019\\BuildTools',
      'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools',
    ];

    for (const msPath of msBuildPaths) {
      if (fs.existsSync(msPath)) {
        result.buildTools.available = true;
        result.buildTools.type = 'Visual Studio Build Tools';
        break;
      }
    }

    // Check for windows-build-tools npm package marker
    try {
      const npmPrefix = spawnSync('npm', ['config', 'get', 'prefix'], {
        encoding: 'utf8',
        timeout: 5000,
        shell: true,
      });
      if (npmPrefix.status === 0 && npmPrefix.stdout) {
        const buildToolsPath = path.join(
          npmPrefix.stdout.trim(),
          'node_modules',
          'windows-build-tools'
        );
        if (fs.existsSync(buildToolsPath)) {
          result.buildTools.available = true;
          result.buildTools.type = 'windows-build-tools';
        }
      }
    } catch {
      // ignore
    }

    if (!result.buildTools.available) {
      result.missing.push('Visual Studio Build Tools');
      result.ready = false;
    }
  } else {
    // Unix: Check for make and g++/clang
    for (const cmd of ['make', 'g++', 'gcc']) {
      try {
        const cmdResult = spawnSync('which', [cmd], {
          encoding: 'utf8',
          timeout: 5000,
        });
        if (cmdResult.status !== 0) {
          result.missing.push(cmd);
          result.ready = false;
        }
      } catch {
        // ignore
      }
    }
  }

  return result;
}

/**
 * Check npm cache health
 */
function checkNpmCacheHealth(): NpmCacheHealth {
  const result: NpmCacheHealth = {
    path: null,
    size: 0,
    healthy: true,
    issues: [],
  };

  try {
    const cacheResult = spawnSync('npm', ['config', 'get', 'cache'], {
      encoding: 'utf8',
      timeout: 5000,
      shell: isWindows,
    });
    if (cacheResult.status === 0 && cacheResult.stdout) {
      result.path = cacheResult.stdout.trim();

      if (fs.existsSync(result.path)) {
        result.size = getDirSize(result.path);

        // Check for very large cache (> 5GB)
        if (result.size > 5 * 1024 * 1024 * 1024) {
          result.issues.push('Cache size exceeds 5GB. Consider running "npm cache clean --force"');
          result.healthy = false;
        }

        // Check for _cacache directory
        const cacachedPath = path.join(result.path, '_cacache');
        if (!fs.existsSync(cacachedPath)) {
          result.issues.push('Cache structure may be corrupted (missing _cacache)');
          result.healthy = false;
        }
      } else {
        result.issues.push('Cache directory does not exist');
      }
    }
  } catch {
    result.issues.push('Could not determine npm cache path');
  }

  // Verify cache integrity (quick check)
  try {
    const verifyResult = spawnSync('npm', ['cache', 'verify'], {
      encoding: 'utf8',
      timeout: 30000,
      shell: isWindows,
    });
    if (verifyResult.status !== 0) {
      result.issues.push('npm cache verify failed');
      result.healthy = false;
    }
  } catch {
    // Timeout or error - don't mark as unhealthy
  }

  return result;
}

/**
 * Check global npm location vs version manager
 */
function checkGlobalNpmLocation(activeManagers: string[]): GlobalNpmLocation {
  const result: GlobalNpmLocation = {
    npmRoot: null,
    activeManager: activeManagers[0] || null,
    correctLocation: true,
    expectedLocation: null,
  };

  try {
    const rootResult = spawnSync('npm', ['root', '-g'], {
      encoding: 'utf8',
      timeout: 5000,
      shell: isWindows,
    });
    if (rootResult.status === 0 && rootResult.stdout) {
      result.npmRoot = rootResult.stdout.trim();
    }
  } catch {
    return result;
  }

  if (!result.npmRoot || !result.activeManager) return result;

  const home = os.homedir();
  const mgr = result.activeManager.toLowerCase();

  // Check if npm root matches expected location for manager
  const expectedRoots: Record<string, string[]> = {
    nvm: [path.join(home, '.nvm')],
    fnm: [path.join(home, '.fnm'), path.join(home, 'Library', 'Application Support', 'fnm')],
    volta: [path.join(home, '.volta', 'tools')],
    n: [path.join(home, 'n'), '/usr/local/lib/node_modules'],
    homebrew: ['/opt/homebrew', '/usr/local'],
    system: ['/usr/lib', '/usr/local/lib'],
  };

  const expected = expectedRoots[mgr];
  if (expected) {
    result.expectedLocation = expected[0];
    const matchesExpected = expected.some(exp => result.npmRoot!.includes(exp));
    if (!matchesExpected) {
      result.correctLocation = false;
    }
  }

  return result;
}

/**
 * Check symlink health (Windows)
 */
function checkSymlinkHealth(): SymlinkHealth | null {
  if (!isWindows) return null;

  const result: SymlinkHealth = {
    working: true,
    isAdmin: false,
    usingJunctions: false,
    issues: [],
  };

  // Check if running as admin
  try {
    const adminResult = spawnSync('net', ['session'], {
      encoding: 'utf8',
      timeout: 5000,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    result.isAdmin = adminResult.status === 0;
  } catch {
    // ignore
  }

  // Test symlink creation
  const testDir = path.join(os.tmpdir(), `node-doctor-symlink-test-${Date.now()}`);
  const testTarget = path.join(testDir, 'target');
  const testLink = path.join(testDir, 'link');

  try {
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(testTarget);

    try {
      fs.symlinkSync(testTarget, testLink, 'junction');
      result.usingJunctions = true;
      // Junction worked, try real symlink
      const testLink2 = path.join(testDir, 'link2');
      try {
        fs.symlinkSync(testTarget, testLink2, 'dir');
        result.working = true;
      } catch {
        result.issues.push('Symbolic links require admin rights or Developer Mode');
        // Junctions still work
      }
    } catch (e: unknown) {
      const error = e as Error;
      result.working = false;
      result.issues.push(`Symlinks not working: ${error.message}`);
    }
  } catch {
    // ignore test errors
  } finally {
    // Cleanup
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  if (!result.isAdmin && result.issues.length === 0) {
    result.issues.push('Enable Developer Mode for better symlink support');
  }

  return result;
}

/**
 * Check for stale node_modules
 */
function checkStaleNodeModules(): StaleNodeModules {
  const result: StaleNodeModules = {
    exists: false,
    builtWithVersion: null,
    currentVersion: process.version,
    majorMismatch: false,
    recommendation: null,
  };

  const cwd = process.cwd();
  const nodeModulesPath = path.join(cwd, 'node_modules');

  if (!fs.existsSync(nodeModulesPath)) {
    return result;
  }

  result.exists = true;

  // Check .node_version or .package-lock.json for hints
  const lockPath = path.join(cwd, 'package-lock.json');
  try {
    if (fs.existsSync(lockPath)) {
      const lockContent = fs.readFileSync(lockPath, 'utf8');
      const lock = JSON.parse(lockContent);
      
      // npm lockfile v3 has packages."".node
      if (lock.packages?.['']?.engines?.node) {
        result.builtWithVersion = lock.packages[''].engines.node;
      }
    }
  } catch {
    // ignore
  }

  // Check for native module indicators
  const nativeModulePaths = [
    path.join(nodeModulesPath, '.package-lock.json'),
    path.join(nodeModulesPath, '.yarn-integrity'),
  ];

  // Try to detect node version from native module compilation
  try {
    const modulesWithNative = fs.readdirSync(nodeModulesPath).filter(dir => {
      const buildPath = path.join(nodeModulesPath, dir, 'build');
      const bindingPath = path.join(nodeModulesPath, dir, 'binding.gyp');
      return fs.existsSync(buildPath) || fs.existsSync(bindingPath);
    });

    if (modulesWithNative.length > 0) {
      // Check Release folder for node version hint
      for (const mod of modulesWithNative.slice(0, 3)) {
        const releasePath = path.join(nodeModulesPath, mod, 'build', 'Release');
        if (fs.existsSync(releasePath)) {
          // Native modules exist - recommend rebuild on major version change
          const currentMajor = parseInt(process.version.slice(1).split('.')[0], 10);
          const pkgPath = path.join(cwd, 'package.json');
          
          try {
            if (fs.existsSync(pkgPath)) {
              const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
              if (pkg.engines?.node) {
                const requiredMajor = parseInt(pkg.engines.node.match(/\d+/)?.[0] || '0', 10);
                if (requiredMajor && Math.abs(currentMajor - requiredMajor) >= 2) {
                  result.majorMismatch = true;
                  result.builtWithVersion = `v${requiredMajor}`;
                }
              }
            }
          } catch {
            // ignore
          }
          break;
        }
      }

      if (result.majorMismatch) {
        result.recommendation = 'Native modules may need rebuild. Run "npm rebuild" or remove node_modules.';
      }
    }
  } catch {
    // ignore
  }

  return result;
}

/**
 * Check IDE integration (VSCode)
 */
function checkIDEIntegration(): IDEIntegration {
  const result: IDEIntegration = {
    hasVSCode: false,
    vscodeIssues: [],
    terminalInheritEnv: null,
    eslintNodePath: null,
  };

  const cwd = process.cwd();
  const vscodePath = path.join(cwd, '.vscode');

  if (!fs.existsSync(vscodePath)) {
    return result;
  }

  result.hasVSCode = true;

  // Check settings.json
  const settingsPath = path.join(vscodePath, 'settings.json');
  try {
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, 'utf8');
      // Remove comments for JSON parsing
      const cleaned = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const settings = JSON.parse(cleaned);

      // Check terminal.integrated.env
      if (settings['terminal.integrated.inheritEnv'] === false) {
        result.terminalInheritEnv = false;
        result.vscodeIssues.push('terminal.integrated.inheritEnv is false - may not pick up nvm/fnm');
      } else {
        result.terminalInheritEnv = true;
      }

      // Check eslint.nodePath
      if (settings['eslint.nodePath']) {
        result.eslintNodePath = true;
        // Check if the path exists
        const eslintNodePath = settings['eslint.nodePath'];
        if (!fs.existsSync(eslintNodePath)) {
          result.vscodeIssues.push(`eslint.nodePath points to non-existent path: ${eslintNodePath}`);
        }
      }

      // Check for hardcoded node paths
      const settingsStr = JSON.stringify(settings);
      if (settingsStr.includes('/node/') || settingsStr.includes('\\\\node\\\\')) {
        result.vscodeIssues.push('Settings contain hardcoded node paths - may break with version changes');
      }
    }
  } catch {
    // Invalid JSON or read error
  }

  // Check extensions.json for recommended extensions
  const extensionsPath = path.join(vscodePath, 'extensions.json');
  try {
    if (fs.existsSync(extensionsPath)) {
      const content = fs.readFileSync(extensionsPath, 'utf8');
      const cleaned = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const extensions = JSON.parse(cleaned);
      
      // Check if nvm/fnm extensions are recommended
      const recommendations = extensions.recommendations || [];
      const hasVersionManagerExt = recommendations.some((ext: string) =>
        ext.toLowerCase().includes('nvm') || ext.toLowerCase().includes('fnm')
      );
      
      if (!hasVersionManagerExt && fs.existsSync(path.join(cwd, '.nvmrc'))) {
        result.vscodeIssues.push('Project has .nvmrc but no nvm VSCode extension recommended');
      }
    }
  } catch {
    // ignore
  }

  return result;
}

/**
 * Check engines field compliance
 */
function checkEnginesCompliance(): EngineCheck | null {
  const cwd = process.cwd();
  const pkgPath = path.join(cwd, 'package.json');

  if (!fs.existsSync(pkgPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(content);

    if (!pkg.engines) {
      return null;
    }

    const result: EngineCheck = {
      node: {
        required: pkg.engines.node || null,
        current: process.version,
        satisfied: true,
      },
    };

    // Check node version
    if (pkg.engines.node) {
      result.node.satisfied = checkVersionSatisfies(process.version, pkg.engines.node);
    }

    // Check npm version
    if (pkg.engines.npm) {
      const npmVersion = getNpmVersion();
      result.npm = {
        required: pkg.engines.npm,
        current: npmVersion,
        satisfied: npmVersion ? checkVersionSatisfies(npmVersion, pkg.engines.npm) : false,
      };
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Simple semver range check
 */
function checkVersionSatisfies(version: string, range: string): boolean {
  // Normalize version (remove 'v' prefix)
  const v = version.replace(/^v/, '');
  const [major, minor = 0, patch = 0] = v.split('.').map(n => parseInt(n, 10) || 0);

  // Handle common range patterns
  const rangeNorm = range.trim();

  // Exact version
  if (/^\d+\.\d+\.\d+$/.test(rangeNorm)) {
    const [rMaj, rMin, rPatch] = rangeNorm.split('.').map(Number);
    return major === rMaj && minor === rMin && patch === rPatch;
  }

  // >= version
  if (rangeNorm.startsWith('>=')) {
    const reqVer = rangeNorm.slice(2).trim().replace(/^v/, '');
    const [rMaj, rMin = 0, rPatch = 0] = reqVer.split('.').map(n => parseInt(n, 10) || 0);
    if (major > rMaj) return true;
    if (major < rMaj) return false;
    if (minor > rMin) return true;
    if (minor < rMin) return false;
    return patch >= rPatch;
  }

  // ^major.minor.patch (caret range)
  if (rangeNorm.startsWith('^')) {
    const reqVer = rangeNorm.slice(1).trim();
    const [rMaj] = reqVer.split('.').map(n => parseInt(n, 10) || 0);
    return major === rMaj;
  }

  // ~major.minor.patch (tilde range)
  if (rangeNorm.startsWith('~')) {
    const reqVer = rangeNorm.slice(1).trim();
    const [rMaj, rMin = 0] = reqVer.split('.').map(n => parseInt(n, 10) || 0);
    return major === rMaj && minor === rMin;
  }

  // major.x or major.* 
  if (/^\d+\.x/.test(rangeNorm) || /^\d+\.\*/.test(rangeNorm)) {
    const rMaj = parseInt(rangeNorm.split('.')[0], 10);
    return major === rMaj;
  }

  // Just major version
  if (/^\d+$/.test(rangeNorm)) {
    return major >= parseInt(rangeNorm, 10);
  }

  // Default: assume satisfied if we can't parse
  return true;
}

/**
 * Collect all extended health checks
 */
function collectExtendedHealthChecks(
  activeManagers: string[],
  shellConfigs: NodeConfigEntry[],
  rawShellEntries: NodeConfigEntryRaw[]
): ExtendedHealthChecks {
  return {
    npmPrefix: checkNpmPrefixMismatch(activeManagers),
    shellSlowStartup: checkShellSlowStartup(shellConfigs, rawShellEntries),
    versionFileConflict: checkVersionFileConflicts(),
    nodeGypReadiness: checkNodeGypReadiness(),
    npmCacheHealth: checkNpmCacheHealth(),
    globalNpmLocation: checkGlobalNpmLocation(activeManagers),
    symlinkHealth: checkSymlinkHealth(),
    staleNodeModules: checkStaleNodeModules(),
    ideIntegration: checkIDEIntegration(),
    enginesCheck: checkEnginesCompliance(),
  };
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2: Data Collection (Single Implementation)
// ═══════════════════════════════════════════════════════════════

export interface CollectHealthDataOptions {
  /** Skip port scanning (faster) */
  skipPorts?: boolean;
  /** Skip shell config detection */
  skipShell?: boolean;
}

/**
 * Collect all health-related data in a single pass
 */
export async function collectHealthData(
  results: ScanResults,
  options?: CollectHealthDataOptions
): Promise<HealthData> {
  // Registry info (sync)
  const registryInfo = detectNpmRegistry();

  // Parallel async fetches
  const [registryStatus, schedule, distReleases] = await Promise.all([
    checkRegistryStatus(registryInfo.global.registry),
    fetchReleaseSchedule(),
    fetchDistIndex(),
  ]);

  // PATH scanning
  const { nodesInPath, activeManagers } = scanPathForNodes(results, schedule, distReleases);

  // Manager detection
  const managers = getAllDetectedManagers(results);

  // Port scanning (optional)
  const portProcesses: CIPortProcess[] = options?.skipPorts
    ? []
    : findAllNodeProcesses().map(p => ({
        port: p.port,
        pid: p.pid,
        name: p.name,
        command: p.command,
      }));

  // Shell configs (optional)
  const shellConfigResult = options?.skipShell ? null : detectShellConfigs();
  const shellConfigs: NodeConfigEntry[] = shellConfigResult
    ? aggregateShellConfigs(shellConfigResult.nodeRelated)
    : [];
  const allShellConfigs: ShellConfigFile[] = shellConfigResult?.found || [];

  // Security for current Node
  const currentVersion = process.version;
  const eol = schedule ? checkEOL(currentVersion, schedule) : null;
  const vulnerabilities = distReleases ? checkSecurity(currentVersion, distReleases) : null;

  // Package managers info (npm, yarn, pnpm)
  const packageManagers = getPackageManagersInfo();

  // Detect duplicate versions across managers
  const duplicateVersions = detectDuplicateVersions(managers);

  // New: Environment variables (no values)
  const environmentVars = collectEnvironmentVars();
  const authTokens = collectAuthTokens();

  // New: Global packages summary
  const globalPackages = collectGlobalPackagesSummary();

  // New: Permission checks
  const permissions = checkPermissions();

  // New: Corepack status
  const corepack = getCorepackInfo();

  // New: Extended health checks
  const rawShellEntries = shellConfigResult?.nodeRelated || [];
  const extendedChecks = collectExtendedHealthChecks(
    Array.from(activeManagers),
    shellConfigs,
    rawShellEntries
  );

  return {
    system: {
      platform: `${os.platform()} ${os.arch()}`,
      arch: os.arch(),
      shell: process.env.SHELL || (isWindows ? 'cmd.exe' : 'unknown'),
      nodeVersion: process.version,
      npmVersion: getNpmVersion(),
      mnpmVersion: getMnpmVersion(),
      execPath: process.execPath,
    },
    nodesInPath,
    managers,
    activeManagers: Array.from(activeManagers),
    registry: { info: registryInfo, status: registryStatus },
    security: { eol, vulnerabilities, tokens: authTokens },
    portProcesses,
    shellConfigs,
    allShellConfigs,
    packageManagers,
    duplicateVersions,
    environmentVars,
    globalPackages,
    permissions,
    corepack,
    extendedChecks,
  };
}

/**
 * Detect duplicate versions installed across multiple managers
 */
function detectDuplicateVersions(managers: DetectedManager[]): DuplicateVersion[] {
  const versionMap = new Map<string, { managers: string[]; sizes: number[] }>();

  for (const mgr of managers) {
    if (mgr.installations) {
      for (const inst of mgr.installations) {
        const existing = versionMap.get(inst.version);
        if (existing) {
          existing.managers.push(mgr.name);
          existing.sizes.push(inst.size);
        } else {
          versionMap.set(inst.version, {
            managers: [mgr.name],
            sizes: [inst.size],
          });
        }
      }
    }
  }

  // Filter to only duplicates (same version in 2+ managers)
  const duplicates: DuplicateVersion[] = [];
  for (const [version, data] of versionMap.entries()) {
    if (data.managers.length > 1) {
      duplicates.push({
        version,
        managers: data.managers,
        totalSize: data.sizes.reduce((a, b) => a + b, 0),
      });
    }
  }

  return duplicates.sort((a, b) => b.totalSize - a.totalSize);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3: Health Assessment (Single Logic)
// ═══════════════════════════════════════════════════════════════

/**
 * Assess health based on collected data
 * Returns standardized check items
 */
export function assessHealthChecks(data: HealthData): HealthCheck[] {
  const checks: HealthCheck[] = [];

  // ─────────────────────────────────────────────────────────────
  // Check: Node.js in PATH
  // ─────────────────────────────────────────────────────────────
  if (data.nodesInPath.length === 0) {
    checks.push({
      id: 'node-in-path',
      name: 'Node.js in PATH',
      category: 'path',
      status: 'fail',
      message: 'No Node.js found in PATH',
      hint: 'Install Node.js or add it to your PATH',
    });
  } else {
    const primary = data.nodesInPath[0];
    checks.push({
      id: 'node-in-path',
      name: 'Node.js in PATH',
      category: 'path',
      status: 'pass',
      message: `Node.js ${primary.version} via ${primary.runner.name}`,
      details: primary.executable,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Check: PATH Shadowing
  // ─────────────────────────────────────────────────────────────
  if (data.nodesInPath.length > 1) {
    checks.push({
      id: 'path-shadowing',
      name: 'PATH Shadowing',
      category: 'path',
      status: 'warn',
      message: `${data.nodesInPath.length - 1} shadowed Node version(s) in PATH`,
      hint: 'Multiple Node installations may cause version conflicts',
      details: data.nodesInPath.map(n => `${n.version} (${n.runner.name})`).join(', '),
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Check: Multiple Active Managers
  // ─────────────────────────────────────────────────────────────
  if (data.activeManagers.length > 1) {
    checks.push({
      id: 'multiple-managers',
      name: 'Version Managers',
      category: 'managers',
      status: 'warn',
      message: `${data.activeManagers.length} version managers active in PATH`,
      hint: 'Consider using only one version manager to avoid conflicts',
      details: `Active: ${data.activeManagers.join(', ')}`,
    });
  } else if (data.activeManagers.length === 1) {
    checks.push({
      id: 'multiple-managers',
      name: 'Version Managers',
      category: 'managers',
      status: 'pass',
      message: `Using ${data.activeManagers[0]}`,
    });
  } else {
    checks.push({
      id: 'multiple-managers',
      name: 'Version Managers',
      category: 'managers',
      status: 'pass',
      message:
        data.managers.length > 0
          ? `${data.managers.length} manager(s) installed`
          : 'No version managers detected (using system Node)',
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Check: Registry Status
  // ─────────────────────────────────────────────────────────────
  if (!data.registry.status.available) {
    checks.push({
      id: 'registry-status',
      name: 'NPM Registry',
      category: 'registry',
      status: 'fail',
      message: 'NPM registry unreachable',
      hint: 'Check network connection',
      details: data.registry.status.error || data.registry.info.global.registry,
    });
  } else if (data.registry.status.latency > 2000) {
    checks.push({
      id: 'registry-latency',
      name: 'NPM Registry',
      category: 'registry',
      status: 'warn',
      message: `High registry latency: ${data.registry.status.latency}ms`,
      hint: 'Consider using a closer mirror',
      details: data.registry.info.global.registry,
    });
  } else {
    checks.push({
      id: 'registry-status',
      name: 'NPM Registry',
      category: 'registry',
      status: 'pass',
      message: `Registry OK (${data.registry.status.latency}ms)`,
      details: data.registry.info.global.registry,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Check: Node.js EOL Status
  // ─────────────────────────────────────────────────────────────
  if (data.security.eol) {
    const eol = data.security.eol;
    if (eol.status === 'eol') {
      checks.push({
        id: 'node-eol',
        name: 'Node.js EOL Status',
        category: 'security',
        status: 'fail',
        message: `Node.js ${data.system.nodeVersion} is End-of-Life (EOL)`,
        hint: `Support ended on ${eol.eolDate}. Upgrade immediately.`,
      });
    } else if (eol.status === 'maintenance') {
      checks.push({
        id: 'node-eol',
        name: 'Node.js EOL Status',
        category: 'security',
        status: 'warn',
        message: `Node.js ${data.system.nodeVersion} is in Maintenance mode`,
        hint: `Support ends on ${eol.eolDate}. Plan your upgrade.`,
      });
    } else if (eol.status === 'active') {
      checks.push({
        id: 'node-eol',
        name: 'Node.js EOL Status',
        category: 'security',
        status: 'pass',
        message: `Node.js ${data.system.nodeVersion} is actively supported`,
      });
    } else {
      checks.push({
        id: 'node-eol',
        name: 'Node.js EOL Status',
        category: 'security',
        status: 'warn',
        message: `Node.js ${data.system.nodeVersion} status unknown`,
        hint: 'Could not match version to release schedule.',
      });
    }
  } else {
    checks.push({
      id: 'node-eol',
      name: 'Node.js EOL Status',
      category: 'security',
      status: 'warn',
      message: 'Could not fetch release schedule',
      hint: 'Check internet connection.',
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Check: Security Vulnerabilities
  // ─────────────────────────────────────────────────────────────
  if (data.security.vulnerabilities) {
    if (data.security.vulnerabilities.vulnerable) {
      checks.push({
        id: 'node-security',
        name: 'Node.js Security',
        category: 'security',
        status: 'warn',
        message: `Node.js ${data.system.nodeVersion} has known vulnerabilities`,
        hint: data.security.vulnerabilities.details,
        details: data.security.vulnerabilities.latestSecurityRelease
          ? `Upgrade to ${data.security.vulnerabilities.latestSecurityRelease}`
          : undefined,
      });
    } else {
      checks.push({
        id: 'node-security',
        name: 'Node.js Security',
        category: 'security',
        status: 'pass',
        message: 'No known security vulnerabilities',
      });
    }
  } else {
    checks.push({
      id: 'node-security',
      name: 'Node.js Security',
      category: 'security',
      status: 'warn',
      message: 'Could not fetch security data',
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Check: Port Conflicts
  // ─────────────────────────────────────────────────────────────
  if (data.portProcesses.length > 0) {
    checks.push({
      id: 'port-conflicts',
      name: 'Port Conflicts',
      category: 'ports',
      status: 'warn',
      message: `${data.portProcesses.length} Node.js process(es) using ports`,
      hint: 'Use "node-doctor heal" to manage these processes',
      details: data.portProcesses.map(p => `Port ${p.port}: ${p.name}`).join('; '),
    });
  } else {
    checks.push({
      id: 'port-conflicts',
      name: 'Port Conflicts',
      category: 'ports',
      status: 'pass',
      message: 'No Node.js processes blocking ports',
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Check: Duplicate Versions
  // ─────────────────────────────────────────────────────────────
  if (data.duplicateVersions.length > 0) {
    const totalWasted = data.duplicateVersions.reduce((sum, d) => {
      // Only count the "extra" copies (total - one copy)
      const avgSize = d.totalSize / d.managers.length;
      return sum + (d.totalSize - avgSize);
    }, 0);
    const wastedMB = Math.round(totalWasted / 1024 / 1024);

    checks.push({
      id: 'duplicate-versions',
      name: 'Duplicate Versions',
      category: 'disk',
      status: 'warn',
      message: `${data.duplicateVersions.length} version(s) installed in multiple managers`,
      hint: `Consider removing duplicates to save ~${wastedMB} MB`,
      details: data.duplicateVersions
        .map(d => `${d.version} in ${d.managers.join(', ')}`)
        .join('; '),
    });
  } else if (data.managers.length > 1) {
    checks.push({
      id: 'duplicate-versions',
      name: 'Duplicate Versions',
      category: 'disk',
      status: 'pass',
      message: 'No duplicate versions across managers',
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Check: NODE_OPTIONS Environment Variable
  // ─────────────────────────────────────────────────────────────
  const nodeOptionsSet = data.environmentVars.find(v => v.name === 'NODE_OPTIONS')?.isSet;
  if (nodeOptionsSet) {
    checks.push({
      id: 'env-node-options',
      name: 'NODE_OPTIONS',
      category: 'environment',
      status: 'warn',
      message: 'NODE_OPTIONS environment variable is set',
      hint: 'This may affect Node.js behavior unexpectedly',
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Check: Global Package Duplicates
  // ─────────────────────────────────────────────────────────────
  if (data.globalPackages.duplicates.length > 0) {
    checks.push({
      id: 'global-duplicates',
      name: 'Global Package Duplicates',
      category: 'globals',
      status: 'warn',
      message: `${data.globalPackages.duplicates.length} package(s) installed globally in multiple managers`,
      hint: 'Consider consolidating to one package manager',
      details: data.globalPackages.duplicates.join(', '),
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Check: Permission Issues
  // ─────────────────────────────────────────────────────────────
  const permissionIssues = data.permissions.filter(p => p.exists && !p.writable);
  if (permissionIssues.length > 0) {
    checks.push({
      id: 'permission-issues',
      name: 'Directory Permissions',
      category: 'permissions',
      status: 'warn',
      message: `${permissionIssues.length} directory(ies) not writable`,
      hint: 'May cause npm install -g failures. Check ownership/permissions.',
      details: permissionIssues.map(p => p.name).join(', '),
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Check: Corepack Status
  // ─────────────────────────────────────────────────────────────
  if (data.corepack.installed) {
    if (data.corepack.packageManagerField && !data.corepack.enabled) {
      checks.push({
        id: 'corepack-status',
        name: 'Corepack',
        category: 'corepack',
        status: 'warn',
        message: 'packageManager field found but corepack not enabled',
        hint: 'Run "corepack enable" to use the specified package manager',
        details: data.corepack.packageManagerField,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // EXTENDED HEALTH CHECKS
  // ═══════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────────
  // Check: npm Prefix Mismatch
  // ─────────────────────────────────────────────────────────────
  if (data.extendedChecks.npmPrefix.mismatch) {
    checks.push({
      id: 'npm-prefix-mismatch',
      name: 'npm Prefix',
      category: 'configuration',
      status: 'warn',
      message: `npm prefix doesn't match active version manager (${data.extendedChecks.npmPrefix.activeManager})`,
      hint: 'Global packages may install to wrong location. Check npm config.',
      details: `Current: ${data.extendedChecks.npmPrefix.prefix}, Expected: ${data.extendedChecks.npmPrefix.expectedPrefix}`,
    });
  } else if (data.extendedChecks.npmPrefix.prefix) {
    checks.push({
      id: 'npm-prefix-mismatch',
      name: 'npm Prefix',
      category: 'configuration',
      status: 'pass',
      message: 'npm prefix matches version manager',
      details: data.extendedChecks.npmPrefix.prefix,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Check: Shell Startup Slowness
  // ─────────────────────────────────────────────────────────────
  if (data.extendedChecks.shellSlowStartup.hasSlowPatterns) {
    const patternCount = data.extendedChecks.shellSlowStartup.patterns.length;
    checks.push({
      id: 'shell-startup-slow',
      name: 'Shell Startup',
      category: 'shell',
      status: 'warn',
      message: `${patternCount} slow startup pattern(s) detected`,
      hint: data.extendedChecks.shellSlowStartup.patterns[0]?.suggestion || 'Consider lazy loading version managers',
      details: data.extendedChecks.shellSlowStartup.patterns
        .map(p => `${p.file}: ${p.manager}`)
        .join('; '),
    });
  } else {
    checks.push({
      id: 'shell-startup-slow',
      name: 'Shell Startup',
      category: 'shell',
      status: 'pass',
      message: 'No slow startup patterns detected',
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Check: Version File Conflicts
  // ─────────────────────────────────────────────────────────────
  if (data.extendedChecks.versionFileConflict.hasConflict) {
    checks.push({
      id: 'version-file-conflict',
      name: 'Version File Conflict',
      category: 'project',
      status: 'warn',
      message: `${data.extendedChecks.versionFileConflict.files.length} version files with different versions`,
      hint: 'Align version files to prevent confusion across tools',
      details: data.extendedChecks.versionFileConflict.files
        .map(f => `${f.file}: ${f.version}`)
        .join(', '),
    });
  } else if (data.extendedChecks.versionFileConflict.files.length > 0) {
    checks.push({
      id: 'version-file-conflict',
      name: 'Version Files',
      category: 'project',
      status: 'pass',
      message: `${data.extendedChecks.versionFileConflict.files.length} version file(s) in sync`,
      details: data.extendedChecks.versionFileConflict.files.map(f => f.file).join(', '),
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Check: engines Field Mismatch
  // ─────────────────────────────────────────────────────────────
  if (data.extendedChecks.enginesCheck) {
    const engines = data.extendedChecks.enginesCheck;
    if (!engines.node.satisfied) {
      checks.push({
        id: 'engines-mismatch',
        name: 'engines Compliance',
        category: 'project',
        status: 'fail',
        message: `Node ${engines.node.current} doesn't match required ${engines.node.required}`,
        hint: `Switch to Node ${engines.node.required} for this project`,
      });
    } else if (engines.npm && !engines.npm.satisfied) {
      checks.push({
        id: 'engines-mismatch',
        name: 'engines Compliance',
        category: 'project',
        status: 'warn',
        message: `npm ${engines.npm.current} doesn't match required ${engines.npm.required}`,
        hint: `Update npm to ${engines.npm.required}`,
      });
    } else if (engines.node.required) {
      checks.push({
        id: 'engines-mismatch',
        name: 'engines Compliance',
        category: 'project',
        status: 'pass',
        message: `Node ${engines.node.current} satisfies required ${engines.node.required}`,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Check: node-gyp Readiness
  // ─────────────────────────────────────────────────────────────
  if (!data.extendedChecks.nodeGypReadiness.ready) {
    checks.push({
      id: 'node-gyp-readiness',
      name: 'node-gyp Readiness',
      category: 'build',
      status: 'warn',
      message: `Missing build tools: ${data.extendedChecks.nodeGypReadiness.missing.join(', ')}`,
      hint: 'Native module compilation may fail. Install missing dependencies.',
      details: data.extendedChecks.nodeGypReadiness.python.version
        ? `Python: ${data.extendedChecks.nodeGypReadiness.python.version}`
        : 'Python not found',
    });
  } else {
    checks.push({
      id: 'node-gyp-readiness',
      name: 'node-gyp Readiness',
      category: 'build',
      status: 'pass',
      message: 'Build tools available for native modules',
      details: data.extendedChecks.nodeGypReadiness.python.version || undefined,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Check: npm Cache Health
  // ─────────────────────────────────────────────────────────────
  if (!data.extendedChecks.npmCacheHealth.healthy) {
    checks.push({
      id: 'npm-cache-health',
      name: 'npm Cache',
      category: 'disk',
      status: 'warn',
      message: data.extendedChecks.npmCacheHealth.issues[0] || 'Cache issues detected',
      hint: 'Run "npm cache clean --force" to fix',
      details: data.extendedChecks.npmCacheHealth.path || undefined,
    });
  } else if (data.extendedChecks.npmCacheHealth.path) {
    const sizeMB = Math.round(data.extendedChecks.npmCacheHealth.size / 1024 / 1024);
    checks.push({
      id: 'npm-cache-health',
      name: 'npm Cache',
      category: 'disk',
      status: 'pass',
      message: `Cache healthy (${sizeMB} MB)`,
      details: data.extendedChecks.npmCacheHealth.path,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Check: Global npm Location
  // ─────────────────────────────────────────────────────────────
  if (!data.extendedChecks.globalNpmLocation.correctLocation) {
    checks.push({
      id: 'global-npm-location',
      name: 'Global npm Location',
      category: 'configuration',
      status: 'warn',
      message: 'npm global root may not match version manager',
      hint: 'Global packages might not be found. Check npm config prefix.',
      details: `Current: ${data.extendedChecks.globalNpmLocation.npmRoot}`,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Check: Symlink Health (Windows only)
  // ─────────────────────────────────────────────────────────────
  if (data.extendedChecks.symlinkHealth) {
    const symlink = data.extendedChecks.symlinkHealth;
    if (symlink.issues.length > 0 && !symlink.working) {
      checks.push({
        id: 'symlink-health',
        name: 'Symlink Support',
        category: 'permissions',
        status: 'warn',
        message: 'Symlinks not fully working',
        hint: symlink.issues[0] || 'Enable Developer Mode or run as Administrator',
        details: symlink.usingJunctions ? 'Falling back to junctions' : undefined,
      });
    } else if (!symlink.isAdmin && symlink.issues.length > 0) {
      checks.push({
        id: 'symlink-health',
        name: 'Symlink Support',
        category: 'permissions',
        status: 'pass',
        message: 'Symlinks working (via Developer Mode)',
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Check: Stale node_modules
  // ─────────────────────────────────────────────────────────────
  if (data.extendedChecks.staleNodeModules.exists && data.extendedChecks.staleNodeModules.majorMismatch) {
    checks.push({
      id: 'stale-node-modules',
      name: 'node_modules Freshness',
      category: 'project',
      status: 'warn',
      message: `node_modules may be stale (built for Node ${data.extendedChecks.staleNodeModules.builtWithVersion})`,
      hint: data.extendedChecks.staleNodeModules.recommendation || 'Run "npm rebuild" or reinstall',
      details: `Current Node: ${data.extendedChecks.staleNodeModules.currentVersion}`,
    });
  } else if (data.extendedChecks.staleNodeModules.exists) {
    checks.push({
      id: 'stale-node-modules',
      name: 'node_modules Freshness',
      category: 'project',
      status: 'pass',
      message: 'node_modules appears compatible',
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Check: IDE Integration
  // ─────────────────────────────────────────────────────────────
  if (data.extendedChecks.ideIntegration.hasVSCode) {
    if (data.extendedChecks.ideIntegration.vscodeIssues.length > 0) {
      checks.push({
        id: 'ide-integration',
        name: 'IDE Integration',
        category: 'ide',
        status: 'warn',
        message: `${data.extendedChecks.ideIntegration.vscodeIssues.length} VSCode configuration issue(s)`,
        hint: data.extendedChecks.ideIntegration.vscodeIssues[0],
        details: data.extendedChecks.ideIntegration.vscodeIssues.join('; '),
      });
    } else {
      checks.push({
        id: 'ide-integration',
        name: 'IDE Integration',
        category: 'ide',
        status: 'pass',
        message: 'VSCode settings look good',
      });
    }
  }

  return checks;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4: Full Assessment
// ═══════════════════════════════════════════════════════════════

/**
 * Run complete health assessment
 * Main entry point for both interactive and CLI modes
 */
export async function runHealthAssessment(
  results: ScanResults,
  options?: CollectHealthDataOptions
): Promise<HealthAssessment> {
  const data = await collectHealthData(results, options);
  const checks = assessHealthChecks(data);

  const passed = checks.filter(c => c.status === 'pass').length;
  const warnings = checks.filter(c => c.status === 'warn').length;
  const failed = checks.filter(c => c.status === 'fail').length;

  const overallStatus: HealthCheckStatus = failed > 0 ? 'fail' : warnings > 0 ? 'warn' : 'pass';

  return {
    timestamp: new Date().toISOString(),
    overallStatus,
    exitCode: failed > 0 ? 1 : 0,
    checks,
    summary: { total: checks.length, passed, warnings, failed },
    data,
  };
}

// ═══════════════════════════════════════════════════════════════
// SECTION 5: Output Formatters
// ═══════════════════════════════════════════════════════════════

/**
 * Format assessment as JSON for CI/CD
 */
export function formatAsJSON(assessment: HealthAssessment): string {
  return JSON.stringify(assessment, null, 2);
}

/**
 * Format assessment as human-readable text
 */
export function formatAsText(assessment: HealthAssessment): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(bold('  🔍 Node Doctor - Health Assessment'));
  lines.push(dim(`  ${assessment.timestamp}`));
  lines.push('');

  // Status banner
  const statusIcon =
    assessment.overallStatus === 'pass' ? '🟢' : assessment.overallStatus === 'warn' ? '🟡' : '🔴';
  const statusText =
    assessment.overallStatus === 'pass'
      ? c('green', 'PASS')
      : assessment.overallStatus === 'warn'
        ? c('yellow', 'WARN')
        : c('red', 'FAIL');
  lines.push(`  ${statusIcon} Status: ${bold(statusText)}`);
  lines.push('');

  // System info
  lines.push(bold('  System'));
  lines.push(`    Platform:  ${assessment.data.system.platform}`);
  lines.push(`    Node:      ${assessment.data.system.nodeVersion}`);
  lines.push(`    npm:       ${assessment.data.system.npmVersion || 'not found'}`);
  lines.push(`    Shell:     ${assessment.data.system.shell}`);
  lines.push('');

  // Checks
  lines.push(bold('  Checks'));
  for (const check of assessment.checks) {
    const icon =
      check.status === 'pass'
        ? c('green', '✓')
        : check.status === 'warn'
          ? c('yellow', '⚠')
          : c('red', '✗');
    lines.push(`    ${icon} ${check.name}: ${check.message}`);
    if (check.details) {
      lines.push(`      ${dim(check.details)}`);
    }
  }
  lines.push('');

  // Summary
  lines.push(bold('  Summary'));
  lines.push(`    Total:    ${assessment.summary.total}`);
  lines.push(`    Passed:   ${c('green', String(assessment.summary.passed))}`);
  lines.push(`    Warnings: ${c('yellow', String(assessment.summary.warnings))}`);
  lines.push(`    Failed:   ${c('red', String(assessment.summary.failed))}`);
  lines.push('');

  // Managers (if any)
  if (assessment.data.managers.length > 0) {
    lines.push(bold('  Version Managers'));
    for (const mgr of assessment.data.managers) {
      const status = assessment.data.activeManagers.includes(mgr.name)
        ? c('green', '(active)')
        : dim('(installed)');
      lines.push(`    ${mgr.name}: ${mgr.versionCount} versions ${status}`);
    }
    lines.push('');
  }

  // Port processes (if any)
  if (assessment.data.portProcesses.length > 0) {
    lines.push(bold('  Port Processes'));
    for (const proc of assessment.data.portProcesses) {
      lines.push(`    Port ${proc.port}: ${proc.name} (PID ${proc.pid})`);
    }
    lines.push('');
  }

  // Extended checks summary
  const extendedCheckIds = [
    'npm-prefix-mismatch', 'shell-startup-slow', 'version-file-conflict',
    'engines-mismatch', 'node-gyp-readiness', 'npm-cache-health',
    'global-npm-location', 'symlink-health', 'stale-node-modules', 'ide-integration'
  ];
  const extendedChecks = assessment.checks.filter(c => extendedCheckIds.includes(c.id));
  if (extendedChecks.some(c => c.status !== 'pass')) {
    lines.push(bold('  Extended Environment Checks'));
    for (const check of extendedChecks) {
      if (check.status !== 'pass') {
        const icon = check.status === 'warn' ? c('yellow', '⚠') : c('red', '✗');
        lines.push(`    ${icon} ${check.name}: ${check.message}`);
        if (check.hint) {
          lines.push(`      ${dim(check.hint)}`);
        }
      }
    }
    lines.push('');
  }

  // Exit code hint
  if (assessment.exitCode !== 0) {
    lines.push(dim(`  Exit code: ${assessment.exitCode}`));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Print formatted text to console
 */
export function printHealthAssessment(assessment: HealthAssessment): void {
  console.log(formatAsText(assessment));
}
