/**
 * Shell Configuration File Detection
 * Cross-platform support for Mac (darwin), Linux, and Windows (win32)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dirExists, fileExists, getEnv, readFileContent, runCommand, HOME } from './utils.js';
import type { ShellConfigFile, NodeConfigEntryRaw, ShellConfigResult } from './types/index.js';

// Platform type from os.platform()
type Platform = 'darwin' | 'linux' | 'win32';

// Current platform
const PLATFORM = os.platform() as Platform;
const isWindows = PLATFORM === 'win32';

// Common path helpers
const APPDATA = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');
const XDG_CONFIG = getEnv('XDG_CONFIG_HOME') || path.join(HOME, '.config');
const ZDOTDIR = getEnv('ZDOTDIR') || HOME;

interface ShellConfigDefinition {
  name: string;
  paths: {
    darwin?: () => string | null;
    linux?: () => string | null;
    win32?: () => string | null;
  };
  shell: string;
  isDir?: boolean;
  isRegistry?: boolean;
}

interface NodePattern {
  pattern: RegExp;
  manager: string;
}

interface FileMatch {
  line: number;
  content: string;
  manager: string;
}

interface NodeRelatedFile {
  name: string;
  path: string;
  shell: string;
  managers: string[];
  matches: FileMatch[];
}

const SHELL_CONFIG_FILES: Record<string, ShellConfigDefinition> = {
  // ═══════════════════════════════════════════════════════════════════
  // Bash
  // ═══════════════════════════════════════════════════════════════════
  bashrc: {
    name: '.bashrc',
    paths: {
      darwin: () => path.join(HOME, '.bashrc'),
      linux: () => path.join(HOME, '.bashrc'),
      win32: () => path.join(HOME, '.bashrc'), // Git Bash / WSL
    },
    shell: 'bash',
  },
  bash_profile: {
    name: '.bash_profile',
    paths: {
      darwin: () => path.join(HOME, '.bash_profile'),
      linux: () => path.join(HOME, '.bash_profile'),
      win32: () => path.join(HOME, '.bash_profile'),
    },
    shell: 'bash',
  },
  bash_login: {
    name: '.bash_login',
    paths: {
      darwin: () => path.join(HOME, '.bash_login'),
      linux: () => path.join(HOME, '.bash_login'),
      win32: () => path.join(HOME, '.bash_login'),
    },
    shell: 'bash',
  },
  bash_logout: {
    name: '.bash_logout',
    paths: {
      darwin: () => path.join(HOME, '.bash_logout'),
      linux: () => path.join(HOME, '.bash_logout'),
      win32: () => path.join(HOME, '.bash_logout'),
    },
    shell: 'bash',
  },
  bash_aliases: {
    name: '.bash_aliases',
    paths: {
      darwin: () => path.join(HOME, '.bash_aliases'),
      linux: () => path.join(HOME, '.bash_aliases'),
      win32: () => path.join(HOME, '.bash_aliases'),
    },
    shell: 'bash',
  },
  bash_functions: {
    name: '.bash_functions',
    paths: {
      darwin: () => path.join(HOME, '.bash_functions'),
      linux: () => path.join(HOME, '.bash_functions'),
      win32: () => path.join(HOME, '.bash_functions'),
    },
    shell: 'bash',
  },
  profile: {
    name: '.profile',
    paths: {
      darwin: () => path.join(HOME, '.profile'),
      linux: () => path.join(HOME, '.profile'),
      win32: () => path.join(HOME, '.profile'),
    },
    shell: 'bash/sh',
  },

  // ═══════════════════════════════════════════════════════════════════
  // Zsh
  // ═══════════════════════════════════════════════════════════════════
  zshrc: {
    name: '.zshrc',
    paths: {
      darwin: () => path.join(ZDOTDIR, '.zshrc'),
      linux: () => path.join(ZDOTDIR, '.zshrc'),
      win32: () => path.join(ZDOTDIR, '.zshrc'),
    },
    shell: 'zsh',
  },
  zprofile: {
    name: '.zprofile',
    paths: {
      darwin: () => path.join(ZDOTDIR, '.zprofile'),
      linux: () => path.join(ZDOTDIR, '.zprofile'),
      win32: () => path.join(ZDOTDIR, '.zprofile'),
    },
    shell: 'zsh',
  },
  zshenv: {
    name: '.zshenv',
    paths: {
      darwin: () => path.join(ZDOTDIR, '.zshenv'),
      linux: () => path.join(ZDOTDIR, '.zshenv'),
      win32: () => path.join(ZDOTDIR, '.zshenv'),
    },
    shell: 'zsh',
  },
  zlogin: {
    name: '.zlogin',
    paths: {
      darwin: () => path.join(ZDOTDIR, '.zlogin'),
      linux: () => path.join(ZDOTDIR, '.zlogin'),
      win32: () => path.join(ZDOTDIR, '.zlogin'),
    },
    shell: 'zsh',
  },
  zlogout: {
    name: '.zlogout',
    paths: {
      darwin: () => path.join(ZDOTDIR, '.zlogout'),
      linux: () => path.join(ZDOTDIR, '.zlogout'),
      win32: () => path.join(ZDOTDIR, '.zlogout'),
    },
    shell: 'zsh',
  },

  // ═══════════════════════════════════════════════════════════════════
  // Fish
  // ═══════════════════════════════════════════════════════════════════
  fish_config: {
    name: 'config.fish',
    paths: {
      darwin: () => path.join(XDG_CONFIG, 'fish', 'config.fish'),
      linux: () => path.join(XDG_CONFIG, 'fish', 'config.fish'),
      win32: () => path.join(APPDATA, 'fish', 'config.fish'),
    },
    shell: 'fish',
  },
  fish_conf_d: {
    name: 'conf.d/',
    paths: {
      darwin: () => path.join(XDG_CONFIG, 'fish', 'conf.d'),
      linux: () => path.join(XDG_CONFIG, 'fish', 'conf.d'),
      win32: () => path.join(APPDATA, 'fish', 'conf.d'),
    },
    shell: 'fish',
    isDir: true,
  },

  // ═══════════════════════════════════════════════════════════════════
  // Oh-My-Zsh
  // ═══════════════════════════════════════════════════════════════════
  omz_custom: {
    name: 'oh-my-zsh custom',
    paths: {
      darwin: () => path.join(HOME, '.oh-my-zsh', 'custom'),
      linux: () => path.join(HOME, '.oh-my-zsh', 'custom'),
      win32: () => path.join(HOME, '.oh-my-zsh', 'custom'),
    },
    shell: 'zsh (oh-my-zsh)',
    isDir: true,
  },

  // ═══════════════════════════════════════════════════════════════════
  // PowerShell 5.x (Windows PowerShell)
  // ═══════════════════════════════════════════════════════════════════
  ps_profile: {
    name: 'PowerShell Profile',
    paths: {
      darwin: () => path.join(XDG_CONFIG, 'powershell', 'Microsoft.PowerShell_profile.ps1'),
      linux: () => path.join(XDG_CONFIG, 'powershell', 'Microsoft.PowerShell_profile.ps1'),
      win32: () => path.join(HOME, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
    },
    shell: 'PowerShell',
  },
  ps_profile_all: {
    name: 'PowerShell Profile (All Hosts)',
    paths: {
      darwin: () => path.join(XDG_CONFIG, 'powershell', 'profile.ps1'),
      linux: () => path.join(XDG_CONFIG, 'powershell', 'profile.ps1'),
      win32: () => path.join(HOME, 'Documents', 'WindowsPowerShell', 'profile.ps1'),
    },
    shell: 'PowerShell',
  },
  ps_profile_onedrive: {
    name: 'PowerShell Profile (OneDrive)',
    paths: {
      win32: () => path.join(HOME, 'OneDrive', 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
    },
    shell: 'PowerShell',
  },

  // ═══════════════════════════════════════════════════════════════════
  // PowerShell 7+ (pwsh / PowerShell Core)
  // ═══════════════════════════════════════════════════════════════════
  pwsh_profile: {
    name: 'PowerShell Core Profile',
    paths: {
      darwin: () => path.join(XDG_CONFIG, 'powershell', 'Microsoft.PowerShell_profile.ps1'),
      linux: () => path.join(XDG_CONFIG, 'powershell', 'Microsoft.PowerShell_profile.ps1'),
      win32: () => path.join(HOME, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
    },
    shell: 'pwsh',
  },
  pwsh_profile_onedrive: {
    name: 'PowerShell Core Profile (OneDrive)',
    paths: {
      win32: () => path.join(HOME, 'OneDrive', 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
    },
    shell: 'pwsh',
  },

  // ═══════════════════════════════════════════════════════════════════
  // CMD (Windows only)
  // ═══════════════════════════════════════════════════════════════════
  autorun: {
    name: 'CMD AutoRun',
    paths: {
      win32: () => null, // Registry-based, no file path
    },
    shell: 'cmd',
    isRegistry: true,
  },

  // ═══════════════════════════════════════════════════════════════════
  // Nushell
  // ═══════════════════════════════════════════════════════════════════
  nushell_config: {
    name: 'config.nu',
    paths: {
      darwin: () => path.join(XDG_CONFIG, 'nushell', 'config.nu'),
      linux: () => path.join(XDG_CONFIG, 'nushell', 'config.nu'),
      win32: () => path.join(APPDATA, 'nushell', 'config.nu'),
    },
    shell: 'nushell',
  },
  nushell_env: {
    name: 'env.nu',
    paths: {
      darwin: () => path.join(XDG_CONFIG, 'nushell', 'env.nu'),
      linux: () => path.join(XDG_CONFIG, 'nushell', 'env.nu'),
      win32: () => path.join(APPDATA, 'nushell', 'env.nu'),
    },
    shell: 'nushell',
  },

  // ═══════════════════════════════════════════════════════════════════
  // Elvish
  // ═══════════════════════════════════════════════════════════════════
  elvish_rc: {
    name: 'rc.elv',
    paths: {
      darwin: () => path.join(XDG_CONFIG, 'elvish', 'rc.elv'),
      linux: () => path.join(XDG_CONFIG, 'elvish', 'rc.elv'),
      win32: () => path.join(APPDATA, 'elvish', 'rc.elv'),
    },
    shell: 'elvish',
  },

  // ═══════════════════════════════════════════════════════════════════
  // Xonsh
  // ═══════════════════════════════════════════════════════════════════
  xonshrc: {
    name: '.xonshrc',
    paths: {
      darwin: () => path.join(HOME, '.xonshrc'),
      linux: () => path.join(HOME, '.xonshrc'),
      win32: () => path.join(HOME, '.xonshrc'),
    },
    shell: 'xonsh',
  },
  xonsh_rc: {
    name: 'rc.xsh',
    paths: {
      darwin: () => path.join(XDG_CONFIG, 'xonsh', 'rc.xsh'),
      linux: () => path.join(XDG_CONFIG, 'xonsh', 'rc.xsh'),
      win32: () => path.join(APPDATA, 'xonsh', 'rc.xsh'),
    },
    shell: 'xonsh',
  },

  // ═══════════════════════════════════════════════════════════════════
  // Csh / Tcsh
  // ═══════════════════════════════════════════════════════════════════
  cshrc: {
    name: '.cshrc',
    paths: {
      darwin: () => path.join(HOME, '.cshrc'),
      linux: () => path.join(HOME, '.cshrc'),
      win32: () => null,
    },
    shell: 'csh',
  },
  tcshrc: {
    name: '.tcshrc',
    paths: {
      darwin: () => path.join(HOME, '.tcshrc'),
      linux: () => path.join(HOME, '.tcshrc'),
      win32: () => null,
    },
    shell: 'tcsh',
  },
};

// Using /i flag only (not /g) to avoid lastIndex state bugs when reusing patterns
const NODE_PATTERNS: NodePattern[] = [
  // ═══════════════════════════════════════════════════════════════════
  // nvm (Unix/macOS/Linux)
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /NVM_DIR/i, manager: 'nvm' },
  { pattern: /NVM_BIN/i, manager: 'nvm' },
  { pattern: /\.nvm/i, manager: 'nvm' },
  { pattern: /nvm\.sh/i, manager: 'nvm' },

  // ═══════════════════════════════════════════════════════════════════
  // nvm-windows (Windows)
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /NVM_HOME/i, manager: 'nvm-windows' },
  { pattern: /NVM_SYMLINK/i, manager: 'nvm-windows' },

  // ═══════════════════════════════════════════════════════════════════
  // fnm
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /fnm\s+env/i, manager: 'fnm' },
  { pattern: /FNM_/i, manager: 'fnm' },
  { pattern: /\.fnm/i, manager: 'fnm' },
  { pattern: /fnm\s+use/i, manager: 'fnm' },

  // ═══════════════════════════════════════════════════════════════════
  // volta
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /VOLTA_HOME/i, manager: 'volta' },
  { pattern: /\.volta/i, manager: 'volta' },
  { pattern: /volta\s+setup/i, manager: 'volta' },
  { pattern: /load\.fish.*volta/i, manager: 'volta' },

  // ═══════════════════════════════════════════════════════════════════
  // asdf
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /ASDF_DIR/i, manager: 'asdf' },
  { pattern: /ASDF_DATA_DIR/i, manager: 'asdf' },
  { pattern: /ASDF_CONFIG_FILE/i, manager: 'asdf' },
  { pattern: /\.asdf/i, manager: 'asdf' },
  { pattern: /asdf\.sh/i, manager: 'asdf' },

  // ═══════════════════════════════════════════════════════════════════
  // n
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /N_PREFIX/i, manager: 'n' },
  { pattern: /N_NODE_MIRROR/i, manager: 'n' },
  { pattern: /N_CACHE_PREFIX/i, manager: 'n' },
  { pattern: /\/n\/versions/i, manager: 'n' },

  // ═══════════════════════════════════════════════════════════════════
  // mise (formerly rtx)
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /MISE_DATA_DIR/i, manager: 'mise' },
  { pattern: /MISE_CONFIG_DIR/i, manager: 'mise' },
  { pattern: /MISE_CACHE_DIR/i, manager: 'mise' },
  { pattern: /mise\s+activate/i, manager: 'mise' },
  { pattern: /\.local\/share\/mise/i, manager: 'mise' },

  // ═══════════════════════════════════════════════════════════════════
  // vfox
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /VFOX_HOME/i, manager: 'vfox' },
  { pattern: /\.version-fox/i, manager: 'vfox' },
  { pattern: /vfox\s+activate/i, manager: 'vfox' },

  // ═══════════════════════════════════════════════════════════════════
  // nodenv
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /NODENV_ROOT/i, manager: 'nodenv' },
  { pattern: /NODENV_VERSION/i, manager: 'nodenv' },
  { pattern: /NODENV_DIR/i, manager: 'nodenv' },
  { pattern: /\.nodenv/i, manager: 'nodenv' },
  { pattern: /nodenv\s+init/i, manager: 'nodenv' },

  // ═══════════════════════════════════════════════════════════════════
  // nvs
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /NVS_HOME/i, manager: 'nvs' },
  { pattern: /\.nvs/i, manager: 'nvs' },
  { pattern: /nvs\.sh/i, manager: 'nvs' },

  // ═══════════════════════════════════════════════════════════════════
  // nodist (Windows)
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /NODIST_PREFIX/i, manager: 'nodist' },
  { pattern: /NODIST_VERSION/i, manager: 'nodist' },
  { pattern: /nodist_bash_profile/i, manager: 'nodist' },

  // ═══════════════════════════════════════════════════════════════════
  // proto
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /PROTO_HOME/i, manager: 'proto' },
  { pattern: /\.proto/i, manager: 'proto' },
  { pattern: /proto\s+use/i, manager: 'proto' },
  { pattern: /proto\s+setup/i, manager: 'proto' },

  // ═══════════════════════════════════════════════════════════════════
  // nodebrew
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /nodebrew/i, manager: 'nodebrew' },
  { pattern: /\.nodebrew/i, manager: 'nodebrew' },

  // ═══════════════════════════════════════════════════════════════════
  // gnvm (Windows)
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /GNVM_/i, manager: 'gnvm' },
  { pattern: /gnvm\.exe/i, manager: 'gnvm' },
  { pattern: /NODE_HOME/i, manager: 'gnvm' }, // Common for gnvm

  // ═══════════════════════════════════════════════════════════════════
  // ndenv
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /NDENV_ROOT/i, manager: 'ndenv' },
  { pattern: /\.ndenv/i, manager: 'ndenv' },
  { pattern: /ndenv\s+init/i, manager: 'ndenv' },

  // ═══════════════════════════════════════════════════════════════════
  // snm
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /SNM_DIR/i, manager: 'snm' },
  { pattern: /\.snm/i, manager: 'snm' },
  { pattern: /snm\s+env/i, manager: 'snm' },

  // ═══════════════════════════════════════════════════════════════════
  // nvmd (nvm-desktop)
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /NVMD_DIR/i, manager: 'nvmd' },
  { pattern: /\.nvmd/i, manager: 'nvmd' },
  { pattern: /nvmd/i, manager: 'nvmd' },

  // ═══════════════════════════════════════════════════════════════════
  // tnvm
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /TNVM_DIR/i, manager: 'tnvm' },
  { pattern: /\.tnvm/i, manager: 'tnvm' },
  { pattern: /tnvm/i, manager: 'tnvm' },

  // ═══════════════════════════════════════════════════════════════════
  // Homebrew (detects Homebrew-installed Node paths)
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /\/opt\/homebrew\/bin\/node/i, manager: 'homebrew' },
  { pattern: /\/usr\/local\/bin\/node/i, manager: 'homebrew' },
  { pattern: /\/home\/linuxbrew\/.linuxbrew/i, manager: 'homebrew' },
  { pattern: /HOMEBREW_PREFIX.*node/i, manager: 'homebrew' },

  // ═══════════════════════════════════════════════════════════════════
  // Corepack & Package Managers
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /COREPACK_HOME/i, manager: 'corepack' },
  { pattern: /corepack\s+enable/i, manager: 'corepack' },
  { pattern: /nodejs|node\.js/i, manager: 'node' },
  { pattern: /npm/i, manager: 'npm' },
  { pattern: /pnpm/i, manager: 'pnpm' },
  { pattern: /yarn/i, manager: 'yarn' },
  { pattern: /corepack/i, manager: 'corepack' },
];

interface ShellConfigFound {
  key: string;
  name: string;
  path: string;
  shell: string;
  isDir: boolean;
  exists: boolean;
}

interface DetectResult {
  found: ShellConfigFound[];
  nodeRelated: NodeRelatedFile[];
  summary: {
    total: number;
    withNodeConfig: number;
  };
}

/**
 * Get the config file path for the current platform
 */
function getConfigPath(config: ShellConfigDefinition): string | null {
  const pathFn = config.paths[PLATFORM];
  if (!pathFn) return null;
  return pathFn();
}

export function detectShellConfigs(): ShellConfigResult {
  const found: ShellConfigFound[] = [];
  const nodeRelated: NodeConfigEntryRaw[] = [];
  const managersFound = new Set<string>();
  let totalConfigs = 0;
  let configsWithNode = 0;

  for (const [key, config] of Object.entries(SHELL_CONFIG_FILES)) {
    if (config.isRegistry) continue;

    // Check if PowerShell/pwsh is available on non-Windows
    if (config.shell.includes('PowerShell') || config.shell === 'pwsh') {
      if (!isWindows) {
        // Use 'command -v' instead of 'which' for POSIX compatibility
        const pwshExists = runCommand('command', ['-v', 'pwsh']) !== null;
        if (!pwshExists && config.shell !== 'pwsh') continue;
      }
    }

    const filePath = getConfigPath(config);
    if (!filePath) continue;

    const exists = config.isDir ? dirExists(filePath) : fileExists(filePath);

    if (exists) {
      found.push({
        key,
        name: config.name,
        path: filePath,
        shell: config.shell,
        isDir: config.isDir || false,
        exists: true,
      });
      totalConfigs++;

      if (!config.isDir) {
        const content = readFileContent(filePath);
        if (content) {
          const lines = content.split(/\r?\n/);
          const fileMatches: FileMatch[] = [];

          lines.forEach((line, index) => {
            if (!line.trim()) return;
            // Ignore commented lines
            if (line.trim().startsWith('#')) return;

            for (const { pattern, manager } of NODE_PATTERNS) {
              if (pattern.test(line)) {
                fileMatches.push({
                  line: index + 1,
                  content: line,
                  manager,
                });
                managersFound.add(manager);
                break;
              }
            }
          });

          if (fileMatches.length > 0) {
            for (const match of fileMatches) {
              nodeRelated.push({
                file: config.name,
                line: match.line,
                content: match.content,
                manager: match.manager,
                path: filePath,
              });
            }
            configsWithNode++;
          }
        }
      } else {
        try {
          const files = fs.readdirSync(filePath);
          for (const file of files) {
            if (file.endsWith('.fish') || file.endsWith('.zsh') || file.endsWith('.sh') || file.endsWith('.ps1')) {
              const fullPath = path.join(filePath, file);
              const content = readFileContent(fullPath);
              if (content) {
                const lines = content.split(/\r?\n/);
                const fileMatches: FileMatch[] = [];

                lines.forEach((line, index) => {
                  if (!line.trim()) return;

                  for (const { pattern, manager } of NODE_PATTERNS) {
                    if (pattern.test(line)) {
                      fileMatches.push({
                        line: index + 1,
                        content: line,
                        manager,
                      });
                      managersFound.add(manager);
                      break;
                    }
                  }
                });

                if (fileMatches.length > 0) {
                  for (const match of fileMatches) {
                    nodeRelated.push({
                      file: `${config.name}/${file}`,
                      line: match.line,
                      content: match.content,
                      manager: match.manager,
                      path: fullPath,
                    });
                  }
                  configsWithNode++;
                }
              }
            }
          }
        } catch {}
      }
    }
  }

  return {
    found: found.map((f) => ({
      name: f.name,
      path: f.path,
      exists: f.exists,
      shell: f.shell,
    })),
    nodeRelated,
    summary: {
      total: totalConfigs,
      withNodeConfig: configsWithNode,
    },
  };
}
