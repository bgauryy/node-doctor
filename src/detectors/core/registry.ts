/**
 * Detector Registry
 *
 * Centralized management of version manager detectors with validation,
 * scanning, and aggregation capabilities.
 */

import os from 'node:os';
import { compareVersions } from './helpers.js';
import type {
  DetectorConfig,
  DetectorResult,
  ScanResults,
  AggregatedInstallation,
  Platform,
} from '../../types/index.js';

interface ManagerSummary {
  name: string;
  displayName: string;
  icon: string;
  count: number;
  size: number;
}

/**
 * Registry for managing version manager detectors
 */
export class DetectorRegistry {
  detectors: DetectorConfig[];

  constructor() {
    this.detectors = [];
  }

  /**
   * Register a new detector
   *
   * @throws {Error} If detector is invalid
   */
  register(detector: DetectorConfig): DetectorRegistry {
    const error = this.validate(detector);
    if (error) {
      throw new Error(`Invalid detector '${detector.name || 'unknown'}': ${error}`);
    }

    // Check for duplicate names
    if (this.detectors.some((d) => d.name === detector.name)) {
      throw new Error(`Detector '${detector.name}' is already registered`);
    }

    this.detectors.push(detector);
    return this;
  }

  /**
   * Register multiple detectors at once
   */
  registerAll(detectors: DetectorConfig[]): DetectorRegistry {
    for (const detector of detectors) {
      this.register(detector);
    }
    return this;
  }

  /**
   * Validate a detector configuration
   */
  validate(detector: DetectorConfig): string | null {
    if (!detector) {
      return 'Detector is null or undefined';
    }

    if (!detector.name || typeof detector.name !== 'string') {
      return 'Missing or invalid "name" property';
    }

    if (!detector.displayName || typeof detector.displayName !== 'string') {
      return 'Missing or invalid "displayName" property';
    }

    if (!Array.isArray(detector.platforms) || detector.platforms.length === 0) {
      return 'Missing or invalid "platforms" array';
    }

    const validPlatforms: Platform[] = ['darwin', 'linux', 'win32'];
    for (const platform of detector.platforms) {
      if (!validPlatforms.includes(platform)) {
        return `Invalid platform "${platform}". Must be one of: ${validPlatforms.join(', ')}`;
      }
    }

    if (typeof detector.detect !== 'function') {
      return 'Missing or invalid "detect" function';
    }

    if (typeof detector.canDelete !== 'boolean') {
      return 'Missing or invalid "canDelete" boolean';
    }

    return null;
  }

  /**
   * Get detectors for the current platform
   */
  getForCurrentPlatform(): DetectorConfig[] {
    const platform = os.platform() as Platform;
    return this.detectors.filter((d) => d.platforms.includes(platform));
  }

  /**
   * Get a detector by name
   */
  get(name: string): DetectorConfig | undefined {
    return this.detectors.find((d) => d.name === name);
  }

  /**
   * Scan all detectors for the current platform
   */
  scanAll(): ScanResults {
    const results: ScanResults = {};
    const platform = os.platform() as Platform;

    for (const detector of this.detectors) {
      if (detector.platforms.includes(platform)) {
        try {
          results[detector.name] = detector.detect();
        } catch (err) {
          // Graceful degradation - log error but continue
          console.error(`Detector '${detector.name}' failed:`, err instanceof Error ? err.message : err);
          results[detector.name] = null;
        }
      }
    }

    return results;
  }

  /**
   * Get all installations from scan results
   *
   * Aggregates installations from all detectors, adding detector metadata
   * to each installation.
   */
  getAllInstallations(
    results: ScanResults,
    options: { includeNonDeletable?: boolean } = {}
  ): AggregatedInstallation[] {
    const all: AggregatedInstallation[] = [];
    const platform = os.platform() as Platform;

    for (const detector of this.detectors) {
      if (!detector.platforms.includes(platform)) {
        continue;
      }

      // Skip non-deletable managers unless explicitly requested
      if (!detector.canDelete && !options.includeNonDeletable) {
        continue;
      }

      const result = results[detector.name];
      if (result?.installations) {
        for (const inst of result.installations) {
          all.push({
            ...inst,
            detectorName: detector.name,
            detectorDisplayName: detector.displayName,
            detectorIcon: detector.icon,
            canDelete: detector.canDelete,
          });
        }
      }
    }

    // Sort by version (newest first)
    all.sort((a, b) => compareVersions(a.version, b.version));

    return all;
  }

  /**
   * Get summary statistics for all detected managers
   */
  getSummary(results: ScanResults): ManagerSummary[] {
    const platform = os.platform() as Platform;
    const summary: ManagerSummary[] = [];

    for (const detector of this.detectors) {
      if (!detector.platforms.includes(platform)) {
        continue;
      }

      // Skip special detectors
      if (detector.name === 'path' || detector.name === 'system') {
        continue;
      }

      const result = results[detector.name];
      if (result?.installations && result.installations.length > 0) {
        const totalSize = result.installations.reduce((sum, inst) => sum + (inst.size || 0), 0);
        summary.push({
          name: detector.name,
          displayName: detector.displayName,
          icon: detector.icon,
          count: result.installations.length,
          size: totalSize,
        });
      }
    }

    return summary;
  }

  /**
   * Unregister a detector by name
   */
  unregister(name: string): boolean {
    const index = this.detectors.findIndex((d) => d.name === name);
    if (index >= 0) {
      this.detectors.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear all registered detectors
   */
  clear(): void {
    this.detectors = [];
  }

  /**
   * Get count of registered detectors
   */
  get count(): number {
    return this.detectors.length;
  }
}

// Default registry instance
export const defaultRegistry = new DetectorRegistry();
