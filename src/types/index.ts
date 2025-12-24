/**
 * Core Type Definitions for Node Doctor
 */

// ─────────────────────────────────────────────────────────────
// Installation Types
// ─────────────────────────────────────────────────────────────

/**
 * Represents a single Node.js installation
 */
export interface Installation {
  /** Node version number (without 'v' prefix) */
  version: string;
  /** Full path to installation directory */
  path: string;
  /** Path to node executable */
  executable: string;
  /** Disk size in bytes */
  size: number;
  /** Output of `node --version` if executable works */
  verified: string | null;
  /** Manager name ('nvm', 'fnm', 'volta', etc.) */
  manager: string;
  /** Architecture (x64, arm64) if detected */
  arch?: string;
  /** Formula name for Homebrew */
  formula?: string;
  /** Real path if symlink */
  realPath?: string | null;
}

/**
 * Installation with aggregated detector metadata
 */
export interface AggregatedInstallation extends Installation {
  detectorName: string;
  detectorDisplayName: string;
  detectorIcon: string;
  canDelete: boolean;
}

// ─────────────────────────────────────────────────────────────
// Detector Types
// ─────────────────────────────────────────────────────────────

/**
 * Result returned by a detector's detect() function
 */
export interface DetectorResult {
  /** Base directory for this manager */
  baseDir: string;
  /** Subdirectory containing versions */
  versionsDir?: string;
  /** Array of detected installations */
  installations: Installation[];
  /** Default/alias version if set */
  defaultVersion?: string | null;
  /** Environment variable name */
  envVar?: string;
  /** Whether env var is currently set */
  envVarSet?: boolean;
  /** Extra properties for specific detectors */
  [key: string]: unknown;
}

/** Supported platform identifiers */
export type Platform = 'darwin' | 'linux' | 'win32';

/**
 * Configuration for a version manager detector
 */
export interface DetectorConfig {
  /** Unique identifier ('nvm', 'fnm', 'volta', etc.) */
  name: string;
  /** Human-readable name */
  displayName: string;
  /** Emoji icon */
  icon: string;
  /** Supported platforms */
  platforms: Platform[];
  /** Whether user can delete versions */
  canDelete: boolean;
  /** Detection function */
  detect(): DetectorResult | null;
}

/**
 * Results from scanAll() - maps detector name to result
 */
export type ScanResults = Record<string, DetectorResult | null>;

// ─────────────────────────────────────────────────────────────
// Registry Types
// ─────────────────────────────────────────────────────────────

/**
 * Registry connectivity status
 */
export interface RegistryStatus {
  /** Whether registry is reachable */
  available: boolean;
  /** Response time in ms */
  latency: number;
  /** HTTP status code (0 on error) */
  status: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Parsed npmrc/yarnrc configuration
 */
export interface NpmrcConfig {
  /** Global registry URL */
  registry: string | null;
  /** Scoped registries (@scope -> URL) */
  scopes: Record<string, string>;
}

/** Registry source configuration */
export interface RegistrySourceConfig {
  registry: string;
  source: RegistrySource;
  path: string | null;
}

/** Scoped registry configuration */
export interface ScopedRegistry {
  registry: string;
  source: RegistrySource;
  path: string;
}

/** Config file info */
export interface ConfigFileInfo {
  type: string;
  path: string;
  exists: boolean;
}

/**
 * Complete registry detection result
 */
export interface RegistryInfo {
  /** Global registry config */
  global: RegistrySourceConfig;
  /** Local override */
  local: RegistrySourceConfig | null;
  /** Scoped registries */
  scopes: Record<string, ScopedRegistry>;
  /** Found config files */
  configFiles: ConfigFileInfo[];
}

// ─────────────────────────────────────────────────────────────
// Package Manager Info Types
// ─────────────────────────────────────────────────────────────

/** Cache/store info */
export interface CacheInfo {
  path: string | null;
  size: number;
}

/** Package manager info */
export interface PackageManagerInfo {
  npm: {
    version: string | null;
    cache: CacheInfo;
    registry: string | null;
  };
  yarn: {
    version: string | null;
    cache: CacheInfo;
    registry: string | null;
    registrySource: string;
  };
  pnpm: {
    version: string | null;
    store: CacheInfo;
    registry: string | null;
    registrySource: string;
  };
  npx: {
    cache: CacheInfo;
  };
}

// ─────────────────────────────────────────────────────────────
// Integrity Types
// ─────────────────────────────────────────────────────────────

/** Integrity check status */
export type IntegrityStatus = 'ok' | 'mismatch' | 'error' | 'skipped' | 'not-found';

/**
 * Result of integrity check
 */
export interface IntegrityCheckResult {
  /** Check result */
  status: IntegrityStatus;
  /** Error message if status === 'error' */
  error?: string;
  /** Computed hash if available */
  hash?: string;
  /** Expected hash from nodejs.org */
  expectedHash?: string;
  /** Match type */
  matchType?: 'binary' | 'tarball' | 'unknown';
}

// ─────────────────────────────────────────────────────────────
// Health Assessment Types
// ─────────────────────────────────────────────────────────────

/** Health status levels */
export type HealthLevel = 'good' | 'warning' | 'critical';

/**
 * A health issue detected by the doctor
 */
export interface HealthIssue {
  /** Severity level */
  level: HealthLevel;
  /** Which section this issue belongs to */
  section: string;
  /** Description of the issue */
  message: string;
  /** Actionable suggestion to fix */
  hint: string;
}

/**
 * Health assessment banner info
 */
export interface HealthBanner {
  /** Overall health level */
  health: HealthLevel;
  /** Emoji indicator */
  icon: string;
  /** Formatted status text */
  text: string;
  /** Color name for styling */
  color: string;
}

/**
 * Health summary
 */
export interface HealthSummary {
  health: HealthLevel;
  criticalCount: number;
  warningCount: number;
}

// ─────────────────────────────────────────────────────────────
// Shell Config Types
// ─────────────────────────────────────────────────────────────

/**
 * Shell configuration file info
 */
export interface ShellConfigFile {
  /** File name */
  name: string;
  /** Full path */
  path: string;
  /** Whether file exists */
  exists: boolean;
  /** Shell type (bash, zsh, fish, powershell) */
  shell: string;
}

/**
 * Node-related entry found in shell config (raw from file scanning)
 */
export interface NodeConfigEntryRaw {
  /** Config file name */
  file: string;
  /** Line number */
  line: number;
  /** Line content */
  content: string;
  /** Detected manager name */
  manager: string;
  /** Full path to the file */
  path: string;
}

/**
 * Node-related entry found in shell config (aggregated for display)
 */
export interface NodeConfigEntry {
  /** Config file name */
  name: string;
  /** Full path to the file */
  path: string;
  /** Detected managers (array) */
  managers: string[];
}

/**
 * Result of shell config detection
 */
export interface ShellConfigResult {
  /** All config files found */
  found: ShellConfigFile[];
  /** Node-related entries (raw format) */
  nodeRelated: NodeConfigEntryRaw[];
  /** Summary stats */
  summary: {
    total: number;
    withNodeConfig: number;
  };
}

// ─────────────────────────────────────────────────────────────
// Global Packages Types
// ─────────────────────────────────────────────────────────────

/**
 * Global package info
 */
export interface GlobalPackage {
  /** Package name */
  name: string;
  /** Installed version */
  version: string;
  /** Package manager (npm, yarn, pnpm) */
  manager: string;
  /** Installation path */
  path?: string;
  /** Disk size in bytes */
  size?: number;
}

/**
 * Global packages by manager
 */
export interface GlobalPackagesResult {
  /** npm global packages */
  npm: GlobalPackage[];
  /** yarn global packages */
  yarn: GlobalPackage[];
  /** pnpm global packages */
  pnpm: GlobalPackage[];
}

// ─────────────────────────────────────────────────────────────
// UI Types
// ─────────────────────────────────────────────────────────────

/**
 * Runner identification result
 */
export interface RunnerInfo {
  /** Manager name or 'system' or 'unknown' */
  name: string;
  /** Emoji icon */
  icon: string;
}

/**
 * Node found in PATH
 */
export interface PathNode {
  /** Full path to node executable */
  executable: string;
  /** Resolved symlink target (if different) */
  realPath: string;
  /** Which manager owns this */
  runner: RunnerInfo;
  /** Node version */
  version: string;
  /** Whether this is the active node */
  isCurrent: boolean;
}

/**
 * Manager summary for display
 */
export interface ManagerSummary {
  /** Manager identifier */
  name: string;
  /** Human-readable name */
  displayName: string;
  /** Emoji icon */
  icon: string;
  /** Installation directory */
  baseDir: string;
  /** Number of installed versions */
  versionCount: number;
  /** Total disk usage in bytes */
  totalSize: number;
  /** Environment variable name */
  envVar?: string;
  /** Whether env var is set */
  envVarSet?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Doctor Data Types
// ─────────────────────────────────────────────────────────────

/**
 * Complete doctor data aggregation
 */
export interface DoctorData {
  // System info
  platform: string;
  arch: string;
  shell: string;
  nodeVersion: string;
  execPath: string;

  // Managers
  allManagers: ManagerSummary[];
  managersInPath: Set<string>;

  // PATH analysis
  foundNodes: PathNode[];

  // Shell configs
  shellResults: ShellConfigResult;

  // Registry
  registryInfo: RegistryInfo;
  registryStatus: RegistryStatus;

  // Global packages
  globalPkgs: GlobalPackage[];
  globalPkgsData: GlobalPackagesResult;

  // Health
  healthIssues: HealthIssue[];
  healthSummary: HealthSummary;
}

// ─────────────────────────────────────────────────────────────
// Color Types
// ─────────────────────────────────────────────────────────────

/** Available color names */
export type ColorName =
  | 'reset'
  | 'bright'
  | 'dim'
  | 'underscore'
  | 'blink'
  | 'reverse'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'bgRed'
  | 'bgGreen'
  | 'bgYellow'
  | 'bgBlue'
  | 'bgMagenta';

// ─────────────────────────────────────────────────────────────
// Additional Doctor Types
// ─────────────────────────────────────────────────────────────

/**
 * Registry status result from connectivity check
 */
export interface RegistryStatusResult {
  available: boolean;
  latency: number;
  status: number;
  error?: string;
}

/**
 * Registry source identifier
 */
export type RegistrySource =
  | 'default'
  | 'environment'
  | 'project-npmrc'
  | 'user-npmrc'
  | 'global-npmrc'
  | 'project-yarnrc'
  | 'user-yarnrc'
  | 'project-yarnrc-yml';

/**
 * Found Node in PATH during doctor scan
 */
export interface EOLStatus {
  status: 'active' | 'maintenance' | 'eol' | 'unknown';
  eolDate?: string;
  maintenanceDate?: string;
  isLTS?: boolean;
}

export interface SecurityStatus {
  vulnerable: boolean;
  latestSecurityRelease?: string;
  details?: string;
}

export interface FoundNode {
  executable: string;
  realPath: string;
  runner: RunnerInfo;
  version: string;
  isCurrent: boolean;
  eol?: EOLStatus;
  security?: SecurityStatus;
}

/**
 * Individual version info within a manager
 */
export interface DetectedVersion {
  version: string;
  path: string;
  size: number;
}

/**
 * Detected manager summary
 */
export interface DetectedManager {
  name: string;
  displayName: string;
  icon: string;
  baseDir: string;
  versionCount: number;
  totalSize: number;
  envVar?: string;
  envVarSet?: boolean;
  /** Individual installations with version and path */
  installations: DetectedVersion[];
}

// ─────────────────────────────────────────────────────────────
// Integrity Result Types
// ─────────────────────────────────────────────────────────────

/**
 * Integrity check result
 */
export interface IntegrityResult {
  status: 'ok' | 'mismatch' | 'archive' | 'error';
  localHash?: string;
  expectedHash?: string | null;
  matchType?: 'binary' | 'archive' | 'unknown';
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// Project Version File Types
// ─────────────────────────────────────────────────────────────

/**
 * Version file info
 */
export interface VersionFileInfo {
  file: string;
  version: string;
  path: string;
}

/**
 * Version file parser definition
 */
export interface VersionFileParser {
  name: string;
  parser: (content: string) => string | null;
}

// ─────────────────────────────────────────────────────────────
// UI Suggestion Types
// ─────────────────────────────────────────────────────────────

/**
 * Action suggestion
 */
export interface ActionSuggestion {
  action: string;
  benefit?: string;
  priority: number;
}

// ─────────────────────────────────────────────────────────────
// Unified Health Engine Types
// ─────────────────────────────────────────────────────────────

/**
 * Health check categories for grouping
 */
export type HealthCheckCategory =
  | 'path'
  | 'managers'
  | 'registry'
  | 'security'
  | 'ports'
  | 'environment'
  | 'globals'
  | 'permissions'
  | 'corepack'
  | 'disk'
  | 'configuration'
  | 'shell'
  | 'project'
  | 'build'
  | 'ide';

/**
 * Health check identifiers
 */
export type HealthCheckId =
  | 'node-in-path'
  | 'path-shadowing'
  | 'multiple-managers'
  | 'registry-status'
  | 'registry-latency'
  | 'node-eol'
  | 'node-security'
  | 'port-conflicts'
  | 'duplicate-versions'
  | 'env-node-options'
  | 'global-duplicates'
  | 'permission-issues'
  | 'corepack-status'
  // New environment checks
  | 'npm-prefix-mismatch'
  | 'shell-startup-slow'
  | 'version-file-conflict'
  | 'engines-mismatch'
  | 'node-gyp-readiness'
  | 'npm-cache-health'
  | 'global-npm-location'
  | 'symlink-health'
  | 'stale-node-modules'
  | 'ide-integration';

/**
 * Health check status (unified)
 */
export type HealthCheckStatus = 'pass' | 'warn' | 'fail';

/**
 * Unified health check item
 * Used by both interactive Doctor and CLI commands
 */
export interface HealthCheck {
  /** Unique check identifier */
  id: HealthCheckId;
  /** Human-readable name */
  name: string;
  /** Category for grouping */
  category: HealthCheckCategory;
  /** Check result */
  status: HealthCheckStatus;
  /** Description of result */
  message: string;
  /** Actionable suggestion (for warnings/failures) */
  hint?: string;
  /** Extra context for JSON output */
  details?: string;
}

/**
 * Complete health data collection
 * Single source of all diagnostic data
 */
/** Duplicate version info */
export interface DuplicateVersion {
  version: string;
  managers: string[];
  totalSize: number;
}

export interface HealthData {
  /** System information */
  system: {
    platform: string;
    arch: string;
    shell: string;
    nodeVersion: string;
    npmVersion: string | null;
    mnpmVersion: string | null;
    execPath: string;
  };

  /** Node executables found in PATH */
  nodesInPath: FoundNode[];

  /** All detected version managers */
  managers: DetectedManager[];

  /** Managers currently active in PATH */
  activeManagers: string[];

  /** NPM registry configuration and status */
  registry: {
    info: RegistryInfo;
    status: RegistryStatusResult;
  };

  /** Security assessment */
  security: {
    eol: EOLStatus | null;
    vulnerabilities: SecurityStatus | null;
    tokens: EnvVarInfo[];
  };

  /** Node.js processes using ports */
  portProcesses: CIPortProcess[];

  /** Shell config files with Node.js entries (for interactive display) */
  shellConfigs: NodeConfigEntry[];

  /** All detected shell config files (for informational display) */
  allShellConfigs: ShellConfigFile[];

  /** Package managers info (npm, yarn, pnpm) */
  packageManagers: PackageManagerInfo;

  /** Duplicate versions across managers */
  duplicateVersions: DuplicateVersion[];

  /** Environment variables (new) */
  environmentVars: EnvVarInfo[];

  /** Global packages summary (new) */
  globalPackages: GlobalPackagesSummary;

  /** Permission checks (new) */
  permissions: PermissionCheck[];

  /** Corepack status (new) */
  corepack: CorepackInfo;

  /** Extended environment checks */
  extendedChecks: ExtendedHealthChecks;
}

/**
 * Complete health assessment result
 */
export interface HealthAssessment {
  /** ISO timestamp of assessment */
  timestamp: string;
  /** Overall result: pass/warn/fail */
  overallStatus: HealthCheckStatus;
  /** Exit code for CLI (0 = pass, 1 = fail) */
  exitCode: number;
  /** Individual check results */
  checks: HealthCheck[];
  /** Summary counts */
  summary: {
    total: number;
    passed: number;
    warnings: number;
    failed: number;
  };
  /** Raw collected data */
  data: HealthData;
}

// ─────────────────────────────────────────────────────────────
// CI Check Types (legacy - use HealthCheck* types for new code)
// ─────────────────────────────────────────────────────────────

/**
 * CI check severity level
 * @deprecated Use HealthCheckStatus instead
 */
export type CICheckLevel = 'pass' | 'warn' | 'fail';

/**
 * Individual check result
 */
export interface CICheckItem {
  /** Check identifier */
  id: string;
  /** Check name */
  name: string;
  /** Check result level */
  level: CICheckLevel;
  /** Description of what was checked */
  message: string;
  /** Additional details */
  details?: string;
}

/**
 * System information for CI output
 */
export interface CISystemInfo {
  platform: string;
  arch: string;
  nodeVersion: string;
  npmVersion: string | null;
  shell: string;
}

/**
 * Manager info for CI output
 */
export interface CIManagerInfo {
  name: string;
  displayName: string;
  versionCount: number;
  totalSizeBytes: number;
  baseDir: string;
  inPath: boolean;
}

/**
 * Port process info for CI output
 */
export interface CIPortProcess {
  port: number;
  pid: number;
  name: string;
  command?: string;
}

/**
 * Complete CI check result
 */
export interface CICheckResult {
  /** Timestamp of check */
  timestamp: string;
  /** Overall result: pass/warn/fail */
  status: CICheckLevel;
  /** Exit code (0 for pass, 1 for issues) */
  exitCode: number;
  /** System information */
  system: CISystemInfo;
  /** Individual check results */
  checks: CICheckItem[];
  /** Summary counts */
  summary: {
    total: number;
    passed: number;
    warnings: number;
    failed: number;
  };
  /** Detected version managers */
  managers: CIManagerInfo[];
  /** Node.js processes using ports */
  portProcesses: CIPortProcess[];
}

// ─────────────────────────────────────────────────────────────
// Doctor Enhancement Types
// ─────────────────────────────────────────────────────────────

/**
 * Environment variable info (no values exposed for security)
 */
export interface EnvVarInfo {
  /** Variable name */
  name: string;
  /** Whether the variable is set */
  isSet: boolean;
}

/**
 * Corepack installation and status info
 */
export interface CorepackInfo {
  /** Whether corepack is installed */
  installed: boolean;
  /** Corepack version if installed */
  version: string | null;
  /** Whether corepack is enabled (shims active) */
  enabled: boolean;
  /** Package managers managed by corepack */
  managedManagers: string[];
  /** packageManager field from package.json (if in project) */
  packageManagerField: string | null;
}

/**
 * Permission check result for a directory
 */
export interface PermissionCheck {
  /** Human-readable name */
  name: string;
  /** Path to the directory */
  path: string;
  /** Whether the directory exists */
  exists: boolean;
  /** Whether the directory is writable */
  writable: boolean;
}

/**
 * Global packages summary for doctor display
 */
export interface GlobalPackagesSummary {
  /** npm global packages */
  npm: { count: number; size: number };
  /** yarn global packages */
  yarn: { count: number; size: number };
  /** pnpm global packages */
  pnpm: { count: number; size: number };
  /** Total count */
  totalCount: number;
  /** Total size in bytes */
  totalSize: number;
  /** Packages installed in multiple managers */
  duplicates: string[];
}

// ─────────────────────────────────────────────────────────────
// Project Health Types
// ─────────────────────────────────────────────────────────────

/**
 * Engine requirement check result
 */
export interface EngineRequirement {
  /** Required version range from package.json */
  required: string | null;
  /** Current installed version */
  current: string | null;
  /** Whether current satisfies required */
  satisfied: boolean;
}

/**
 * Engines check result
 */
export interface EngineCheck {
  /** Node.js engine requirement */
  node: EngineRequirement;
  /** npm engine requirement */
  npm?: EngineRequirement;
  /** yarn engine requirement */
  yarn?: EngineRequirement;
  /** pnpm engine requirement */
  pnpm?: EngineRequirement;
}

/**
 * Lockfile integrity check result
 */
export interface LockfileCheck {
  /** Whether package-lock.json exists */
  hasPackageLock: boolean;
  /** Whether yarn.lock exists */
  hasYarnLock: boolean;
  /** Whether pnpm-lock.yaml exists */
  hasPnpmLock: boolean;
  /** Detected package manager based on lockfile */
  detectedManager: 'npm' | 'yarn' | 'pnpm' | null;
  /** Warning: multiple lockfiles present */
  multipleLocksWarning: boolean;
  /** Warning: no lockfile but node_modules exists */
  missingLockWarning: boolean;
}

/**
 * node_modules health check result
 */
export interface NodeModulesCheck {
  /** Whether node_modules exists */
  exists: boolean;
  /** Size in bytes */
  size: number;
  /** Number of top-level packages */
  packageCount: number;
  /** Whether node_modules appears orphaned (no lockfile) */
  orphaned: boolean;
}

/**
 * Script security info
 */
export interface ScriptInfo {
  /** Script name (preinstall, postinstall, etc.) */
  name: string;
  /** Script content */
  content: string | undefined;
  /** Whether script contains potential remote execution */
  hasRemoteExecution: boolean;
  /** Whether script contains sudo */
  hasSudo: boolean;
}

/**
 * Package scripts security analysis
 */
export interface ScriptAnalysis {
  /** Whether package has lifecycle scripts */
  hasLifecycleScripts: boolean;
  /** Individual script analysis */
  scripts: ScriptInfo[];
  /** Risk level: none, low, medium, high */
  riskLevel: 'none' | 'low' | 'medium' | 'high';
}

/**
 * Project version file with match status
 */
export interface VersionFileCheck {
  /** File name */
  file: string;
  /** Full path */
  path: string;
  /** Required version */
  required: string;
  /** Current Node version */
  current: string;
  /** Whether current satisfies required */
  satisfied: boolean;
}

// ─────────────────────────────────────────────────────────────
// New Environment Check Types
// ─────────────────────────────────────────────────────────────

/**
 * npm prefix check result
 */
export interface NpmPrefixCheck {
  /** Current npm prefix path */
  prefix: string | null;
  /** Active version manager */
  activeManager: string | null;
  /** Expected prefix based on manager */
  expectedPrefix: string | null;
  /** Whether there's a mismatch */
  mismatch: boolean;
}

/**
 * Shell startup slowness indicator
 */
export interface ShellSlowStartupCheck {
  /** Whether slow patterns detected */
  hasSlowPatterns: boolean;
  /** Detected slow patterns */
  patterns: SlowStartupPattern[];
}

export interface SlowStartupPattern {
  /** Config file where pattern found */
  file: string;
  /** Manager causing slowness */
  manager: string;
  /** Line number */
  line: number;
  /** Suggestion to fix */
  suggestion: string;
}

/**
 * Version file conflict check
 */
export interface VersionFileConflict {
  /** Whether conflicts exist */
  hasConflict: boolean;
  /** Conflicting files */
  files: VersionFileInfo[];
  /** Distinct versions found */
  distinctVersions: string[];
}

/**
 * node-gyp readiness check
 */
export interface NodeGypReadiness {
  /** Whether ready for native compilation */
  ready: boolean;
  /** Python availability */
  python: {
    available: boolean;
    version: string | null;
    path: string | null;
  };
  /** Build tools (Windows) */
  buildTools?: {
    available: boolean;
    type: string | null;
  };
  /** Missing requirements */
  missing: string[];
}

/**
 * npm cache health check
 */
export interface NpmCacheHealth {
  /** Cache path */
  path: string | null;
  /** Cache size in bytes */
  size: number;
  /** Whether cache appears healthy */
  healthy: boolean;
  /** Issues detected */
  issues: string[];
}

/**
 * Global npm location check
 */
export interface GlobalNpmLocation {
  /** npm global root path */
  npmRoot: string | null;
  /** Active version manager */
  activeManager: string | null;
  /** Whether location is correct for manager */
  correctLocation: boolean;
  /** Expected location */
  expectedLocation: string | null;
}

/**
 * Symlink health check (Windows)
 */
export interface SymlinkHealth {
  /** Whether symlinks are working */
  working: boolean;
  /** Whether running as admin */
  isAdmin: boolean;
  /** Whether junctions are being used instead */
  usingJunctions: boolean;
  /** Issues detected */
  issues: string[];
}

/**
 * Stale node_modules check
 */
export interface StaleNodeModules {
  /** Whether node_modules exists */
  exists: boolean;
  /** Node version node_modules was built with */
  builtWithVersion: string | null;
  /** Current Node version */
  currentVersion: string;
  /** Whether major version changed */
  majorMismatch: boolean;
  /** Recommendation */
  recommendation: string | null;
}

/**
 * IDE integration check
 */
export interface IDEIntegration {
  /** Whether VSCode workspace detected */
  hasVSCode: boolean;
  /** VSCode settings issues */
  vscodeIssues: string[];
  /** Whether terminal inherits env properly */
  terminalInheritEnv: boolean | null;
  /** ESLint node path configured */
  eslintNodePath: boolean | null;
}

/**
 * Extended health data with new checks
 */
export interface ExtendedHealthChecks {
  /** npm prefix mismatch check */
  npmPrefix: NpmPrefixCheck;
  /** Shell startup slowness */
  shellSlowStartup: ShellSlowStartupCheck;
  /** Version file conflicts */
  versionFileConflict: VersionFileConflict;
  /** node-gyp readiness */
  nodeGypReadiness: NodeGypReadiness;
  /** npm cache health */
  npmCacheHealth: NpmCacheHealth;
  /** Global npm location */
  globalNpmLocation: GlobalNpmLocation;
  /** Symlink health (Windows) */
  symlinkHealth: SymlinkHealth | null;
  /** Stale node_modules */
  staleNodeModules: StaleNodeModules;
  /** IDE integration */
  ideIntegration: IDEIntegration;
  /** engines field check */
  enginesCheck: EngineCheck | null;
}

/**
 * Complete project health assessment
 */
export interface ProjectHealthAssessment {
  /** Timestamp of assessment */
  timestamp: string;
  /** Project directory */
  projectDir: string;
  /** Whether this appears to be a Node.js project */
  isNodeProject: boolean;
  /** Version file checks */
  versionFiles: VersionFileCheck[];
  /** Engine requirements check */
  engines: EngineCheck | null;
  /** Lockfile integrity check */
  lockfile: LockfileCheck;
  /** node_modules health check */
  nodeModules: NodeModulesCheck;
  /** Scripts security analysis */
  scripts: ScriptAnalysis;
  /** Overall status */
  overallStatus: HealthCheckStatus;
  /** Summary counts */
  summary: {
    passed: number;
    warnings: number;
    failed: number;
  };
}
