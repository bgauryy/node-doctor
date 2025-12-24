/**
 * Tests for color utilities
 * @module tests/colors.test
 */

import { describe, it, expect } from 'vitest';
import { c, bold, dim } from '../src/colors.js';

describe('colors', () => {
  describe('c (color function)', () => {
    it('should wrap text with red color codes', () => {
      const result = c('red', 'error message');
      expect(result).toBe('\x1b[31merror message\x1b[0m');
    });

    it('should wrap text with green color codes', () => {
      const result = c('green', 'success');
      expect(result).toBe('\x1b[32msuccess\x1b[0m');
    });

    it('should wrap text with yellow color codes', () => {
      const result = c('yellow', 'warning');
      expect(result).toBe('\x1b[33mwarning\x1b[0m');
    });

    it('should wrap text with blue color codes', () => {
      const result = c('blue', 'info');
      expect(result).toBe('\x1b[34minfo\x1b[0m');
    });

    it('should wrap text with cyan color codes', () => {
      const result = c('cyan', 'highlight');
      expect(result).toBe('\x1b[36mhighlight\x1b[0m');
    });

    it('should wrap text with magenta color codes', () => {
      const result = c('magenta', 'special');
      expect(result).toBe('\x1b[35mspecial\x1b[0m');
    });

    it('should wrap text with white color codes', () => {
      const result = c('white', 'text');
      expect(result).toBe('\x1b[37mtext\x1b[0m');
    });

    it('should apply background colors', () => {
      expect(c('bgRed', 'alert')).toBe('\x1b[41malert\x1b[0m');
      expect(c('bgGreen', 'ok')).toBe('\x1b[42mok\x1b[0m');
      expect(c('bgYellow', 'warn')).toBe('\x1b[43mwarn\x1b[0m');
      expect(c('bgBlue', 'info')).toBe('\x1b[44minfo\x1b[0m');
      expect(c('bgMagenta', 'special')).toBe('\x1b[45mspecial\x1b[0m');
    });

    it('should apply text decorations', () => {
      expect(c('underscore', 'underlined')).toBe('\x1b[4munderlined\x1b[0m');
      expect(c('reverse', 'inverted')).toBe('\x1b[7minverted\x1b[0m');
    });

    it('should handle empty strings', () => {
      expect(c('red', '')).toBe('\x1b[31m\x1b[0m');
    });

    it('should handle special characters', () => {
      const result = c('red', 'hello\nworld');
      expect(result).toBe('\x1b[31mhello\nworld\x1b[0m');
    });

    it('should handle unicode', () => {
      const result = c('green', '✓ success');
      expect(result).toBe('\x1b[32m✓ success\x1b[0m');
    });
  });

  describe('bold', () => {
    it('should make text bold (bright)', () => {
      const result = bold('important');
      expect(result).toBe('\x1b[1mimportant\x1b[0m');
    });

    it('should handle empty strings', () => {
      expect(bold('')).toBe('\x1b[1m\x1b[0m');
    });
  });

  describe('dim', () => {
    it('should make text dim', () => {
      const result = dim('subtle');
      expect(result).toBe('\x1b[2msubtle\x1b[0m');
    });

    it('should handle empty strings', () => {
      expect(dim('')).toBe('\x1b[2m\x1b[0m');
    });
  });

  describe('color combinations', () => {
    it('should allow nesting of bold inside color', () => {
      const result = c('red', bold('critical'));
      expect(result).toContain('\x1b[31m');
      expect(result).toContain('\x1b[1m');
      expect(result).toContain('critical');
    });

    it('should allow nesting of color inside bold', () => {
      const result = bold(c('red', 'error'));
      expect(result).toContain('\x1b[1m');
      expect(result).toContain('\x1b[31m');
      expect(result).toContain('error');
    });

    it('should allow multiple nested styles', () => {
      const result = bold(dim('test'));
      expect(result).toContain('test');
      // Both bright and dim codes should be present
      expect(result).toContain('\x1b[1m');
      expect(result).toContain('\x1b[2m');
    });
  });

  describe('reset behavior', () => {
    it('should always end with reset code', () => {
      expect(c('red', 'text')).toMatch(/\x1b\[0m$/);
      expect(bold('text')).toMatch(/\x1b\[0m$/);
      expect(dim('text')).toMatch(/\x1b\[0m$/);
    });

    it('should start with appropriate color code', () => {
      expect(c('red', 'text')).toMatch(/^\x1b\[31m/);
      expect(c('green', 'text')).toMatch(/^\x1b\[32m/);
      expect(c('yellow', 'text')).toMatch(/^\x1b\[33m/);
    });
  });
});
