/**
 * CLI Help Text Generation
 */

import { c, bold, dim } from '../colors.js';
import { commands } from './commands.js';
import { GLOBAL_OPTIONS } from './types.js';
import type { CLICommand } from './types.js';

// Version is injected by Vite at build time from package.json
declare const __APP_VERSION__: string;
const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';

/**
 * Show main help (all commands)
 */
export function showHelp(): void {
  console.log();
  console.log(bold('  🔍 Node Doctor') + dim(` v${VERSION}`));
  console.log(dim('  Interactive CLI to scan, diagnose, and clean up Node.js installations.'));
  console.log();

  // Usage
  console.log(bold('  USAGE'));
  console.log();
  console.log(`    ${c('cyan', '$')} node-doctor ${dim('[command] [options]')}`);
  console.log();

  // Interactive mode
  console.log(bold('  INTERACTIVE MODE'));
  console.log();
  console.log(`    ${c('cyan', '$')} node-doctor`);
  console.log(`    ${dim('Run without arguments to start the interactive menu.')}`);
  console.log();

  // Commands
  console.log(bold('  COMMANDS'));
  console.log();

  const maxCmdLen = Math.max(...commands.map(c => c.name.length));

  for (const cmd of commands) {
    const padding = ' '.repeat(maxCmdLen - cmd.name.length + 2);
    console.log(`    ${c('green', cmd.name)}${padding}${cmd.description}`);
  }
  console.log();

  // Global options
  console.log(bold('  GLOBAL OPTIONS'));
  console.log();

  for (const opt of GLOBAL_OPTIONS) {
    const shortStr = opt.short ? `${opt.short}, ` : '    ';
    console.log(`    ${shortStr}${opt.long.padEnd(12)} ${opt.description}`);
  }
  console.log();

  // Examples
  console.log(bold('  EXAMPLES'));
  console.log();
  console.log(`    ${dim('# Start interactive mode')}`);
  console.log(`    ${c('cyan', '$')} node-doctor`);
  console.log();
  console.log(`    ${dim('# Show environment info')}`);
  console.log(`    ${c('cyan', '$')} node-doctor info`);
  console.log();
  console.log(`    ${dim('# List all versions')}`);
  console.log(`    ${c('cyan', '$')} node-doctor list`);
  console.log();
  console.log(`    ${dim('# Run CI health checks')}`);
  console.log(`    ${c('cyan', '$')} node-doctor check`);
  console.log();
  console.log(`    ${dim('# Find all Node.js processes using ports')}`);
  console.log(`    ${c('cyan', '$')} node-doctor heal`);
  console.log();

  // More info
  console.log(bold('  MORE INFO'));
  console.log();
  console.log(`    ${dim('Run')} node-doctor <command> --help ${dim('for command-specific help.')}`);
  console.log();
}

/**
 * Show help for a specific command
 */
export function showCommandHelp(cmd: CLICommand): void {
  console.log();
  console.log(`  ${bold(cmd.name)} - ${cmd.description}`);
  console.log();

  // Detailed help if available
  if (cmd.detailedHelp) {
    console.log(cmd.detailedHelp);
    console.log();
  }

  // Usage
  console.log(bold('  USAGE'));
  console.log();
  console.log(`    ${c('cyan', '$')} ${cmd.usage}`);
  console.log();

  // Aliases
  if (cmd.aliases && cmd.aliases.length > 0) {
    console.log(bold('  ALIASES'));
    console.log();
    console.log(`    ${cmd.aliases.map(a => c('green', a)).join(', ')}`);
    console.log();
  }

  // Arguments
  if (cmd.args && cmd.args.length > 0) {
    console.log(bold('  ARGUMENTS'));
    console.log();
    for (const arg of cmd.args) {
      const reqStr = arg.required ? dim(' (required)') : dim(' (optional)');
      console.log(`    ${c('yellow', `<${arg.name}>`)}${reqStr}`);
      console.log(`      ${arg.description}`);
    }
    console.log();
  }

  // Options
  if (cmd.options && cmd.options.length > 0) {
    console.log(bold('  OPTIONS'));
    console.log();
    for (const opt of cmd.options) {
      const shortStr = opt.short ? `${opt.short}, ` : '    ';
      const valueHint = (opt.hasValue || opt.takesValue) ? ' <value>' : '';
      console.log(`    ${shortStr}${opt.long}${valueHint}`.padEnd(24) + opt.description);
    }
    console.log();
  }

  // Examples - prefer cmd.examples if available
  console.log(bold('  EXAMPLES'));
  console.log();

  if (cmd.examples && cmd.examples.length > 0) {
    for (const ex of cmd.examples) {
      console.log(`    ${dim('# ' + ex.desc)}`);
      console.log(`    ${c('cyan', '$')} ${ex.cmd}`);
      console.log();
    }
  } else {
    // Fallback to hardcoded examples
    if (cmd.name === 'kill-port') {
      console.log(`    ${dim('# Kill process on port 3000')}`);
      console.log(`    ${c('cyan', '$')} node-doctor kill-port 3000`);
      console.log();
      console.log(`    ${dim('# Force kill on port 8080')}`);
      console.log(`    ${c('cyan', '$')} node-doctor kill-port 8080 --force`);
    } else if (cmd.name === 'heal') {
      console.log(`    ${dim('# Show all Node.js processes using ports')}`);
      console.log(`    ${c('cyan', '$')} node-doctor heal`);
      console.log();
      console.log(`    ${dim('# Auto-kill all (for CI/scripts)')}`);
      console.log(`    ${c('cyan', '$')} node-doctor heal --yes`);
    } else if (cmd.name === 'check') {
      console.log(`    ${dim('# Run CI health checks (includes Security & EOL)')}`);
      console.log(`    ${c('cyan', '$')} node-doctor check`);
      console.log();
      console.log(`    ${dim('# Output as JSON for parsing')}`);
      console.log(`    ${c('cyan', '$')} node-doctor check --json`);
      console.log();
      console.log(`    ${dim('# Use exit code in CI/CD')}`);
      console.log(`    ${c('cyan', '$')} node-doctor check && echo "All checks passed"`);
    } else if (cmd.name === 'list') {
      console.log(`    ${dim('# List all detected Node.js versions')}`);
      console.log(`    ${c('cyan', '$')} node-doctor list`);
      console.log();
      console.log(`    ${dim('# Output JSON')}`);
      console.log(`    ${c('cyan', '$')} node-doctor list --json`);
    } else if (cmd.name === 'project') {
      console.log(`    ${dim('# Scan directory for version files')}`);
      console.log(`    ${c('cyan', '$')} node-doctor project`);
    } else if (cmd.name === 'globals') {
      console.log(`    ${dim('# List global packages')}`);
      console.log(`    ${c('cyan', '$')} node-doctor globals`);
    } else if (cmd.name === 'disk') {
      console.log(`    ${dim('# Show disk usage')}`);
      console.log(`    ${c('cyan', '$')} node-doctor disk`);
    }
    console.log();
  }
}

/**
 * Show version
 */
export function showVersion(): void {
  console.log(`node-doctor v${VERSION}`);
}
