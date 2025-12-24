/**
 * 🔍 Node Doctor
 *
 * Interactive CLI to scan, diagnose, and clean up Node.js installations.
 *
 * Supports:
 * - nvm, fnm, Volta, asdf, n, Homebrew, system installations
 * - Shell config file analysis
 * - Registry configuration checks
 * - Port process management (Port Exorcist)
 *
 * Usage:
 *   npx node-doctor           Interactive mode
 *   npx node-doctor --help    Show all commands
 *
 */

import { c, bold, dim } from './colors.js';
import { clearScreen } from './utils.js';
import { loadInquirer, select, Separator } from './prompts.js';
import { scanAll } from './detectors/index.js';
import { printHeader, printWelcome, printSummary } from './ui.js';
import { listAllVersionsInteractive } from './features/list.js';
import { runDoctor } from './features/doctor.js';
import { showDiskUsage } from './features/disk.js';
import { showProjectVersionFiles } from './features/project.js';
import { showGlobalPackages } from './features/globals.js';
import { showPortExorcist } from './features/port-exorcist.js';
import { Spinner } from './spinner.js';
import { runCLI } from './cli/index.js';
import type { ScanResults } from './types/index.js';

type MenuChoice = 'list' | 'doctor' | 'heal' | 'project' | 'globals' | 'disk' | 'refresh' | 'exit';

// ─────────────────────────────────────────────────────────────
// Interactive Menu
// ─────────────────────────────────────────────────────────────

async function showMainMenu(): Promise<MenuChoice> {
  console.log();

  const choice = await select({
    message: 'What would you like to do?',
    choices: [
      {
        name: '📋 List all Node versions',
        value: 'list',
        description: 'View all installed versions with integrity status',
      },
      {
        name: '🏥 Doctor',
        value: 'doctor',
        description: 'Diagnose environment, PATH priority, security, and port issues',
      },
      {
        name: '💀 Port Exorcist',
        value: 'heal',
        description: 'Find and kill Node.js processes blocking ports',
      },
      {
        name: '📄 Scan project version files',
        value: 'project',
        description: 'Find .nvmrc, .node-version, package.json engines',
      },
      {
        name: '📦 List global packages',
        value: 'globals',
        description: 'Show npm/yarn/pnpm globally installed packages',
      },
      {
        name: '📊 Show disk usage',
        value: 'disk',
        description: 'View disk space used by each version manager',
      },
      {
        name: '🔄 Refresh scan',
        value: 'refresh',
        description: 'Re-scan for Node installations',
      },
      new Separator(),
      {
        name: '🚪 Exit',
        value: 'exit',
        description: 'Quit the application',
      },
    ],
    pageSize: 10,
    loop: false,
    theme: {
      prefix: '  ',
      style: {
        highlight: (text: string) => c('cyan', text),
        message: (text: string) => bold(text),
      },
    },
  }) as MenuChoice;

  return choice;
}

// ─────────────────────────────────────────────────────────────
// Interactive Mode
// ─────────────────────────────────────────────────────────────

async function runInteractiveMode(): Promise<void> {
  // Load inquirer dynamically (ES module)
  await loadInquirer();

  // Show welcome on first run
  printWelcome();

  const spinner = new Spinner('Scanning for Node installations...').start();

  // Allow spinner to render before blocking operation
  await new Promise(resolve => setTimeout(resolve, 50));

  let results: ScanResults = scanAll();

  spinner.succeed('Scan complete!');
  console.log();

  // Wait for user before proceeding to menu
  await select({
    message: 'Press Enter to continue...',
    choices: [{ name: '→ Continue to menu', value: 'continue' }],
    theme: { prefix: '  ' },
  });

  let isFirstRun = true;

  while (true) {
    clearScreen();
    printHeader();

    // Show brief welcome reminder on first iteration only
    if (isFirstRun) {
      console.log(`  ${dim('Tip: Use Doctor to check PATH configuration and issues')}`);
      console.log();
      isFirstRun = false;
    }

    printSummary(results);

    const choice = await showMainMenu();

    switch (choice) {
      case 'list':
        results = await listAllVersionsInteractive(results);
        break;

      case 'doctor':
        await runDoctor(results);
        break;

      case 'heal':
        await showPortExorcist();
        break;

      case 'disk':
        await showDiskUsage(results);
        break;

      case 'project':
        await showProjectVersionFiles(results);
        break;

      case 'globals':
        await showGlobalPackages();
        break;

      case 'refresh':
        console.log();
        console.log(`  ${c('cyan', '⏳')} Rescanning...`);
        results = scanAll();
        break;

      case 'exit':
        clearScreen();
        console.log();
        console.log(c('dim', '─'.repeat(66)));
        console.log(dim('  Thanks for using Node Doctor! 👋'));
        console.log(c('dim', '─'.repeat(66)));
        console.log();
        process.exit(0);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Main Entry Point
// ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Check for CLI commands first
  const handled = await runCLI();

  if (handled) {
    return; // CLI command was executed
  }

  // No CLI command - run interactive mode
  await runInteractiveMode();
}

// Handle termination signals gracefully
function handleTermination(): void {
  // Restore cursor visibility in case spinner was active
  process.stdout.write('\x1B[?25h');
  console.log();
  console.log(dim('  Goodbye! 👋'));
  process.exit(0);
}

// Handle Ctrl+C (SIGINT)
process.on('SIGINT', handleTermination);

// Handle SIGTERM (common in containers/process managers)
process.on('SIGTERM', handleTermination);

main().catch(err => {
  // Handle Ctrl+C during prompts gracefully
  if (err?.name === 'ExitPromptError') {
    console.log();
    console.log(dim('  Goodbye! 👋'));
    process.exit(0);
  }
  console.error('Error:', err);
  process.exit(1);
});
