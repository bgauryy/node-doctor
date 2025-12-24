# Node Doctor

![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen) ![License MIT](https://img.shields.io/badge/license-MIT-blue) ![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey)

**Interactive CLI to scan, diagnose, and fix Node.js environment issues.**

Node Doctor unifies detection across 20+ version managers, identifies configuration conflicts, cleans up zombie processes, and manages disk usage. It is designed to be a zero-dependency, drop-in utility for any Node.js developer's toolkit.

---

## Features

*   **Deep Diagnosis**: Detects shadowed binaries, PATH conflicts, and misconfigured shell scripts (`.zshrc`, `.bashrc`, etc.).
*   **Process Management**: Instantly find and kill "zombie" Node.js processes blocking ports.
*   **Universal Detection**: Works with 20+ version managers including `nvm`, `fnm`, `volta`, `asdf`, `mise`, `brew`, and system installs.
*   **Security Audit**: Identifies End-of-Life (EOL) Node versions and verifies binary integrity against official checksums.
*   **Disk Cleanup**: Visualizes disk usage per version and allows immediate removal of unused versions.
*   **CI/CD Ready**: specialized `check` mode for automated pipelines with JSON output.

## Quick Start

No installation is required. Run directly via `npx`:

```bash
# Start the interactive dashboard
npx node-doctor
```

## Usage

### Interactive Mode
Running without arguments launches the interactive dashboard, allowing you to browse versions, view disk usage, and run diagnostics via a menu interface.

```bash
npx node-doctor
```

### CLI Commands

For scripting or direct access, use the subcommands:

| Command | Aliases | Description |
|:---|:---|:---|
| `info` | `doctor`, `doc`, `dr` | Run full system diagnosis (PATH, Shell, Registry, Security). |
| `heal` | | Find Node.js processes using ports (use `--yes` to kill all). |
| `kill-port <port>` | `kp` | Kill the process listening on a specific port. |
| `list` | `ls` | List all detected Node.js versions and their disk usage. |
| `project` | `scan`, `health` | Run project health check (version files, engines, lockfile). |
| `globals` | `g` | List global packages installed via npm, yarn, or pnpm. |
| `disk` | `du` | Show disk usage summary by version manager. |
| `check` | `ci` | Run non-interactive health checks (exit code 1 on failure). |

> **Tip:** Most commands support `--json` for machine-readable output.

### Examples

**Check environment health:**
```bash
npx node-doctor info
```

**Kill a process blocking port 3000:**
```bash
npx node-doctor kp 3000
```

**Run in CI to verify environment health:**
```bash
npx node-doctor check --json
```

---

## Health Checks

Node Doctor runs **23 comprehensive health checks** across multiple categories. Each check returns `pass`, `warn`, or `fail` status with actionable hints.

### Core Checks

| Check | ID | Description |
|:------|:---|:------------|
| **Node.js in PATH** | `node-in-path` | Verifies Node.js is accessible in your system PATH. Fails if no Node.js is found, which means you can't run `node` commands. |
| **PATH Shadowing** | `path-shadowing` | Detects when multiple Node.js installations exist in PATH. The first one "shadows" others, which can cause confusion when you think you're using one version but another runs. Common when mixing nvm with Homebrew. |
| **Multiple Managers** | `multiple-managers` | Warns when more than one version manager is active in PATH (e.g., both nvm and fnm). This often leads to conflicts where managers fight over which Node.js runs. |
| **Duplicate Versions** | `duplicate-versions` | Finds the same Node.js version installed across multiple managers. For example, v20.10.0 in both nvm and Homebrew wastes disk space and causes confusion. |

### Registry Checks

| Check | ID | Description |
|:------|:---|:------------|
| **NPM Registry Status** | `registry-status` | Tests connectivity to your configured npm registry. Fails if unreachable (network issues, VPN required, or registry is down). |
| **Registry Latency** | `registry-latency` | Warns if registry response time exceeds 2000ms. High latency slows down all npm operations. Consider using a closer mirror or caching proxy. |

### Security Checks

| Check | ID | Description |
|:------|:---|:------------|
| **Node.js EOL Status** | `node-eol` | Checks if your Node.js version is End-of-Life (EOL) or in Maintenance mode. EOL versions no longer receive security patches—upgrade immediately! Uses the official Node.js release schedule. |
| **Node.js Security** | `node-security` | Compares your Node.js version against known security releases. Warns if a newer security patch is available for your major version. |

### Environment Checks

| Check | ID | Description |
|:------|:---|:------------|
| **NODE_OPTIONS** | `env-node-options` | Warns if `NODE_OPTIONS` environment variable is set. While useful, it affects ALL Node.js processes and can cause unexpected behavior (memory limits, experimental flags, etc.). |
| **Port Conflicts** | `port-conflicts` | Finds Node.js processes currently listening on network ports. Helpful when you get "EADDRINUSE" errors—shows exactly which process is blocking which port. |

### Global Packages Checks

| Check | ID | Description |
|:------|:---|:------------|
| **Global Package Duplicates** | `global-duplicates` | Detects packages installed globally in multiple package managers (npm, yarn, pnpm). For example, `typescript` in both npm and yarn globals causes version confusion. |
| **Permission Issues** | `permission-issues` | Checks if npm global and cache directories are writable. Non-writable directories cause `npm install -g` failures. Common issue when npm was installed with sudo. |

### Corepack Check

| Check | ID | Description |
|:------|:---|:------------|
| **Corepack Status** | `corepack-status` | Detects `packageManager` field in package.json but corepack not enabled. Corepack manages package manager versions—run `corepack enable` to use the project's specified version. |

### Extended Environment Checks

These checks detect common issues that plague Node.js developers working with version managers:

| Check | ID | Description |
|:------|:---|:------------|
| **npm Prefix Mismatch** | `npm-prefix-mismatch` | Detects when `npm config get prefix` doesn't match your active version manager. This causes global packages to install to the wrong location (e.g., installing with nvm but npm writes to system location). Fix by running `npm config delete prefix` or reinstalling npm. |
| **Shell Startup Slowness** | `shell-startup-slow` | Identifies slow patterns in shell config files (`.zshrc`, `.bashrc`). nvm's default initialization adds 200-500ms to shell startup. Suggests lazy loading or switching to faster alternatives like fnm. |
| **Version File Conflict** | `version-file-conflict` | Detects conflicts between `.nvmrc`, `.node-version`, `.tool-versions`, and `package.json` engines. Having different versions in these files confuses team members and CI systems. |
| **engines Compliance** | `engines-mismatch` | Validates your current Node.js and npm versions against `package.json` engines field. Fails if you're using an incompatible version—prevents "works on my machine" issues. |
| **node-gyp Readiness** | `node-gyp-readiness` | Checks if your system can compile native Node.js modules. Verifies Python is installed and (on Windows) Visual Studio Build Tools. Without these, `npm install` fails on packages like `node-sass`, `bcrypt`, or `sharp`. |
| **npm Cache Health** | `npm-cache-health` | Verifies npm cache integrity and size. Corrupted cache causes mysterious install failures. Large cache (>5GB) may indicate orphaned entries. Run `npm cache clean --force` to fix. |
| **Global npm Location** | `global-npm-location` | Ensures `npm root -g` matches your version manager's expected location. Mismatches mean global packages might not be found or installed in wrong places. |
| **Symlink Health** | `symlink-health` | **Windows only.** Checks if symbolic links work properly. Many version managers use symlinks; without admin rights or Developer Mode, they fall back to junctions which can cause issues. |
| **Stale node_modules** | `stale-node-modules` | Detects when `node_modules` was installed with a different Node.js major version. Native modules compiled for Node 18 may crash on Node 20. Run `npm rebuild` after switching versions. |
| **IDE Integration** | `ide-integration` | Validates VSCode settings for Node.js compatibility. Checks `terminal.integrated.inheritEnv` (should be true for nvm/fnm), `eslint.nodePath`, and warns about hardcoded Node.js paths. |

---

## Output Example

```
  ✓ Node.js in PATH: Node.js v20.10.0 via nvm
  ✓ Version Managers: Using nvm
  ✓ NPM Registry: Registry OK (52ms)
  ✓ Node.js EOL Status: Node.js v20.10.0 is actively supported
  ✓ Node.js Security: No known security vulnerabilities
  ✓ Port Conflicts: No Node.js processes blocking ports
  ✓ npm Prefix: npm prefix matches version manager
  ✓ Shell Startup: No slow startup patterns detected
  ✓ Version Files: 2 version file(s) in sync
  ✓ engines Compliance: Node v20.10.0 satisfies required >=18.0.0
  ✓ node-gyp Readiness: Build tools available for native modules
  ✓ npm Cache: Cache healthy (2103 MB)
  ✓ node_modules Freshness: node_modules appears compatible
```

---

## Supported Version Managers

Node Doctor automatically detects and interacts with 20+ version managers:

| | | | |
|---|---|---|---|
| nvm | nvm-windows | fnm | Volta |
| asdf | mise | n | nodenv |
| nvs | Homebrew | vfox | proto |
| nodebrew | nodist | nvmd | gnvm |
| snm | tnvm | ndenv | System |

---

## CI/CD Integration

Use the `check` command in CI pipelines to catch environment issues early:

```yaml
# GitHub Actions example
- name: Check Node.js Environment
  run: npx node-doctor check --json
```

Exit codes:
- `0` - All checks passed
- `1` - One or more checks failed

---

## JSON Output

All commands support `--json` for programmatic access:

```bash
npx node-doctor info --json
```

Output includes:
- `timestamp` - ISO timestamp of the check
- `overallStatus` - `pass`, `warn`, or `fail`
- `exitCode` - 0 for success, 1 for failure
- `checks` - Array of individual check results
- `summary` - Count of passed, warnings, and failed
- `data` - Raw diagnostic data (system info, managers, registry, etc.)

---

## License

MIT © [Octocode](https://octocode.ai)
