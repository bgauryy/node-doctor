/**
 * Tests for semver utilities
 * @module tests/semver.test
 */

import { describe, it, expect } from 'vitest';
import {
  parse,
  valid,
  clean,
  major,
  compare,
  gt,
  validRange,
  satisfies,
} from '../src/semver.js';

describe('semver', () => {
  describe('parse', () => {
    it('should parse full semver string', () => {
      const result = parse('18.1.2');
      expect(result).toEqual({
        major: 18,
        minor: 1,
        patch: 2,
        version: '18.1.2',
      });
    });

    it('should parse version with v prefix', () => {
      const result = parse('v20.10.0');
      expect(result).toEqual({
        major: 20,
        minor: 10,
        patch: 0,
        version: '20.10.0',
      });
    });

    it('should parse major.minor only', () => {
      const result = parse('18.5');
      expect(result).toEqual({
        major: 18,
        minor: 5,
        patch: 0,
        version: '18.5.0',
      });
    });

    it('should parse major only', () => {
      const result = parse('22');
      expect(result).toEqual({
        major: 22,
        minor: 0,
        patch: 0,
        version: '22.0.0',
      });
    });

    it('should handle trailing whitespace', () => {
      // Note: Leading whitespace before 'v' prefix prevents removal
      // since regex uses ^v anchor. Trailing whitespace is trimmed.
      const result = parse('v18.1.0  ');
      expect(result).toEqual({
        major: 18,
        minor: 1,
        patch: 0,
        version: '18.1.0',
      });
    });

    it('should handle version without v prefix with whitespace', () => {
      const result = parse('  18.1.0  ');
      expect(result).toEqual({
        major: 18,
        minor: 1,
        patch: 0,
        version: '18.1.0',
      });
    });

    it('should return null for invalid version', () => {
      expect(parse('')).toBeNull();
      expect(parse('invalid')).toBeNull();
      expect(parse('abc.def.ghi')).toBeNull();
    });

    it('should return null for null/undefined', () => {
      expect(parse(null as unknown as string)).toBeNull();
      expect(parse(undefined as unknown as string)).toBeNull();
    });
  });

  describe('valid', () => {
    it('should return normalized version for valid input', () => {
      expect(valid('18.1.2')).toBe('18.1.2');
      expect(valid('v20.0.0')).toBe('20.0.0');
      expect(valid('18')).toBe('18.0.0');
    });

    it('should return null for invalid input', () => {
      expect(valid('')).toBeNull();
      expect(valid('not-a-version')).toBeNull();
    });
  });

  describe('clean', () => {
    it('should clean and normalize version', () => {
      expect(clean('  v18.1.0  ')).toBe('18.1.0');
      expect(clean('v20.0.0')).toBe('20.0.0');
    });

    it('should return null for invalid', () => {
      expect(clean('')).toBeNull();
      expect(clean(null as unknown as string)).toBeNull();
    });
  });

  describe('major', () => {
    it('should extract major version', () => {
      expect(major('18.1.2')).toBe(18);
      expect(major('v20.10.5')).toBe(20);
      expect(major('22')).toBe(22);
    });

    it('should throw for invalid version', () => {
      expect(() => major('invalid')).toThrow(TypeError);
      expect(() => major('')).toThrow(TypeError);
    });
  });

  describe('compare', () => {
    it('should compare equal versions', () => {
      expect(compare('18.0.0', '18.0.0')).toBe(0);
      expect(compare('v20.1.0', '20.1.0')).toBe(0);
    });

    it('should compare by major version', () => {
      expect(compare('20.0.0', '18.0.0')).toBe(1);
      expect(compare('18.0.0', '20.0.0')).toBe(-1);
    });

    it('should compare by minor version', () => {
      expect(compare('18.5.0', '18.3.0')).toBe(1);
      expect(compare('18.3.0', '18.5.0')).toBe(-1);
    });

    it('should compare by patch version', () => {
      expect(compare('18.1.5', '18.1.3')).toBe(1);
      expect(compare('18.1.3', '18.1.5')).toBe(-1);
    });

    it('should throw for invalid versions', () => {
      expect(() => compare('invalid', '18.0.0')).toThrow(TypeError);
      expect(() => compare('18.0.0', 'invalid')).toThrow(TypeError);
    });
  });

  describe('gt', () => {
    it('should return true when a > b', () => {
      expect(gt('20.0.0', '18.0.0')).toBe(true);
      expect(gt('18.5.0', '18.4.0')).toBe(true);
      expect(gt('18.1.5', '18.1.4')).toBe(true);
    });

    it('should return false when a <= b', () => {
      expect(gt('18.0.0', '20.0.0')).toBe(false);
      expect(gt('18.0.0', '18.0.0')).toBe(false);
    });
  });

  describe('validRange', () => {
    it('should validate exact versions', () => {
      expect(validRange('18.0.0')).toBe('18.0.0');
      expect(validRange('18.0')).toBe('18.0');
      expect(validRange('18')).toBe('18');
    });

    it('should validate comparator ranges', () => {
      expect(validRange('>=18')).toBe('>=18');
      expect(validRange('>18.0.0')).toBe('>18.0.0');
      expect(validRange('<=20')).toBe('<=20');
      expect(validRange('<20.0.0')).toBe('<20.0.0');
      expect(validRange('=18.0.0')).toBe('=18.0.0');
    });

    it('should validate caret ranges', () => {
      expect(validRange('^18.0.0')).toBe('^18.0.0');
      expect(validRange('^20.1.0')).toBe('^20.1.0');
    });

    it('should validate tilde ranges', () => {
      expect(validRange('~18.1.0')).toBe('~18.1.0');
      expect(validRange('~20.0.0')).toBe('~20.0.0');
    });

    it('should validate wildcard ranges', () => {
      expect(validRange('*')).toBe('*');
      expect(validRange('x')).toBe('x');
      expect(validRange('18.x')).toBe('18.x');
      expect(validRange('18.*')).toBe('18.*');
      expect(validRange('18.1.x')).toBe('18.1.x');
    });

    it('should validate hyphen ranges', () => {
      expect(validRange('18.0.0 - 20.0.0')).toBe('18.0.0 - 20.0.0');
    });

    it('should validate OR ranges', () => {
      expect(validRange('18 || 20')).toBe('18 || 20');
      expect(validRange('^18.0.0 || ^20.0.0')).toBe('^18.0.0 || ^20.0.0');
    });

    it('should validate AND ranges (space-separated)', () => {
      expect(validRange('>=18 <20')).toBe('>=18 <20');
      expect(validRange('>=18.0.0 <20.0.0')).toBe('>=18.0.0 <20.0.0');
    });

    it('should return null for invalid ranges', () => {
      expect(validRange('')).toBeNull();
      expect(validRange(null as unknown as string)).toBeNull();
      expect(validRange('invalid-range')).toBeNull();
    });
  });

  describe('satisfies', () => {
    describe('exact match', () => {
      it('should match exact version', () => {
        expect(satisfies('18.0.0', '18.0.0')).toBe(true);
        expect(satisfies('18.0.1', '18.0.0')).toBe(false);
      });

      it('should match partial versions', () => {
        expect(satisfies('18.5.0', '18')).toBe(true);
        expect(satisfies('18.0.0', '18')).toBe(true);
        expect(satisfies('19.0.0', '18')).toBe(false);

        expect(satisfies('18.5.0', '18.5')).toBe(true);
        expect(satisfies('18.5.1', '18.5')).toBe(true);
        expect(satisfies('18.6.0', '18.5')).toBe(false);
      });
    });

    describe('comparators', () => {
      it('should handle >= operator', () => {
        expect(satisfies('20.0.0', '>=18')).toBe(true);
        expect(satisfies('18.0.0', '>=18')).toBe(true);
        expect(satisfies('17.0.0', '>=18')).toBe(false);
      });

      it('should handle > operator', () => {
        expect(satisfies('19.0.0', '>18')).toBe(true);
        expect(satisfies('18.0.0', '>18.0.0')).toBe(false);
        expect(satisfies('18.0.1', '>18.0.0')).toBe(true);
      });

      it('should handle <= operator', () => {
        expect(satisfies('18.0.0', '<=20')).toBe(true);
        expect(satisfies('20.0.0', '<=20.0.0')).toBe(true);
        expect(satisfies('21.0.0', '<=20')).toBe(false);
      });

      it('should handle < operator', () => {
        expect(satisfies('18.0.0', '<20')).toBe(true);
        expect(satisfies('20.0.0', '<20.0.0')).toBe(false);
        expect(satisfies('19.9.9', '<20.0.0')).toBe(true);
      });

      it('should handle = operator', () => {
        expect(satisfies('18.0.0', '=18.0.0')).toBe(true);
        expect(satisfies('18.0.1', '=18.0.0')).toBe(false);
      });
    });

    describe('caret ranges', () => {
      it('should match same major, >= target', () => {
        expect(satisfies('18.0.0', '^18.0.0')).toBe(true);
        expect(satisfies('18.5.0', '^18.0.0')).toBe(true);
        expect(satisfies('18.99.99', '^18.0.0')).toBe(true);
        expect(satisfies('19.0.0', '^18.0.0')).toBe(false);
        expect(satisfies('17.9.9', '^18.0.0')).toBe(false);
      });

      it('should require >= target within major', () => {
        expect(satisfies('18.5.0', '^18.5.0')).toBe(true);
        expect(satisfies('18.6.0', '^18.5.0')).toBe(true);
        expect(satisfies('18.4.0', '^18.5.0')).toBe(false);
      });
    });

    describe('tilde ranges', () => {
      it('should match same major.minor, >= target', () => {
        expect(satisfies('18.1.0', '~18.1.0')).toBe(true);
        expect(satisfies('18.1.5', '~18.1.0')).toBe(true);
        expect(satisfies('18.2.0', '~18.1.0')).toBe(false);
        expect(satisfies('19.1.0', '~18.1.0')).toBe(false);
      });
    });

    describe('wildcard ranges', () => {
      it('should match any version with *', () => {
        expect(satisfies('1.0.0', '*')).toBe(true);
        expect(satisfies('99.99.99', '*')).toBe(true);
      });

      it('should match any version with x', () => {
        expect(satisfies('1.0.0', 'x')).toBe(true);
        expect(satisfies('99.99.99', 'x')).toBe(true);
      });

      it('should match major wildcard', () => {
        expect(satisfies('18.0.0', '18.x')).toBe(true);
        expect(satisfies('18.5.3', '18.x')).toBe(true);
        expect(satisfies('19.0.0', '18.x')).toBe(false);

        expect(satisfies('18.0.0', '18.*')).toBe(true);
        expect(satisfies('19.0.0', '18.*')).toBe(false);
      });

      it('should match minor wildcard', () => {
        expect(satisfies('18.1.0', '18.1.x')).toBe(true);
        expect(satisfies('18.1.99', '18.1.x')).toBe(true);
        expect(satisfies('18.2.0', '18.1.x')).toBe(false);
      });
    });

    describe('hyphen ranges', () => {
      it('should match inclusive range', () => {
        expect(satisfies('18.0.0', '18.0.0 - 20.0.0')).toBe(true);
        expect(satisfies('19.0.0', '18.0.0 - 20.0.0')).toBe(true);
        expect(satisfies('20.0.0', '18.0.0 - 20.0.0')).toBe(true);
        expect(satisfies('17.0.0', '18.0.0 - 20.0.0')).toBe(false);
        expect(satisfies('21.0.0', '18.0.0 - 20.0.0')).toBe(false);
      });
    });

    describe('OR ranges', () => {
      it('should match if any part matches', () => {
        expect(satisfies('18.0.0', '18 || 20')).toBe(true);
        expect(satisfies('20.0.0', '18 || 20')).toBe(true);
        expect(satisfies('19.0.0', '18 || 20')).toBe(false);

        expect(satisfies('18.5.0', '^18.0.0 || ^20.0.0')).toBe(true);
        expect(satisfies('20.1.0', '^18.0.0 || ^20.0.0')).toBe(true);
        expect(satisfies('19.0.0', '^18.0.0 || ^20.0.0')).toBe(false);
      });
    });

    describe('AND ranges', () => {
      it('should match if all conditions match', () => {
        expect(satisfies('19.0.0', '>=18 <20')).toBe(true);
        expect(satisfies('18.0.0', '>=18 <20')).toBe(true);
        expect(satisfies('20.0.0', '>=18 <20')).toBe(false);
        expect(satisfies('17.0.0', '>=18 <20')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should return false for invalid version', () => {
        expect(satisfies('invalid', '>=18')).toBe(false);
      });

      it('should return false for invalid range', () => {
        expect(satisfies('18.0.0', 'invalid-range')).toBe(false);
      });

      it('should handle v prefix in version', () => {
        expect(satisfies('v18.0.0', '>=18')).toBe(true);
        expect(satisfies('v20.0.0', '^18.0.0')).toBe(false);
      });
    });
  });
});
