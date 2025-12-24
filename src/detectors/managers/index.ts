/**
 * Manager Detectors Index
 *
 * Exports all individual detector modules for registration.
 */

// Import all detectors
import { nvmDetector } from './nvm.js';
import { nvmWindowsDetector } from './nvm-windows.js';
import { fnmDetector } from './fnm.js';
import { voltaDetector } from './volta.js';
import { asdfDetector } from './asdf.js';
import { nDetector } from './n.js';
import { miseDetector } from './mise.js';
import { vfoxDetector } from './vfox.js';
import { nodenvDetector } from './nodenv.js';
import { nvsDetector } from './nvs.js';
import { nodistDetector } from './nodist.js';
import { protoDetector } from './proto.js';
import { homebrewDetector } from './homebrew.js';
import { nodebrewDetector } from './nodebrew.js';
import { gnvmDetector } from './gnvm.js';
import { ndenvDetector } from './ndenv.js';
import { snmDetector } from './snm.js';
import { nvmdDetector } from './nvmd.js';
import { tnvmDetector } from './tnvm.js';
import { systemDetector } from './system.js';
import { pathDetector } from './path.js';
import type { DetectorConfig } from '../../types/index.js';

// Re-export individual detectors
export {
  nvmDetector,
  nvmWindowsDetector,
  fnmDetector,
  voltaDetector,
  asdfDetector,
  nDetector,
  miseDetector,
  vfoxDetector,
  nodenvDetector,
  nvsDetector,
  nodistDetector,
  protoDetector,
  homebrewDetector,
  nodebrewDetector,
  gnvmDetector,
  ndenvDetector,
  snmDetector,
  nvmdDetector,
  tnvmDetector,
  systemDetector,
  pathDetector,
};

/**
 * All detectors in registration order
 */
export const allDetectors: DetectorConfig[] = [
  // Unix version managers
  nvmDetector,
  fnmDetector,
  voltaDetector,
  asdfDetector,
  nDetector,
  miseDetector,
  vfoxDetector,
  nodenvDetector,
  nvsDetector,
  protoDetector,

  // Windows version managers
  nvmWindowsDetector,
  nodistDetector,

  // Package managers and system
  homebrewDetector,
  nodebrewDetector,
  gnvmDetector,
  ndenvDetector,
  snmDetector,
  nvmdDetector,
  tnvmDetector,
  systemDetector,
  pathDetector,
];
