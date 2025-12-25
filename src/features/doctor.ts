/**
 * Doctor Mode - Unified Environment Diagnostics
 * Now powered by health-engine.ts for consistent results
 */

import { c, bold, dim } from '../colors.js';
import { clearScreen, formatSize } from '../utils.js';
import { select, BACK } from '../prompts.js';
import { printHeader } from '../ui.js';
import { getSourceLabel } from './registry.js';
import { runHealthAssessment, formatAsJSON } from './health-engine.js';
import { scanAll } from '../detectors/index.js';
import type {
  ScanResults,
  HealthAssessment,
  HealthBanner,
  FoundNode,
  DetectedManager,
  ColorName,
  PackageManagerInfo,
  DuplicateVersion,
  EnvVarInfo,
  GlobalPackagesSummary,
  PermissionCheck,
  CorepackInfo,
  ShellConfigFile,
  NodeConfigEntry,
  ExtendedHealthChecks,
  HealthCheck,
} from '../types/index.js';

// ═══════════════════════════════════════════════════════════════
// Health Display Helpers
// ═══════════════════════════════════════════════════════════════

type HealthLevel = 'good' | 'warning' | 'critical';

const HEALTH: Record<string, HealthLevel> = {
  GOOD: 'good',
  WARNING: 'warning',
  CRITICAL: 'critical',
};

/**
 * Get health status indicator with color
 */
function getHealthIndicator(health: HealthLevel, text?: string): string {
  switch (health) {
    case HEALTH.GOOD:
      return c('green', text || '✓');
    case HEALTH.WARNING:
      return c('yellow', text || '⚠');
    case HEALTH.CRITICAL:
      return c('red', text || '✗');
    default:
      return dim(text || '○');
  }
}

/**
 * Get health banner for summary display
 */
function getHealthBannerFromAssessment(assessment: HealthAssessment): HealthBanner {
  const { failed, warnings } = assessment.summary;

  if (failed > 0) {
    return {
      health: 'critical',
      icon: '🔴',
      text: c('red', bold(`${failed} Critical Issue${failed > 1 ? 's' : ''}`)),
      color: 'red',
    };
  }
  if (warnings > 0) {
    return {
      health: 'warning',
      icon: '🟡',
      text: c('yellow', bold(`${warnings} Warning${warnings > 1 ? 's' : ''}`)),
      color: 'yellow',
    };
  }
  return {
    health: 'good',
    icon: '🟢',
    text: c('green', bold('All Good')),
    color: 'green',
  };
}

interface MenuChoice {
  type: 'back' | 'refresh';
}

interface DoctorOptions {
  /** Output results as JSON (non-interactive) */
  json?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Main Doctor Function
// ═══════════════════════════════════════════════════════════════

/**
 * Main doctor function
 */
export async function runDoctor(initialResults: ScanResults, options?: DoctorOptions): Promise<void> {
  // ─────────────────────────────────────────────────────────────
  // Step 1: Run unified health assessment
  // ─────────────────────────────────────────────────────────────
  if (!options?.json) {
    console.log(`  ${c('cyan', '⏳')} Running health assessment...`);
  }

  let results = initialResults;
  let assessment = await runHealthAssessment(results);

  // ─────────────────────────────────────────────────────────────
  // Step 2: JSON output mode (non-interactive)
  // ─────────────────────────────────────────────────────────────
  if (options?.json) {
    console.log(formatAsJSON(assessment));
    process.exitCode = assessment.exitCode;
    return;
  }

  // ─────────────────────────────────────────────────────────────
  // Step 3: Interactive display (using assessment.data)
  // ─────────────────────────────────────────────────────────────
  // Main loop
  while (true) {
    const healthBanner = getHealthBannerFromAssessment(assessment);
    clearScreen();
    // printHeader(); // Removed to avoid double title

    console.log(c('cyan', '━'.repeat(66)));
    console.log(`  🏥 ${bold('Environment Info')}  ${healthBanner.icon} ${healthBanner.text}`);
    console.log(c('cyan', '━'.repeat(66)));
    console.log();

    // Display all sections using assessment.data
    displayDoctorUI(assessment);

    // ═══════════════════════════════════════════════════════════════════
    // Simple Menu: Refresh or Exit
    // ═══════════════════════════════════════════════════════════════════
    console.log(`  ${dim('Esc to go back')}`);
    console.log();

    // Ensure stdout is flushed before prompt renders
    // This prevents partial display issues with long output
    await new Promise<void>(resolve => {
      if (process.stdout.write('')) {
        resolve();
      } else {
        process.stdout.once('drain', resolve);
      }
    });

    const choice = (await select({
      message: 'Select action:',
      choices: [
        { name: '🔄 Refresh info', value: { type: 'refresh' } },
        { name: '🚪 Back to menu', value: { type: 'back' } },
      ],
      pageSize: 10,
      loop: false,
      theme: {
        prefix: '  ',
        style: { highlight: (text: string) => c('cyan', text) },
      },
    })) as MenuChoice | typeof BACK;

    // Handle ESC or back
    if (choice === BACK || (choice as MenuChoice).type === 'back') {
      return;
    }

    if (choice.type === 'refresh') {
      console.log();
      console.log(`  ${c('cyan', '⏳')} Refreshing data...`);
      results = scanAll();
      assessment = await runHealthAssessment(results);
      continue;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Display Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Display doctor UI sections using assessment data
 */
function displayDoctorUI(assessment: HealthAssessment): void {
  const { data, checks } = assessment;

  // Section 1: System (from data.system)
  displaySystemSection(data.system);

  // Section 2: Managers (from data.managers)
  displayManagersSection(data.managers, data.activeManagers);

  // Section 3: PATH Priority (from data.nodesInPath)
  displayPathSection(data.nodesInPath);

  // Section 4: Security (prominent display)
  displaySecuritySection(data.security, checks, data.system.nodeVersion);

  // Section 5: Port Status (merged from health checks)
  displayPortSection(data.portProcesses);

  // Section 6: Registry (from data.registry)
  displayRegistrySection(data.registry, assessment);

  // Section 7: Package Managers (npm, yarn, pnpm)
  displayPackageManagersSection(data.packageManagers);

  // Section 8: Environment Variables
  displayEnvironmentSection(data.environmentVars);

  // Section 9: Global Packages Summary
  displayGlobalPackagesSection(data.globalPackages);

  // Section 10: Corepack Status
  displayCorepackSection(data.corepack);

  // Section 11: Permissions
  displayPermissionsSection(data.permissions);

  // Section 12: Duplicate Versions
  if (data.duplicateVersions.length > 0) {
    displayDuplicatesSection(data.duplicateVersions);
  }

  // Section 13: Shell Config Files (informational)
  displayShellConfigsSection(data.allShellConfigs, data.shellConfigs);

  // Section 14: Extended Health Checks
  displayExtendedChecksSection(data.extendedChecks, checks);

  // Section 15: Issues Summary (from checks)
  displayIssuesSummary(checks);
}

/**
 * Section 1: System Info
 */
function displaySystemSection(system: HealthAssessment['data']['system']): void {
  console.log(`  ${c('green', '✓')} ${bold('System')}`);
  console.log(`    ${dim('Platform:')}   ${system.platform}`);
  console.log(`    ${dim('Shell:')}      ${system.shell}`);
  console.log(`    ${dim('Node:')}       ${c('green', system.nodeVersion)}`);
  if (system.mnpmVersion) {
    console.log(`    ${dim('mnpm:')}       ${c('green', system.mnpmVersion)}`);
  }
  console.log(`    ${dim('Executable:')} ${system.execPath}`);
  console.log();
}

/**
 * Section 2: Detected Managers
 */
function displayManagersSection(managers: DetectedManager[], activeManagers: string[]): void {
  const managersInPath = new Set(activeManagers);
  const managersHealth: HealthLevel = managersInPath.size > 1 ? HEALTH.WARNING : HEALTH.GOOD;
  const managersIndicator = getHealthIndicator(managersHealth);
  console.log(`  ${managersIndicator} ${bold('Detected Managers')}`);
  console.log();

  if (managers.length === 0) {
    console.log(`    ${dim('No version managers detected')}`);
  } else {
    for (const mgr of managers) {
      const inPath = managersInPath.has(mgr.name);
      // Active managers when multiple are active = yellow warning
      const hasConflict = managersInPath.size > 1 && inPath;
      const statusIcon = hasConflict
        ? c('yellow', '●')
        : inPath
          ? c('green', '●')
          : c('dim', '○');
      const statusText = hasConflict
        ? c('yellow', 'active (conflict)')
        : inPath
          ? c('green', 'active')
          : c('dim', 'installed');

      console.log(
        `    ${statusIcon} ${mgr.icon} ${bold(mgr.name)} ${dim(`(${mgr.versionCount} versions, ${formatSize(mgr.totalSize)})`)} ${statusText}`
      );
      console.log(`         ${dim(mgr.baseDir)}`);

      // Show individual versions
      if (mgr.installations && mgr.installations.length > 0) {
        for (const inst of mgr.installations) {
          // Compact format: Version - Path - Size
          console.log(`           ${dim('→')} ${bold(inst.version.padEnd(10))} ${dim(inst.path)} ${dim(`(${formatSize(inst.size)})`)}`);
        }
      }
    }

    // Show warning hint for multiple active managers
    if (managersInPath.size > 1) {
      console.log();
      console.log(
        `    ${c('yellow', '⚠')} ${c('yellow', 'Multiple active managers may cause PATH conflicts')}`
      );
    }
  }
  console.log();
}

/**
 * Section 3: PATH Priority
 */
function displayPathSection(foundNodes: FoundNode[]): void {
  const pathHealth: HealthLevel =
    foundNodes.length === 0
      ? HEALTH.CRITICAL
      : foundNodes.length > 1
        ? HEALTH.WARNING
        : HEALTH.GOOD;
  const pathIndicator = getHealthIndicator(pathHealth);
  console.log(`  ${pathIndicator} ${bold('PATH Priority')} ${dim('(first wins)')}`);
  console.log();

  if (foundNodes.length === 0) {
    console.log(`    ${c('red', '✗')} ${c('red', 'No Node.js in PATH')}`);
    console.log(`      ${dim('Install Node.js or add it to your PATH')}`);
  } else {
    for (let i = 0; i < foundNodes.length; i++) {
      const node = foundNodes[i];
      const rank = i + 1;
      const isShadowed = !node.isCurrent && rank > 1;
      const marker = node.isCurrent
        ? c('green', '➜')
        : isShadowed
          ? c('yellow', `${rank}.`)
          : dim(`${rank}.`);
      const status = node.isCurrent
        ? c('green', '(current)')
        : isShadowed
          ? c('yellow', '(shadowed)')
          : '';
      const versionColor: ColorName = node.isCurrent ? 'green' : isShadowed ? 'yellow' : 'white';

      let extraInfo = '';
      if (node.eol?.status === 'eol') {
        extraInfo += ` ${c('bgRed', ' EOL ')}`;
      } else if (node.eol?.status === 'maintenance') {
        extraInfo += ` ${c('bgYellow', ' Maintenance ')}`;
      }

      if (node.security?.vulnerable) {
        extraInfo += ` ${c('red', '⚠ Vulnerable')}`;
      }

      console.log(
        `    ${marker} ${node.runner.icon} ${bold(node.runner.name)} ${c(versionColor, node.version)}${extraInfo} ${status}`
      );
      console.log(`         ${dim(node.executable)}`);
    }
  }
  console.log();
}

/**
 * Section 4: Security
 */
function displaySecuritySection(
  security: HealthAssessment['data']['security'],
  checks: HealthAssessment['checks'],
  nodeVersion: string
): void {
  // Determine section health from checks
  const securityChecks = checks.filter(c => c.category === 'security');
  const hasFail = securityChecks.some(c => c.status === 'fail');
  const hasWarn = securityChecks.some(c => c.status === 'warn');
  const securityHealth: HealthLevel = hasFail
    ? HEALTH.CRITICAL
    : hasWarn
      ? HEALTH.WARNING
      : HEALTH.GOOD;
  const securityIndicator = getHealthIndicator(securityHealth);

  console.log(`  ${securityIndicator} ${bold('Security')}`);
  console.log();

  // EOL Status
  if (security.eol) {
    const eol = security.eol;
    if (eol.status === 'eol') {
      console.log(
        `    ${c('red', '●')} Node.js ${nodeVersion} is ${c('bgRed', ' End-of-Life (EOL) ')}`
      );
      console.log(`      ${dim(`Support ended on ${eol.eolDate}. Upgrade immediately.`)}`);
    } else if (eol.status === 'maintenance') {
      console.log(
        `    ${c('yellow', '●')} Node.js ${nodeVersion} is in ${c('bgYellow', ' Maintenance ')} mode`
      );
      console.log(`      ${dim(`Support ends on ${eol.eolDate}. Plan your upgrade.`)}`);
    } else if (eol.status === 'active') {
      console.log(`    ${c('green', '●')} Node.js ${nodeVersion} is actively supported`);
    } else {
      console.log(`    ${c('yellow', '●')} Node.js ${nodeVersion} status unknown`);
    }
  } else {
    console.log(`    ${c('yellow', '●')} Could not fetch release schedule`);
  }

  // Security vulnerabilities
  if (security.vulnerabilities) {
    if (security.vulnerabilities.vulnerable) {
      console.log(`    ${c('red', '●')} Known security vulnerabilities detected`);
      if (security.vulnerabilities.details) {
        console.log(`      ${dim(security.vulnerabilities.details)}`);
      }
      if (security.vulnerabilities.latestSecurityRelease) {
        console.log(
          `      ${dim(`Upgrade to ${security.vulnerabilities.latestSecurityRelease}`)}`
        );
      }
    } else {
      console.log(`    ${c('green', '●')} No known security vulnerabilities`);
    }
  } else {
    console.log(`    ${c('yellow', '●')} Could not fetch security data`);
  }

  // Auth Tokens (PATS)
  if (security.tokens && security.tokens.length > 0) {
    console.log();
    console.log(`    ${bold('Authentication Tokens (PATS)')}`);
    const setTokens = security.tokens.filter(t => t.isSet);
    if (setTokens.length > 0) {
      for (const token of setTokens) {
        console.log(`      ${c('green', '●')} ${token.name} ${dim('(set)')}`);
      }
    } else {
      console.log(`      ${dim('No tokens detected')}`);
    }
  }

  console.log();
}

/**
 * Section 5: Port Status
 */
function displayPortSection(portProcesses: HealthAssessment['data']['portProcesses']): void {
  const hasProcesses = portProcesses.length > 0;
  const portHealth: HealthLevel = hasProcesses ? HEALTH.WARNING : HEALTH.GOOD;
  const portIndicator = getHealthIndicator(portHealth);

  console.log(`  ${portIndicator} ${bold('Port Status')}`);
  console.log();

  if (portProcesses.length === 0) {
    console.log(`    ${c('green', '●')} No Node.js processes blocking ports`);
  } else {
    console.log(
      `    ${c('yellow', '●')} ${portProcesses.length} Node.js process(es) using ports`
    );
    for (const proc of portProcesses) {
      console.log(`      Port ${bold(String(proc.port))} ${dim('→')} ${proc.name} ${dim(`(PID: ${proc.pid})`)}`);
    }
    console.log();
    console.log(`    ${dim('Use "node-doctor heal" to manage these processes')}`);
  }
  console.log();
}

/**
 * Section 6: NPM Registry Configuration
 */
function displayRegistrySection(
  registry: HealthAssessment['data']['registry'],
  assessment: HealthAssessment
): void {
  const registryHealth: HealthLevel = !registry.status.available
    ? HEALTH.CRITICAL
    : registry.status.latency > 2000
      ? HEALTH.WARNING
      : HEALTH.GOOD;
  const registryIndicator = getHealthIndicator(registryHealth);
  console.log(`  ${registryIndicator} ${bold('NPM Registry')}`);
  console.log();

  const printedPaths = new Set<string>();

  // Global registry
  const isDefault = registry.info.global.source === 'default';
  const globalIcon = isDefault ? c('dim', '○') : c('green', '●');
  const globalLabel = isDefault
    ? dim('(default)')
    : dim(`(${getSourceLabel(registry.info.global.source)})`);

  let statusLabel = '';
  if (registry.status.available) {
    const latencyColor: ColorName = registry.status.latency > 2000 ? 'yellow' : 'green';
    statusLabel = c(latencyColor, `[${registry.status.status} OK - ${registry.status.latency}ms]`);
  } else if (registry.status.error) {
    statusLabel = c('red', `[Error: ${registry.status.error}]`);
  } else {
    statusLabel = c('red', `[Unreachable]`);
  }

  console.log(
    `    ${globalIcon} ${bold('Global:')} ${registry.info.global.registry} ${globalLabel} ${statusLabel}`
  );
  if (registry.info.global.path) {
    console.log(`         ${dim(registry.info.global.path)}`);
    printedPaths.add(registry.info.global.path);
  } else if (registry.info.global.source === 'environment') {
    const envVar = process.env.npm_config_registry ? 'npm_config_registry' : 'NPM_CONFIG_REGISTRY';
    console.log(`         ${dim(`$${envVar}`)}`);
    // Also show the global config file location
    const globalNpmrc = registry.info.configFiles.find(f => f.type === 'global-npmrc');
    if (globalNpmrc) {
      console.log(`         ${dim(`Global config: ${globalNpmrc.path}`)}`);
      printedPaths.add(globalNpmrc.path);
    }
  } else if (registry.info.global.source === 'default') {
    // Show global config file location even when using default
    const globalNpmrc = registry.info.configFiles.find(f => f.type === 'global-npmrc');
    if (globalNpmrc) {
      console.log(`         ${dim(`Global config: ${globalNpmrc.path}`)}`);
      printedPaths.add(globalNpmrc.path);
    }
  }

  // Local/Project registry (if different)
  if (registry.info.local) {
    console.log(
      `    ${c('blue', '●')} ${bold('Project:')} ${registry.info.local.registry} ${dim(`(${getSourceLabel(registry.info.local.source)})`)}`
    );
    console.log(`         ${dim(registry.info.local.path || '')}`);
    if (registry.info.local.path) printedPaths.add(registry.info.local.path);
  }

  // Scoped registries
  const scopeEntries = Object.entries(registry.info.scopes);
  if (scopeEntries.length > 0) {
    console.log();
    console.log(`    ${dim('Scoped Registries:')}`);
    for (const [scope, info] of scopeEntries) {
      console.log(`      ${c('cyan', '→')} ${bold(scope)}: ${info.registry}`);
      console.log(`           ${dim(info.path)}`);
      if (info.path) printedPaths.add(info.path);
    }
  }

  // Config files found (only show ones not already displayed)
  const existingConfigs = registry.info.configFiles.filter(f => f.exists && !printedPaths.has(f.path));
  if (existingConfigs.length > 0) {
    console.log();
    console.log(`    ${dim('Config files:')}`);
    for (const cf of existingConfigs) {
      console.log(`      ${c('green', '✓')} ${dim(cf.path)}`);
    }
  }
  console.log();
}

/**
 * Section 7: Package Managers (npm, yarn, pnpm)
 */
function displayPackageManagersSection(pkgMgrs: PackageManagerInfo): void {
  console.log(`  ${c('green', '✓')} ${bold('Package Managers')}`);
  console.log();

  // npm
  if (pkgMgrs.npm.version) {
    console.log(`    ${c('cyan', '●')} ${bold('npm')} ${pkgMgrs.npm.version}`);
    if (pkgMgrs.npm.cache.path) {
      console.log(`         Cache: ${dim(pkgMgrs.npm.cache.path)} ${dim(`(${formatSize(pkgMgrs.npm.cache.size)})`)}`);
    }
  }

  // yarn
  if (pkgMgrs.yarn.version) {
    console.log(`    ${c('cyan', '●')} ${bold('yarn')} ${pkgMgrs.yarn.version}`);
    if (pkgMgrs.yarn.cache.path) {
      console.log(`         Cache: ${dim(pkgMgrs.yarn.cache.path)} ${dim(`(${formatSize(pkgMgrs.yarn.cache.size)})`)}`);
    }
    if (pkgMgrs.yarn.registry && pkgMgrs.yarn.registry !== 'https://registry.yarnpkg.com') {
      console.log(`         Registry: ${dim(pkgMgrs.yarn.registry)} ${dim(`(${pkgMgrs.yarn.registrySource})`)}`);
    }
  }

  // pnpm
  if (pkgMgrs.pnpm.version) {
    console.log(`    ${c('cyan', '●')} ${bold('pnpm')} ${pkgMgrs.pnpm.version}`);
    if (pkgMgrs.pnpm.store.path) {
      console.log(`         Store: ${dim(pkgMgrs.pnpm.store.path)} ${dim(`(${formatSize(pkgMgrs.pnpm.store.size)})`)}`);
    }
    if (pkgMgrs.pnpm.registry) {
      console.log(`         Registry: ${dim(pkgMgrs.pnpm.registry)} ${dim(`(${pkgMgrs.pnpm.registrySource})`)}`);
    }
  }

  // npx cache
  if (pkgMgrs.npx.cache.path && pkgMgrs.npx.cache.size > 0) {
    console.log(`    ${c('dim', '●')} ${dim('npx cache:')} ${dim(formatSize(pkgMgrs.npx.cache.size))}`);
  }

  // Show hint if no package managers found
  if (!pkgMgrs.npm.version && !pkgMgrs.yarn.version && !pkgMgrs.pnpm.version) {
    console.log(`    ${dim('No package managers detected')}`);
  }

  console.log();
}

/**
 * Section 8: Environment Variables (no values shown)
 */
function displayEnvironmentSection(envVars: EnvVarInfo[]): void {
  const setVars = envVars.filter(v => v.isSet);

  if (setVars.length === 0) {
    return; // Don't show section if no vars are set
  }

  const hasNodeOptions = setVars.some(v => v.name === 'NODE_OPTIONS');
  const indicator = hasNodeOptions ? c('yellow', '⚠') : c('green', '✓');

  console.log(`  ${indicator} ${bold('Environment Variables')}`);
  console.log();

  for (const v of setVars) {
    const icon = v.name === 'NODE_OPTIONS' ? c('yellow', '●') : c('green', '●');
    console.log(`    ${icon} ${v.name} ${dim('(set)')}`);
  }

  if (hasNodeOptions) {
    console.log();
    console.log(`    ${c('yellow', '⚠')} ${c('yellow', 'NODE_OPTIONS may affect Node.js behavior')}`);
  }

  console.log();
}

/**
 * Section 9: Global Packages Summary
 */
function displayGlobalPackagesSection(globals: GlobalPackagesSummary): void {
  if (globals.totalCount === 0) {
    return; // Don't show section if no global packages
  }

  const hasDuplicates = globals.duplicates.length > 0;
  const indicator = hasDuplicates ? c('yellow', '⚠') : c('green', '✓');

  console.log(`  ${indicator} ${bold('Global Packages')}`);
  console.log();

  if (globals.npm.count > 0) {
    console.log(`    ${c('cyan', '●')} npm: ${globals.npm.count} packages ${dim(`(${formatSize(globals.npm.size)})`)}`);
  }
  if (globals.yarn.count > 0) {
    console.log(`    ${c('cyan', '●')} yarn: ${globals.yarn.count} packages ${dim(`(${formatSize(globals.yarn.size)})`)}`);
  }
  if (globals.pnpm.count > 0) {
    console.log(`    ${c('cyan', '●')} pnpm: ${globals.pnpm.count} packages ${dim(`(${formatSize(globals.pnpm.size)})`)}`);
  }

  if (hasDuplicates) {
    console.log();
    console.log(`    ${c('yellow', '⚠')} ${c('yellow', `${globals.duplicates.length} package(s) in multiple managers:`)}`);
    console.log(`      ${dim(globals.duplicates.slice(0, 5).join(', '))}${globals.duplicates.length > 5 ? dim(` (+${globals.duplicates.length - 5} more)`) : ''}`);
  }

  console.log();
}

/**
 * Section 10: Corepack Status
 */
function displayCorepackSection(corepack: CorepackInfo): void {
  if (!corepack.installed) {
    return; // Don't show section if corepack not installed
  }

  const hasWarning = corepack.packageManagerField && !corepack.enabled;
  const indicator = hasWarning ? c('yellow', '⚠') : c('green', '✓');

  console.log(`  ${indicator} ${bold('Corepack')}`);
  console.log();

  console.log(`    ${c('green', '●')} Version: ${corepack.version}`);
  console.log(`    ${corepack.enabled ? c('green', '●') : c('dim', '○')} Status: ${corepack.enabled ? 'enabled' : 'not enabled'}`);

  if (corepack.managedManagers.length > 0) {
    console.log(`    ${c('cyan', '●')} Managing: ${corepack.managedManagers.join(', ')}`);
  }

  if (corepack.packageManagerField) {
    console.log(`    ${c('blue', '●')} package.json: ${corepack.packageManagerField}`);
    if (!corepack.enabled) {
      console.log();
      console.log(`    ${c('yellow', '⚠')} ${c('yellow', 'Run "corepack enable" to use specified package manager')}`);
    }
  }

  console.log();
}

/**
 * Section 11: Permissions
 */
function displayPermissionsSection(permissions: PermissionCheck[]): void {
  const issues = permissions.filter(p => p.exists && !p.writable);

  if (issues.length === 0) {
    return; // Don't show section if no permission issues
  }

  console.log(`  ${c('yellow', '⚠')} ${bold('Permission Issues')}`);
  console.log();

  for (const p of issues) {
    console.log(`    ${c('yellow', '●')} ${p.name}: ${dim('not writable')}`);
    console.log(`      ${dim(p.path)}`);
  }

  console.log();
  console.log(`    ${dim('Tip: Check ownership or use sudo for global installs')}`);
  console.log();
}

/**
 * Section 12: Duplicate Versions
 */
function displayDuplicatesSection(duplicates: DuplicateVersion[]): void {
  const totalWasted = duplicates.reduce((sum, d) => {
    const avgSize = d.totalSize / d.managers.length;
    return sum + (d.totalSize - avgSize);
  }, 0);

  console.log(`  ${c('yellow', '⚠')} ${bold('Duplicate Versions')} ${dim(`(~${formatSize(totalWasted)} wasted)`)}`);
  console.log();

  for (const dup of duplicates) {
    console.log(`    ${c('yellow', '●')} ${bold(dup.version)} ${dim(`installed in: ${dup.managers.join(', ')}`)}`);
    console.log(`         ${dim(`Total: ${formatSize(dup.totalSize)} (${dup.managers.length} copies)`)}`);
  }

  console.log();
  console.log(`    ${dim('Tip: Keep one manager and remove duplicates to save disk space')}`);
  console.log();
}

/**
 * Section 13: Shell Config Files (informational, non-actionable)
 */
function displayShellConfigsSection(allConfigs: ShellConfigFile[], nodeConfigs: NodeConfigEntry[]): void {
  if (allConfigs.length === 0) {
    return;
  }

  // Create a set of paths that have Node-related entries
  const nodeConfigPaths = new Set(nodeConfigs.map(c => c.path));

  console.log(`  ${c('green', '✓')} ${bold('Shell Config Files')}`);
  console.log();

  // Group configs by shell type
  const byShell = new Map<string, ShellConfigFile[]>();
  for (const config of allConfigs) {
    const shell = config.shell;
    if (!byShell.has(shell)) {
      byShell.set(shell, []);
    }
    byShell.get(shell)!.push(config);
  }

  for (const [shell, configs] of byShell) {
    console.log(`    ${dim(shell)}`);
    for (const config of configs) {
      const hasNode = nodeConfigPaths.has(config.path);
      const nodeEntry = nodeConfigs.find(c => c.path === config.path);
      const managers = nodeEntry?.managers.filter(m => !['node', 'npm', 'yarn', 'pnpm', 'corepack'].includes(m)) || [];

      const icon = hasNode ? c('cyan', '●') : c('dim', '○');
      const managerInfo = managers.length > 0 ? ` ${dim(`→ ${managers.join(', ')}`)}` : '';

      console.log(`      ${icon} ${config.name}${managerInfo}`);
      console.log(`        ${dim(config.path)}`);
    }
  }
  console.log();
}

/**
 * Section 14: Extended Health Checks
 */
function displayExtendedChecksSection(extendedChecks: ExtendedHealthChecks, checks: HealthCheck[]): void {
  // Get relevant extended checks
  const extendedCheckIds = [
    'npm-prefix-mismatch',
    'shell-startup-slow',
    'version-file-conflict',
    'engines-mismatch',
    'node-gyp-readiness',
    'npm-cache-health',
    'global-npm-location',
    'symlink-health',
    'stale-node-modules',
    'ide-integration',
  ];

  const relevantChecks = checks.filter(c => extendedCheckIds.includes(c.id));
  const hasIssues = relevantChecks.some(c => c.status === 'warn' || c.status === 'fail');
  const hasCritical = relevantChecks.some(c => c.status === 'fail');

  if (relevantChecks.length === 0) {
    return; // No extended checks ran
  }

  const indicator = hasCritical
    ? c('red', '✗')
    : hasIssues
      ? c('yellow', '⚠')
      : c('green', '✓');

  console.log(`  ${indicator} ${bold('Environment Checks')}`);
  console.log();

  // Group checks by category for cleaner display
  const categories: Record<string, HealthCheck[]> = {
    'Project': [],
    'Build Tools': [],
    'Configuration': [],
    'Shell': [],
    'IDE': [],
  };

  for (const check of relevantChecks) {
    if (['version-file-conflict', 'engines-mismatch', 'stale-node-modules'].includes(check.id)) {
      categories['Project'].push(check);
    } else if (['node-gyp-readiness'].includes(check.id)) {
      categories['Build Tools'].push(check);
    } else if (['npm-prefix-mismatch', 'npm-cache-health', 'global-npm-location', 'symlink-health'].includes(check.id)) {
      categories['Configuration'].push(check);
    } else if (['shell-startup-slow'].includes(check.id)) {
      categories['Shell'].push(check);
    } else if (['ide-integration'].includes(check.id)) {
      categories['IDE'].push(check);
    }
  }

  for (const [category, categoryChecks] of Object.entries(categories)) {
    if (categoryChecks.length === 0) continue;

    console.log(`    ${dim(category)}`);

    for (const check of categoryChecks) {
      const statusIcon =
        check.status === 'pass'
          ? c('green', '●')
          : check.status === 'warn'
            ? c('yellow', '●')
            : c('red', '●');

      const statusColor: ColorName =
        check.status === 'pass' ? 'green' : check.status === 'warn' ? 'yellow' : 'red';

      console.log(`      ${statusIcon} ${check.name}: ${c(statusColor, check.message)}`);

      if (check.status !== 'pass' && check.hint) {
        console.log(`        ${c('cyan', '→')} ${dim(check.hint)}`);
      }

      if (check.details && check.status !== 'pass') {
        console.log(`        ${dim(check.details)}`);
      }
    }
  }

  // Show detailed info for specific checks
  if (extendedChecks.versionFileConflict.hasConflict) {
    console.log();
    console.log(`    ${c('yellow', 'Version File Conflict Details:')}`);
    for (const file of extendedChecks.versionFileConflict.files) {
      console.log(`      ${dim('→')} ${file.file}: ${bold(file.version)}`);
    }
  }

  if (extendedChecks.shellSlowStartup.hasSlowPatterns) {
    console.log();
    console.log(`    ${c('yellow', 'Shell Startup Patterns:')}`);
    for (const pattern of extendedChecks.shellSlowStartup.patterns.slice(0, 3)) {
      console.log(`      ${dim('→')} ${pattern.file} (${pattern.manager})`);
      console.log(`        ${dim(pattern.suggestion)}`);
    }
    if (extendedChecks.shellSlowStartup.patterns.length > 3) {
      console.log(`      ${dim(`... and ${extendedChecks.shellSlowStartup.patterns.length - 3} more`)}`);
    }
  }

  if (extendedChecks.ideIntegration.hasVSCode && extendedChecks.ideIntegration.vscodeIssues.length > 0) {
    console.log();
    console.log(`    ${c('yellow', 'VSCode Issues:')}`);
    for (const issue of extendedChecks.ideIntegration.vscodeIssues) {
      console.log(`      ${dim('→')} ${issue}`);
    }
  }

  console.log();
}

/**
 * Section 15: Issues Summary
 */
function displayIssuesSummary(checks: HealthAssessment['checks']): void {
  // Get failures and warnings
  const failures = checks.filter(c => c.status === 'fail');
  const warnings = checks.filter(c => c.status === 'warn');

  if (failures.length > 0 || warnings.length > 0) {
    console.log(`  ${bold('Recommended Actions')}`);
    console.log();

    // Show critical issues first
    for (const check of failures) {
      console.log(`    ${c('red', '●')} ${c('red', check.message)}`);
      if (check.hint) {
        console.log(`      ${c('cyan', '→')} ${dim(check.hint)}`);
      }
    }

    for (const check of warnings) {
      console.log(`    ${c('yellow', '●')} ${c('yellow', check.message)}`);
      if (check.hint) {
        console.log(`      ${c('cyan', '→')} ${dim(check.hint)}`);
      }
    }
    console.log();
  } else {
    console.log(`  ${c('green', '✓')} ${c('green', 'No issues detected - your environment looks healthy!')}`);
    console.log();
  }
}

// ═══════════════════════════════════════════════════════════════
// Report Generation (for --output flag)
// ═══════════════════════════════════════════════════════════════

interface ReportOptions {
  json?: boolean;
}

/**
 * Generate a diagnostic report as string (for file output)
 */
export async function generateDoctorReport(results: ScanResults, options?: ReportOptions): Promise<string> {
  const assessment = await runHealthAssessment(results);

  if (options?.json) {
    return formatAsJSON(assessment);
  }

  // Generate text report
  const lines: string[] = [];
  const hr = '═'.repeat(70);
  const hrLight = '─'.repeat(70);

  lines.push(hr);
  lines.push('  NODE DOCTOR - INFO REPORT');
  lines.push(`  Generated: ${new Date().toISOString()}`);
  lines.push(hr);
  lines.push('');

  // Summary
  const { summary } = assessment;
  const status = assessment.overallStatus === 'pass' ? '✓ HEALTHY' :
                 assessment.overallStatus === 'warn' ? '⚠ WARNINGS' : '✗ ISSUES FOUND';
  lines.push(`  Status: ${status}`);
  lines.push(`  Checks: ${summary.passed} passed, ${summary.warnings} warnings, ${summary.failed} failed`);
  lines.push('');

  // System Info
  lines.push(hrLight);
  lines.push('  SYSTEM');
  lines.push(hrLight);
  lines.push(`  Platform:   ${assessment.data.system.platform}`);
  lines.push(`  Arch:       ${assessment.data.system.arch}`);
  lines.push(`  Shell:      ${assessment.data.system.shell}`);
  lines.push(`  Node:       ${assessment.data.system.nodeVersion}`);
  lines.push(`  npm:        ${assessment.data.system.npmVersion || 'not found'}`);
  lines.push(`  Executable: ${assessment.data.system.execPath}`);
  lines.push('');

  // Managers
  lines.push(hrLight);
  lines.push('  VERSION MANAGERS');
  lines.push(hrLight);
  if (assessment.data.managers.length === 0) {
    lines.push('  No version managers detected');
  } else {
    for (const mgr of assessment.data.managers) {
      const active = assessment.data.activeManagers.includes(mgr.name) ? ' [ACTIVE]' : '';
      lines.push(`  ${mgr.icon} ${mgr.name} (${mgr.versionCount} versions, ${formatSize(mgr.totalSize)})${active}`);
      lines.push(`     Base: ${mgr.baseDir}`);
      if (mgr.installations && mgr.installations.length > 0) {
        for (const inst of mgr.installations) {
          lines.push(`     → ${inst.version} (${formatSize(inst.size)})`);
          lines.push(`       ${inst.path}`);
        }
      }
    }
  }
  lines.push('');

  // PATH Priority
  lines.push(hrLight);
  lines.push('  PATH PRIORITY');
  lines.push(hrLight);
  if (assessment.data.nodesInPath.length === 0) {
    lines.push('  ✗ No Node.js in PATH');
  } else {
    for (let i = 0; i < assessment.data.nodesInPath.length; i++) {
      const node = assessment.data.nodesInPath[i];
      const current = node.isCurrent ? ' [CURRENT]' : '';
      const shadowed = !node.isCurrent && i > 0 ? ' [SHADOWED]' : '';
      lines.push(`  ${i + 1}. ${node.runner.icon} ${node.runner.name} ${node.version}${current}${shadowed}`);
      lines.push(`     ${node.executable}`);
    }
  }
  lines.push('');

  // Security
  lines.push(hrLight);
  lines.push('  SECURITY');
  lines.push(hrLight);
  if (assessment.data.security.eol) {
    const eol = assessment.data.security.eol;
    const eolStatus = eol.status === 'eol' ? '✗ END-OF-LIFE' :
                      eol.status === 'maintenance' ? '⚠ MAINTENANCE' :
                      eol.status === 'active' ? '✓ ACTIVE' : '? UNKNOWN';
    lines.push(`  EOL Status: ${eolStatus}`);
    if (eol.eolDate) lines.push(`  Support ends: ${eol.eolDate}`);
  }
  if (assessment.data.security.vulnerabilities) {
    const vuln = assessment.data.security.vulnerabilities;
    lines.push(`  Vulnerabilities: ${vuln.vulnerable ? '✗ FOUND' : '✓ NONE'}`);
    if (vuln.latestSecurityRelease) {
      lines.push(`  Recommended: ${vuln.latestSecurityRelease}`);
    }
  }
  lines.push('');

  // Registry
  lines.push(hrLight);
  lines.push('  NPM REGISTRY');
  lines.push(hrLight);
  lines.push(`  Global: ${assessment.data.registry.info.global.registry}`);
  lines.push(`  Source: ${assessment.data.registry.info.global.source}`);
  lines.push(`  Status: ${assessment.data.registry.status.available ? 'OK' : 'UNREACHABLE'} (${assessment.data.registry.status.latency}ms)`);
  if (Object.keys(assessment.data.registry.info.scopes).length > 0) {
    lines.push('  Scoped Registries:');
    for (const [scope, info] of Object.entries(assessment.data.registry.info.scopes)) {
      lines.push(`    ${scope}: ${info.registry}`);
    }
  }
  lines.push('');

  // Issues
  if (summary.warnings > 0 || summary.failed > 0) {
    lines.push(hrLight);
    lines.push('  ISSUES');
    lines.push(hrLight);
    for (const check of assessment.checks) {
      if (check.status === 'fail') {
        lines.push(`  ✗ [ERROR] ${check.message}`);
        if (check.hint) lines.push(`    ${check.hint}`);
      } else if (check.status === 'warn') {
        lines.push(`  ⚠ [WARN] ${check.message}`);
        if (check.hint) lines.push(`    ${check.hint}`);
      }
    }
    lines.push('');
  }

  // Duplicate Versions
  const versionToManagers = new Map<string, string[]>();
  for (const mgr of assessment.data.managers) {
    if (mgr.installations) {
      for (const inst of mgr.installations) {
        const existing = versionToManagers.get(inst.version) || [];
        existing.push(mgr.name);
        versionToManagers.set(inst.version, existing);
      }
    }
  }
  const duplicates = [...versionToManagers.entries()].filter(([_, managers]) => managers.length > 1);
  if (duplicates.length > 0) {
    lines.push(hrLight);
    lines.push('  DUPLICATE VERSIONS (wasting disk space)');
    lines.push(hrLight);
    for (const [version, managers] of duplicates) {
      lines.push(`  ${version} installed in: ${managers.join(', ')}`);
    }
    lines.push('');
  }

  lines.push(hr);
  lines.push('  Report generated by Node Doctor');
  lines.push('  https://github.com/bgauryy/node-doctor');
  lines.push(hr);

  return lines.join('\n');
}
