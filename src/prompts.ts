/**
 * Dynamic Import for ES Module (@inquirer/prompts)
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

// Initialize with placeholder functions that throw if called before loadInquirer()
const notLoadedError = () => {
  throw new Error('Inquirer not loaded. Call loadInquirer() first.');
};

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

export async function loadInquirer(): Promise<void> {
  try {
    const inquirer = await import('@inquirer/prompts');
    select = inquirer.select as SelectFunction;
    confirm = inquirer.confirm as ConfirmFunction;
    input = inquirer.input as InputFunction;
    search = inquirer.search as SearchFunction;
    checkbox = inquirer.checkbox as CheckboxFunction;
    Separator = inquirer.Separator as SeparatorClass;
  } catch (err) {
    console.error('\n  ❌ Missing dependency: @inquirer/prompts');
    console.error('  Please install it first:\n');
    console.error('    npm install @inquirer/prompts\n');
    process.exit(1);
  }
}
