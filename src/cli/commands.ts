/**
 * CLI Command Definitions
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CLICommand, ParsedArgs } from './types.js';
import { findAllNodeProcesses, findProcessOnPort, killProcess, killProcessOnPort } from '../features/port-exorcist.js';
import { runCICheck, outputJSON, outputText } from '../features/ci-check.js';
import { runDoctor, generateDoctorReport } from '../features/doctor.js';
import { scanAll, getAllInstallations, detectors } from '../detectors/index.js';
import { scanProjectVersionFiles, runProjectHealthAssessment, displayProjectHealth } from '../features/project.js';
import { listGlobalPackages } from '../features/globals.js';
import { c, bold, dim } from '../colors.js';
import { formatSize } from '../utils.js';
import { loadInquirer } from '../prompts.js';
import type { Platform } from '../types/index.js';

// ─────────────────────────────────────────────────────────────
// Command: kill-port
// ─────────────────────────────────────────────────────────────

function handleKillPort(args: ParsedArgs): void {
  const portStr = args.args[0];
  const force = !!args.options['force'] || !!args.options['f'];

  if (!portStr) {
    console.log();
    console.log(`  ${c('red', '✗')} Error: Port number required.`);
    console.log();
    console.log(`  ${dim('Usage:')} node-doctor kill-port <port>`);
    console.log(`  ${dim('Example:')} node-doctor kill-port 3000`);
    console.log();
    process.exitCode = 1;
    return;
  }

  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.log();
    console.log(`  ${c('red', '✗')} Error: Invalid port number "${portStr}".`);
    console.log(`  ${dim('Port must be between 1 and 65535.')}`);
    console.log();
    process.exitCode = 1;
    return;
  }

  console.log();
  console.log(`  ${bold('💀 Port Exorcist')}`);
  console.log();

  const scanResult = findProcessOnPort(port);

  if (!scanResult.inUse) {
    console.log(`  ${c('green', '✓')} Port ${port} is already free. Nothing to kill.`);
    console.log();
    return;
  }

  console.log(`  ${c('yellow', '⚠')} Port ${port} is blocked by ${scanResult.process?.name} (PID: ${scanResult.process?.pid})`);

  const result = killProcessOnPort(port, force);

  if (result.success) {
    console.log(`  ${c('green', '✓')} ${result.message}`);
  } else {
    console.log(`  ${c('red', '✗')} ${result.message}`);
    process.exitCode = 1;
  }
  console.log();
}

export const killPortCommand: CLICommand = {
  name: 'kill-port',
  aliases: ['kp'],
  description: 'Kill process blocking a specific port',
  usage: 'node-doctor kill-port <port> [options]',
  args: [
    { name: 'port', required: true, description: 'Port number (1-65535)' },
  ],
  options: [
    { long: '--force', short: '-f', description: 'Force kill (SIGKILL on Unix, /F on Windows)' },
  ],
  handler: handleKillPort,
};

// ─────────────────────────────────────────────────────────────
// Command: heal
// ─────────────────────────────────────────────────────────────

function handleHeal(args: ParsedArgs): void {
  const autoKill = !!args.options['yes'] || !!args.options['y'];

  console.log();
  console.log(`  ${bold('⚡ Quick Heal')} - Scanning for Node.js processes using ports...`);
  console.log();

  const processes = findAllNodeProcesses();

  if (processes.length === 0) {
    console.log(`  ${c('green', '✓')} All clear! No Node.js processes blocking ports.`);
    console.log();
    return;
  }

  console.log(`  ${c('yellow', '⚠')} Found ${processes.length} Node.js process${processes.length > 1 ? 'es' : ''}:`);
  console.log();

  for (const proc of processes) {
    console.log(`    Port ${bold(String(proc.port))} ${dim('→')} ${proc.name} ${dim(`(PID: ${proc.pid})`)}`);
    if (proc.cwd) {
      console.log(`      ${c('blue', '📁')} ${dim(proc.cwd)}`);
    }
    if (proc.command) {
      const cmd = proc.command.length > 50 ? proc.command.substring(0, 50) + '...' : proc.command;
      console.log(`      ${dim(cmd)}`);
    }
  }

  if (autoKill) {
    console.log();
    console.log(`  ${dim('Auto-kill enabled. Killing all...')}`);
    console.log();

    let killed = 0;
    for (const proc of processes) {
      const success = killProcess(proc.pid);
      if (success) {
        console.log(`  ${c('green', '✓')} Killed port ${proc.port} (${proc.name})`);
        killed++;
      } else {
        console.log(`  ${c('red', '✗')} Failed to kill port ${proc.port}`);
      }
    }

    console.log();
    console.log(`  Killed ${killed}/${processes.length} processes.`);
  } else {
    console.log();
    console.log(`  ${dim('Run with --yes to auto-kill, or use:')} node-doctor kill-port <port>`);
  }
  console.log();
}

export const healCommand: CLICommand = {
  name: 'heal',
  description: 'Find and optionally kill all Node.js processes using ports',
  usage: 'node-doctor heal [options]',
  options: [
    { long: '--yes', short: '-y', description: 'Auto-kill all found processes without prompting' },
  ],
  handler: handleHeal,
};

// ─────────────────────────────────────────────────────────────
// Command: check
// ─────────────────────────────────────────────────────────────

async function handleCheck(args: ParsedArgs): Promise<void> {
  const jsonOutput = !!args.options['json'];

  const result = await runCICheck();

  if (jsonOutput) {
    outputJSON(result);
  } else {
    outputText(result);
  }

  process.exitCode = result.exitCode;
}

export const checkCommand: CLICommand = {
  name: 'check',
  aliases: ['ci'],
  description: 'Run CI health checks (non-interactive)',
  usage: 'node-doctor check [options]',
  options: [
    { long: '--json', description: 'Output results as JSON' },
  ],
  handler: handleCheck,
};

// ─────────────────────────────────────────────────────────────
// Command: info (formerly doctor)
// ─────────────────────────────────────────────────────────────

async function handleInfo(args: ParsedArgs): Promise<void> {
  const jsonOutput = !!args.options['json'];
  const outputPath = args.options['output'] as string | undefined;
  const results = scanAll();

  // If --output is specified, generate and save report
  if (outputPath) {
    console.log();
    console.log(`  ${c('cyan', '⏳')} Generating diagnostic report...`);
    const report = await generateDoctorReport(results, { json: jsonOutput });

    // Determine output path
    let finalPath = outputPath;
    if (outputPath === 'true' || outputPath === '') {
      // Default filename if --output is used without a value
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      finalPath = jsonOutput
        ? `node-doctor-report-${timestamp}.json`
        : `node-doctor-report-${timestamp}.txt`;
    }

    // Ensure directory exists
    const dir = path.dirname(finalPath);
    if (dir && dir !== '.' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(finalPath, report, 'utf-8');
    console.log(`  ${c('green', '✓')} Report saved to: ${bold(finalPath)}`);
    console.log();
    return;
  }

  // Load Inquirer for interactive mode
  if (!jsonOutput) {
    await loadInquirer();
  }

  await runDoctor(results, { json: jsonOutput });
}

export const infoCommand: CLICommand = {
  name: 'info',
  aliases: ['doctor', 'doc', 'dr'],
  description: 'Show comprehensive environment information',
  usage: 'node-doctor info [options]',
  options: [
    { long: '--json', description: 'Output results as JSON (non-interactive)' },
    { long: '--output', short: '-o', description: 'Save report to file (use with --json for JSON format)', hasValue: true },
  ],
  examples: [
    { cmd: 'node-doctor info', desc: 'Run interactive diagnosis' },
    { cmd: 'node-doctor info --json', desc: 'Output full diagnostic data as JSON' },
    { cmd: 'node-doctor info --output report.txt', desc: 'Save text report to file' },
    { cmd: 'node-doctor info --json --output report.json', desc: 'Save JSON report to file' },
  ],
  detailedHelp: `
The info command performs a comprehensive analysis of your Node.js environment:

${bold('CHECKS PERFORMED:')}
  ${c('cyan', '•')} System Info        - Platform, shell, Node.js version, executable path
  ${c('cyan', '•')} Version Managers   - Detects nvm, fnm, volta, asdf, brew, and 15+ more
  ${c('cyan', '•')} PATH Analysis      - Identifies shadowed binaries and conflicts
  ${c('cyan', '•')} Security           - EOL status, known vulnerabilities
  ${c('cyan', '•')} Port Status        - Node.js processes blocking ports
  ${c('cyan', '•')} NPM Registry       - Registry configuration and connectivity
  ${c('cyan', '•')} Package Managers   - npm, yarn, pnpm registry and cache info
  ${c('cyan', '•')} Duplicate Versions - Identifies wasted disk space

${bold('EXTENDED ENVIRONMENT CHECKS:')}
  ${c('cyan', '•')} npm Prefix         - Detects npm prefix mismatches with version managers
  ${c('cyan', '•')} Shell Startup      - Identifies slow startup patterns (nvm lazy loading)
  ${c('cyan', '•')} Version Files      - Detects conflicts between .nvmrc, .node-version, etc.
  ${c('cyan', '•')} engines Compliance - Validates package.json engines field
  ${c('cyan', '•')} node-gyp Readiness - Checks Python and build tools for native modules
  ${c('cyan', '•')} npm Cache Health   - Verifies npm cache integrity
  ${c('cyan', '•')} Global npm Location- Validates npm global root matches version manager
  ${c('cyan', '•')} Symlink Health     - Windows symlink/junction support check
  ${c('cyan', '•')} Stale node_modules - Detects node_modules built with different Node version
  ${c('cyan', '•')} IDE Integration    - VSCode settings validation

${bold('HEALTH INDICATORS:')}
  ${c('green', '✓')} Pass    - No issues detected
  ${c('yellow', '⚠')} Warning - Potential issues that may cause problems
  ${c('red', '✗')} Error   - Critical issues requiring attention

${bold('INTERACTIVE MODE:')}
  In interactive mode, you can:
  - View detailed information for each section
  - Edit shell configuration files directly
  - Navigate with arrow keys and Enter

${bold('CI/CD USAGE:')}
  For automated pipelines, use the 'check' command instead:
  ${dim('npx node-doctor check --json')}
`,
  handler: handleInfo,
};

// ─────────────────────────────────────────────────────────────
// Command: list
// ─────────────────────────────────────────────────────────────

function handleList(args: ParsedArgs): void {
  const jsonOutput = !!args.options['json'];
  const results = scanAll();
  const allInstallations = getAllInstallations(results, { includeNonDeletable: true });

  if (jsonOutput) {
    console.log(JSON.stringify(allInstallations, null, 2));
    return;
  }

  console.log();
  console.log(`  ${bold('📋 All Detected Node.js Versions')}`);
  console.log();

  if (allInstallations.length === 0) {
    console.log(`  ${c('yellow', 'No Node.js installations found.')}`);
    console.log();
    return;
  }

  console.log(`  ${c('cyan', 'Manager'.padEnd(15))} ${c('cyan', 'Version'.padEnd(15))} ${c('cyan', 'Path')}`);
  console.log(`  ${dim('─'.repeat(15))} ${dim('─'.repeat(15))} ${dim('─'.repeat(40))}`);

  for (const inst of allInstallations) {
    console.log(`  ${inst.detectorName.padEnd(15)} ${inst.version.padEnd(15)} ${dim(inst.path)}`);
  }
  console.log();
}

export const listCommand: CLICommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List all detected Node.js versions',
  usage: 'node-doctor list [options]',
  options: [
    { long: '--json', description: 'Output results as JSON' },
  ],
  handler: handleList,
};

// ─────────────────────────────────────────────────────────────
// Command: project
// ─────────────────────────────────────────────────────────────

function handleProject(args: ParsedArgs): void {
  const jsonOutput = !!args.options['json'];
  const simpleMode = !!args.options['simple'];
  const projectDir = (args.args[0] as string) || process.cwd();

  // Simple mode: just list version files (backward compatible)
  if (simpleMode) {
    const files = scanProjectVersionFiles(projectDir);

    if (jsonOutput) {
      console.log(JSON.stringify(files, null, 2));
      return;
    }

    console.log();
    console.log(`  ${bold('📄 Project Version Files')}`);
    console.log(dim(`  Scanning: ${projectDir}`));
    console.log();

    if (files.length === 0) {
      console.log(`  ${dim('No version files found (.nvmrc, .node-version, etc.)')}`);
      console.log();
      return;
    }

    for (const file of files) {
      console.log(`  ${c('green', file.file.padEnd(20))} ${bold(file.version)}`);
      console.log(`    ${dim(file.path)}`);
    }
    console.log();
    return;
  }

  // Full health check mode (default)
  if (!jsonOutput) {
    console.log();
    console.log(`  ${c('cyan', '⏳')} Analyzing project health...`);
  }

  const assessment = runProjectHealthAssessment(projectDir);

  if (jsonOutput) {
    console.log(JSON.stringify(assessment, null, 2));
    process.exitCode = assessment.overallStatus === 'fail' ? 1 : 0;
    return;
  }

  console.log('\r\x1b[2K'); // Clear the "Analyzing" line
  displayProjectHealth(assessment);

  process.exitCode = assessment.overallStatus === 'fail' ? 1 : 0;
}

export const projectCommand: CLICommand = {
  name: 'project',
  aliases: ['scan', 'health'],
  description: 'Run comprehensive project health check',
  usage: 'node-doctor project [directory] [options]',
  args: [
    { name: 'directory', required: false, description: 'Project directory (default: current)' },
  ],
  options: [
    { long: '--json', description: 'Output results as JSON' },
    { long: '--simple', short: '-s', description: 'Simple mode: only list version files' },
  ],
  examples: [
    { cmd: 'node-doctor project', desc: 'Check current directory health' },
    { cmd: 'node-doctor project ./my-app', desc: 'Check specific project' },
    { cmd: 'node-doctor project --json', desc: 'Output health as JSON' },
    { cmd: 'node-doctor project --simple', desc: 'Just list version files' },
  ],
  detailedHelp: `
${bold('PROJECT HEALTH CHECK')}

Analyzes a Node.js project for common configuration issues:

${c('cyan', '•')} ${bold('Version Files')} - Checks .nvmrc, .node-version, .tool-versions
    against the currently running Node.js version

${c('cyan', '•')} ${bold('Engine Requirements')} - Validates package.json engines field
    for node, npm, yarn, and pnpm versions

${c('cyan', '•')} ${bold('Lockfile Integrity')} - Detects missing or multiple lockfiles
    (package-lock.json, yarn.lock, pnpm-lock.yaml)

${c('cyan', '•')} ${bold('node_modules Health')} - Reports size, package count, and
    detects orphaned installations

${c('cyan', '•')} ${bold('Script Security')} - Analyzes lifecycle scripts for potential
    security concerns (postinstall, preinstall, prepare)

${bold('EXIT CODES')}
  0 - All checks passed
  1 - One or more checks failed
`,
  handler: handleProject,
};

// ─────────────────────────────────────────────────────────────
// Command: globals
// ─────────────────────────────────────────────────────────────

function handleGlobals(args: ParsedArgs): void {
  const jsonOutput = !!args.options['json'];
  const globals = listGlobalPackages();

  if (jsonOutput) {
    console.log(JSON.stringify(globals, null, 2));
    return;
  }

  console.log();
  console.log(`  ${bold('📦 Global Packages')}`);
  console.log();

  const managers = ['npm', 'yarn', 'pnpm'] as const;
  let hasPackages = false;

  for (const mgr of managers) {
    const pkgs = globals[mgr];
    if (pkgs && pkgs.length > 0) {
      hasPackages = true;
      console.log(`  ${bold(mgr)} ${dim(`(${pkgs.length})`)}`);
      for (const pkg of pkgs) {
        const sizeStr = pkg.size ? dim(` (${formatSize(pkg.size)})`) : '';
        console.log(`    ${pkg.name} ${c('cyan', pkg.version)}${sizeStr}`);
      }
      console.log();
    }
  }

  if (!hasPackages) {
    console.log(`  ${dim('No global packages found.')}`);
    console.log();
  }
}

export const globalsCommand: CLICommand = {
  name: 'globals',
  aliases: ['g'],
  description: 'List globally installed packages',
  usage: 'node-doctor globals [options]',
  options: [
    { long: '--json', description: 'Output results as JSON' },
  ],
  handler: handleGlobals,
};

// ─────────────────────────────────────────────────────────────
// Command: disk
// ─────────────────────────────────────────────────────────────

function handleDisk(args: ParsedArgs): void {
  const jsonOutput = !!args.options['json'];
  const results = scanAll();
  const platform = os.platform() as Platform;

  const usageData = [];
  for (const detector of detectors) {
    if (detector.platforms.includes(platform) && detector.name !== 'path' && detector.name !== 'system') {
      const result = results[detector.name];
      if (result?.installations && result.installations.length > 0) {
        let total = 0;
        for (const inst of result.installations) {
          total += inst.size || 0;
        }
        usageData.push({
          manager: detector.name,
          displayName: detector.displayName,
          count: result.installations.length,
          size: total,
          formattedSize: formatSize(total)
        });
      }
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify(usageData, null, 2));
    return;
  }

  console.log();
  console.log(`  ${bold('📊 Disk Usage')}`);
  console.log();

  if (usageData.length === 0) {
    console.log(`  ${dim('No version managers detected.')}`);
    console.log();
    return;
  }

  usageData.sort((a, b) => b.size - a.size);

  for (const data of usageData) {
    console.log(`  ${bold(data.displayName)}: ${c('green', data.formattedSize)} ${dim(`(${data.count} versions)`)}`);
  }
  console.log();
}

export const diskCommand: CLICommand = {
  name: 'disk',
  aliases: ['du'],
  description: 'Show disk usage by version managers',
  usage: 'node-doctor disk [options]',
  options: [
    { long: '--json', description: 'Output results as JSON' },
  ],
  handler: handleDisk,
};

// ─────────────────────────────────────────────────────────────
// All Commands Registry
// ─────────────────────────────────────────────────────────────

export const commands: CLICommand[] = [
  killPortCommand,
  healCommand,
  checkCommand,
  infoCommand,
  listCommand,
  projectCommand,
  globalsCommand,
  diskCommand,
];

/**
 * Find command by name or alias
 */
export function findCommand(name: string): CLICommand | undefined {
  return commands.find(cmd =>
    cmd.name === name || cmd.aliases?.includes(name)
  );
}
