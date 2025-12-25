/**
 * Global Package Listing
 * Lists globally installed packages from npm, yarn, and pnpm
 */

import path from 'node:path';
import { runCommand, clearScreen, getDirSize, formatSize, dirExists } from '../utils.js';
import { c, bold, dim } from '../colors.js';
import { select, search, BACK } from '../prompts.js';
import { printHeader } from '../ui.js';
import type { GlobalPackage, GlobalPackagesResult } from '../types/index.js';

// Type definitions for npm/pnpm output
interface NpmDependencyInfo {
  version?: string;
  path?: string;
  resolved?: string;
}

interface NpmListOutput {
  dependencies?: Record<string, NpmDependencyInfo>;
}

interface PnpmDependencyInfo {
  version?: string;
  path?: string;
}

interface PnpmListOutput {
  dependencies?: Record<string, PnpmDependencyInfo>;
}

/**
 * Get global packages from all managers
 */
export function listGlobalPackages(): GlobalPackagesResult {
  const globals: GlobalPackagesResult = {
    npm: [],
    yarn: [],
    pnpm: [],
  };

  // 1. NPM Globals
  try {
    const npmRoot = runCommand('npm', ['root', '-g']);
    const npmOutput = runCommand('npm', ['list', '-g', '--depth=0', '--json']);

    if (npmOutput) {
      let parsed: NpmListOutput;
      try {
        parsed = JSON.parse(npmOutput) as NpmListOutput;
      } catch (parseError) {
        // Log JSON parse errors for debugging, don't silently swallow
        console.error('Failed to parse npm list output:', parseError);
        parsed = {};
      }
      if (parsed.dependencies) {
        globals.npm = Object.entries(parsed.dependencies).map(([name, info]) => {
          let pkgPath = info.path || 'unknown';

          // Try to resolve path if missing
          if ((pkgPath === 'unknown' || !pkgPath) && npmRoot) {
            const candidate = path.join(npmRoot, name);
            if (dirExists(candidate)) {
              pkgPath = candidate;
            }
          }

          let size: number | undefined;
          if (pkgPath !== 'unknown') {
            size = getDirSize(pkgPath);
          }
          return {
            name,
            version: info.version || 'unknown',
            path: pkgPath,
            manager: 'npm' as const,
            size,
          };
        });
      }
    }
  } catch {
    // npm command failed - npm not installed or not in PATH
  }

  // 2. Yarn Globals (Classic)
  try {
    const yarnGlobalDir = runCommand('yarn', ['global', 'dir']);
    const yarnRoot = yarnGlobalDir ? path.join(yarnGlobalDir, 'node_modules') : null;
    const yarnText = runCommand('yarn', ['global', 'list', '--depth=0']);
    
    if (yarnText) {
      const lines = yarnText.split('\n');
      for (const line of lines) {
        const match = line.match(/info "(@?[^@]+)@([^"]+)"/);
        if (match) {
          const name = match[1];
          const version = match[2];
          let pkgPath = 'unknown';
          let size: number | undefined;

          if (yarnRoot) {
            const candidate = path.join(yarnRoot, name);
            if (dirExists(candidate)) {
              pkgPath = candidate;
              size = getDirSize(candidate);
            }
          }

          globals.yarn.push({
            name,
            version,
            manager: 'yarn',
            path: pkgPath,
            size
          });
        }
      }
    }
  } catch {
    // yarn command failed - yarn not installed or not in PATH
  }

  // 3. pnpm Globals
  try {
    const pnpmRoot = runCommand('pnpm', ['root', '-g']);
    const pnpmOutput = runCommand('pnpm', ['list', '-g', '--depth=0', '--json']);

    if (pnpmOutput) {
      let parsed: PnpmListOutput | PnpmListOutput[];
      try {
        parsed = JSON.parse(pnpmOutput) as PnpmListOutput | PnpmListOutput[];
      } catch (parseError) {
        // Log JSON parse errors for debugging, don't silently swallow
        console.error('Failed to parse pnpm list output:', parseError);
        parsed = {};
      }
      const root = Array.isArray(parsed) ? parsed[0] : parsed;
      if (root && root.dependencies) {
        globals.pnpm = Object.entries(root.dependencies).map(([name, info]) => {
          let pkgPath = info.path || 'unknown';

          if ((pkgPath === 'unknown' || !pkgPath) && pnpmRoot) {
            const candidate = path.join(pnpmRoot, name);
            if (dirExists(candidate)) {
              pkgPath = candidate;
            }
          }

          let size: number | undefined;
          if (pkgPath !== 'unknown') {
            size = getDirSize(pkgPath);
          }
          return {
            name,
            version: info.version || 'unknown',
            path: pkgPath,
            manager: 'pnpm' as const,
            size,
          };
        });
      }
    }
  } catch {
    // pnpm command failed - pnpm not installed or not in PATH
  }

  return globals;
}

/**
 * UI: Show details for a single package
 */
async function showPackageDetails(pkg: GlobalPackage): Promise<void> {
  clearScreen();
  printHeader();

  console.log(c('cyan', '━'.repeat(66)));
  console.log(`  📦 ${bold(pkg.name)}`);
  console.log(c('cyan', '━'.repeat(66)));
  console.log();

  const managerColor = pkg.manager === 'npm' ? 'green' : pkg.manager === 'yarn' ? 'blue' : 'yellow';
  
  console.log(`  ${dim('Version:')}     ${c('cyan', pkg.version)}`);
  console.log(`  ${dim('Manager:')}     ${c(managerColor, pkg.manager)}`);
  
  if (pkg.size) {
    console.log(`  ${dim('Size:')}        ${formatSize(pkg.size)}`);
  }
  
  if (pkg.path && pkg.path !== 'unknown') {
    console.log(`  ${dim('Path:')}        ${pkg.path}`);
  }
  
  console.log();

  await select({
    message: 'Press Enter to go back to list...',
    choices: [{ name: '← Back', value: 'back' }],
    theme: { prefix: '  ' },
  });
}

/**
 * UI: Show global packages with searchable list
 */
export async function showGlobalPackages(): Promise<void> {
  // Show scanning indicator before clearing screen or loop
  console.log();
  process.stdout.write(`  ${dim('Scanning for global packages (calculating sizes)...')}`);
  
  const allGlobals = listGlobalPackages();
  const flatPackages = [
    ...allGlobals.npm,
    ...allGlobals.yarn,
    ...allGlobals.pnpm
  ];
  
  // Sort alphabetically
  flatPackages.sort((a, b) => a.name.localeCompare(b.name));
  
  const totalCount = flatPackages.length;
  const totalSize = flatPackages.reduce((sum, pkg) => sum + (pkg.size || 0), 0);
  
  process.stdout.write('\r\x1b[2K'); // Clear scanning line

  while (true) {
    clearScreen();
    printHeader();

    console.log(c('cyan', '━'.repeat(66)));
    console.log(`  📦 ${bold('Global Packages')}`);
    console.log(c('cyan', '━'.repeat(66)));
    console.log();

    console.log(`  ${bold('Summary')}`);
    console.log(`    ${dim('Total Packages:')} ${c('green', String(totalCount))}`);
    if (totalSize > 0) {
      console.log(`    ${dim('Total Size:')}     ${c('green', formatSize(totalSize))}`);
    }
    console.log();
    
    if (totalCount === 0) {
      console.log(`  ${c('yellow', 'No global packages found.')}`);
      console.log();
      await select({
        message: 'Press Enter to return to menu...',
        choices: [{ name: '← Back', value: 'back' }],
        theme: { prefix: '  ' },
      });
      return;
    }

    console.log(`  ${dim('Type to search packages, or press Enter to browse')}`);
    console.log(`  ${dim('Esc to go back')}`);
    console.log();

    let selection: string | GlobalPackage | typeof BACK;
    try {
      // Use search prompt for type-to-filter functionality
      selection = await search({
        message: 'Search packages:',
        pageSize: 15,
        source: async (term: string | undefined) => {
          const searchTerm = (term || '').toLowerCase();
          
          // Always include back option at top
          const searchResults: Array<{ name: string; value: string | GlobalPackage }> = [
            { name: `${c('yellow', '←')} Back to menu`, value: 'back' }
          ];
          
          // Filter packages based on search term
          const filtered = searchTerm 
            ? flatPackages.filter(pkg => 
                pkg.name.toLowerCase().includes(searchTerm) ||
                pkg.manager.toLowerCase().includes(searchTerm)
              )
            : flatPackages;
          
          for (const pkg of filtered) {
            const managerColor = pkg.manager === 'npm' ? 'green' : pkg.manager === 'yarn' ? 'blue' : 'yellow';
            const marker = c(managerColor, '●');
            const sizeStr = pkg.size ? dim(` (${formatSize(pkg.size)})`) : '';
            
            searchResults.push({
              name: `${marker} ${pkg.name} ${dim('@')} ${pkg.version}${sizeStr}`,
              value: pkg
            });
          }
          
          return searchResults;
        },
        theme: {
          prefix: '  ',
          style: { highlight: (text: string) => c('cyan', text) }
        },
      });
    } catch (err) {
      // Handle ESC/Ctrl+C
      if (err && typeof err === 'object' && 'name' in err && 
          (err.name === 'ExitPromptError' || err.name === 'AbortPromptError' || err.name === 'CancelPromptError')) {
        return;
      }
      throw err;
    }

    // Handle ESC or back
    if (selection === BACK || selection === 'back') {
      return;
    }

    if (typeof selection !== 'string') {
      await showPackageDetails(selection as GlobalPackage);
    }
  }
}
