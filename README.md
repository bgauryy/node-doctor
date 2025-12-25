# Node Doctor

![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen) ![License MIT](https://img.shields.io/badge/license-MIT-blue) ![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey)

**Interactive CLI to diagnose and fix Node.js environment issues.**

Detects 20+ version managers, identifies PATH conflicts, cleans up zombie processes, and manages disk usage.

## Quick Start

```bash
npx node-doctor
```

## Commands

| Command | Aliases | Description |
|:--------|:--------|:------------|
| *(none)* | | Interactive menu with all features |
| `info` | `doctor` | Full environment diagnosis |
| `check` | `ci` | CI/CD health checks (exit 1 on failure) |
| `perf` | `performance` | CPU, memory, event loop analysis |
| `list` | `ls` | List all Node.js versions |
| `project` | `scan` | Project health (engines, lockfile, version files) |
| `globals` | `g` | Global packages (npm/yarn/pnpm) |
| `disk` | `du` | Disk usage by version manager |
| `cleanup` | `clean` | Delete node_modules and unused Node versions |
| `heal` | | Find Node.js processes using ports |
| `kill-port` | `kp` | Kill process on specific port |

**Tip:** Most commands support `--json` for machine-readable output.

## Examples

```bash
# Interactive mode
npx node-doctor

# Environment diagnosis
npx node-doctor info

# CI/CD pipeline check
npx node-doctor check --json

# Kill process on port 3000
npx node-doctor kp 3000

# Performance metrics
npx node-doctor perf --snapshot

# Cleanup wizard
npx node-doctor cleanup
```

## Health Checks

Runs **13 health checks** with `pass`, `warn`, or `fail` status:

| Category | Checks |
|:---------|:-------|
| **PATH** | Node in PATH, PATH shadowing, multiple managers |
| **Registry** | npm registry status, latency |
| **Security** | EOL status, known vulnerabilities |
| **Environment** | NODE_OPTIONS, port conflicts, npm prefix |
| **Project** | Version file conflicts, engines compliance, stale node_modules |
| **Build** | node-gyp readiness (Python, build tools) |
| **IDE** | VSCode integration issues |

## Supported Version Managers

nvm, nvm-windows, fnm, Volta, asdf, mise, n, nodenv, nvs, Homebrew, vfox, proto, nodebrew, nodist, nvmd, gnvm, snm, tnvm, ndenv, System

## CI/CD Integration

```yaml
# GitHub Actions
- name: Check Node.js Environment
  run: npx node-doctor check --json
```

Exit codes: `0` = pass, `1` = fail

## JSON Output

```bash
npx node-doctor info --json
```

Returns: `timestamp`, `overallStatus`, `exitCode`, `checks[]`, `summary`, `data`

## Performance Profiling

```bash
# 3-second sampling (default)
npx node-doctor perf

# Instant snapshot
npx node-doctor perf --snapshot

# Custom duration
npx node-doctor perf --duration 10000
```

| Metric | Warning | Critical |
|:-------|:--------|:---------|
| CPU | > 70% | > 90% |
| Memory (heap) | > 70% | > 85% |
| Event Loop Delay | > 50ms | > 100ms |

## License

MIT © [bgauryy](https://github.com/bgauryy)
