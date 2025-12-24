/**
 * Lightweight semver utilities for Node.js version checking
 * Supports the subset of semver needed for node-doctor
 */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  version: string;
}

/**
 * Parse a version string into components
 * Handles: "18.1.2", "v18.1.2", "18.1", "18"
 */
export function parse(version: string): SemVer | null {
  if (!version || typeof version !== 'string') return null;
  
  // Remove 'v' prefix and trim
  const cleaned = version.replace(/^v/, '').trim();
  
  // Match semver pattern (allowing partial versions)
  const match = cleaned.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  
  const major = parseInt(match[1], 10);
  const minor = match[2] !== undefined ? parseInt(match[2], 10) : 0;
  const patch = match[3] !== undefined ? parseInt(match[3], 10) : 0;
  
  return {
    major,
    minor,
    patch,
    version: `${major}.${minor}.${patch}`,
  };
}

/**
 * Validate and return normalized version string, or null if invalid
 */
export function valid(version: string): string | null {
  const parsed = parse(version);
  return parsed ? parsed.version : null;
}

/**
 * Clean whitespace and 'v' prefix, return normalized version or null
 */
export function clean(version: string): string | null {
  if (!version || typeof version !== 'string') return null;
  const parsed = parse(version.trim());
  return parsed ? parsed.version : null;
}

/**
 * Extract major version number
 */
export function major(version: string): number {
  const parsed = parse(version);
  if (!parsed) {
    throw new TypeError(`Invalid Version: ${version}`);
  }
  return parsed.major;
}

/**
 * Compare two versions: returns -1, 0, or 1
 * Throws TypeError for invalid versions instead of treating them as equal
 */
export function compare(a: string, b: string): -1 | 0 | 1 {
  const parsedA = parse(a);
  const parsedB = parse(b);

  if (!parsedA) {
    throw new TypeError(`Invalid Version: ${a}`);
  }
  if (!parsedB) {
    throw new TypeError(`Invalid Version: ${b}`);
  }
  
  if (parsedA.major !== parsedB.major) {
    return parsedA.major > parsedB.major ? 1 : -1;
  }
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor > parsedB.minor ? 1 : -1;
  }
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch > parsedB.patch ? 1 : -1;
  }
  return 0;
}

/**
 * Greater than comparison
 */
export function gt(a: string, b: string): boolean {
  return compare(a, b) === 1;
}

/**
 * Check if a range string is valid
 * Returns the normalized range string or null if invalid
 */
export function validRange(range: string): string | null {
  if (!range || typeof range !== 'string') return null;
  
  const trimmed = range.trim();
  if (!trimmed) return null;
  
  // Handle OR ranges (split by ||)
  const parts = trimmed.split(/\s*\|\|\s*/);
  
  for (const part of parts) {
    if (!isValidRangePart(part.trim())) {
      return null;
    }
  }
  
  return trimmed;
}

/**
 * Check if a single range part is valid
 */
function isValidRangePart(part: string): boolean {
  if (!part) return false;
  
  // Patterns we support:
  // - Exact: 18.0.0, 18.0, 18
  // - Comparators: >=18, >18.0.0, <=20, <20.0.0, =18.0.0
  // - Caret: ^18.0.0
  // - Tilde: ~18.1.0
  // - Wildcard: 18.x, 18.*, *, x
  // - Hyphen range: 18.0.0 - 20.0.0
  // - Combined: >=18.0.0 <20.0.0
  
  // Handle hyphen ranges
  if (part.includes(' - ')) {
    const [left, right] = part.split(' - ').map(s => s.trim());
    return parse(left) !== null && parse(right) !== null;
  }
  
  // Handle space-separated AND conditions (>=18 <20)
  const conditions = part.split(/\s+/).filter(Boolean);
  
  for (const cond of conditions) {
    // Wildcard patterns
    if (cond === '*' || cond === 'x') continue;
    if (/^\d+\.[x*]$/.test(cond)) continue;
    if (/^\d+\.\d+\.[x*]$/.test(cond)) continue;
    
    // Comparator patterns: >=, >, <=, <, =, ^, ~
    const comparatorMatch = cond.match(/^([<>=^~]+)?(\d+(?:\.\d+)?(?:\.\d+)?)$/);
    if (comparatorMatch) continue;
    
    return false;
  }
  
  return true;
}

/**
 * Check if a version satisfies a range
 */
export function satisfies(version: string, range: string): boolean {
  const parsed = parse(version);
  if (!parsed) return false;
  
  const normalizedRange = validRange(range);
  if (!normalizedRange) return false;
  
  // Handle OR ranges (any part matching is sufficient)
  const parts = normalizedRange.split(/\s*\|\|\s*/);
  
  return parts.some(part => satisfiesPart(parsed, part.trim()));
}

/**
 * Check if a parsed version satisfies a single range part
 */
function satisfiesPart(version: SemVer, part: string): boolean {
  // Handle hyphen ranges: 18.0.0 - 20.0.0
  if (part.includes(' - ')) {
    const [left, right] = part.split(' - ').map(s => s.trim());
    const leftParsed = parse(left);
    const rightParsed = parse(right);
    if (!leftParsed || !rightParsed) return false;
    return compare(version.version, leftParsed.version) >= 0 &&
           compare(version.version, rightParsed.version) <= 0;
  }
  
  // Handle space-separated AND conditions (>=18 <20)
  const conditions = part.split(/\s+/).filter(Boolean);
  
  return conditions.every(cond => satisfiesCondition(version, cond));
}

/**
 * Check if a version satisfies a single condition
 */
function satisfiesCondition(version: SemVer, condition: string): boolean {
  // Wildcard: *, x
  if (condition === '*' || condition === 'x') return true;
  
  // Major wildcard: 18.x, 18.*
  const majorWildcard = condition.match(/^(\d+)\.[x*]$/);
  if (majorWildcard) {
    return version.major === parseInt(majorWildcard[1], 10);
  }
  
  // Major.minor wildcard: 18.1.x, 18.1.*
  const minorWildcard = condition.match(/^(\d+)\.(\d+)\.[x*]$/);
  if (minorWildcard) {
    return version.major === parseInt(minorWildcard[1], 10) &&
           version.minor === parseInt(minorWildcard[2], 10);
  }
  
  // Parse comparator
  const match = condition.match(/^([<>=^~]*)(.+)$/);
  if (!match) return false;
  
  const [, operator, versionStr] = match;
  const target = parse(versionStr);
  if (!target) return false;
  
  switch (operator) {
    case '':
    case '=':
      // Exact match (but allow partial: 18 matches 18.x.x)
      if (versionStr.split('.').length === 1) {
        return version.major === target.major;
      }
      if (versionStr.split('.').length === 2) {
        return version.major === target.major && version.minor === target.minor;
      }
      return compare(version.version, target.version) === 0;
      
    case '>':
      return compare(version.version, target.version) > 0;
      
    case '>=':
      return compare(version.version, target.version) >= 0;
      
    case '<':
      return compare(version.version, target.version) < 0;
      
    case '<=':
      return compare(version.version, target.version) <= 0;
      
    case '^':
      // Caret: same major, >= target
      return version.major === target.major &&
             compare(version.version, target.version) >= 0;
      
    case '~':
      // Tilde: same major.minor, >= target
      return version.major === target.major &&
             version.minor === target.minor &&
             compare(version.version, target.version) >= 0;
      
    default:
      return false;
  }
}

