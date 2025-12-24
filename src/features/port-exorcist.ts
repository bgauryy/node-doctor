/**
 * Port Exorcist - Zombie Process Killer
 *
 * Dynamically finds all Node.js processes using ports and lets you kill them.
 * Solves the common `EADDRINUSE` frustration.
 *
 * Usage:
 *   - Interactive: from main menu "Kill Port Process"
 *   - CLI: `node-doctor kill-port <port>` or `node-doctor heal`
 */

import { spawnSync } from 'node:child_process';
import { c, bold, dim } from '../colors.js';
import { clearScreen, isWindows } from '../utils.js';
import { select, confirm } from '../prompts.js';
import { printHeader } from '../ui.js';
import { Spinner } from '../spinner.js';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/** Process using a port */
export interface PortProcess {
  /** Process ID */
  pid: number;
  /** Process name/command */
  name: string;
  /** User running the process */
  user: string;
  /** Port being used */
  port: number;
  /** Protocol (TCP/UDP) */
  protocol: string;
  /** Full command if available */
  command?: string;
  /** Current working directory */
  cwd?: string;
}

/** Result of port scan */
export interface PortScanResult {
  /** Port number scanned */
  port: number;
  /** Whether the port is in use */
  inUse: boolean;
  /** Process using the port (if any) */
  process: PortProcess | null;
  /** Error message if scan failed */
  error?: string;
}

/**
 * Common Node.js related process names to identify
 */
const NODE_PROCESS_NAMES = new Set([
  'node',
  'npm',
  'npx',
  'yarn',
  'pnpm',
  'tsx',
  'ts-node',
  'vite',
  'next',
  'nuxt',
  'electron',
  'node.exe',
  'npm.exe',
  'npx.exe',
  'yarn.exe',
  'pnpm.exe',
]);

/**
 * Check if a command/process name is Node-related
 */
function isNodeProcess(name: string): boolean {
  const lower = name.toLowerCase();
  return NODE_PROCESS_NAMES.has(lower) || lower.includes('node');
}

// ─────────────────────────────────────────────────────────────
// Core Functions - Find ALL Node Processes with Ports
// ─────────────────────────────────────────────────────────────

/**
 * Find ALL Node.js processes that are listening on ports
 * This is the main function - dynamically finds node processes
 */
export function findAllNodeProcesses(): PortProcess[] {
  try {
    if (isWindows) {
      return findAllNodeProcessesWindows();
    } else {
      return findAllNodeProcessesUnix();
    }
  } catch {
    return [];
  }
}

/**
 * Unix/macOS: Find all Node processes listening on ports using lsof
 */
function findAllNodeProcessesUnix(): PortProcess[] {
  const processes: PortProcess[] = [];

  try {
    // lsof -i -P -n -sTCP:LISTEN finds all TCP listening processes
    // Then we filter for node-related processes
    const result = spawnSync('lsof', ['-i', '-P', '-n', '-sTCP:LISTEN'], {
      encoding: 'utf8',
      timeout: 10000,
    });

    if (result.status !== 0 || !result.stdout?.trim()) {
      return processes;
    }

    const lines = result.stdout.trim().split('\n');
    // Skip header line
    if (lines.length < 2) {
      return processes;
    }

    // Track unique PID+port combinations
    const seen = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Format: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
      const parts = line.split(/\s+/);

      if (parts.length < 9) continue;

      const [command, pidStr, user, , , , , , name] = parts;
      const pid = parseInt(pidStr, 10);

      if (isNaN(pid)) continue;

      // Check if this is a node-related process
      if (!isNodeProcess(command)) continue;

      // Extract port from NAME (format: *:PORT or IP:PORT)
      const portMatch = name.match(/:(\d+)$/);
      if (!portMatch) continue;

      const port = parseInt(portMatch[1], 10);
      if (isNaN(port)) continue;

      // Skip if we've seen this PID+port combo
      const key = `${pid}:${port}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Try to get full command
      let fullCommand: string | undefined;
      try {
        const psResult = spawnSync('ps', ['-p', String(pid), '-o', 'command='], {
          encoding: 'utf8',
          timeout: 2000,
        });
        if (psResult.status === 0 && psResult.stdout) {
          fullCommand = psResult.stdout.trim();
        }
      } catch {}

      // Try to get current working directory
      let cwd: string | undefined;
      try {
        // On macOS, use lsof -p PID -Fn to get cwd
        // Output format: pPID\nfcwd\nn/path/to/dir
        const cwdResult = spawnSync('lsof', ['-p', String(pid), '-Fn', '-a', '-d', 'cwd'], {
          encoding: 'utf8',
          timeout: 2000,
        });
        if (cwdResult.status === 0 && cwdResult.stdout) {
          const cwdLines = cwdResult.stdout.trim().split('\n');
          // Find the line that starts with 'n' and is a path (starts with /)
          for (const cwdLine of cwdLines) {
            if (cwdLine.startsWith('n/')) {
              cwd = cwdLine.substring(1); // Remove 'n' prefix
              break;
            }
          }
        }
      } catch {}

      processes.push({
        pid,
        name: command,
        user,
        port,
        protocol: 'TCP',
        command: fullCommand,
        cwd,
      });
    }

    // Sort by port number
    processes.sort((a, b) => a.port - b.port);

    return processes;
  } catch {
    return processes;
  }
}

/**
 * Windows: Find all Node processes listening on ports
 */
function findAllNodeProcessesWindows(): PortProcess[] {
  const processes: PortProcess[] = [];

  try {
    // Get all listening TCP connections with PIDs
    const netstatResult = spawnSync('netstat', ['-ano'], {
      encoding: 'utf8',
      timeout: 10000,
      // Removed shell: true - netstat works fine without shell
    });

    if (netstatResult.status !== 0 || !netstatResult.stdout) {
      return processes;
    }

    // Build a map of PID -> port
    const pidPorts = new Map<number, number[]>();

    const lines = netstatResult.stdout.split('\n');
    for (const line of lines) {
      const match = line.match(/TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
      if (match) {
        const port = parseInt(match[1], 10);
        const pid = parseInt(match[2], 10);
        if (!isNaN(port) && !isNaN(pid)) {
          if (!pidPorts.has(pid)) {
            pidPorts.set(pid, []);
          }
          pidPorts.get(pid)!.push(port);
        }
      }
    }

    // Get all processes and filter for node-related ones
    const taskResult = spawnSync('tasklist', ['/FO', 'CSV', '/NH'], {
      encoding: 'utf8',
      timeout: 10000,
      // Removed shell: true - tasklist works fine without shell
    });

    if (taskResult.status !== 0 || !taskResult.stdout) {
      return processes;
    }

    const taskLines = taskResult.stdout.split('\n');
    for (const taskLine of taskLines) {
      // Format: "Image Name","PID","Session Name","Session#","Mem Usage"
      const match = taskLine.match(/"([^"]+)","(\d+)"/);
      if (!match) continue;

      const processName = match[1];
      const pid = parseInt(match[2], 10);

      if (isNaN(pid)) continue;

      // Check if this PID has listening ports
      const ports = pidPorts.get(pid);
      if (!ports || ports.length === 0) continue;

      // Check if this is a node-related process
      if (!isNodeProcess(processName)) continue;

      // Add an entry for each port
      for (const port of ports) {
        processes.push({
          pid,
          name: processName.replace('.exe', ''),
          user: 'unknown',
          port,
          protocol: 'TCP',
        });
      }
    }

    // Sort by port number
    processes.sort((a, b) => a.port - b.port);

    return processes;
  } catch {
    return processes;
  }
}

/**
 * Find process using a specific port (any process, not just node)
 */
export function findProcessOnPort(port: number): PortScanResult {
  try {
    if (isWindows) {
      return findProcessOnPortWindows(port);
    } else {
      return findProcessOnPortUnix(port);
    }
  } catch (err) {
    return {
      port,
      inUse: false,
      process: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Unix/macOS implementation using lsof
 */
function findProcessOnPortUnix(port: number): PortScanResult {
  try {
    const result = spawnSync('lsof', ['-i', `:${port}`, '-P', '-n', '-sTCP:LISTEN'], {
      encoding: 'utf8',
      timeout: 5000,
    });

    if (result.status !== 0 || !result.stdout?.trim()) {
      return { port, inUse: false, process: null };
    }

    const lines = result.stdout.trim().split('\n');
    if (lines.length < 2) {
      return { port, inUse: false, process: null };
    }

    const dataLine = lines[1];
    const parts = dataLine.split(/\s+/);

    if (parts.length < 9) {
      return { port, inUse: false, process: null };
    }

    const [command, pidStr, user] = parts;
    const pid = parseInt(pidStr, 10);

    if (isNaN(pid)) {
      return { port, inUse: false, process: null };
    }

    let fullCommand: string | undefined;
    try {
      const psResult = spawnSync('ps', ['-p', String(pid), '-o', 'command='], {
        encoding: 'utf8',
        timeout: 2000,
      });
      if (psResult.status === 0 && psResult.stdout) {
        fullCommand = psResult.stdout.trim();
      }
    } catch {}

    return {
      port,
      inUse: true,
      process: {
        pid,
        name: command,
        user,
        port,
        protocol: 'TCP',
        command: fullCommand,
      },
    };
  } catch {
    return { port, inUse: false, process: null };
  }
}

/**
 * Windows implementation using netstat
 */
function findProcessOnPortWindows(port: number): PortScanResult {
  try {
    const result = spawnSync('netstat', ['-ano'], {
      encoding: 'utf8',
      timeout: 5000,
      // Removed shell: true - netstat works fine without shell
    });

    if (result.status !== 0 || !result.stdout) {
      return { port, inUse: false, process: null };
    }

    const lines = result.stdout.split('\n');
    for (const line of lines) {
      const match = line.match(/TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
      if (match && parseInt(match[1], 10) === port) {
        const pid = parseInt(match[2], 10);

        let processName = 'unknown';
        try {
          const taskResult = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
            encoding: 'utf8',
            timeout: 2000,
            // Removed shell: true - tasklist works fine without shell
          });
          if (taskResult.stdout) {
            const taskMatch = taskResult.stdout.match(/"([^"]+)"/);
            if (taskMatch) {
              processName = taskMatch[1];
            }
          }
        } catch {}

        return {
          port,
          inUse: true,
          process: {
            pid,
            name: processName,
            user: 'unknown',
            port,
            protocol: 'TCP',
          },
        };
      }
    }

    return { port, inUse: false, process: null };
  } catch {
    return { port, inUse: false, process: null };
  }
}

/**
 * System-critical PIDs that should never be killed
 * PID 0: kernel scheduler, PID 1: init/systemd, PID 4: Windows System
 */
const PROTECTED_PIDS = new Set([0, 1, 4]);

/**
 * Kill a process by PID
 * @param pid - Process ID to kill
 * @param force - Use SIGKILL/-9 instead of SIGTERM/-15
 * @returns true if process was killed successfully
 */
export function killProcess(pid: number, force: boolean = false): boolean {
  // Validate PID is a positive integer
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  // Never kill system-critical processes
  if (PROTECTED_PIDS.has(pid)) {
    console.error(`Refusing to kill protected system process (PID: ${pid})`);
    return false;
  }

  try {
    if (isWindows) {
      const args = force ? ['/F', '/PID', String(pid)] : ['/PID', String(pid)];
      const result = spawnSync('taskkill', args, {
        encoding: 'utf8',
        timeout: 5000,
        // Removed shell: true - taskkill works fine without shell
      });
      return result.status === 0;
    } else {
      const signal = force ? '-9' : '-15';
      const result = spawnSync('kill', [signal, String(pid)], {
        encoding: 'utf8',
        timeout: 5000,
      });
      return result.status === 0;
    }
  } catch {
    return false;
  }
}

/**
 * Kill process on a specific port
 */
export function killProcessOnPort(port: number, force: boolean = false): {
  success: boolean;
  message: string;
  process?: PortProcess;
} {
  const scanResult = findProcessOnPort(port);

  if (!scanResult.inUse || !scanResult.process) {
    return {
      success: false,
      message: `No process found listening on port ${port}`,
    };
  }

  const killed = killProcess(scanResult.process.pid, force);

  if (killed) {
    return {
      success: true,
      message: `Successfully killed process ${scanResult.process.name} (PID: ${scanResult.process.pid}) on port ${port}`,
      process: scanResult.process,
    };
  } else {
    return {
      success: false,
      message: `Failed to kill process ${scanResult.process.name} (PID: ${scanResult.process.pid}). Try with --force or run with elevated privileges.`,
      process: scanResult.process,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Interactive UI
// ─────────────────────────────────────────────────────────────

/**
 * Interactive Port Exorcist - Main Menu Entry
 */
export async function showPortExorcist(): Promise<void> {
  clearScreen();
  printHeader();

  console.log(c('cyan', '━'.repeat(66)));
  console.log(`  💀 ${bold('Port Exorcist')} - ${dim('Kill zombie Node.js processes')}`);
  console.log(c('cyan', '━'.repeat(66)));
  console.log();

  const spinner = new Spinner('Scanning for Node.js processes using ports...').start();

  // Small delay to show spinner
  await new Promise(resolve => setTimeout(resolve, 100));

  const nodeProcesses = findAllNodeProcesses();

  if (nodeProcesses.length === 0) {
    spinner.succeed('No Node.js processes found using ports');
    console.log();
    console.log(`  ${c('green', '✓')} ${bold('All clear!')} No Node.js processes are blocking any ports.`);
    console.log();

    await select({
      message: 'Press Enter to continue...',
      choices: [{ name: '← Back to menu', value: 'back' }],
      theme: { prefix: '  ' },
    });
    return;
  }

  spinner.succeed(`Found ${nodeProcesses.length} Node.js process${nodeProcesses.length > 1 ? 'es' : ''} using ports`);
  console.log();

  // Build choices for selection with path info integrated
  const choices: Array<{ name: string; value: string; description?: string }> = [
    ...nodeProcesses.map(proc => {
      // Show cwd in description, falling back to command
      let description = proc.cwd || proc.command?.substring(0, 60);
      if (description && description.length > 60) {
        description = '...' + description.slice(-57);
      }
      return {
        name: `💀 Kill port ${proc.port} (${proc.name}, PID: ${proc.pid})`,
        value: `pid:${proc.pid}`,
        description: description ? `📁 ${description}` : undefined,
      };
    }),
  ];

  // Add "kill all" option if multiple processes
  if (nodeProcesses.length > 1) {
    choices.push({
      name: `🔥 Kill ALL ${nodeProcesses.length} Node.js processes`,
      value: 'all',
      description: 'Terminate all listed processes',
    });
  }

  choices.push({
    name: '← Back to menu',
    value: 'back',
  });

  const choice = await select({
    message: 'Select a process to kill:',
    choices,
    pageSize: 12,
    theme: { prefix: '  ' },
  }) as string;

  if (choice === 'back') {
    return;
  }

  if (choice === 'all') {
    // Kill all processes
    const shouldKill = await confirm({
      message: `Kill all ${nodeProcesses.length} Node.js processes?`,
      default: false,
    });

    if (shouldKill) {
      await killMultipleProcesses(nodeProcesses);
    }
  } else if (choice.startsWith('pid:')) {
    // Kill single process by PID
    const pid = parseInt(choice.replace('pid:', ''), 10);
    const proc = nodeProcesses.find(p => p.pid === pid);
    if (proc) {
      const shouldKill = await confirm({
        message: `Kill ${proc.name} on port ${proc.port} (PID: ${proc.pid})?`,
        default: true,
      });

      if (shouldKill) {
        await killSingleProcess(proc);
      }
    }
  }

  // Show again to see updated state
  return showPortExorcist();
}

/**
 * Kill a single process with feedback
 */
async function killSingleProcess(proc: PortProcess): Promise<void> {
  console.log();
  const spinner = new Spinner(`Killing ${proc.name} (PID: ${proc.pid})...`).start();

  await new Promise(resolve => setTimeout(resolve, 100));

  const killed = killProcess(proc.pid);

  if (killed) {
    spinner.succeed(`Killed ${proc.name} on port ${proc.port}`);
  } else {
    spinner.fail(`Failed to kill ${proc.name}`);
    console.log(`  ${c('yellow', '→')} Try running with elevated privileges (sudo)`);

    const forceKill = await confirm({
      message: 'Try force kill (SIGKILL)?',
      default: false,
    });

    if (forceKill) {
      const forceResult = killProcess(proc.pid, true);
      if (forceResult) {
        console.log(`  ${c('green', '✓')} Force killed successfully!`);
      } else {
        console.log(`  ${c('red', '✗')} Force kill failed. You may need to run with sudo.`);
      }
    }
  }
}

/**
 * Kill multiple processes with feedback
 */
async function killMultipleProcesses(processes: PortProcess[]): Promise<void> {
  console.log();
  let killed = 0;
  let failed = 0;

  for (const proc of processes) {
    process.stdout.write(`  ${dim('Killing')} ${proc.name} (port ${proc.port})... `);
    const success = killProcess(proc.pid);
    if (success) {
      console.log(c('green', '✓'));
      killed++;
    } else {
      console.log(c('red', '✗'));
      failed++;
    }
  }

  console.log();
  if (failed === 0) {
    console.log(`  ${c('green', '✓')} ${bold('All zombies exorcised!')} Killed ${killed} process${killed > 1 ? 'es' : ''}.`);
  } else if (killed > 0) {
    console.log(`  ${c('yellow', '⚠')} Killed ${killed}, failed ${failed}. Some may require elevated privileges.`);
  } else {
    console.log(`  ${c('red', '✗')} Failed to kill any processes. Try running with sudo.`);
  }

  await new Promise(resolve => setTimeout(resolve, 1000));
}

// ─────────────────────────────────────────────────────────────
// CLI Commands
// ─────────────────────────────────────────────────────────────

/**
 * CLI: Kill a specific port (non-interactive)
 */
export function cliKillPort(port: number, force: boolean = false): void {
  console.log();
  console.log(`  💀 ${bold('Port Exorcist')}`);
  console.log();

  const scanResult = findProcessOnPort(port);

  if (!scanResult.inUse) {
    console.log(`  ${c('green', '✓')} Port ${port} is already free. Nothing to kill.`);
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
}

/**
 * CLI: Heal command - find and show/kill all Node processes
 */
export function cliHeal(autoKill: boolean = false): void {
  console.log();
  console.log(`  ⚡ ${bold('Quick Heal')} - Scanning for Node.js processes using ports...`);
  console.log();

  const processes = findAllNodeProcesses();

  if (processes.length === 0) {
    console.log(`  ${c('green', '✓')} All clear! No Node.js processes blocking ports.`);
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
}
