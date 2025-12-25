/**
 * Dynamic Import for ES Module (@inquirer/prompts)
 * With ESC key support for "go back" functionality
 */

type SelectFunction = (config: unknown) => Promise<unknown>;
type ConfirmFunction = (config: unknown) => Promise<boolean>;
type InputFunction = (config: unknown) => Promise<string>;
type SearchFunction = (config: unknown) => Promise<unknown>;
type CheckboxFunction = <T>(config: unknown) => Promise<T[]>;

// Separator is a class that can be instantiated with optional text
interface SeparatorInstance {
  type: 'separator';
  separator: string;
}

type SeparatorClass = {
  new (separator?: string): SeparatorInstance;
};

// Symbol to indicate user pressed ESC (go back)
export const BACK = Symbol('back');
export type BackSymbol = typeof BACK;

// Initialize with placeholder functions that throw if called before loadInquirer()
const notLoadedError = () => {
  throw new Error('Inquirer not loaded. Call loadInquirer() first.');
};

// Raw inquirer functions (internal)
let _select: SelectFunction = notLoadedError as SelectFunction;
let _confirm: ConfirmFunction = notLoadedError as ConfirmFunction;
let _checkbox: CheckboxFunction = notLoadedError as CheckboxFunction;

// Wrapped functions with ESC support
export let select: SelectFunction = notLoadedError as SelectFunction;
export let confirm: ConfirmFunction = notLoadedError as ConfirmFunction;
export let input: InputFunction = notLoadedError as InputFunction;
export let search: SearchFunction = notLoadedError as SearchFunction;
export let checkbox: CheckboxFunction = notLoadedError as CheckboxFunction;
export let Separator: SeparatorClass = class {
  constructor() {
    throw new Error('Inquirer not loaded. Call loadInquirer() first.');
  }
} as unknown as SeparatorClass;
export type { SeparatorClass, SeparatorInstance };

/**
 * Check if error is from ESC/Ctrl+C
 * @inquirer/prompts can throw different error types:
 * - ExitPromptError: User pressed Ctrl+C
 * - AbortPromptError: Prompt was aborted
 * - CancelPromptError: User pressed ESC (added in v7+)
 */
function isExitError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'name' in err &&
    (err.name === 'ExitPromptError' || 
     err.name === 'AbortPromptError' || 
     err.name === 'CancelPromptError')
  );
}

/**
 * Wrap select to return BACK on ESC
 */
function wrapSelect(fn: SelectFunction): SelectFunction {
  return async (config: unknown) => {
    try {
      return await fn(config);
    } catch (err) {
      if (isExitError(err)) {
        return BACK;
      }
      throw err;
    }
  };
}

/**
 * Wrap confirm to return false on ESC
 */
function wrapConfirm(fn: ConfirmFunction): ConfirmFunction {
  return async (config: unknown) => {
    try {
      return await fn(config);
    } catch (err) {
      if (isExitError(err)) {
        return false;
      }
      throw err;
    }
  };
}

/**
 * Wrap checkbox to return empty array on ESC
 */
function wrapCheckbox(fn: CheckboxFunction): CheckboxFunction {
  return async <T>(config: unknown) => {
    try {
      return await fn<T>(config);
    } catch (err) {
      if (isExitError(err)) {
        return [] as T[];
      }
      throw err;
    }
  };
}

/**
 * Wrap search to return BACK on ESC
 */
function wrapSearch(fn: SearchFunction): SearchFunction {
  return async (config: unknown) => {
    try {
      return await fn(config);
    } catch (err) {
      if (isExitError(err)) {
        return BACK;
      }
      throw err;
    }
  };
}

export async function loadInquirer(): Promise<void> {
  try {
    const inquirer = await import('@inquirer/prompts');
    _select = inquirer.select as SelectFunction;
    _confirm = inquirer.confirm as ConfirmFunction;
    _checkbox = inquirer.checkbox as CheckboxFunction;

    // Wrap with ESC support
    select = wrapSelect(_select);
    confirm = wrapConfirm(_confirm);
    checkbox = wrapCheckbox(_checkbox);
    search = wrapSearch(inquirer.search as SearchFunction);

    // These don't need wrapping
    input = inquirer.input as InputFunction;
    Separator = inquirer.Separator as SeparatorClass;
  } catch (err) {
    console.error('\n  ❌ Missing dependency: @inquirer/prompts');
    console.error('  Please install it first:\n');
    console.error('    npm install @inquirer/prompts\n');
    process.exit(1);
  }
}
