/**
 * Enhanced Disk Cleanup Feature
 * Inspired by npkill's excellent UX - multi-select, real-time scanning, batch deletion
 */

import fs from 'node:fs';
import path from 'node:path';
import { c, bold, dim } from '../colors.js';
import { clearScreen, formatSize, getDirSizeAsync, HOME } from '../utils.js';
import { select, checkbox, confirm, Separator } from '../prompts.js';
import { getAllInstallations, scanAll } from '../detectors/index.js';
import { printHeader } from '../ui.js';
import type { ScanResults, AggregatedInstallation } from '../types/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface NodeModulesEntry {
  path: string;
  size: number;
  lastModified: Date;
  projectName: string;
  daysSinceModified: number;
}

interface CleanupTarget {
  type: 'node_modules' | 'node_version';
  path: string;
  size: number;
  label: string;
  description: string;
  lastModified?: Date;
  daysSinceModified?: number;
  canDelete: boolean;
  installation?: AggregatedInstallation;
}

type SortMode = 'size' | 'path' | 'modified';

// ═══════════════════════════════════════════════════════════════════════════
// node_modules Scanner
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Recursively find all node_modules directories starting from a root path
 */
async function findNodeModules(
  rootPath: string,
  onFound: (entry: NodeModulesEntry) => void,
  maxDepth: number = 10
): Promise<void> {
  const visited = new Set<string>();

  async function scan(dirPath: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    // Resolve real path to handle symlinks
    let realPath: string;
    try {
      realPath = fs.realpathSync(dirPath);
      if (visited.has(realPath)) return;
      visited.add(realPath);
    } catch {
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      // Skip hidden directories and common non-project dirs
      if (entry.name.startsWith('.')) continue;
      if (['Library', 'Applications', 'Pictures', 'Music', 'Movies', 'Public'].includes(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);

      if (!entry.isDirectory()) continue;

      // Check if this is a symlink to avoid infinite loops
      try {
        const stat = fs.lstatSync(fullPath);
        if (stat.isSymbolicLink()) continue;
      } catch {
        continue;
      }

      if (entry.name === 'node_modules') {
        // Found a node_modules directory
        try {
          const stat = fs.statSync(fullPath);
          const projectDir = path.dirname(fullPath);
          const projectName = path.basename(projectDir);

          // Get last modified time from the parent directory (project)
          const lastModified = stat.mtime;
          const daysSinceModified = Math.floor(
            (Date.now() - lastModified.getTime()) / (1000 * 60 * 60 * 24)
          );

          // Calculate size asynchronously
          const size = await getDirSizeAsync(fullPath);

          onFound({
            path: fullPath,
            size,
            lastModified,
            projectName,
            daysSinceModified,
          });
        } catch {
          // Skip if we can't stat
        }
        // Don't descend into node_modules
        continue;
      }

      // Recurse into subdirectory
      await scan(fullPath, depth + 1);
    }
  }

  await scan(rootPath, 0);
}

/**
 * Get the most common project directories to scan
 */
function getDefaultScanPaths(): string[] {
  const paths: string[] = [];

  // Common project directories
  const commonDirs = [
    'Projects',
    'projects',
    'Development',
    'development',
    'dev',
    'Dev',
    'code',
    'Code',
    'workspace',
    'Workspace',
    'repos',
    'Repos',
    'src',
    'Sites',
    'sites',
    'www',
  ];

  for (const dir of commonDirs) {
    const fullPath = path.join(HOME, dir);
    if (fs.existsSync(fullPath)) {
      paths.push(fullPath);
    }
  }

  // If no common dirs found, use home directory
  if (paths.length === 0) {
    paths.push(HOME);
  }

  return paths;
}

// ═══════════════════════════════════════════════════════════════════════════
// Cleanup UI
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format days since modified to human readable string
 */
function formatAge(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

/**
 * Create a visual size bar
 */
function createSizeBar(size: number, maxSize: number, width: number = 20): string {
  const ratio = maxSize > 0 ? size / maxSize : 0;
  const filled = Math.round(ratio * width);
  const empty = width - filled;

  // Color based on size
  let color: 'green' | 'yellow' | 'red' = 'green';
  if (size > 500 * 1024 * 1024) color = 'red'; // > 500MB
  else if (size > 100 * 1024 * 1024) color = 'yellow'; // > 100MB

  return c(color, '█'.repeat(filled)) + dim('░'.repeat(empty));
}

/**
 * Sort cleanup targets based on mode
 */
function sortTargets(targets: CleanupTarget[], mode: SortMode): CleanupTarget[] {
  const sorted = [...targets];

  switch (mode) {
    case 'size':
      sorted.sort((a, b) => b.size - a.size);
      break;
    case 'path':
      sorted.sort((a, b) => a.path.localeCompare(b.path));
      break;
    case 'modified':
      sorted.sort((a, b) => (b.daysSinceModified ?? 0) - (a.daysSinceModified ?? 0));
      break;
  }

  return sorted;
}

/**
 * Interactive cleanup menu
 */
export async function runCleanup(results: ScanResults): Promise<ScanResults> {
  while (true) {
    clearScreen();
    printHeader();

    console.log(c('cyan', '━'.repeat(66)));
    console.log(`  🧹 ${bold('Disk Cleanup')} ${dim('- Free up space by removing unused files')}`);
    console.log(c('cyan', '━'.repeat(66)));
    console.log();

    const action = await select({
      message: 'What would you like to clean up?',
      choices: [
        {
          name: `📦 ${bold('node_modules')} ${dim('- Find and delete old node_modules directories')}`,
          value: 'node_modules',
          description: 'Scan for node_modules folders and bulk delete them',
        },
        {
          name: `🟢 ${bold('Node.js Versions')} ${dim('- Remove unused Node.js versions')}`,
          value: 'versions',
          description: 'Select and delete Node.js versions from version managers',
        },
        {
          name: `📊 ${bold('Disk Usage Overview')} ${dim('- View space used by each manager')}`,
          value: 'overview',
          description: 'See disk usage breakdown by version manager',
        },
        new Separator(),
        {
          name: `${c('yellow', '←')} Back to main menu`,
          value: 'back',
        },
      ],
      theme: {
        prefix: '  ',
        style: {
          highlight: (text: string) => c('cyan', text),
          message: (text: string) => bold(text),
        },
      },
    }) as string;

    if (action === 'back') {
      return results;
    }

    if (action === 'node_modules') {
      await cleanupNodeModules();
    } else if (action === 'versions') {
      results = await cleanupNodeVersions(results);
    } else if (action === 'overview') {
      await showDiskOverview(results);
    }
  }
}

/**
 * Show disk usage overview with visual bars
 */
async function showDiskOverview(results: ScanResults): Promise<void> {
  clearScreen();
  printHeader();

  console.log(c('cyan', '━'.repeat(66)));
  console.log(`  📊 ${bold('Disk Usage Overview')}`);
  console.log(c('cyan', '━'.repeat(66)));
  console.log();

  const allInstallations = getAllInstallations(results, { includeNonDeletable: true });

  // Group by manager
  const byManager: Record<string, { count: number; size: number; displayName: string; icon: string }> = {};

  for (const inst of allInstallations) {
    const key = inst.detectorName;
    if (!byManager[key]) {
      byManager[key] = {
        count: 0,
        size: 0,
        displayName: inst.detectorDisplayName,
        icon: inst.detectorIcon,
      };
    }
    byManager[key].count++;
    byManager[key].size += inst.size || 0;
  }

  // Convert to array and sort by size
  const managers = Object.entries(byManager)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.size - a.size);

  if (managers.length === 0) {
    console.log(`  ${c('yellow', 'No Node.js installations found.')}`);
    console.log();
  } else {
    const maxSize = managers[0].size;
    let grandTotal = 0;

    for (const mgr of managers) {
      grandTotal += mgr.size;
      const bar = createSizeBar(mgr.size, maxSize, 25);

      console.log(`  ${mgr.icon} ${bold(mgr.displayName)}`);
      console.log(`     ${bar} ${bold(formatSize(mgr.size))}`);
      console.log(`     ${dim(`${mgr.count} version${mgr.count !== 1 ? 's' : ''} installed`)}`);
      console.log();
    }

    console.log(c('cyan', '━'.repeat(66)));
    console.log(`  ${bold('Total:')} ${c('green', formatSize(grandTotal))} ${dim(`across ${allInstallations.length} versions`)}`);
    console.log(c('cyan', '━'.repeat(66)));
  }

  console.log();
  await select({
    message: 'Press Enter to continue...',
    choices: [{ name: '← Back', value: 'back' }],
    theme: { prefix: '  ' },
  });
}

/**
 * Cleanup node_modules directories
 */
async function cleanupNodeModules(): Promise<void> {
  clearScreen();
  printHeader();

  console.log(c('cyan', '━'.repeat(66)));
  console.log(`  📦 ${bold('node_modules Cleanup')}`);
  console.log(c('cyan', '━'.repeat(66)));
  console.log();

  // Ask where to scan
  const scanPaths = getDefaultScanPaths();

  const scanChoice = await select({
    message: 'Where should I scan for node_modules?',
    choices: [
      ...scanPaths.slice(0, 5).map(p => ({
        name: `📁 ${p.replace(HOME, '~')}`,
        value: p,
      })),
      new Separator(),
      {
        name: `📂 ${bold('All common directories')}`,
        value: 'all',
        description: `Scan: ${scanPaths.map(p => path.basename(p)).join(', ')}`,
      },
      {
        name: `🏠 ${bold('Entire home directory')} ${dim('(may take a while)')}`,
        value: HOME,
      },
      new Separator(),
      { name: `${c('yellow', '←')} Cancel`, value: 'cancel' },
    ],
    theme: {
      prefix: '  ',
      style: {
        highlight: (text: string) => c('cyan', text),
        message: (text: string) => bold(text),
      },
    },
  }) as string;

  if (scanChoice === 'cancel') {
    return;
  }

  const pathsToScan = scanChoice === 'all' ? scanPaths : [scanChoice];

  console.log();
  console.log(`  ${c('cyan', '⏳')} Scanning for node_modules...`);
  console.log(`  ${dim('This may take a moment depending on the size of your directories.')}`);
  console.log();

  const found: NodeModulesEntry[] = [];
  let totalSize = 0;

  // Scan for node_modules with live feedback
  for (const scanPath of pathsToScan) {
    process.stdout.write(`  ${dim('Scanning:')} ${scanPath.replace(HOME, '~')}...`);

    await findNodeModules(scanPath, (entry) => {
      found.push(entry);
      totalSize += entry.size;

      // Live feedback
      process.stdout.write(
        `\r  ${c('green', '✓')} Found ${bold(String(found.length))} node_modules (${formatSize(totalSize)})    `
      );
    });

    process.stdout.write('\n');
  }

  console.log();

  if (found.length === 0) {
    console.log(`  ${c('yellow', 'No node_modules directories found.')}`);
    console.log();
    await select({
      message: 'Press Enter to continue...',
      choices: [{ name: '← Back', value: 'back' }],
      theme: { prefix: '  ' },
    });
    return;
  }

  // Sort by size (largest first)
  found.sort((a, b) => b.size - a.size);

  console.log(c('cyan', '━'.repeat(66)));
  console.log(`  Found ${bold(String(found.length))} node_modules directories (${bold(formatSize(totalSize))} total)`);
  console.log(c('cyan', '━'.repeat(66)));
  console.log();

  // Ask for sort preference
  const sortMode = await select({
    message: 'How would you like to sort the results?',
    choices: [
      { name: '📊 By size (largest first)', value: 'size' },
      { name: '📅 By age (oldest first)', value: 'modified' },
      { name: '📁 By path (alphabetical)', value: 'path' },
    ],
    theme: { prefix: '  ' },
  }) as SortMode;

  // Re-sort based on preference
  if (sortMode === 'modified') {
    found.sort((a, b) => b.daysSinceModified - a.daysSinceModified);
  } else if (sortMode === 'path') {
    found.sort((a, b) => a.path.localeCompare(b.path));
  }

  // Build choices for checkbox with visual indicators
  const maxSize = Math.max(...found.map(f => f.size));

  const choices = found.map((entry) => {
    const sizeBar = createSizeBar(entry.size, maxSize, 15);
    const age = formatAge(entry.daysSinceModified);
    const shortPath = entry.path.replace(HOME, '~').replace('/node_modules', '');

    // Truncate path if too long
    const maxPathLen = 35;
    const displayPath = shortPath.length > maxPathLen
      ? '...' + shortPath.slice(-(maxPathLen - 3))
      : shortPath;

    return {
      name: `${sizeBar} ${bold(formatSize(entry.size).padStart(9))} ${dim(age.padStart(14))} ${displayPath}`,
      value: entry.path,
      checked: entry.daysSinceModified > 30 && entry.size > 50 * 1024 * 1024, // Auto-select old & large
    };
  });

  console.log();
  console.log(`  ${dim('Use Space to toggle, A to select all, Enter to confirm')}`);
  console.log(`  ${dim('Tip: Old & large (>50MB, >30 days) are pre-selected')}`);
  console.log();

  const selected = await checkbox<string>({
    message: 'Select node_modules to delete:',
    choices,
    pageSize: 15,
    loop: false,
    theme: {
      prefix: '  ',
      icon: {
        checked: c('green', '◉'),
        unchecked: dim('○'),
        cursor: c('cyan', '❯'),
      },
      style: {
        highlight: (text: string) => c('cyan', text),
        message: (text: string) => bold(text),
      },
    },
  });

  if (selected.length === 0) {
    console.log();
    console.log(`  ${c('yellow', 'No directories selected.')}`);
    await new Promise(r => setTimeout(r, 1000));
    return;
  }

  // Calculate total to delete
  const toDelete = found.filter(f => selected.includes(f.path));
  const deleteSize = toDelete.reduce((sum, f) => sum + f.size, 0);

  console.log();
  console.log(c('red', '━'.repeat(66)));
  console.log(`  ${c('red', '⚠️  DELETE CONFIRMATION')}`);
  console.log(c('red', '━'.repeat(66)));
  console.log();
  console.log(`  You are about to delete ${bold(String(toDelete.length))} node_modules directories.`);
  console.log(`  This will free up ${c('green', bold(formatSize(deleteSize)))}.`);
  console.log();

  // Show first few
  for (const entry of toDelete.slice(0, 5)) {
    console.log(`    ${c('red', '✗')} ${entry.path.replace(HOME, '~')}`);
  }
  if (toDelete.length > 5) {
    console.log(`    ${dim(`... and ${toDelete.length - 5} more`)}`);
  }
  console.log();

  const shouldDelete = await confirm({
    message: 'Are you sure you want to delete these directories?',
    default: false,
    theme: { prefix: '  ' },
  });

  if (!shouldDelete) {
    console.log(`  ${c('yellow', 'Cancelled.')}`);
    await new Promise(r => setTimeout(r, 1000));
    return;
  }

  // Delete with progress
  console.log();
  let deleted = 0;
  let freedSpace = 0;

  for (const entry of toDelete) {
    process.stdout.write(`  Deleting ${entry.projectName}...`);

    try {
      fs.rmSync(entry.path, { recursive: true, force: true });
      deleted++;
      freedSpace += entry.size;
      console.log(c('green', ' ✓'));
    } catch (err) {
      console.log(c('red', ` ✗ ${(err as Error).message}`));
    }
  }

  console.log();
  console.log(c('green', '━'.repeat(66)));
  console.log(`  ${c('green', '✓')} Deleted ${bold(String(deleted))} directories, freed ${c('green', bold(formatSize(freedSpace)))}`);
  console.log(c('green', '━'.repeat(66)));
  console.log();

  await select({
    message: 'Press Enter to continue...',
    choices: [{ name: '← Back', value: 'back' }],
    theme: { prefix: '  ' },
  });
}

/**
 * Cleanup Node.js versions with multi-select
 */
async function cleanupNodeVersions(results: ScanResults): Promise<ScanResults> {
  clearScreen();
  printHeader();

  console.log(c('cyan', '━'.repeat(66)));
  console.log(`  🟢 ${bold('Node.js Version Cleanup')}`);
  console.log(c('cyan', '━'.repeat(66)));
  console.log();

  const allInstallations = getAllInstallations(results, { includeNonDeletable: false });

  if (allInstallations.length === 0) {
    console.log(`  ${c('yellow', 'No deletable Node.js versions found.')}`);
    console.log(`  ${dim('System installations and Homebrew versions must be removed manually.')}`);
    console.log();
    await select({
      message: 'Press Enter to continue...',
      choices: [{ name: '← Back', value: 'back' }],
      theme: { prefix: '  ' },
    });
    return results;
  }

  // Sort by size
  allInstallations.sort((a, b) => (b.size || 0) - (a.size || 0));

  const maxSize = Math.max(...allInstallations.map(i => i.size || 0));
  const totalSize = allInstallations.reduce((sum, i) => sum + (i.size || 0), 0);

  console.log(`  Found ${bold(String(allInstallations.length))} deletable versions (${bold(formatSize(totalSize))} total)`);
  console.log();
  console.log(`  ${dim('Use Space to toggle, A to select all, Enter to confirm')}`);
  console.log();

  // Build choices with visual size bars
  const choices = allInstallations.map((inst) => {
    const version = inst.verified || `v${inst.version}`;
    const sizeBar = createSizeBar(inst.size || 0, maxSize, 15);
    const sizeStr = formatSize(inst.size || 0).padStart(9);

    // Identify old versions
    const major = parseInt((inst.version || '').replace(/^v/, '').split('.')[0], 10);
    const isOld = !isNaN(major) && major < 18;

    return {
      name: `${sizeBar} ${bold(sizeStr)} ${inst.detectorIcon} ${bold(version)} ${dim(`(${inst.detectorDisplayName})`)}${isOld ? c('yellow', ' [OLD]') : ''}`,
      value: inst.path,
      checked: isOld, // Auto-select old versions
    };
  });

  const selected = await checkbox<string>({
    message: 'Select versions to delete:',
    choices,
    pageSize: 12,
    loop: false,
    theme: {
      prefix: '  ',
      icon: {
        checked: c('green', '◉'),
        unchecked: dim('○'),
        cursor: c('cyan', '❯'),
      },
      style: {
        highlight: (text: string) => c('cyan', text),
        message: (text: string) => bold(text),
      },
    },
  });

  if (selected.length === 0) {
    console.log();
    console.log(`  ${c('yellow', 'No versions selected.')}`);
    await new Promise(r => setTimeout(r, 1000));
    return results;
  }

  // Get details of selected installations
  const toDelete = allInstallations.filter(i => selected.includes(i.path));
  const deleteSize = toDelete.reduce((sum, i) => sum + (i.size || 0), 0);

  console.log();
  console.log(c('red', '━'.repeat(66)));
  console.log(`  ${c('red', '⚠️  DELETE CONFIRMATION')}`);
  console.log(c('red', '━'.repeat(66)));
  console.log();
  console.log(`  You are about to delete ${bold(String(toDelete.length))} Node.js version${toDelete.length > 1 ? 's' : ''}.`);
  console.log(`  This will free up ${c('green', bold(formatSize(deleteSize)))}.`);
  console.log();

  for (const inst of toDelete.slice(0, 5)) {
    const version = inst.verified || `v${inst.version}`;
    console.log(`    ${c('red', '✗')} ${inst.detectorIcon} ${bold(version)} ${dim(`(${inst.detectorDisplayName})`)}`);
  }
  if (toDelete.length > 5) {
    console.log(`    ${dim(`... and ${toDelete.length - 5} more`)}`);
  }
  console.log();

  const shouldDelete = await confirm({
    message: 'Are you sure you want to delete these versions?',
    default: false,
    theme: { prefix: '  ' },
  });

  if (!shouldDelete) {
    console.log(`  ${c('yellow', 'Cancelled.')}`);
    await new Promise(r => setTimeout(r, 1000));
    return results;
  }

  // Delete with progress
  console.log();
  let deleted = 0;
  let freedSpace = 0;

  for (const inst of toDelete) {
    const version = inst.verified || `v${inst.version}`;
    process.stdout.write(`  Deleting ${version}...`);

    try {
      fs.rmSync(inst.path, { recursive: true, force: true });
      deleted++;
      freedSpace += inst.size || 0;
      console.log(c('green', ' ✓'));
    } catch (err) {
      console.log(c('red', ` ✗ ${(err as Error).message}`));
    }
  }

  console.log();
  console.log(c('green', '━'.repeat(66)));
  console.log(`  ${c('green', '✓')} Deleted ${bold(String(deleted))} versions, freed ${c('green', bold(formatSize(freedSpace)))}`);
  console.log(c('green', '━'.repeat(66)));
  console.log();

  await select({
    message: 'Press Enter to continue...',
    choices: [{ name: '← Back', value: 'back' }],
    theme: { prefix: '  ' },
  });

  // Rescan to update results
  return scanAll();
}
