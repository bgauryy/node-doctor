# 📋 Node Doctor - Development Tasks & Roadmap

Focus: Maximize user impact by solving immediate pain points (zombie processes, disk space, CI automation).

## 🔥 High Priority / Immediate Value
*Solves daily frustrations and cleans up environment clutter.*

- [x] **1. The "Port Exorcist" (Zombie Process Killer)** ✅
    - **Goal:** Kill processes blocking ports (e.g., `EADDRINUSE: 3000`) without `lsof/kill -9`.
    - **Command:** `node-doctor kill-port <port>` or `node-doctor heal` (auto-detect).
    - **Value:** Saves 3-4 terminal commands; instant frustration relief.
    - **Implementation:** `src/features/port-exorcist.ts`, `src/cli/commands.ts`.
    - **Status:** Complete. Dynamically detects all Node.js processes using ports.

- [ ] **2. Cleanup Wizard**
    - **Goal:** Free up disk space and remove clutter.
    - **Features:**
        - Identify unused Node versions (not matching any project).
        - Find orphaned global packages (installed for deleted versions).
        - Detect duplicates across managers (e.g., v20 in `nvm` AND `fnm`).
        - Batch delete with confirmation.
    - **Value:** 🔥🔥🔥 High. Users have GBs of waste.
    - **Implementation:** `src/features/cleanup.ts`.

## 🛠️ High Value / Automation
*Enables usage in pipelines and ensures security.*

- [x] **3. Headless / CI Mode** ✅
    - **Goal:** Run checks in CI/CD without user interaction.
    - **Features:**
        - Flags: `--json`, `--check`.
        - Exit code 1 if issues found.
        - JSON output for parsing.
    - **Value:** Essential for enterprise/team adoption.
    - **Implementation:** `src/features/ci-check.ts`, `src/cli/commands.ts`.
    - **Commands:** `node-doctor check`, `node-doctor --check --json`.

- [ ] **4. Security Audit**
    - **Goal:** Identify risks in the environment.
    - **Features:**
        - Check installed versions against CVE database.
        - Flag EOL (End of Life) versions.
        - Suggest secure upgrade paths.
    - **Value:** 🔥🔥🔥 High. Security compliance.
    - **Implementation:** `src/features/security.ts`.

## 🧩 Workflow & Compatibility
*Consistency across teams and projects.*

- [ ] **5. Per-Project Compatibility Advisor**
    - **Goal:** Stop "Works on my machine".
    - **Features:**
        - Compare active Node version vs project (`engines`, `.nvmrc`).
        - Warn on mismatch.
        - Suggest: "Switch to v20 via fnm".
    - **Implementation:** `src/features/compatibility.ts` or extend `project.ts`.

- [ ] **6. Version Manager Migration Assistant**
    - **Goal:** Help users switch tools (e.g., `nvm` -> `fnm`).
    - **Features:**
        - Detect source/target managers.
        - Generate migration plan/script.
        - Transfer global packages.
    - **Value:** Reduces fear of breaking env when switching tools.
    - **Implementation:** `src/features/migration.ts`.

---

## 🎨 UX/UI Design

### Interactive Menu
*Keep it clean, focused on actions.*

```
  📋 List all Node versions      View versions with integrity status
  🏥 Doctor                      Diagnose environment, PATH, registry
  💀 Kill Port Process           Find & kill zombies on ports         ✅ DONE
  🧹 Cleanup Wizard              Free disk space (unused versions)    <-- TODO
  📄 Scan project version files  Find .nvmrc, .node-version files
  📦 List global packages        Show npm/yarn/pnpm globals
  📊 Show disk usage             View space per version manager
  🔄 Refresh scan                Re-scan for installations
  ─────────────────────────────────────────────────────────────
  🚪 Exit                        Quit the application
```

### Command Line Interface (CLI)
*Direct commands for power users and scripts.*

**1. Port Killing** ✅ (Implemented)
```bash
# Find all Node.js processes using ports
node-doctor heal

# Auto-kill all (for CI/scripts)
node-doctor heal --yes

# Kill specific port immediately
node-doctor kill-port 3000

# Force kill
node-doctor kill-port 3000 --force
```

**2. Cleanup**
```bash
# Start interactive wizard
node-doctor cleanup

# CI/Script mode (dry run by default)
node-doctor cleanup --yes
```

**3. CI / Headless** ✅ (Implemented)
```bash
# Check environment health (exit 1 on error)
node-doctor check

# Output results as JSON
node-doctor check --json

# Alternative global flag syntax
node-doctor --check --json
```

---

## 💡 Future Ideas / Backlog

- [ ] **Monorepo / Workspace Scanner**
    - Group requirements by workspace packages.
- [ ] **Environment Snapshot & Restore**
    - Share team configs via JSON/YAML.
- [ ] **LTS Tracker**
    - Visualize LTS schedule and EOL dates.
- [ ] **Performance Comparison**
    - Benchmark startup times of different managers.
- [ ] **Global Package Sync**
    - Keep globals in sync across versions.

---

## 🏗️ Architecture Notes

- **Modular Detector System:** `src/detectors/managers/` (Easy to add new managers)
- **Feature Isolation:** `src/features/` (Keep new logic self-contained)
- **Strong Types:** `src/types/index.ts`

**Recommended New Files:**
- `src/features/port-exorcist.ts` ✅ (Done)
- `src/features/ci-check.ts` ✅ (Done)
- `src/features/cleanup.ts`
- `src/features/security.ts`
- `src/features/compatibility.ts`
- `src/features/migration.ts`

---

## ✅ Completed Features

| Feature | Command | Status |
|---------|---------|--------|
| Port Exorcist | `node-doctor heal`, `kill-port` | ✅ Done |
| CI/Headless Mode | `node-doctor check --json` | ✅ Done |
