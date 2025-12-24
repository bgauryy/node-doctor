/**
 * Tests for health assessment engine
 * @module tests/health-engine.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  HealthData,
  HealthCheck,
  FoundNode,
  DetectedManager,
  RegistryInfo,
  RegistryStatusResult,
  EOLStatus,
  SecurityStatus,
  NodeConfigEntry,
  CIPortProcess,
} from '../src/types/index.js';

// We test the pure assessment logic without mocking
import { assessHealthChecks, formatAsJSON, formatAsText } from '../src/features/health-engine.js';

// Helper to create test health data
function createTestHealthData(overrides: Partial<HealthData> = {}): HealthData {
  const defaultRegistryInfo: RegistryInfo = {
    global: {
      registry: 'https://registry.npmjs.org/',
      source: 'default',
      path: null,
    },
    local: null,
    scopes: {},
    configFiles: [],
  };

  const defaultRegistryStatus: RegistryStatusResult = {
    available: true,
    latency: 100,
    status: 200,
  };

  return {
    system: {
      platform: 'darwin arm64',
      arch: 'arm64',
      shell: '/bin/zsh',
      nodeVersion: 'v20.10.0',
      npmVersion: '10.2.0',
      execPath: '/usr/local/bin/node',
    },
    nodesInPath: [],
    managers: [],
    activeManagers: [],
    registry: {
      info: defaultRegistryInfo,
      status: defaultRegistryStatus,
    },
    security: {
      eol: null,
      vulnerabilities: null,
    },
    portProcesses: [],
    shellConfigs: [],
    ...overrides,
  };
}

// Helper to create a FoundNode
function createFoundNode(overrides: Partial<FoundNode> = {}): FoundNode {
  return {
    executable: '/usr/local/bin/node',
    realPath: '/usr/local/bin/node',
    runner: { name: 'system', icon: '🖥️' },
    version: 'v20.10.0',
    isCurrent: true,
    ...overrides,
  };
}

// Helper to create a DetectedManager
function createManager(overrides: Partial<DetectedManager> = {}): DetectedManager {
  return {
    name: 'nvm',
    displayName: 'NVM',
    icon: '🌿',
    baseDir: '/Users/test/.nvm',
    versionCount: 3,
    totalSize: 500 * 1024 * 1024,
    ...overrides,
  };
}

describe('health-engine', () => {
  describe('assessHealthChecks', () => {
    describe('Node in PATH check', () => {
      it('should pass when Node is in PATH', () => {
        const data = createTestHealthData({
          nodesInPath: [
            createFoundNode({
              version: 'v20.10.0',
              runner: { name: 'nvm', icon: '🌿' },
            }),
          ],
        });

        const checks = assessHealthChecks(data);
        const nodeCheck = checks.find((c) => c.id === 'node-in-path');

        expect(nodeCheck).toBeDefined();
        expect(nodeCheck!.status).toBe('pass');
        expect(nodeCheck!.message).toContain('v20.10.0');
        expect(nodeCheck!.message).toContain('nvm');
      });

      it('should fail when no Node in PATH', () => {
        const data = createTestHealthData({
          nodesInPath: [],
        });

        const checks = assessHealthChecks(data);
        const nodeCheck = checks.find((c) => c.id === 'node-in-path');

        expect(nodeCheck).toBeDefined();
        expect(nodeCheck!.status).toBe('fail');
        expect(nodeCheck!.hint).toBeDefined();
      });
    });

    describe('PATH shadowing check', () => {
      it('should warn when multiple Nodes in PATH', () => {
        const data = createTestHealthData({
          nodesInPath: [
            createFoundNode({ version: 'v20.10.0', runner: { name: 'nvm', icon: '🌿' } }),
            createFoundNode({
              executable: '/opt/homebrew/bin/node',
              version: 'v18.0.0',
              runner: { name: 'homebrew', icon: '🍺' },
            }),
            createFoundNode({
              executable: '/usr/bin/node',
              version: 'v16.0.0',
              runner: { name: 'system', icon: '🖥️' },
            }),
          ],
        });

        const checks = assessHealthChecks(data);
        const shadowCheck = checks.find((c) => c.id === 'path-shadowing');

        expect(shadowCheck).toBeDefined();
        expect(shadowCheck!.status).toBe('warn');
        expect(shadowCheck!.message).toContain('2 shadowed');
      });

      it('should not create shadowing check for single Node', () => {
        const data = createTestHealthData({
          nodesInPath: [createFoundNode()],
        });

        const checks = assessHealthChecks(data);
        const shadowCheck = checks.find((c) => c.id === 'path-shadowing');

        expect(shadowCheck).toBeUndefined();
      });
    });

    describe('Multiple managers check', () => {
      it('should pass with single active manager', () => {
        const data = createTestHealthData({
          activeManagers: ['nvm'],
          managers: [createManager()],
        });

        const checks = assessHealthChecks(data);
        const managerCheck = checks.find((c) => c.id === 'multiple-managers');

        expect(managerCheck).toBeDefined();
        expect(managerCheck!.status).toBe('pass');
        expect(managerCheck!.message).toContain('nvm');
      });

      it('should warn with multiple active managers', () => {
        const data = createTestHealthData({
          activeManagers: ['nvm', 'fnm', 'volta'],
          managers: [
            createManager({ name: 'nvm' }),
            createManager({ name: 'fnm', displayName: 'FNM' }),
            createManager({ name: 'volta', displayName: 'Volta' }),
          ],
        });

        const checks = assessHealthChecks(data);
        const managerCheck = checks.find((c) => c.id === 'multiple-managers');

        expect(managerCheck).toBeDefined();
        expect(managerCheck!.status).toBe('warn');
        expect(managerCheck!.message).toContain('3 version managers active');
        expect(managerCheck!.details).toContain('nvm');
        expect(managerCheck!.details).toContain('fnm');
        expect(managerCheck!.details).toContain('volta');
      });

      it('should pass with no active managers but installed managers', () => {
        const data = createTestHealthData({
          activeManagers: [],
          managers: [createManager()],
        });

        const checks = assessHealthChecks(data);
        const managerCheck = checks.find((c) => c.id === 'multiple-managers');

        expect(managerCheck).toBeDefined();
        expect(managerCheck!.status).toBe('pass');
        expect(managerCheck!.message).toContain('1 manager(s) installed');
      });

      it('should pass with no managers detected', () => {
        const data = createTestHealthData({
          activeManagers: [],
          managers: [],
        });

        const checks = assessHealthChecks(data);
        const managerCheck = checks.find((c) => c.id === 'multiple-managers');

        expect(managerCheck).toBeDefined();
        expect(managerCheck!.status).toBe('pass');
        expect(managerCheck!.message).toContain('No version managers detected');
      });
    });

    describe('Registry status check', () => {
      it('should pass when registry is available with low latency', () => {
        const data = createTestHealthData({
          registry: {
            info: {
              global: { registry: 'https://registry.npmjs.org/', source: 'default', path: null },
              local: null,
              scopes: {},
              configFiles: [],
            },
            status: { available: true, latency: 150, status: 200 },
          },
        });

        const checks = assessHealthChecks(data);
        const registryCheck = checks.find((c) => c.id === 'registry-status');

        expect(registryCheck).toBeDefined();
        expect(registryCheck!.status).toBe('pass');
        expect(registryCheck!.message).toContain('150ms');
      });

      it('should fail when registry is unavailable', () => {
        const data = createTestHealthData({
          registry: {
            info: {
              global: { registry: 'https://registry.npmjs.org/', source: 'default', path: null },
              local: null,
              scopes: {},
              configFiles: [],
            },
            status: { available: false, latency: 0, status: 0, error: 'Connection timeout' },
          },
        });

        const checks = assessHealthChecks(data);
        const registryCheck = checks.find((c) => c.id === 'registry-status');

        expect(registryCheck).toBeDefined();
        expect(registryCheck!.status).toBe('fail');
        expect(registryCheck!.message).toContain('unreachable');
      });

      it('should warn when registry has high latency', () => {
        const data = createTestHealthData({
          registry: {
            info: {
              global: { registry: 'https://registry.npmjs.org/', source: 'default', path: null },
              local: null,
              scopes: {},
              configFiles: [],
            },
            status: { available: true, latency: 3000, status: 200 },
          },
        });

        const checks = assessHealthChecks(data);
        const registryCheck = checks.find((c) => c.id === 'registry-latency');

        expect(registryCheck).toBeDefined();
        expect(registryCheck!.status).toBe('warn');
        expect(registryCheck!.message).toContain('3000ms');
      });
    });

    describe('EOL status check', () => {
      it('should pass for active LTS version', () => {
        const eol: EOLStatus = {
          status: 'active',
          isLTS: true,
        };

        const data = createTestHealthData({
          security: { eol, vulnerabilities: null },
        });

        const checks = assessHealthChecks(data);
        const eolCheck = checks.find((c) => c.id === 'node-eol');

        expect(eolCheck).toBeDefined();
        expect(eolCheck!.status).toBe('pass');
        expect(eolCheck!.message).toContain('actively supported');
      });

      it('should warn for maintenance version', () => {
        const eol: EOLStatus = {
          status: 'maintenance',
          eolDate: '2024-04-30',
        };

        const data = createTestHealthData({
          security: { eol, vulnerabilities: null },
        });

        const checks = assessHealthChecks(data);
        const eolCheck = checks.find((c) => c.id === 'node-eol');

        expect(eolCheck).toBeDefined();
        expect(eolCheck!.status).toBe('warn');
        expect(eolCheck!.message).toContain('Maintenance');
        expect(eolCheck!.hint).toContain('2024-04-30');
      });

      it('should fail for EOL version', () => {
        const eol: EOLStatus = {
          status: 'eol',
          eolDate: '2023-09-11',
        };

        const data = createTestHealthData({
          security: { eol, vulnerabilities: null },
        });

        const checks = assessHealthChecks(data);
        const eolCheck = checks.find((c) => c.id === 'node-eol');

        expect(eolCheck).toBeDefined();
        expect(eolCheck!.status).toBe('fail');
        expect(eolCheck!.message).toContain('End-of-Life');
        expect(eolCheck!.hint).toContain('2023-09-11');
      });

      it('should warn when EOL status unknown', () => {
        const eol: EOLStatus = {
          status: 'unknown',
        };

        const data = createTestHealthData({
          security: { eol, vulnerabilities: null },
        });

        const checks = assessHealthChecks(data);
        const eolCheck = checks.find((c) => c.id === 'node-eol');

        expect(eolCheck).toBeDefined();
        expect(eolCheck!.status).toBe('warn');
        expect(eolCheck!.message).toContain('unknown');
      });

      it('should warn when EOL data unavailable', () => {
        const data = createTestHealthData({
          security: { eol: null, vulnerabilities: null },
        });

        const checks = assessHealthChecks(data);
        const eolCheck = checks.find((c) => c.id === 'node-eol');

        expect(eolCheck).toBeDefined();
        expect(eolCheck!.status).toBe('warn');
        expect(eolCheck!.message).toContain('Could not fetch');
      });
    });

    describe('Security vulnerabilities check', () => {
      it('should pass when no vulnerabilities', () => {
        const vulnerabilities: SecurityStatus = {
          vulnerable: false,
        };

        const data = createTestHealthData({
          security: { eol: null, vulnerabilities },
        });

        const checks = assessHealthChecks(data);
        const secCheck = checks.find((c) => c.id === 'node-security');

        expect(secCheck).toBeDefined();
        expect(secCheck!.status).toBe('pass');
        expect(secCheck!.message).toContain('No known security vulnerabilities');
      });

      it('should warn when vulnerabilities exist', () => {
        const vulnerabilities: SecurityStatus = {
          vulnerable: true,
          details: 'CVE-2023-xxxx: Buffer overflow in HTTP parser',
          latestSecurityRelease: 'v20.10.1',
        };

        const data = createTestHealthData({
          security: { eol: null, vulnerabilities },
        });

        const checks = assessHealthChecks(data);
        const secCheck = checks.find((c) => c.id === 'node-security');

        expect(secCheck).toBeDefined();
        expect(secCheck!.status).toBe('warn');
        expect(secCheck!.message).toContain('known vulnerabilities');
        expect(secCheck!.hint).toContain('CVE-2023');
        expect(secCheck!.details).toContain('v20.10.1');
      });

      it('should warn when security data unavailable', () => {
        const data = createTestHealthData({
          security: { eol: null, vulnerabilities: null },
        });

        const checks = assessHealthChecks(data);
        const secCheck = checks.find((c) => c.id === 'node-security');

        expect(secCheck).toBeDefined();
        expect(secCheck!.status).toBe('warn');
        expect(secCheck!.message).toContain('Could not fetch');
      });
    });

    describe('Port conflicts check', () => {
      it('should pass when no port processes', () => {
        const data = createTestHealthData({
          portProcesses: [],
        });

        const checks = assessHealthChecks(data);
        const portCheck = checks.find((c) => c.id === 'port-conflicts');

        expect(portCheck).toBeDefined();
        expect(portCheck!.status).toBe('pass');
        expect(portCheck!.message).toContain('No Node.js processes blocking ports');
      });

      it('should warn when port processes exist', () => {
        const portProcesses: CIPortProcess[] = [
          { port: 3000, pid: 1234, name: 'node', command: 'node server.js' },
          { port: 8080, pid: 5678, name: 'node', command: 'npm start' },
        ];

        const data = createTestHealthData({
          portProcesses,
        });

        const checks = assessHealthChecks(data);
        const portCheck = checks.find((c) => c.id === 'port-conflicts');

        expect(portCheck).toBeDefined();
        expect(portCheck!.status).toBe('warn');
        expect(portCheck!.message).toContain('2 Node.js process(es)');
        expect(portCheck!.details).toContain('Port 3000');
        expect(portCheck!.details).toContain('Port 8080');
      });
    });

    describe('check completeness', () => {
      it('should return all expected check IDs', () => {
        const data = createTestHealthData({
          nodesInPath: [createFoundNode()],
        });

        const checks = assessHealthChecks(data);
        const checkIds = checks.map((c) => c.id);

        expect(checkIds).toContain('node-in-path');
        expect(checkIds).toContain('multiple-managers');
        expect(checkIds).toContain('registry-status');
        expect(checkIds).toContain('node-eol');
        expect(checkIds).toContain('node-security');
        expect(checkIds).toContain('port-conflicts');
      });

      it('should have valid categories for all checks', () => {
        const data = createTestHealthData({
          nodesInPath: [createFoundNode()],
        });

        const checks = assessHealthChecks(data);
        const validCategories = ['path', 'managers', 'registry', 'security', 'ports'];

        for (const check of checks) {
          expect(validCategories).toContain(check.category);
        }
      });

      it('should have valid status for all checks', () => {
        const data = createTestHealthData({
          nodesInPath: [createFoundNode()],
        });

        const checks = assessHealthChecks(data);
        const validStatuses = ['pass', 'warn', 'fail'];

        for (const check of checks) {
          expect(validStatuses).toContain(check.status);
        }
      });
    });
  });

  describe('formatAsJSON', () => {
    it('should return valid JSON string', () => {
      const assessment = {
        timestamp: '2024-01-01T00:00:00.000Z',
        overallStatus: 'pass' as const,
        exitCode: 0,
        checks: [],
        summary: { total: 0, passed: 0, warnings: 0, failed: 0 },
        data: createTestHealthData(),
      };

      const json = formatAsJSON(assessment);
      expect(() => JSON.parse(json)).not.toThrow();

      const parsed = JSON.parse(json);
      expect(parsed.timestamp).toBe('2024-01-01T00:00:00.000Z');
      expect(parsed.overallStatus).toBe('pass');
    });
  });

  describe('formatAsText', () => {
    it('should include key sections', () => {
      const assessment = {
        timestamp: '2024-01-01T00:00:00.000Z',
        overallStatus: 'pass' as const,
        exitCode: 0,
        checks: [
          {
            id: 'node-in-path' as const,
            name: 'Node.js in PATH',
            category: 'path' as const,
            status: 'pass' as const,
            message: 'Node.js v20.10.0 via nvm',
          },
        ],
        summary: { total: 1, passed: 1, warnings: 0, failed: 0 },
        data: createTestHealthData({
          nodesInPath: [createFoundNode()],
        }),
      };

      const text = formatAsText(assessment);

      expect(text).toContain('Health Assessment');
      expect(text).toContain('System');
      expect(text).toContain('Checks');
      expect(text).toContain('Summary');
      expect(text).toContain('darwin');
    });

    it('should show manager info when present', () => {
      const assessment = {
        timestamp: '2024-01-01T00:00:00.000Z',
        overallStatus: 'pass' as const,
        exitCode: 0,
        checks: [],
        summary: { total: 0, passed: 0, warnings: 0, failed: 0 },
        data: createTestHealthData({
          managers: [createManager()],
          activeManagers: ['nvm'],
        }),
      };

      const text = formatAsText(assessment);

      expect(text).toContain('Version Managers');
      expect(text).toContain('nvm');
      expect(text).toContain('3 versions');
    });

    it('should show port processes when present', () => {
      const assessment = {
        timestamp: '2024-01-01T00:00:00.000Z',
        overallStatus: 'warn' as const,
        exitCode: 0,
        checks: [],
        summary: { total: 0, passed: 0, warnings: 0, failed: 0 },
        data: createTestHealthData({
          portProcesses: [{ port: 3000, pid: 1234, name: 'node' }],
        }),
      };

      const text = formatAsText(assessment);

      expect(text).toContain('Port Processes');
      expect(text).toContain('Port 3000');
      expect(text).toContain('PID 1234');
    });
  });
});
