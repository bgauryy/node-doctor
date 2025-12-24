/**
 * CI/Headless Check Mode
 *
 * Runs environment checks non-interactively for CI/CD pipelines.
 * Now powered by health-engine.ts for consistent results with doctor.
 */

import { scanAll } from '../detectors/index.js';
import {
  runHealthAssessment,
  formatAsJSON,
  formatAsText,
  printHealthAssessment,
} from './health-engine.js';
import type { HealthAssessment } from '../types/index.js';

// ─────────────────────────────────────────────────────────────
// Main CI Check Function
// ─────────────────────────────────────────────────────────────

/**
 * Run all CI checks and return structured result
 * Now delegates to the unified health engine
 */
export async function runCICheck(): Promise<HealthAssessment> {
  const results = scanAll();
  return runHealthAssessment(results);
}

// ─────────────────────────────────────────────────────────────
// Output Formatters (re-export from health-engine)
// ─────────────────────────────────────────────────────────────

/**
 * Output result as JSON
 */
export function outputJSON(result: HealthAssessment): void {
  console.log(formatAsJSON(result));
}

/**
 * Output result as formatted text
 */
export function outputText(result: HealthAssessment): void {
  printHealthAssessment(result);
}
