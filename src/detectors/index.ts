/**
 * Node.js Installation Detectors
 *
 * Central entry point for all version manager detectors.
 * Uses the modular detector system from managers/ directory.
 */

import os from 'node:os';
import { allDetectors } from './managers/index.js';
import { DetectorRegistry, defaultRegistry } from './core/registry.js';
import type {
  DetectorConfig,
  DetectorResult,
  ScanResults,
  AggregatedInstallation,
  Platform,
} from '../types/index.js';

// Register all detectors with the default registry
defaultRegistry.registerAll(allDetectors);

// Export the detectors array for backward compatibility
export const detectors: DetectorConfig[] = allDetectors;

/**
 * Scan all detectors for current platform
 */
export function scanAll(): ScanResults {
  return defaultRegistry.scanAll();
}

/**
 * Get all installations from results
 */
export function getAllInstallations(
  results: ScanResults,
  options: { includeNonDeletable?: boolean } = {}
): AggregatedInstallation[] {
  return defaultRegistry.getAllInstallations(results, options);
}

// Re-export types and utilities
export { DetectorRegistry, defaultRegistry };
export type { DetectorConfig, DetectorResult, ScanResults, AggregatedInstallation };

// Re-export all individual detectors for direct access
export * from './managers/index.js';
