/**
 * CLI Type Definitions
 */

/** CLI command example */
export interface CLIExample {
  /** Command to run */
  cmd: string;
  /** Description of what it does */
  desc: string;
}

/** CLI command definition */
export interface CLICommand {
  /** Command name (e.g., 'kill-port', 'heal') */
  name: string;
  /** Command aliases */
  aliases?: string[];
  /** Short description for help */
  description: string;
  /** Usage example */
  usage: string;
  /** Command arguments */
  args?: CLIArg[];
  /** Command-specific options */
  options?: CLIOption[];
  /** Example usages */
  examples?: CLIExample[];
  /** Detailed help text (shown with --help on the command) */
  detailedHelp?: string;
  /** Handler function */
  handler: (args: ParsedArgs) => void | Promise<void>;
}

/** CLI argument definition */
export interface CLIArg {
  /** Argument name */
  name: string;
  /** Whether argument is required */
  required: boolean;
  /** Description */
  description: string;
}

/** CLI option definition */
export interface CLIOption {
  /** Long form (e.g., '--force') */
  long: string;
  /** Short form (e.g., '-f') */
  short?: string;
  /** Description */
  description: string;
  /** Whether option takes a value */
  takesValue?: boolean;
  /** Alias for takesValue */
  hasValue?: boolean;
}

/** Parsed CLI arguments */
export interface ParsedArgs {
  /** The command name */
  command: string | null;
  /** Positional arguments */
  args: string[];
  /** Options/flags */
  options: Record<string, string | boolean>;
}

/** Global CLI options */
export const GLOBAL_OPTIONS: CLIOption[] = [
  { long: '--help', short: '-h', description: 'Show help message' },
  { long: '--version', short: '-v', description: 'Show version number' },
  { long: '--check', short: '-c', description: 'Run CI checks (non-interactive)' },
  { long: '--json', description: 'Output results as JSON (use with --check)' },
];
