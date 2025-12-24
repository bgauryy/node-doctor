/**
 * Disk Usage Feature
 */

import os from 'node:os';
import { c, bold, dim } from '../colors.js';
import { clearScreen, formatSize } from '../utils.js';
import { select } from '../prompts.js';
import { detectors } from '../detectors/index.js';
import { printHeader } from '../ui.js';
import type { ScanResults, Platform } from '../types/index.js';

interface UsageData {
  name: string;
  icon: string;
  count: number;
  size: number;
}

export async function showDiskUsage(results: ScanResults): Promise<void> {
  clearScreen();
  printHeader();

  console.log(c('cyan', '━'.repeat(66)));
  console.log(`  📊 ${bold('Disk Usage by Version Manager')}`);
  console.log(c('cyan', '━'.repeat(66)));
  console.log();

  const platform = os.platform() as Platform;
  let grandTotal = 0;

  const usageData: UsageData[] = [];

  for (const detector of detectors) {
    if (detector.platforms.includes(platform) && detector.name !== 'path' && detector.name !== 'system') {
      const result = results[detector.name];
      if (result?.installations && result.installations.length > 0) {
        let total = 0;
        for (const inst of result.installations) {
          total += inst.size || 0;
        }
        grandTotal += total;

        usageData.push({
          name: detector.displayName,
          icon: detector.icon,
          count: result.installations.length,
          size: total,
        });
      }
    }
  }

  // Sort by size descending
  usageData.sort((a, b) => b.size - a.size);

  // Find max size for bar chart
  const maxSize = usageData.length > 0 ? usageData[0].size : 0;
  const barWidth = 30;

  for (const data of usageData) {
    const barLength = maxSize > 0 ? Math.round((data.size / maxSize) * barWidth) : 0;
    const bar = '█'.repeat(barLength) + '░'.repeat(barWidth - barLength);

    console.log(`  ${data.icon} ${bold(data.name)}`);
    console.log(`     ${c('cyan', bar)} ${bold(formatSize(data.size))}`);
    console.log(`     ${dim(`${data.count} version${data.count !== 1 ? 's' : ''} installed`)}`);
    console.log();
  }

  console.log(c('cyan', '━'.repeat(66)));
  console.log(`  ${bold('Total:')} ${c('green', formatSize(grandTotal))}`);
  console.log(c('cyan', '━'.repeat(66)));
  console.log();

  await select({
    message: 'Press Enter to continue...',
    choices: [{ name: '← Back to menu', value: 'back' }],
    theme: { prefix: '  ' },
  });
}
