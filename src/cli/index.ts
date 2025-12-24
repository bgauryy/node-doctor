/**
 * CLI Entry Point
 *
 * Modular CLI argument parsing and command routing.
 */

import type { ParsedArgs } from './types.js';
import { findCommand } from './commands.js';
import { showHelp, showCommandHelp, showVersion } from './help.js';

// Options that take values (look-ahead parsing)
const OPTIONS_WITH_VALUES = new Set(['output', 'o']);

/**
 * Parse command line arguments
 */
export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs {
  const result: ParsedArgs = {
    command: null,
    args: [],
    options: {},
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg.startsWith('--')) {
      // Long option
      const [key, value] = arg.slice(2).split('=');
      if (value !== undefined) {
        result.options[key] = value;
      } else if (OPTIONS_WITH_VALUES.has(key) && i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        // Option takes a value, look ahead
        result.options[key] = argv[i + 1];
        i++;
      } else {
        result.options[key] = true;
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      // Short option(s)
      const flags = arg.slice(1);
      // Check if last flag takes a value
      const lastFlag = flags[flags.length - 1];
      if (flags.length === 1 && OPTIONS_WITH_VALUES.has(lastFlag) && i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        result.options[lastFlag] = argv[i + 1];
        i++;
      } else {
        for (const flag of flags) {
          result.options[flag] = true;
        }
      }
    } else if (!result.command) {
      // First non-option is the command
      result.command = arg;
    } else {
      // Everything else is a positional argument
      result.args.push(arg);
    }

    i++;
  }

  return result;
}

/**
 * Run CLI
 * Returns true if a CLI command was handled, false to continue to interactive mode
 */
export async function runCLI(argv?: string[]): Promise<boolean> {
  const args = parseArgs(argv);

  // Global --help
  if (args.options['help'] || args.options['h']) {
    if (args.command) {
      const cmd = findCommand(args.command);
      if (cmd) {
        showCommandHelp(cmd);
        return true;
      }
    }
    showHelp();
    return true;
  }

  // Global --version
  if (args.options['version'] || args.options['v']) {
    showVersion();
    return true;
  }

  // Global --check (shortcut for `node-doctor check`)
  if (args.options['check'] || args.options['c']) {
    const checkCmd = findCommand('check');
    if (checkCmd) {
      await checkCmd.handler(args);
      return true;
    }
  }

  // No command - return false to go to interactive mode
  if (!args.command) {
    return false;
  }

  // Find and run command
  const command = findCommand(args.command);

  if (!command) {
    console.log();
    console.log(`  Unknown command: ${args.command}`);
    console.log(`  Run 'node-doctor --help' to see available commands.`);
    console.log();
    process.exitCode = 1;
    return true;
  }

  // Check for command-specific help
  if (args.options['help'] || args.options['h']) {
    showCommandHelp(command);
    return true;
  }

  // Run the command handler
  await command.handler(args);
  return true;
}

// Re-export types and utilities
export type { ParsedArgs, CLICommand, CLIOption, CLIArg } from './types.js';
export { commands, findCommand } from './commands.js';
export { showHelp, showCommandHelp, showVersion } from './help.js';
