# Architecture

> High-level architecture of **node-doctor** — an interactive CLI to scan, diagnose, and clean up Node.js installations.

---

## Bird's Eye View

**What**: Interactive TUI for detecting, managing, and diagnosing Node.js installations across 20+ version managers (nvm, fnm, Volta, asdf, mise, etc.)

**How**: TypeScript CLI built with `@inquirer/prompts` for interactivity. Uses a modular **detector plugin system** where each version manager is a self-contained detector module.

**Why**: Users often accumulate multiple Node.js installations from different version managers. This tool provides a single interface to discover them all, check for PATH conflicts, verify binary integrity, and reclaim disk space.

---

## Entry Points

| Entry | File | Description |
|-------|------|-------------|
| **CLI Main** | `src/index.ts:1` | Interactive menu loop, orchestrates features |
| **Detector System** | `src/detectors/index.ts:1` | Central entry for scanning all version managers |
| **Registry** | `src/detectors/core/registry.ts:1` | `DetectorRegistry` class manages all detectors |

**Start here**: Read `src/index.ts` to understand the menu loop, then explore `src/detectors/` for the plugin architecture.

---

## Code Map

### `/src`

**Purpose**: Root source containing CLI entry point and shared utilities

**Key files**:
- `index.ts:1` — Main CLI entry, menu loop, feature orchestration
- `utils.ts:1` — Platform detection, file ops (`dirExists`, `getDirSize`, `runCommand`)
- `colors.ts:1` — Terminal ANSI color utilities (`c()`, `bold()`, `dim()`)
- `spinner.ts:1` — Zero-dependency loading spinner class
- `prompts.ts:1` — Dynamic import wrapper for `@inquirer/prompts`
- `ui.ts:1` — Header, welcome screen, summary printing
- `shell-config.ts:1` — Shell config file detection (.zshrc, .bashrc, etc.)

**Invariants**: All modules use ES Module syntax (`import`/`export`). Platform-specific logic uses `os.platform()`.

---

### `/src/detectors`

**Purpose**: Modular detection system for Node.js version managers

**Key files**:
- `index.ts:1` — Public API: `scanAll()`, `getAllInstallations()`
- `core/registry.ts:1` — `DetectorRegistry` class (validator, scanner, aggregator)
- `core/helpers.ts:1` — Shared utilities: `discoverInstallations()`, `resolveBaseDir()`
- `managers/index.ts:1` — Exports all 21 detector modules

**Invariants**:
- Every detector must implement `DetectorConfig` interface
- Detectors are registered once via `defaultRegistry.registerAll()`
- Detectors must declare supported `platforms` array

**API Boundary**:
- **Public**: `scanAll()`, `getAllInstallations()`, `DetectorRegistry`
- **Internal**: Individual detector implementations in `managers/`

---

### `/src/detectors/managers`

**Purpose**: Individual version manager detector implementations

**Key files (21 detectors)**:
- `nvm.ts` — NVM (Node Version Manager) for macOS/Linux
- `nvm-windows.ts` — NVM for Windows
- `fnm.ts` — Fast Node Manager
- `volta.ts` — Volta
- `asdf.ts` — asdf version manager
- `n.ts` — tj/n
- `mise.ts` — mise (formerly rtx)
- `vfox.ts` — vfox
- `nodenv.ts` — nodenv
- `ndenv.ts` — ndenv
- `nvs.ts` — Node Version Switcher
- `nodist.ts` — Nodist (Windows)
- `nodebrew.ts` — nodebrew
- `nvmd.ts` — nvmd (Node Version Manager Desktop)
- `gnvm.ts` — gnvm (Windows)
- `snm.ts` — snm (Simple Node Manager)
- `tnvm.ts` — tnvm (Taobao Node Version Manager)
- `proto.ts` — proto
- `homebrew.ts` — Homebrew (macOS)
- `system.ts` — System-installed Node
- `path.ts` — Node found in PATH

**Invariants**:
- Each detector exports a `DetectorConfig` object
- Must use helpers from `core/helpers.ts` for consistency
- Must declare `platforms: Platform[]` for cross-platform support

---

### `/src/features`

**Purpose**: CLI feature implementations (each menu option)

**Key files**:
- `list.ts:1` — List all Node versions with integrity badges
- `doctor.ts:1` — Environment diagnostics, health assessment
- `disk.ts:1` — Disk usage visualization
- `project.ts:1` — Scan for `.nvmrc`, `.node-version`, `package.json` engines
- `globals.ts:1` — List global npm/yarn/pnpm packages
- `registry.ts:1` — NPM registry detection and connectivity
- `integrity.ts:1` — SHA256 verification against nodejs.org
- `path.ts:1` — PATH analysis and runner identification

**Invariants**:
- Features receive `ScanResults` and return updated results if changed
- Features own their own UI rendering (call `clearScreen()`, `printHeader()`)
- Features use `select()` from `prompts.ts` for user interaction

---

### `/src/types`

**Purpose**: TypeScript type definitions

**Key file**: `index.ts:1` — All interfaces and types

**Key types**:
- `Installation` — A single Node.js installation
- `DetectorConfig` — Interface for version manager detectors
- `DetectorResult` — Output from a detector's `detect()` function
- `ScanResults` — Map of detector name → DetectorResult
- `AggregatedInstallation` — Installation with detector metadata
- `HealthIssue` — Doctor health check issue

---

## System Boundaries & Layers

```
┌───────────────────────────────────────────────────────────┐
│                    CLI Layer (index.ts)                   │
│              Menu loop, user interaction                  │
└──────────────────────────┬────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
│   Features/     │ │  Detectors/ │ │   UI Utilities  │
│   (commands)    │ │  (plugins)  │ │  colors/spinner │
└────────┬────────┘ └──────┬──────┘ └─────────────────┘
         │                 │
         │    ┌────────────┴────────────┐
         │    │                         │
         ▼    ▼                         ▼
┌─────────────────────┐      ┌─────────────────────┐
│  DetectorRegistry   │      │   Core Helpers      │
│  (registration,     │      │  (discoverInstall-  │
│   scanning)         │      │   ations, etc.)     │
└─────────────────────┘      └─────────────────────┘
```

**Rules**:
- Features depend on Detectors (call `scanAll()`)
- Detectors are self-contained, don't import Features
- All modules may use `utils.ts`, `colors.ts`, `types/`

**Dependency Direction**: `CLI → Features → Detectors → Core Helpers`

---

## Key Abstractions & Types

### `DetectorConfig` (`src/types/index.ts`)
Interface every version manager detector must implement.

```typescript
interface DetectorConfig {
  name: string;           // 'nvm', 'fnm', etc.
  displayName: string;    // Human-readable name
  icon: string;           // Emoji icon
  platforms: Platform[];  // ['darwin', 'linux', 'win32']
  canDelete: boolean;     // Whether user can delete versions
  detect(): DetectorResult | null;
}
```
**Used by**: `DetectorRegistry`, all detector modules

---

### `DetectorRegistry` (`src/detectors/core/registry.ts:1`)
Central registry managing all version manager detectors.

**Key methods**:
- `register(detector)` — Add detector with validation
- `scanAll()` — Run all detectors for current platform
- `getAllInstallations(results)` — Aggregate all installations
- `validate(detector)` — Ensure detector has required fields

**Used by**: `src/detectors/index.ts`, Features

---

### `Installation` (`src/types/index.ts`)
Represents a single Node.js installation.

```typescript
interface Installation {
  version: string;        // '20.10.0'
  path: string;          // Full installation path
  executable: string;    // Path to node binary
  size: number;          // Bytes
  verified: string | null; // Output of node --version
  manager: string;       // 'nvm', 'fnm', etc.
}
```
**Used by**: All detectors, list feature, integrity feature

---

### `ScanResults` (`src/types/index.ts`)
Map of detector name to result.

```typescript
type ScanResults = Record<string, DetectorResult | null>;
```
**Used by**: All features, passed through menu loop

---

## Architectural Decisions

### Plugin-based Detector System
**Date**: Initial design | **Status**: Accepted

**Context**: Need to support 20+ version managers with different detection logic, paths, and platform support.

**Alternatives**:
- Monolithic detection function with switch cases
- Configuration-driven detection with JSON specs

**Decision**: Modular plugin architecture where each detector is a standalone module implementing `DetectorConfig`.

**Consequences**:
- ✅ Easy to add new detectors (create file, export config, add to array)
- ✅ Detectors are testable in isolation
- ✅ Platform-specific logic contained within each detector
- ❌ Some code duplication across similar detectors (mitigated by `core/helpers.ts`)

---

### Zero External UI Dependencies (except inquirer)
**Date**: Initial design | **Status**: Accepted

**Context**: CLI needs interactive prompts and visual feedback.

**Alternatives**:
- Use `ora` for spinners, `chalk` for colors, `blessed` for TUI
- Build everything from scratch

**Decision**: Minimal dependencies — only `@inquirer/prompts` for prompts, custom implementations for colors/spinner.

**Consequences**:
- ✅ Smaller bundle, faster install
- ✅ No dependency conflicts
- ✅ Full control over terminal output
- ❌ Custom spinner/colors less feature-rich than libraries

---

### ES Modules Only
**Date**: Initial design | **Status**: Accepted

**Context**: Package needs to work as CLI tool with modern Node.js.

**Decision**: Use ES Modules (`"type": "module"` in package.json), Vite for bundling.

**Consequences**:
- ✅ Modern syntax, better tree-shaking
- ✅ Top-level await available
- ❌ Requires Node.js >= 18
- ❌ Dynamic imports needed for `@inquirer/prompts` (see `prompts.ts`)

---

## Cross-Cutting Concerns

### Error Handling

**Strategy**: Graceful degradation with try/catch at boundaries

**Invariants**:
- Individual detector failures don't crash the whole scan (`src/detectors/core/registry.ts:scanAll`)
- Network errors (registry check) show user-friendly messages
- File system errors return `null` rather than throwing

**Examples**: `src/detectors/core/registry.ts:78` — detector errors logged and skipped

---

### Configuration

**Files**: None — zero-config CLI tool

**Env Vars Used**:
- `NVM_DIR`, `VOLTA_HOME`, `ASDF_DATA_DIR`, `N_PREFIX` — version manager paths
- `PATH` — for finding active Node
- Various `XDG_*` directories for cross-platform support

**Precedence**: Environment variable → Platform-specific default path

---

### Observability

**Logging**: Minimal — uses `console.log` for UI output, `console.error` for failures

**Debug**: No debug mode currently implemented

---

## Dependencies & Build

### Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@inquirer/prompts` | ^7.2.1 | Interactive CLI prompts (select, confirm) |
| `semver` | ^7.7.3 | Version comparison and parsing |

### Dev Dependencies

| Package | Purpose |
|---------|---------|
| `typescript` | Type checking |
| `vite` | Build/bundling |
| `eslint` | Linting |

### Build Commands

```bash
yarn install          # Install dependencies
yarn build            # Production build (Vite → out/node-doctor.js)
yarn start            # Run the CLI
yarn lint             # Run ESLint
yarn lint:fix         # Auto-fix lint errors
yarn typecheck        # TypeScript type checking
```

---

## Design Patterns & Constraints

### Patterns Used

| Pattern | Where | Why |
|---------|-------|-----|
| **Registry** | `DetectorRegistry` | Central management of detector plugins |
| **Strategy** | Each detector's `detect()` | Different detection algorithms per manager |
| **Factory Helpers** | `createExecutableGetter()` | Create reusable executable path resolvers |

### Anti-Patterns to Avoid

| Avoid | Why | Do Instead |
|-------|-----|------------|
| **Importing features into detectors** | Creates circular deps | Features call detectors, not vice versa |
| **Hardcoding paths** | Platform differences | Use `resolveBaseDir()` with env var fallbacks |
| **Throwing in detectors** | Breaks scan | Return `null` on failure |
| **Sync file operations in hot paths** | Blocks UI | Use async where performance matters |

### Constraints

**Technical**:
- Node.js >= 18.0.0 required (ES modules, modern APIs)
- Terminal must support ANSI colors
- TTY required for interactive prompts

**Platform**:
- macOS: Homebrew detection assumes `/opt/homebrew` or `/usr/local`
- Windows: Different path separators, executable names (`.exe`)
- Linux: XDG directory conventions

---

## Contributors Guide

### Adding a New Version Manager Detector

1. **Create file**: `src/detectors/managers/mymanager.ts`
2. **Implement**: Export a `DetectorConfig` object
3. **Register**: Add to `allDetectors` array in `managers/index.ts`

**Template**:

```typescript
import { discoverInstallations, createExecutableGetter, resolveBaseDir, createDetectorResult, HOME } from '../core/helpers.js';
import type { DetectorConfig, DetectorResult } from '../../types/index.js';

export const myManagerDetector: DetectorConfig = {
  name: 'mymanager',
  displayName: 'My Manager',
  icon: '🔹',
  platforms: ['darwin', 'linux'],  // or ['win32'] or all three
  canDelete: true,

  detect(): DetectorResult | null {
    const baseDir = resolveBaseDir('MY_MANAGER_DIR', `${HOME}/.mymanager`);
    const versionsDir = `${baseDir}/versions`;
    
    const installations = discoverInstallations(versionsDir, {
      executable: createExecutableGetter({ unix: 'bin/node' }),
      manager: 'mymanager',
    });

    return createDetectorResult({
      baseDir,
      versionsDir,
      installations,
      envVar: 'MY_MANAGER_DIR',
    });
  },
};
```

### Bug Fixes

1. **Locate**: Bugs typically in `src/features/` (UI) or `src/detectors/managers/` (detection)
2. **Fix**: Edit the relevant file
3. **Test**: `yarn build && yarn start`
4. **Verify**: `yarn lint && yarn typecheck`

### Navigation Tips

| To find... | Look in... |
|-----------|------------|
| Menu options | `src/index.ts:showMainMenu()` |
| Version manager detection | `src/detectors/managers/<name>.ts` |
| Health diagnostics | `src/features/doctor.ts:assessHealth()` |
| Type definitions | `src/types/index.ts` |
| Terminal colors | `src/colors.ts` |
| File/directory utilities | `src/utils.ts` |

