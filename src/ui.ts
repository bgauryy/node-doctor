/**
 * UI Components - Headers, Summaries, and Display Helpers
 */

import os from 'node:os';
import { c, bold, dim } from './colors.js';
import { formatSize, HOME } from './utils.js';
import { getAllInstallations } from './detectors/index.js';
import type { ScanResults, ColorName, ActionSuggestion } from './types/index.js';

interface BoxOptions {
  color?: ColorName;
  width?: number;
  padding?: number;
}

// Helper: get visual width of string (accounts for emojis taking 2 columns)
function getVisualWidth(str: string): number {
  // Remove ANSI codes for width calculation
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  // Convert to array of characters (handles surrogate pairs correctly)
  const chars = [...stripped];
  // Count emojis (each takes 2 visual columns instead of 1)
  const emojiCount = chars.filter(char =>
    /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(char)
  ).length;
  return chars.length + emojiCount;
}

// Helper: pad string to target visual width
function padToWidth(str: string, targetWidth: number, center: boolean = false): string {
  const visualWidth = getVisualWidth(str);
  const padding = Math.max(0, targetWidth - visualWidth);
  if (center) {
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
  }
  return str + ' '.repeat(padding);
}

/**
 * Print a rounded box with content
 */
function printBox(title: string | null, contentLines: string[], options: BoxOptions = {}): void {
  const { color = 'cyan', width = 64, padding = 1 } = options;
  const style = (text: string): string => c(color, text);

  // Top border
  const titleText = title ? ` ${bold(title)} ` : '';

  // Center title if present, or just put it
  // For simplicity, we embed title in top border if present
  let topBorder = '';
  if (title) {
    const dashLen = Math.floor((width - 2 - getVisualWidth(titleText)) / 2);
    // Adjust if odd width
    const rightDashLen = width - 2 - getVisualWidth(titleText) - dashLen;
    topBorder = style('╭' + '─'.repeat(dashLen)) + titleText + style('─'.repeat(rightDashLen) + '╮');
  } else {
    topBorder = style('╭' + '─'.repeat(width - 2) + '╮');
  }

  console.log(topBorder);

  // Content
  for (const line of contentLines) {
    // We assume content lines fit or are manually managed for now to keep it simple
    // but we pad to width
    const lineContent = ' '.repeat(padding) + line;
    const visualLen = getVisualWidth(lineContent);
    const rightPad = Math.max(0, width - 2 - visualLen);
    console.log(style('│') + lineContent + ' '.repeat(rightPad) + style('│'));
  }

  // Bottom border
  console.log(style('╰' + '─'.repeat(width - 2) + '╯'));
}

export function printHeader(): void {
  const width = 64;
  console.log();
  // Using new box style for header
  printBox(null, [
    padToWidth(bold('  🔍 Node Doctor'), width - 4),
    padToWidth(dim('  Scan, manage, and clean up Node.js installations'), width - 4)
  ], { color: 'cyan', width });

  console.log();
  console.log(`  ${dim('Platform:')} ${bold(os.platform())} ${dim('|')} ${dim('Arch:')} ${bold(os.arch())} ${dim('|')} ${dim('Home:')} ${bold(HOME)}`);
  console.log();
}

export function printWelcome(): void {
  const width = 64;
  console.log();

  printBox(null, [
    '',
    padToWidth(bold('  👋 Welcome to Node Doctor!'), width - 4),
    '',
    padToWidth('  This tool helps you:', width - 4),
    padToWidth(`    ${c('green', '•')} Find all Node.js installations on your system`, width - 4),
    padToWidth(`    ${c('green', '•')} Clean up unused versions to free disk space`, width - 4),
    padToWidth(`    ${c('green', '•')} Diagnose PATH conflicts between managers`, width - 4),
    ''
  ], { color: 'cyan', width });

  console.log();
}

export function printSummary(results: ScanResults): void {
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  📊 ${bold('Summary')}`);
  console.log(c('blue', '━'.repeat(66)));
  console.log();

  let totalVersions = 0;
  let totalSize = 0;
  const managers: string[] = [];

  for (const [name, result] of Object.entries(results)) {
    if (result && result.installations && name !== 'path' && name !== 'system') {
      const count = result.installations.length;
      if (count > 0) {
        totalVersions += count;
        managers.push(name);
        for (const inst of result.installations) {
          totalSize += inst.size || 0;
        }
      }
    }
  }

  console.log(`  ${dim('Managers Detected:')}      ${bold(String(managers.length))} ${dim(managers.length > 0 ? `(${managers.join(', ')})` : '')}`);
  console.log(`  ${dim('Total Node Versions:')}    ${bold(String(totalVersions))}`);
  console.log(`  ${dim('Total Disk Space:')}       ${bold(formatSize(totalSize))}`);

  if (results.path?.activeNode) {
    const pathResult = results.path as { activeNode?: string; foundNodes?: Array<{ verified?: string }> };
    const activeVersion = pathResult.foundNodes?.[0]?.verified;
    if (activeVersion) {
      console.log(`  ${dim('Active Version:')}         ${c('green', activeVersion)}`);
    }
    console.log(`  ${dim('Currently Active Node:')}  ${c('green', pathResult.activeNode as string)}`);
  }

  console.log();

  if (managers.length > 1) {
    console.log(`  ${c('yellow', '⚠️  Warning:')} Multiple version managers detected (${managers.join(', ')})`);
    console.log(`     ${dim('Problem:')} Can cause PATH conflicts and version confusion.`);
    console.log(`     ${c('cyan', '→ Action:')} Run ${bold("'Doctor'")} to see which is active, consider keeping only one.`);
    console.log();
  }

  if (totalVersions > 5) {
    console.log(`  ${c('yellow', '💡 Tip:')} You have ${totalVersions} Node versions installed (${formatSize(totalSize)} total).`);
    console.log(`     ${c('cyan', '→ Action:')} Run ${bold("'List all Node versions'")} to review and delete unused ones.`);
    console.log();
  }

  const suggestions = getSuggestedActions(results, managers, totalVersions, totalSize);
  if (suggestions.length > 0) {
    console.log(c('cyan', '─'.repeat(66)));
    console.log(`  ${bold('💡 Suggested Actions:')}`);
    console.log();
    for (const sug of suggestions.slice(0, 3)) {
      console.log(`  ${c('cyan', '→')} ${sug.action}`);
      if (sug.benefit) {
        console.log(`    ${dim(sug.benefit)}`);
      }
    }
    console.log();
  }
}

function getSuggestedActions(
  results: ScanResults,
  managers: string[],
  _totalVersions: number,
  _totalSize: number
): ActionSuggestion[] {
  const suggestions: ActionSuggestion[] = [];
  const allInstallations = getAllInstallations(results, { includeNonDeletable: false });

  // Check for old Node.js versions
  const oldVersions = allInstallations.filter(inst => {
    const ver = (inst.version || '').replace(/^v/, '');
    const major = parseInt(ver.split('.')[0], 10);
    return !isNaN(major) && major < 18;
  });

  if (oldVersions.length > 0) {
    const totalOldSize = oldVersions.reduce((sum, inst) => sum + (inst.size || 0), 0);
    suggestions.push({
      action: `Delete ${oldVersions.length} old Node version${oldVersions.length > 1 ? 's' : ''} (v16 and older)`,
      benefit: `Saves ${formatSize(totalOldSize)} disk space`,
      priority: 2
    });
  }

  // Check for many versions of same manager
  const managerVersionCounts: Record<string, number> = {};
  for (const inst of allInstallations) {
    const mgr = inst.manager || inst.detectorName;
    managerVersionCounts[mgr] = (managerVersionCounts[mgr] || 0) + 1;
  }

  for (const [mgr, count] of Object.entries(managerVersionCounts)) {
    if (count > 5) {
      suggestions.push({
        action: `Clean up ${mgr}: you have ${count} versions installed`,
        benefit: `Keep only 2-3 versions you actively use`,
        priority: 3
      });
    }
  }

  // Check for multiple managers
  if (managers.length > 1) {
    suggestions.push({
      action: `Consolidate to one version manager`,
      benefit: `Simplifies your setup and avoids PATH conflicts`,
      priority: 1
    });
  }

  suggestions.sort((a, b) => a.priority - b.priority);

  return suggestions;
}
