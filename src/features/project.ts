/**
 * Project Version File Scanning and Health Checks
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as semver from '../semver.js';
import { c, bold, dim } from '../colors.js';
import { clearScreen, readFileContent, fileExists, isWindows, getDirSize, formatSize, dirExists } from '../utils.js';
import { select } from '../prompts.js';
import { getAllInstallations } from '../detectors/index.js';
import { printHeader } from '../ui.js';
import { identifyRunner } from './path.js';
import type {
  ScanResults,
  VersionFileInfo,
  VersionFileParser,
  VersionFileCheck,
  EngineCheck,
  EngineRequirement,
  LockfileCheck,
  NodeModulesCheck,
  ScriptAnalysis,
  ScriptInfo,
  ProjectHealthAssessment,
  HealthCheckStatus,
} from '../types/index.js';

const VERSION_FILE_PARSERS: VersionFileParser[] = [
  {
    name: '.nvmrc',
    parser: (content: string): string | null => content.trim().split('\n')[0].trim(),
  },
  {
    name: '.node-version',
    parser: (content: string): string | null => content.trim().split('\n')[0].trim(),
  },
  {
    name: '.tool-versions',
    parser: (content: string): string | null => {
      const match = content.match(/^nodejs\s+(\S+)/m);
      return match ? match[1] : null;
    },
  },
  {
    name: '.prototools',
    parser: (content: string): string | null => {
      const match = content.match(/node\s*=\s*"?([^"\s]+)"?/);
      return match ? match[1] : null;
    },
  },
  {
    name: 'package.json',
    parser: (content: string): string | null => {
      try {
        const pkg = JSON.parse(content);
        return pkg.engines?.node || null;
      } catch {
        return null;
      }
    },
  },
];

export function scanProjectVersionFiles(projectDir: string = process.cwd()): VersionFileInfo[] {
  const results: VersionFileInfo[] = [];

  for (const { name, parser } of VERSION_FILE_PARSERS) {
    const filePath = path.join(projectDir, name);
    const content = readFileContent(filePath);

    if (content) {
      const version = parser(content);
      if (version) {
        results.push({
          file: name,
          version,
          path: filePath,
        });
      }
    }
  }

  return results;
}

function getActiveManager(results: ScanResults): string | null {
  const pathEnv = process.env.PATH || '';
  const separator = isWindows ? ';' : ':';
  const pathDirs = pathEnv.split(separator).filter(Boolean);
  const nodeExecutable = isWindows ? 'node.exe' : 'node';

  for (const dir of pathDirs) {
    const nodePath = path.join(dir, nodeExecutable);
    if (fileExists(nodePath)) {
      const runner = identifyRunner(nodePath, results);
      if (runner.name && !['system', 'unknown'].includes(runner.name)) {
        return runner.name;
      }
    }
  }
  return null;
}

function getInstallCommand(version: string, activeManager: string): string | null {
  const ver = version.replace(/^v/, '');

  const majorMatch = ver.match(/^[<>=^~]*(\d+)/);
  const targetVersion = majorMatch ? majorMatch[1] : ver;

  const commands: Record<string, string> = {
    'nvm': `nvm install ${targetVersion}`,
    'fnm': `fnm install ${targetVersion}`,
    'volta': `volta install node@${targetVersion}`,
    'asdf': `asdf install nodejs ${targetVersion}`,
    'mise': `mise install node@${targetVersion}`,
    'n': `n install ${targetVersion}`,
    'nvs': `nvs add ${targetVersion}`,
    'nodist': `nodist + ${targetVersion}`,
    'proto': `proto install node ${targetVersion}`,
    'nodenv': `nodenv install ${targetVersion}`,
  };

  return commands[activeManager] || null;
}

function isVersionInstalled(requestedVersion: string, results: ScanResults): boolean {
  const allInstallations = getAllInstallations(results, { includeNonDeletable: true });
  const requested = requestedVersion.replace(/^v/, '').trim();

  // Check if it's a valid semver range (>=18.0.0, ^20.0.0, 18.x, etc.)
  const isRange = semver.validRange(requested);

  if (isRange) {
    // Use semver.satisfies to properly check ranges like >=18.0.0
    return allInstallations.some(inst => {
      const instVersion = (inst.version || '').replace(/^v/, '');
      const cleaned = semver.clean(instVersion);
      if (!cleaned) return false;
      return semver.satisfies(cleaned, requested);
    });
  }

  // Exact version match (fallback for non-semver versions)
  return allInstallations.some(inst => {
    const instVersion = (inst.version || '').replace(/^v/, '');
    return instVersion === requested ||
           instVersion.startsWith(requested + '.') ||
           requested === instVersion.split('.')[0];
  });
}

export async function showProjectVersionFiles(results: ScanResults): Promise<void> {
  clearScreen();
  printHeader();

  console.log(c('cyan', '━'.repeat(66)));
  console.log(`  📄 ${bold('Project Version Files')}`);
  console.log(c('cyan', '━'.repeat(66)));
  console.log();

  const cwd = process.cwd();
  console.log(`  ${dim('Scanning:')} ${cwd}`);
  console.log();

  const versionFiles = scanProjectVersionFiles(cwd);
  const activeManager = getActiveManager(results);

  if (versionFiles.length === 0) {
    console.log(`  ${c('yellow', 'No version files found in current directory.')}`);
    console.log();
    console.log(`  ${dim('Supported files:')}`);
    for (const { name } of VERSION_FILE_PARSERS) {
      console.log(`    ${dim('•')} ${name}`);
    }
    console.log();
  } else {
    console.log(`  ${bold('Found Version Specifications:')}`);
    console.log();

    for (const vf of versionFiles) {
      const installed = isVersionInstalled(vf.version, results);
      const statusIcon = installed ? c('green', '✓') : c('red', '✗');
      const statusText = installed ? c('green', 'installed') : c('red', 'not installed');

      console.log(`  ${c('cyan', '●')} ${bold(vf.file)}`);
      console.log(`     ${dim('Version:')}   ${bold(vf.version)} ${statusIcon} ${dim(`(${statusText})`)}`);

      if (!installed && activeManager) {
        const installCmd = getInstallCommand(vf.version, activeManager);
        if (installCmd) {
          console.log(`     ${c('cyan', '→ Install:')} ${c('yellow', installCmd)}`);
        }
      }

      console.log(`     ${dim('Path:')}      ${vf.path}`);
      console.log();
    }

    const installedCount = versionFiles.filter(vf => isVersionInstalled(vf.version, results)).length;
    const total = versionFiles.length;

    console.log(c('cyan', '━'.repeat(66)));
    console.log(`  ${dim('Summary:')} ${installedCount}/${total} specified versions are installed`);

    if (installedCount < total) {
      if (activeManager) {
        console.log(`  ${dim('Active manager:')} ${bold(activeManager)}`);
      } else {
        console.log();
        console.log(`  ${c('yellow', '💡 Tip:')} No version manager detected. Install one like nvm, fnm, or volta.`);
      }
    }
  }

  console.log();
  console.log(`  ${dim('Esc to go back')}`);
  await select({
    message: 'Press Enter to continue...',
    choices: [{ name: '← Back to menu', value: 'back' }],
    theme: { prefix: '  ' },
  });
}

// ═══════════════════════════════════════════════════════════════
// Project Health Check Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Check version files against current Node version
 */
export function checkVersionFiles(projectDir: string = process.cwd()): VersionFileCheck[] {
  const versionFiles = scanProjectVersionFiles(projectDir);
  const currentVersion = process.version.replace(/^v/, '');

  return versionFiles.map(vf => {
    const required = vf.version.replace(/^v/, '').trim();
    let satisfied = false;

    // Check if it's a semver range or exact version
    const isRange = semver.validRange(required);
    if (isRange) {
      const cleaned = semver.clean(currentVersion);
      if (cleaned) {
        satisfied = semver.satisfies(cleaned, required);
      }
    } else {
      // Exact or partial version match
      satisfied =
        currentVersion === required ||
        currentVersion.startsWith(required + '.') ||
        required === currentVersion.split('.')[0];
    }

    return {
      file: vf.file,
      path: vf.path,
      required: vf.version,
      current: process.version,
      satisfied,
    };
  });
}

/**
 * Check engine requirements from package.json
 */
export function checkEngineRequirements(projectDir: string = process.cwd()): EngineCheck | null {
  const pkgPath = path.join(projectDir, 'package.json');
  const content = readFileContent(pkgPath);

  if (!content) return null;

  try {
    const pkg = JSON.parse(content);
    if (!pkg.engines) return null;

    const result: EngineCheck = {
      node: createEngineRequirement(pkg.engines.node, process.version),
    };

    // npm version
    if (pkg.engines.npm) {
      const npmVersion = getNpmVersion();
      result.npm = createEngineRequirement(pkg.engines.npm, npmVersion);
    }

    // yarn version
    if (pkg.engines.yarn) {
      const yarnVersion = getYarnVersion();
      result.yarn = createEngineRequirement(pkg.engines.yarn, yarnVersion);
    }

    // pnpm version
    if (pkg.engines.pnpm) {
      const pnpmVersion = getPnpmVersion();
      result.pnpm = createEngineRequirement(pkg.engines.pnpm, pnpmVersion);
    }

    return result;
  } catch {
    return null;
  }
}

function createEngineRequirement(required: string | null, current: string | null): EngineRequirement {
  if (!required) {
    return { required: null, current, satisfied: true };
  }

  if (!current) {
    return { required, current: null, satisfied: false };
  }

  const cleanCurrent = semver.clean(current.replace(/^v/, ''));
  const isRange = semver.validRange(required);
  let satisfied = false;

  if (isRange && cleanCurrent) {
    satisfied = semver.satisfies(cleanCurrent, required);
  }

  return { required, current, satisfied };
}

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
  } catch {
    // npm command failed - not installed or timed out
  }
  return null;
}

function getYarnVersion(): string | null {
  try {
    const result = spawnSync('yarn', ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      shell: isWindows,
    });
    if (result.status === 0 && result.stdout) {
      return result.stdout.trim();
    }
  } catch {
    // yarn command failed - not installed or timed out
  }
  return null;
}

function getPnpmVersion(): string | null {
  try {
    const result = spawnSync('pnpm', ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      shell: isWindows,
    });
    if (result.status === 0 && result.stdout) {
      return result.stdout.trim();
    }
  } catch {
    // pnpm command failed - not installed or timed out
  }
  return null;
}

/**
 * Check lockfile integrity
 */
export function checkLockfileIntegrity(projectDir: string = process.cwd()): LockfileCheck {
  const hasPackageLock = fileExists(path.join(projectDir, 'package-lock.json'));
  const hasYarnLock = fileExists(path.join(projectDir, 'yarn.lock'));
  const hasPnpmLock = fileExists(path.join(projectDir, 'pnpm-lock.yaml'));
  const hasNodeModules = dirExists(path.join(projectDir, 'node_modules'));

  const lockCount = [hasPackageLock, hasYarnLock, hasPnpmLock].filter(Boolean).length;

  // Determine detected package manager
  let detectedManager: 'npm' | 'yarn' | 'pnpm' | null = null;
  if (hasPackageLock) detectedManager = 'npm';
  else if (hasYarnLock) detectedManager = 'yarn';
  else if (hasPnpmLock) detectedManager = 'pnpm';

  return {
    hasPackageLock,
    hasYarnLock,
    hasPnpmLock,
    detectedManager,
    multipleLocksWarning: lockCount > 1,
    missingLockWarning: lockCount === 0 && hasNodeModules,
  };
}

/**
 * Check node_modules health
 */
export function checkNodeModulesHealth(projectDir: string = process.cwd()): NodeModulesCheck {
  const nodeModulesPath = path.join(projectDir, 'node_modules');
  const exists = dirExists(nodeModulesPath);

  if (!exists) {
    return {
      exists: false,
      size: 0,
      packageCount: 0,
      orphaned: false,
    };
  }

  // Count top-level packages (excluding .bin and hidden folders)
  let packageCount = 0;
  try {
    const entries = fs.readdirSync(nodeModulesPath);
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      if (entry === '.bin') continue;

      // Handle scoped packages
      if (entry.startsWith('@')) {
        const scopePath = path.join(nodeModulesPath, entry);
        try {
          const scopedPackages = fs.readdirSync(scopePath);
          packageCount += scopedPackages.filter(p => !p.startsWith('.')).length;
        } catch {
          // Scoped package directory unreadable - skip
        }
      } else {
        packageCount++;
      }
    }
  } catch {
    // node_modules directory unreadable - permission denied
  }

  // Check if orphaned (no lockfile)
  const lockfile = checkLockfileIntegrity(projectDir);
  const orphaned = !lockfile.hasPackageLock && !lockfile.hasYarnLock && !lockfile.hasPnpmLock;

  // Calculate size (can be slow for large node_modules)
  const size = getDirSize(nodeModulesPath);

  return {
    exists,
    size,
    packageCount,
    orphaned,
  };
}

/**
 * Analyze package scripts for security concerns
 */
export function analyzeScripts(projectDir: string = process.cwd()): ScriptAnalysis {
  const pkgPath = path.join(projectDir, 'package.json');
  const content = readFileContent(pkgPath);

  const defaultResult: ScriptAnalysis = {
    hasLifecycleScripts: false,
    scripts: [],
    riskLevel: 'none',
  };

  if (!content) return defaultResult;

  try {
    const pkg = JSON.parse(content);
    if (!pkg.scripts) return defaultResult;

    const lifecycleScripts = ['preinstall', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly'];
    const scripts: ScriptInfo[] = [];
    let hasLifecycle = false;
    let highRiskCount = 0;
    let mediumRiskCount = 0;

    for (const scriptName of lifecycleScripts) {
      const scriptContent = pkg.scripts[scriptName];
      if (scriptContent) {
        hasLifecycle = true;

        // Check for risky patterns
        const hasRemoteExecution = /\b(curl|wget|fetch|http|https|ftp)\b/i.test(scriptContent);
        const hasSudo = /\bsudo\b/i.test(scriptContent);
        const hasEval = /\b(eval|Function)\b/.test(scriptContent);
        const hasShellExec = /\$\(|`/.test(scriptContent);

        if (hasSudo || hasEval) highRiskCount++;
        else if (hasRemoteExecution || hasShellExec) mediumRiskCount++;

        scripts.push({
          name: scriptName,
          content: scriptContent,
          hasRemoteExecution: hasRemoteExecution || hasShellExec,
          hasSudo,
        });
      }
    }

    // Determine risk level
    let riskLevel: 'none' | 'low' | 'medium' | 'high' = 'none';
    if (highRiskCount > 0) riskLevel = 'high';
    else if (mediumRiskCount > 0) riskLevel = 'medium';
    else if (hasLifecycle) riskLevel = 'low';

    return {
      hasLifecycleScripts: hasLifecycle,
      scripts,
      riskLevel,
    };
  } catch {
    return defaultResult;
  }
}

/**
 * Run comprehensive project health assessment
 */
export function runProjectHealthAssessment(projectDir: string = process.cwd()): ProjectHealthAssessment {
  const pkgPath = path.join(projectDir, 'package.json');
  const isNodeProject = fileExists(pkgPath);

  const versionFiles = checkVersionFiles(projectDir);
  const engines = checkEngineRequirements(projectDir);
  const lockfile = checkLockfileIntegrity(projectDir);
  const nodeModules = checkNodeModulesHealth(projectDir);
  const scripts = analyzeScripts(projectDir);

  // Calculate summary
  let passed = 0;
  let warnings = 0;
  let failed = 0;

  // Version files check
  const versionMismatches = versionFiles.filter(v => !v.satisfied);
  if (versionMismatches.length > 0) {
    failed += versionMismatches.length;
  } else if (versionFiles.length > 0) {
    passed++;
  }

  // Engine requirements check
  if (engines) {
    if (!engines.node.satisfied) failed++;
    else passed++;
    if (engines.npm && !engines.npm.satisfied) warnings++;
    if (engines.yarn && !engines.yarn.satisfied) warnings++;
    if (engines.pnpm && !engines.pnpm.satisfied) warnings++;
  }

  // Lockfile check
  if (lockfile.multipleLocksWarning) warnings++;
  else if (lockfile.missingLockWarning) warnings++;
  else if (lockfile.detectedManager) passed++;

  // node_modules check
  if (nodeModules.orphaned) warnings++;
  else if (nodeModules.exists) passed++;

  // Scripts check
  if (scripts.riskLevel === 'high') warnings++;
  else if (scripts.riskLevel === 'medium') warnings++;
  else if (scripts.hasLifecycleScripts) passed++;

  // Determine overall status
  let overallStatus: HealthCheckStatus = 'pass';
  if (failed > 0) overallStatus = 'fail';
  else if (warnings > 0) overallStatus = 'warn';

  return {
    timestamp: new Date().toISOString(),
    projectDir,
    isNodeProject,
    versionFiles,
    engines,
    lockfile,
    nodeModules,
    scripts,
    overallStatus,
    summary: { passed, warnings, failed },
  };
}

/**
 * Display project health assessment
 */
export function displayProjectHealth(assessment: ProjectHealthAssessment): void {
  const { versionFiles, engines, lockfile, nodeModules, scripts, summary } = assessment;

  // Header
  const statusIcon = assessment.overallStatus === 'pass' ? '🟢' :
                     assessment.overallStatus === 'warn' ? '🟡' : '🔴';
  const statusText = assessment.overallStatus === 'pass' ? c('green', 'Healthy') :
                     assessment.overallStatus === 'warn' ? c('yellow', 'Warnings') : c('red', 'Issues');

  console.log(c('cyan', '━'.repeat(66)));
  console.log(`  📦 ${bold('Project Health')}  ${statusIcon} ${statusText}`);
  console.log(c('cyan', '━'.repeat(66)));
  console.log();
  console.log(`  ${dim('Directory:')} ${assessment.projectDir}`);
  console.log();

  if (!assessment.isNodeProject) {
    console.log(`  ${c('yellow', '⚠')} Not a Node.js project (no package.json found)`);
    console.log();
    return;
  }

  // Version Files
  if (versionFiles.length > 0) {
    const allSatisfied = versionFiles.every(v => v.satisfied);
    const indicator = allSatisfied ? c('green', '✓') : c('red', '✗');

    console.log(`  ${indicator} ${bold('Version Files')}`);
    console.log();

    for (const vf of versionFiles) {
      const icon = vf.satisfied ? c('green', '●') : c('red', '●');
      const status = vf.satisfied ? c('green', 'OK') : c('red', 'mismatch');
      console.log(`    ${icon} ${vf.file}: requires ${bold(vf.required)}, running ${vf.current} ${dim(`(${status})`)}`);
    }
    console.log();
  }

  // Engine Requirements
  if (engines) {
    const allSatisfied = engines.node.satisfied &&
                        (!engines.npm || engines.npm.satisfied) &&
                        (!engines.yarn || engines.yarn.satisfied) &&
                        (!engines.pnpm || engines.pnpm.satisfied);
    const indicator = allSatisfied ? c('green', '✓') : c('yellow', '⚠');

    console.log(`  ${indicator} ${bold('Engine Requirements')}`);
    console.log();

    // Node
    const nodeIcon = engines.node.satisfied ? c('green', '●') : c('red', '●');
    const nodeStatus = engines.node.satisfied ? c('green', 'OK') : c('red', 'mismatch');
    if (engines.node.required) {
      console.log(`    ${nodeIcon} node: requires ${bold(engines.node.required)}, have ${engines.node.current} ${dim(`(${nodeStatus})`)}`);
    }

    // npm
    if (engines.npm?.required) {
      const npmIcon = engines.npm.satisfied ? c('green', '●') : c('yellow', '●');
      const npmStatus = engines.npm.satisfied ? c('green', 'OK') : c('yellow', 'mismatch');
      console.log(`    ${npmIcon} npm: requires ${bold(engines.npm.required)}, have ${engines.npm.current || 'not found'} ${dim(`(${npmStatus})`)}`);
    }

    // yarn
    if (engines.yarn?.required) {
      const yarnIcon = engines.yarn.satisfied ? c('green', '●') : c('yellow', '●');
      const yarnStatus = engines.yarn.satisfied ? c('green', 'OK') : c('yellow', 'mismatch');
      console.log(`    ${yarnIcon} yarn: requires ${bold(engines.yarn.required)}, have ${engines.yarn.current || 'not found'} ${dim(`(${yarnStatus})`)}`);
    }

    console.log();
  }

  // Lockfile
  {
    const hasIssues = lockfile.multipleLocksWarning || lockfile.missingLockWarning;
    const indicator = hasIssues ? c('yellow', '⚠') : lockfile.detectedManager ? c('green', '✓') : c('dim', '○');

    console.log(`  ${indicator} ${bold('Lockfile')}`);
    console.log();

    if (lockfile.multipleLocksWarning) {
      console.log(`    ${c('yellow', '●')} Multiple lockfiles detected - may cause conflicts`);
      if (lockfile.hasPackageLock) console.log(`      ${dim('→')} package-lock.json (npm)`);
      if (lockfile.hasYarnLock) console.log(`      ${dim('→')} yarn.lock (yarn)`);
      if (lockfile.hasPnpmLock) console.log(`      ${dim('→')} pnpm-lock.yaml (pnpm)`);
    } else if (lockfile.missingLockWarning) {
      console.log(`    ${c('yellow', '●')} No lockfile found but node_modules exists`);
      console.log(`      ${dim('Run npm install / yarn / pnpm install to generate lockfile')}`);
    } else if (lockfile.detectedManager) {
      const lockName = lockfile.hasPackageLock ? 'package-lock.json' :
                       lockfile.hasYarnLock ? 'yarn.lock' : 'pnpm-lock.yaml';
      console.log(`    ${c('green', '●')} Using ${lockfile.detectedManager} (${lockName})`);
    } else {
      console.log(`    ${dim('No lockfile (no dependencies installed)')}`);
    }
    console.log();
  }

  // node_modules
  if (nodeModules.exists) {
    const indicator = nodeModules.orphaned ? c('yellow', '⚠') : c('green', '✓');

    console.log(`  ${indicator} ${bold('node_modules')}`);
    console.log();

    console.log(`    ${c('cyan', '●')} ${nodeModules.packageCount} packages ${dim(`(${formatSize(nodeModules.size)})`)}`);

    if (nodeModules.orphaned) {
      console.log(`    ${c('yellow', '●')} Orphaned: no lockfile to verify integrity`);
    }
    console.log();
  }

  // Scripts Security
  if (scripts.hasLifecycleScripts) {
    const indicator = scripts.riskLevel === 'high' ? c('red', '⚠') :
                     scripts.riskLevel === 'medium' ? c('yellow', '⚠') : c('green', '✓');

    console.log(`  ${indicator} ${bold('Lifecycle Scripts')}`);
    console.log();

    for (const script of scripts.scripts) {
      let icon = c('green', '●');
      let warning = '';

      if (script.hasSudo) {
        icon = c('red', '●');
        warning = c('red', '(uses sudo!)');
      } else if (script.hasRemoteExecution) {
        icon = c('yellow', '●');
        warning = c('yellow', '(network/shell execution)');
      }

      console.log(`    ${icon} ${script.name} ${warning}`);
      if (script.content) {
        const truncated = script.content.length > 60 ? script.content.slice(0, 60) + '...' : script.content;
        console.log(`      ${dim(truncated)}`);
      }
    }

    if (scripts.riskLevel !== 'none' && scripts.riskLevel !== 'low') {
      console.log();
      console.log(`    ${dim('Tip: Review scripts before installing dependencies from untrusted sources')}`);
    }
    console.log();
  }

  // Summary
  console.log(c('cyan', '━'.repeat(66)));
  console.log(`  ${dim('Summary:')} ${c('green', String(summary.passed))} passed, ${c('yellow', String(summary.warnings))} warnings, ${c('red', String(summary.failed))} failed`);
  console.log();
}
