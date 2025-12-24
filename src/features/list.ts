/**
 * List All Versions Feature
 */

import { c, bold, dim } from '../colors.js';
import { clearScreen, formatSize, deleteDirRecursive, isWindows } from '../utils.js';
import { select, confirm, search } from '../prompts.js';
import { getAllInstallations, scanAll } from '../detectors/index.js';
import { printHeader } from '../ui.js';
import { checkIntegrity, verifyIntegrity } from './integrity.js';
import type { ScanResults, AggregatedInstallation, IntegrityResult } from '../types/index.js';

interface VersionChoice {
  action: 'select' | 'back';
  inst?: AggregatedInstallation;
}

interface ManagerGroup {
  displayName: string;
  icon: string;
  installations: AggregatedInstallation[];
}

export async function listAllVersionsInteractive(results: ScanResults): Promise<ScanResults> {
  const integrityResults: Record<string, IntegrityResult> = {};
  let integrityChecked = false;

  while (true) {
    clearScreen();
    printHeader();

    console.log(c('cyan', '━'.repeat(66)));
    console.log(`  📋 ${bold('All Node Versions')} ${dim('(select to manage)')}`);
    console.log(c('cyan', '━'.repeat(66)));
    console.log();

    const allInstallations = getAllInstallations(results, { includeNonDeletable: true });

    if (allInstallations.length === 0) {
      console.log(`  ${c('yellow', 'No Node versions found.')}`);
      console.log();
      await select({
        message: 'Press Enter to continue...',
        choices: [{ name: '← Back to menu', value: 'back' }],
        theme: { prefix: '  ' },
      });
      return results;
    }

    // Run integrity checks on first load (Windows only)
    if (!integrityChecked && isWindows) {
      process.stdout.write(`  ${c('cyan', '⏳')} Verifying integrity of ${allInstallations.length} versions...`);

      // Fix race condition: collect results first, then assign in a single-threaded way
      const checkResults = await Promise.all(
        allInstallations.map(async (inst) => ({
          key: inst.executable,
          result: await checkIntegrity(inst),
        }))
      );

      // Assign results sequentially to avoid concurrent writes
      for (const { key, result } of checkResults) {
        integrityResults[key] = result;
      }
      integrityChecked = true;

      process.stdout.write('\r' + ' '.repeat(70) + '\r');
    } else if (!integrityChecked) {
      integrityChecked = true;
    }

    // Group by manager
    const byManager: Record<string, ManagerGroup> = {};
    for (const inst of allInstallations) {
      if (!byManager[inst.detectorName]) {
        byManager[inst.detectorName] = {
          displayName: inst.detectorDisplayName,
          icon: inst.detectorIcon,
          installations: [],
        };
      }
      byManager[inst.detectorName].installations.push(inst);
    }

    // Flatten all installations with manager info for searchable list
    const flatInstallations: Array<{ inst: AggregatedInstallation; displayName: string }> = [];
    
    for (const [_managerName, manager] of Object.entries(byManager)) {
      for (const inst of manager.installations) {
        const version = inst.verified || `v${inst.version}`;
        const size = inst.size ? dim(` ${formatSize(inst.size)}`) : '';

        let integrityBadge = '';
        if (isWindows) {
          const integrityResult = integrityResults[inst.executable];
          if (integrityResult) {
            if (integrityResult.status === 'ok') {
              integrityBadge = c('green', ' ✓');
            } else if (integrityResult.status === 'mismatch') {
              integrityBadge = c('red', ' ✗');
            } else if (integrityResult.status === 'error') {
              integrityBadge = c('red', ' ?');
            }
          }
        }

        flatInstallations.push({
          inst,
          displayName: `${manager.icon} ${bold(version)}${integrityBadge}${size} ${dim(`(${manager.displayName})`)}`,
        });
      }
    }

    console.log(`  ${dim('Type to search versions, or press Enter to browse')}`);
    if (isWindows) {
      console.log(`  ${dim('Integrity:')} ${c('green', '✓')}${dim('=verified')} ${c('red', '✗')}${dim('=mismatch')} ${c('red', '?')}${dim('=error')}`);
    }
    console.log();

    const choice = await search({
      message: 'Search versions:',
      pageSize: 15,
      source: async (term: string | undefined) => {
        const searchTerm = (term || '').toLowerCase();
        
        // Always include back option at top
        const results: Array<{ name: string; value: VersionChoice }> = [
          { name: `${c('yellow', '←')} Back to menu`, value: { action: 'back' } }
        ];
        
        // Filter versions based on search term
        const filtered = searchTerm 
          ? flatInstallations.filter(item => 
              item.inst.version.toLowerCase().includes(searchTerm) ||
              item.inst.detectorDisplayName.toLowerCase().includes(searchTerm) ||
              item.inst.detectorName.toLowerCase().includes(searchTerm)
            )
          : flatInstallations;
        
        for (const item of filtered) {
          results.push({
            name: item.displayName,
            value: { action: 'select', inst: item.inst }
          });
        }
        
        return results;
      },
      theme: {
        prefix: '  ',
        style: {
          highlight: (text: string) => c('cyan', text),
          message: (text: string) => bold(text),
        },
      },
    }) as VersionChoice;

    if (choice.action === 'back') {
      return results;
    }

    // Safety check: ensure inst exists before proceeding
    if (!choice.inst) {
      continue;
    }

    const inst = choice.inst;
    const newResults = await showVersionMenu(inst, results);
    if (newResults !== results) {
      results = newResults;
      integrityChecked = false;
    }
  }
}

async function showVersionMenu(inst: AggregatedInstallation, results: ScanResults): Promise<ScanResults> {
  clearScreen();
  printHeader();

  const version = inst.verified || `v${inst.version}`;

  console.log(c('cyan', '━'.repeat(66)));
  console.log(`  ${inst.detectorIcon} ${bold(version)}`);
  console.log(c('cyan', '━'.repeat(66)));
  console.log();
  console.log(`  ${dim('Manager:')}  ${inst.detectorDisplayName}`);
  console.log(`  ${dim('Path:')}     ${c('cyan', inst.path)}`);
  if (inst.size) {
    console.log(`  ${dim('Size:')}     ${formatSize(inst.size)}`);
  }
  if (inst.executable) {
    console.log(`  ${dim('Binary:')}   ${inst.executable}`);
  }
  console.log();

  const menuChoices: Array<{ name: string; value: string; description?: string }> = [];

  menuChoices.push({
    name: `🛡️  Verify Integrity`,
    value: 'verify',
    description: `Check binary checksum against official release`,
  });

  if (inst.canDelete) {
    menuChoices.push({
      name: `🗑️  Delete this version`,
      value: 'delete',
      description: `Remove ${version} and free up ${formatSize(inst.size || 0)}`,
    });
  } else {
    menuChoices.push({
      name: dim(`🗑️  Delete (not available)`),
      value: 'nodelete',
      description: inst.manager === 'homebrew'
        ? 'Use: brew uninstall node'
        : 'System installations cannot be deleted here',
    });
  }

  menuChoices.push({
    name: '← Go back to list',
    value: 'back',
  });

  const action = await select({
    message: 'What would you like to do?',
    choices: menuChoices,
    theme: {
      prefix: '  ',
      style: {
        highlight: (text: string) => c('cyan', text),
        message: (text: string) => bold(text),
      },
    },
  }) as string;

  if (action === 'verify') {
    await verifyIntegrity(inst);
  } else if (action === 'delete') {
    console.log();
    console.log(c('red', '━'.repeat(66)));
    console.log(`  ${c('red', '⚠️  DELETE CONFIRMATION')}`);
    console.log(c('red', '━'.repeat(66)));
    console.log();
    console.log(`  You are about to delete:`);
    console.log(`    ${c('red', '✗')} ${bold(version)} ${dim(`(${inst.detectorDisplayName})`)}`);
    console.log(`    ${dim(inst.path)}`);
    console.log();

    const shouldDelete = await confirm({
      message: 'Are you sure?',
      default: false,
      theme: { prefix: '  ' },
    });

    if (shouldDelete) {
      try {
        process.stdout.write(`  Deleting ${version}...`);
        deleteDirRecursive(inst.path);
        console.log(c('green', ' ✓ Done'));
        console.log();
        console.log(`  ${c('green', '✓')} Freed ${bold(formatSize(inst.size || 0))}`);
        await new Promise(r => setTimeout(r, 1500));
        return scanAll();
      } catch (err) {
        console.log(c('red', ` ✗ ${(err as Error).message}`));
        await new Promise(r => setTimeout(r, 2000));
      }
    } else {
      console.log(`  ${c('yellow', 'Cancelled.')}`);
      await new Promise(r => setTimeout(r, 1000));
    }
  } else if (action === 'nodelete') {
    console.log();
    if (inst.manager === 'homebrew') {
      console.log(`  ${c('yellow', '💡')} To remove this version, run:`);
      console.log();
      console.log(`     ${c('cyan', `brew uninstall ${inst.formula || 'node'}`)}`);
      console.log();
    } else {
      console.log(`  ${c('yellow', '💡')} System installations should be removed through`);
      console.log(`     your system's package manager or uninstaller.`);
      console.log();
    }
    await select({
      message: 'Press Enter to continue...',
      choices: [{ name: '← Back', value: 'back' }],
      theme: { prefix: '  ' },
    });
  }

  return results;
}
