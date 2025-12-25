/**
 * Platform Detection & Utility Functions
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import os from 'node:os';

// Platform detection
export const isWindows: boolean = os.platform() === 'win32';
export const isMac: boolean = os.platform() === 'darwin';
export const HOME: string = os.homedir();

/**
 * Clear terminal screen properly using ANSI escape sequences.
 * This clears the visible screen, scrollback buffer, and moves cursor to home.
 * More reliable than console.clear() especially after inquirer prompts.
 */
export function clearScreen(): void {
  if (process.stdout.isTTY) {
    // ESC[2J  - Clear entire visible screen
    // ESC[3J  - Clear scrollback buffer (prevents seeing old content when scrolling up)
    // ESC[H   - Move cursor to home position (1,1)
    process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
  } else {
    // Fallback for non-TTY environments
    console.clear();
  }
}

/**
 * Clear residual lines left by prompts (e.g., after inquirer interactions).
 * Use this after a prompt to clean up any leftover artifacts.
 * @param lines Number of lines to clear (default: 2)
 */
export function clearPromptResidue(lines: number = 2): void {
  if (process.stdout.isTTY) {
    for (let i = 0; i < lines; i++) {
      // ESC[1A - Move cursor up one line
      // ESC[2K - Clear entire line
      process.stdout.write('\x1b[1A\x1b[2K');
    }
  }
}

/**
 * Clear current line and move cursor to start.
 * Useful for updating status lines in place.
 */
export function clearLine(): void {
  if (process.stdout.isTTY) {
    // ESC[2K - Clear entire line
    // \r     - Carriage return (move to start of line)
    process.stdout.write('\x1b[2K\r');
  }
}

export function dirExists(dirPath: string): boolean {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

export function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function getEnv(name: string): string | null {
  const value = process.env[name];
  return value !== undefined ? value : null;
}

/**
 * Safely run a command with arguments (no shell injection risk)
 * @param command - The command to run (e.g., 'npm', 'brew')
 * @param args - Array of arguments (e.g., ['root', '-g'])
 * @returns stdout trimmed, or null on error/non-zero exit
 */
export function runCommand(command: string, args: string[] = []): string | null {
  try {
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });
    if (result.status === 0) {
      return result.stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}

export function getNodeVersion(nodePath: string): string | null {
  try {
    const result = spawnSync(nodePath, ['--version'], { encoding: 'utf8', timeout: 5000 });
    if (result.status === 0) {
      return result.stdout.trim();
    }
  } catch {
    // Node binary not found or failed to execute - expected for invalid paths
  }
  return null;
}

/**
 * Async version of getNodeVersion - gets Node.js version without blocking
 * @param nodePath - Path to the node executable
 * @returns Promise resolving to version string or null
 */
export async function getNodeVersionAsync(nodePath: string): Promise<string | null> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync(nodePath, ['--version'], { timeout: 5000 });
    return stdout.trim();
  } catch {
    // Async exec failed - binary not found or timed out
    return null;
  }
}

export function listSubdirs(dirPath: string): string[] {
  try {
    if (!dirExists(dirPath)) return [];
    return fs.readdirSync(dirPath).filter((name) => {
      const fullPath = path.join(dirPath, name);
      return dirExists(fullPath) && !name.startsWith('.');
    });
  } catch {
    // Directory read failed - permission denied or path doesn't exist
    return [];
  }
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

export function getDirSize(dirPath: string): number {
  let size = 0;
  try {
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      // Use lstatSync to avoid following symlinks (prevents infinite recursion)
      const stat = fs.lstatSync(fullPath);
      // Skip symlinks to avoid circular references and counting external files
      if (stat.isSymbolicLink()) {
        continue;
      }
      if (stat.isDirectory()) {
        size += getDirSize(fullPath);
      } else {
        size += stat.size;
      }
    }
  } catch {
    // Directory traversal failed - permission denied or deleted mid-scan
  }
  return size;
}

/**
 * Async version of getDirSize - calculates directory size without blocking
 * @param dirPath - Path to the directory
 * @param shouldStop - Optional callback to check if operation should be cancelled
 * @returns Promise resolving to total size in bytes (0 if stopped)
 */
export async function getDirSizeAsync(
  dirPath: string,
  shouldStop?: () => boolean
): Promise<number> {
  let size = 0;
  try {
    // Check if we should stop before starting
    if (shouldStop?.()) return 0;

    const items = await fs.promises.readdir(dirPath);
    
    // Check again after reading directory
    if (shouldStop?.()) return 0;

    const stats = await Promise.all(
      items.map(async (item) => {
        const fullPath = path.join(dirPath, item);
        try {
          return { path: fullPath, stat: await fs.promises.lstat(fullPath) };
        } catch {
          // Individual file stat failed - skip this entry
          return null;
        }
      })
    );

    for (const entry of stats) {
      // Check for stop in the loop
      if (shouldStop?.()) return size;
      
      if (!entry) continue;
      const { path: itemPath, stat } = entry;
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        size += await getDirSizeAsync(itemPath, shouldStop);
      } else {
        size += stat.size;
      }
    }
  } catch {
    // Async directory traversal failed - permission denied or deleted mid-scan
  }
  return size;
}

/**
 * Allowed base directories for safe deletion (version manager paths)
 * Only directories under these paths can be deleted to prevent accidental deletion
 * of system files or user data outside of Node.js version manager scope.
 */
const ALLOWED_DELETE_BASES: string[] = [
  path.join(HOME, '.nvm'),
  path.join(HOME, '.fnm'),
  path.join(HOME, '.volta'),
  path.join(HOME, '.asdf'),
  path.join(HOME, '.n'),
  path.join(HOME, '.nodenv'),
  path.join(HOME, '.nodebrew'),
  path.join(HOME, '.nvs'),
  path.join(HOME, '.proto'),
  path.join(HOME, '.local', 'share', 'mise'),
  path.join(HOME, '.local', 'share', 'fnm'),
  path.join(HOME, '.version-fox'),
  path.join(HOME, '.ndenv'),
  path.join(HOME, '.tnvm'),
  path.join(HOME, '.nvmd'),
  path.join(HOME, 'AppData', 'Roaming', 'nvm'), // nvm-windows
  path.join(HOME, 'AppData', 'Roaming', 'fnm'),
  path.join(HOME, 'AppData', 'Local', 'nvs'),
  path.join(HOME, 'AppData', 'Local', 'mise'),
  path.join(HOME, 'AppData', 'Local', 'volta'),
];

/**
 * Check if a path is safe for deletion (within allowed version manager directories)
 * @param targetPath - The path to validate
 * @returns true if path is safe to delete, false otherwise
 */
export function isPathSafeForDeletion(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);

  // Check if path is under an allowed base directory
  const isAllowed = ALLOWED_DELETE_BASES.some(base => {
    const resolvedBase = path.resolve(base);
    return resolved.startsWith(resolvedBase + path.sep);
  });

  if (!isAllowed) {
    return false;
  }

  // Check that the path itself is not a symlink (prevent symlink attacks)
  try {
    const stat = fs.lstatSync(resolved);
    if (stat.isSymbolicLink()) {
      return false;
    }
  } catch {
    // If we can't stat the path, it's not safe
    return false;
  }

  return true;
}

/**
 * Safely delete a directory recursively (only within allowed version manager paths)
 * @param dirPath - The directory to delete
 * @returns true if deleted, false if path doesn't exist
 * @throws Error if path is outside allowed directories
 */
export function deleteDirRecursive(dirPath: string): boolean {
  if (!isPathSafeForDeletion(dirPath)) {
    throw new Error(`Refusing to delete path outside allowed directories: ${dirPath}`);
  }

  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
    return true;
  }
  return false;
}

export function readFileContent(filePath: string): string | null {
  try {
    if (fileExists(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
  } catch {
    // File read failed - permission denied or encoding issue
  }
  return null;
}

/**
 * Safely open a file with the system default application
 * Only allows opening files under the user's HOME directory
 * @param filePath - Path to the file to open
 * @returns true if open command was spawned successfully
 */
export function openFile(filePath: string): boolean {
  // Validate file exists and is a regular file
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return false;
    }
  } catch {
    return false;
  }

  // Validate path is under HOME directory (security check)
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(HOME + path.sep) && resolved !== HOME) {
    return false;
  }

  let command: string;
  let args: string[];

  if (isMac) {
    command = 'open';
    args = [filePath];
  } else if (isWindows) {
    command = 'cmd';
    args = ['/c', 'start', '""', filePath];
  } else {
    command = 'xdg-open';
    args = [filePath];
  }

  try {
    spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Shell Detection & PATH Fixing (inspired by fix-path / shell-env packages)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect the user's default shell
 * Priority: os.userInfo().shell > $SHELL env > platform default
 */
export function detectDefaultShell(): string {
  if (isWindows) {
    return process.env.COMSPEC || 'cmd.exe';
  }

  // Primary: Use os.userInfo() which reads from /etc/passwd
  try {
    const { shell } = os.userInfo();
    if (shell) return shell;
  } catch {
    // userInfo() can throw on some systems
  }

  // Fallback: Use $SHELL environment variable
  if (process.env.SHELL) {
    return process.env.SHELL;
  }

  // Last resort: Platform defaults
  return isMac ? '/bin/zsh' : '/bin/sh';
}

/**
 * Strip ANSI escape codes from a string
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

/**
 * Delimiter used to extract env output from shell noise
 */
const ENV_DELIMITER = '_NODE_DOCTOR_ENV_DELIMITER_';

/**
 * Parse environment variables from shell output
 */
function parseEnvOutput(output: string): Record<string, string> {
  const env: Record<string, string> = {};

  // Extract content between delimiters
  const parts = output.split(ENV_DELIMITER);
  if (parts.length < 2) return env;

  const envSection = parts[1];
  const cleanOutput = stripAnsi(envSection);

  for (const line of cleanOutput.split('\n')) {
    if (!line.trim()) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex);
    const value = line.slice(eqIndex + 1);
    env[key] = value;
  }

  return env;
}

/**
 * Get environment variables from the user's shell
 * Spawns a login+interactive shell to load all dotfiles (.bashrc, .zshrc, etc.)
 *
 * @param shell - Shell to use (defaults to user's default shell)
 * @returns Environment variables from the shell, or null on failure
 */
export function getShellEnv(shell?: string): Record<string, string> | null {
  if (isWindows) {
    // Windows doesn't have the GUI app PATH problem
    return { ...process.env } as Record<string, string>;
  }

  const targetShell = shell || detectDefaultShell();

  // -i = interactive (loads .bashrc, .zshrc)
  // -l = login shell (loads .bash_profile, .profile, .zprofile)
  // -c = execute command
  const args = [
    '-ilc',
    `echo -n "${ENV_DELIMITER}"; env; echo -n "${ENV_DELIMITER}"; exit`,
  ];

  try {
    const result = spawnSync(targetShell, args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      timeout: 10000, // 10s timeout
      env: {
        ...process.env,
        // Prevent oh-my-zsh and other plugins from slowing things down
        DISABLE_AUTO_UPDATE: 'true',
      },
    });

    if (result.status === 0 && result.stdout) {
      return parseEnvOutput(result.stdout);
    }
  } catch {
    // Shell spawn failed
  }

  return null;
}

/**
 * Get the PATH from the user's shell environment
 * Uses shell spawning with -ilc to get the "real" PATH that includes
 * all paths configured in dotfiles (.bashrc, .zshrc, etc.)
 *
 * @param shell - Shell to use (defaults to user's default shell)
 * @returns The shell's PATH, or null on failure
 */
export function getShellPath(shell?: string): string | null {
  const env = getShellEnv(shell);
  return env?.PATH || null;
}

/**
 * Default fallback paths if shell spawning fails
 */
const FALLBACK_PATHS = [
  './node_modules/.bin',
  path.join(HOME, '.nodebrew', 'current', 'bin'),
  path.join(HOME, '.nvm', 'current', 'bin'),
  path.join(HOME, '.fnm', 'current', 'bin'),
  path.join(HOME, '.volta', 'bin'),
  path.join(HOME, '.local', 'bin'),
  '/usr/local/bin',
  '/opt/homebrew/bin',
];

/**
 * Fix the PATH in process.env to include paths from the shell
 * Useful when running from GUI apps that don't inherit shell PATH
 *
 * @returns true if PATH was updated, false if using fallback or unchanged
 */
export function fixPath(): boolean {
  if (isWindows) {
    return false; // Windows doesn't have this issue
  }

  const shellPath = getShellPath();

  if (shellPath) {
    const cleanPath = stripAnsi(shellPath);
    if (cleanPath && cleanPath !== process.env.PATH) {
      process.env.PATH = cleanPath;
      return true;
    }
  } else {
    // Shell spawn failed - use sensible fallbacks
    const currentPath = process.env.PATH || '';
    const pathsToAdd = FALLBACK_PATHS.filter(p => !currentPath.includes(p));

    if (pathsToAdd.length > 0) {
      process.env.PATH = [...pathsToAdd, currentPath].join(':');
      return true;
    }
  }

  return false;
}

/**
 * Get comprehensive shell information
 * Useful for diagnostics and debugging PATH issues
 */
export interface ShellInfo {
  defaultShell: string;
  currentPath: string;
  shellPath: string | null;
  pathDifference: {
    inShellOnly: string[];
    inProcessOnly: string[];
  };
}

export function getShellInfo(): ShellInfo {
  const defaultShell = detectDefaultShell();
  const currentPath = process.env.PATH || '';
  const shellPath = getShellPath();

  const currentPaths = new Set(currentPath.split(':').filter(Boolean));
  const shellPaths = new Set((shellPath || '').split(':').filter(Boolean));

  const inShellOnly = [...shellPaths].filter(p => !currentPaths.has(p));
  const inProcessOnly = [...currentPaths].filter(p => !shellPaths.has(p));

  return {
    defaultShell,
    currentPath,
    shellPath,
    pathDifference: {
      inShellOnly,
      inProcessOnly,
    },
  };
}
