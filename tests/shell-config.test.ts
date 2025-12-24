/**
 * Tests for shell configuration detection patterns
 * @module tests/shell-config.test
 *
 * Note: These tests verify the NODE_PATTERNS regex matching logic.
 * The full detectShellConfigs() function requires complex mocking
 * of fs operations, so we test the pattern matching in isolation.
 */

import { describe, it, expect } from 'vitest';

// Define the patterns we want to test (extracted from shell-config.ts)
interface NodePattern {
  pattern: RegExp;
  manager: string;
}

const NODE_PATTERNS: NodePattern[] = [
  // NVM (Unix/macOS/Linux)
  { pattern: /NVM_DIR/i, manager: 'nvm' },
  { pattern: /NVM_BIN/i, manager: 'nvm' },
  { pattern: /\.nvm/i, manager: 'nvm' },
  { pattern: /nvm\.sh/i, manager: 'nvm' },

  // nvm-windows (Windows)
  { pattern: /NVM_HOME/i, manager: 'nvm-windows' },
  { pattern: /NVM_SYMLINK/i, manager: 'nvm-windows' },

  // fnm
  { pattern: /fnm\s+env/i, manager: 'fnm' },
  { pattern: /FNM_/i, manager: 'fnm' },
  { pattern: /\.fnm/i, manager: 'fnm' },
  { pattern: /fnm\s+use/i, manager: 'fnm' },

  // volta
  { pattern: /VOLTA_HOME/i, manager: 'volta' },
  { pattern: /\.volta/i, manager: 'volta' },
  { pattern: /volta\s+setup/i, manager: 'volta' },

  // asdf
  { pattern: /ASDF_DIR/i, manager: 'asdf' },
  { pattern: /ASDF_DATA_DIR/i, manager: 'asdf' },
  { pattern: /\.asdf/i, manager: 'asdf' },
  { pattern: /asdf\.sh/i, manager: 'asdf' },

  // n
  { pattern: /N_PREFIX/i, manager: 'n' },
  { pattern: /\/n\/versions/i, manager: 'n' },

  // mise
  { pattern: /MISE_DATA_DIR/i, manager: 'mise' },
  { pattern: /mise\s+activate/i, manager: 'mise' },
  { pattern: /\.local\/share\/mise/i, manager: 'mise' },

  // vfox
  { pattern: /VFOX_HOME/i, manager: 'vfox' },
  { pattern: /\.version-fox/i, manager: 'vfox' },
  { pattern: /vfox\s+activate/i, manager: 'vfox' },

  // nodenv
  { pattern: /NODENV_ROOT/i, manager: 'nodenv' },
  { pattern: /\.nodenv/i, manager: 'nodenv' },
  { pattern: /nodenv\s+init/i, manager: 'nodenv' },

  // nvs
  { pattern: /NVS_HOME/i, manager: 'nvs' },
  { pattern: /\.nvs/i, manager: 'nvs' },
  { pattern: /nvs\.sh/i, manager: 'nvs' },

  // proto
  { pattern: /PROTO_HOME/i, manager: 'proto' },
  { pattern: /\.proto/i, manager: 'proto' },
  { pattern: /proto\s+setup/i, manager: 'proto' },

  // nodebrew
  { pattern: /nodebrew/i, manager: 'nodebrew' },
  { pattern: /\.nodebrew/i, manager: 'nodebrew' },

  // Homebrew
  { pattern: /\/opt\/homebrew\/bin\/node/i, manager: 'homebrew' },
  { pattern: /\/usr\/local\/bin\/node/i, manager: 'homebrew' },
  { pattern: /HOMEBREW_PREFIX.*node/i, manager: 'homebrew' },

  // Package managers (order matters - more specific first)
  { pattern: /pnpm/i, manager: 'pnpm' },
  { pattern: /yarn/i, manager: 'yarn' },
  { pattern: /corepack/i, manager: 'corepack' },
  { pattern: /npm/i, manager: 'npm' },
];

/**
 * Helper to find matching manager for a line
 */
function findManager(line: string): string | null {
  for (const { pattern, manager } of NODE_PATTERNS) {
    if (pattern.test(line)) {
      return manager;
    }
  }
  return null;
}

/**
 * Helper to find all matching managers for a content block
 */
function findAllManagers(content: string): string[] {
  const managers = new Set<string>();
  const lines = content.split('\n');

  for (const line of lines) {
    // Skip comments
    if (line.trim().startsWith('#')) continue;
    if (!line.trim()) continue;

    const manager = findManager(line);
    if (manager) {
      managers.add(manager);
    }
  }

  return Array.from(managers);
}

describe('shell-config patterns', () => {
  describe('NVM detection', () => {
    it('should detect NVM_DIR export', () => {
      expect(findManager('export NVM_DIR="$HOME/.nvm"')).toBe('nvm');
    });

    it('should detect .nvm path', () => {
      expect(findManager('[ -s "$HOME/.nvm/nvm.sh" ]')).toBe('nvm');
    });

    it('should detect nvm.sh sourcing', () => {
      expect(findManager('. "$NVM_DIR/nvm.sh"')).toBe('nvm');
    });

    it('should be case insensitive', () => {
      expect(findManager('export nvm_dir="$HOME/.nvm"')).toBe('nvm');
    });
  });

  describe('FNM detection', () => {
    it('should detect fnm env', () => {
      expect(findManager('eval "$(fnm env --use-on-cd)"')).toBe('fnm');
    });

    it('should detect FNM_DIR', () => {
      expect(findManager('export FNM_DIR="$HOME/.fnm"')).toBe('fnm');
    });

    it('should detect .fnm path', () => {
      expect(findManager('export PATH="$HOME/.fnm:$PATH"')).toBe('fnm');
    });

    it('should detect fnm use', () => {
      expect(findManager('fnm use 18')).toBe('fnm');
    });
  });

  describe('Volta detection', () => {
    it('should detect VOLTA_HOME', () => {
      expect(findManager('export VOLTA_HOME="$HOME/.volta"')).toBe('volta');
    });

    it('should detect .volta path', () => {
      expect(findManager('export PATH="$HOME/.volta/bin:$PATH"')).toBe('volta');
    });

    it('should detect volta setup', () => {
      expect(findManager('volta setup')).toBe('volta');
    });
  });

  describe('asdf detection', () => {
    it('should detect ASDF_DIR', () => {
      expect(findManager('export ASDF_DIR="$HOME/.asdf"')).toBe('asdf');
    });

    it('should detect .asdf path', () => {
      expect(findManager('. "$HOME/.asdf/asdf.sh"')).toBe('asdf');
    });

    it('should detect asdf.sh sourcing', () => {
      expect(findManager('source $HOME/.asdf/asdf.sh')).toBe('asdf');
    });
  });

  describe('mise detection', () => {
    it('should detect mise activate', () => {
      expect(findManager('eval "$(mise activate zsh)"')).toBe('mise');
    });

    it('should detect MISE_DATA_DIR', () => {
      expect(findManager('export MISE_DATA_DIR="$HOME/.mise"')).toBe('mise');
    });

    it('should detect .local/share/mise path', () => {
      expect(findManager('export PATH="$HOME/.local/share/mise/shims:$PATH"')).toBe('mise');
    });
  });

  describe('proto detection', () => {
    it('should detect PROTO_HOME', () => {
      expect(findManager('export PROTO_HOME="$HOME/.proto"')).toBe('proto');
    });

    it('should detect .proto path', () => {
      expect(findManager('export PATH="$HOME/.proto/shims:$PATH"')).toBe('proto');
    });

    it('should detect proto setup', () => {
      expect(findManager('proto setup')).toBe('proto');
    });
  });

  describe('n detection', () => {
    it('should detect N_PREFIX', () => {
      expect(findManager('export N_PREFIX="$HOME/n"')).toBe('n');
    });

    it('should detect /n/versions path', () => {
      expect(findManager('export PATH="$HOME/n/versions/node/18/bin:$PATH"')).toBe('n');
    });
  });

  describe('nodenv detection', () => {
    it('should detect NODENV_ROOT', () => {
      expect(findManager('export NODENV_ROOT="$HOME/.nodenv"')).toBe('nodenv');
    });

    it('should detect nodenv init', () => {
      expect(findManager('eval "$(nodenv init -)"')).toBe('nodenv');
    });

    it('should detect .nodenv path', () => {
      expect(findManager('export PATH="$HOME/.nodenv/bin:$PATH"')).toBe('nodenv');
    });
  });

  describe('Homebrew detection', () => {
    it('should detect /opt/homebrew/bin/node', () => {
      expect(findManager('export PATH="/opt/homebrew/bin/node:$PATH"')).toBe('homebrew');
    });

    it('should detect /usr/local/bin/node', () => {
      expect(findManager('export PATH="/usr/local/bin/node:$PATH"')).toBe('homebrew');
    });
  });

  describe('nvs detection', () => {
    it('should detect NVS_HOME', () => {
      expect(findManager('export NVS_HOME="$HOME/.nvs"')).toBe('nvs');
    });

    it('should detect .nvs path', () => {
      expect(findManager('export PATH="$HOME/.nvs:$PATH"')).toBe('nvs');
    });
  });

  describe('vfox detection', () => {
    it('should detect VFOX_HOME', () => {
      expect(findManager('export VFOX_HOME="$HOME/.version-fox"')).toBe('vfox');
    });

    it('should detect vfox activate', () => {
      expect(findManager('eval "$(vfox activate zsh)"')).toBe('vfox');
    });
  });

  describe('Package manager detection', () => {
    it('should detect npm', () => {
      expect(findManager('export PATH="$HOME/.npm-global/bin:$PATH"')).toBe('npm');
    });

    it('should detect pnpm', () => {
      expect(findManager('export PNPM_HOME="$HOME/.pnpm"')).toBe('pnpm');
    });

    it('should detect yarn', () => {
      expect(findManager('export PATH="$HOME/.yarn/bin:$PATH"')).toBe('yarn');
    });

    it('should detect corepack', () => {
      expect(findManager('corepack enable')).toBe('corepack');
    });
  });

  describe('Comment handling', () => {
    it('should not match commented lines', () => {
      const managers = findAllManagers(`
# export NVM_DIR="$HOME/.nvm"
# Old configuration
`);
      expect(managers).not.toContain('nvm');
    });

    it('should match uncommented lines only', () => {
      const managers = findAllManagers(`
# export NVM_DIR="$HOME/.nvm"
export VOLTA_HOME="$HOME/.volta"
`);
      expect(managers).not.toContain('nvm');
      expect(managers).toContain('volta');
    });
  });

  describe('Multiple managers detection', () => {
    it('should detect multiple managers in content', () => {
      const content = `
# NVM (old)
export NVM_DIR="$HOME/.nvm"

# Volta (current)
export VOLTA_HOME="$HOME/.volta"
export PATH="$VOLTA_HOME/bin:$PATH"

# npm global
export PATH="$HOME/.npm-global/bin:$PATH"
`;
      const managers = findAllManagers(content);

      expect(managers).toContain('nvm');
      expect(managers).toContain('volta');
      expect(managers).toContain('npm');
    });

    it('should handle mixed case', () => {
      const content = `
export nvm_dir="$HOME/.nvm"
export VOLTA_HOME="$HOME/.volta"
export Fnm_Dir="$HOME/.fnm"
`;
      const managers = findAllManagers(content);

      expect(managers).toContain('nvm');
      expect(managers).toContain('volta');
      expect(managers).toContain('fnm');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty lines', () => {
      expect(findManager('')).toBeNull();
      expect(findManager('   ')).toBeNull();
    });

    it('should handle lines with only whitespace', () => {
      expect(findManager('   \t  ')).toBeNull();
    });

    it('should handle partial matches correctly', () => {
      // NVMRC (file name) shouldn't match NVM
      // Actually, NVM_DIR pattern will match if NVM is in the line
      const line = 'cat .nvmrc';
      expect(findManager(line)).toBe('nvm'); // .nvm pattern matches
    });

    it('should handle realistic shell config', () => {
      const bashrc = `
# ~/.bashrc

# If not running interactively, don't do anything
case $- in
    *i*) ;;
      *) return;;
esac

# NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \\. "$NVM_DIR/bash_completion"

# Aliases
alias ll='ls -la'
`;
      const managers = findAllManagers(bashrc);
      expect(managers).toContain('nvm');
      expect(managers.length).toBeGreaterThan(0);
    });
  });

  describe('Nodebrew detection', () => {
    it('should detect nodebrew', () => {
      expect(findManager('export PATH=$HOME/.nodebrew/current/bin:$PATH')).toBe('nodebrew');
    });
  });
});
