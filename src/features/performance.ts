/**
 * Performance Metrics - CPU, Memory, Event Loop Analysis
 * Inspired by clinic.js doctor approach
 */

import { performance, PerformanceObserver } from 'node:perf_hooks';
import v8 from 'node:v8';
import os from 'node:os';
import { c, bold, dim } from '../colors.js';
import { formatSize } from '../utils.js';
import type {
  PerformanceSample,
  PerformanceSummary,
  PerformanceAnalysis,
  PerformanceConfig,
  MemorySnapshot,
  CpuSnapshot,
  EventLoopMetrics,
  HandleMetrics,
  HealthCheckStatus,
} from '../types/index.js';

// ═══════════════════════════════════════════════════════════════
// Default Configuration
// ═══════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: PerformanceConfig = {
  sampleInterval: 100, // 100ms between samples
  duration: 3000, // 3 seconds total
  includeSamples: false,
  cpuWarnThreshold: 70,
  cpuCriticalThreshold: 90,
  memoryWarnThreshold: 70, // % of heap
  memoryCriticalThreshold: 85,
  delayWarnThreshold: 50, // ms
  delayCriticalThreshold: 100,
};

// ═══════════════════════════════════════════════════════════════
// Performance Sampler Class
// ═══════════════════════════════════════════════════════════════

class PerformanceSampler {
  private config: PerformanceConfig;
  private samples: PerformanceSample[] = [];
  private lastCpuUsage: NodeJS.CpuUsage | null = null;
  private lastSampleTime: number = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<PerformanceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Collect a single performance sample
   */
  private collectSample(): PerformanceSample {
    const now = performance.now();
    const timestamp = Date.now();

    // Memory metrics
    const memUsage = process.memoryUsage();
    const memory: MemorySnapshot = {
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers || 0,
    };

    // CPU metrics
    const currentCpuUsage = process.cpuUsage(this.lastCpuUsage || undefined);
    const elapsedTime = this.lastSampleTime > 0 ? now - this.lastSampleTime : this.config.sampleInterval;
    const cpuPercent = ((currentCpuUsage.user + currentCpuUsage.system) / 1000) / elapsedTime * 100;

    const cpu: CpuSnapshot = {
      user: currentCpuUsage.user,
      system: currentCpuUsage.system,
      percent: Math.min(cpuPercent, 100 * os.cpus().length), // Cap at max possible
    };

    this.lastCpuUsage = process.cpuUsage();
    this.lastSampleTime = now;

    // Event loop metrics
    const eventLoop = this.getEventLoopMetrics(elapsedTime);

    // Handle metrics
    const handles = this.getHandleMetrics();

    return {
      timestamp,
      memory,
      cpu,
      eventLoop,
      handles,
    };
  }

  /**
   * Get event loop metrics
   */
  private getEventLoopMetrics(elapsedTime: number): EventLoopMetrics {
    let utilization = 0;
    let delay = 0;

    // Try to get event loop utilization (Node.js 14.10+)
    try {
      const elu = (performance as typeof performance & { eventLoopUtilization?: () => { utilization: number } }).eventLoopUtilization?.();
      if (elu) {
        utilization = elu.utilization;
      }
    } catch {
      // Not available
    }

    // Estimate delay based on timing drift
    const expectedInterval = this.config.sampleInterval;
    delay = Math.max(0, elapsedTime - expectedInterval);

    return {
      delay,
      utilization,
      idlePercent: (1 - utilization) * 100,
    };
  }

  /**
   * Get active handles and requests metrics
   */
  private getHandleMetrics(): HandleMetrics {
    // @ts-expect-error - _getActiveHandles is internal but useful
    const activeHandles = process._getActiveHandles?.() || [];
    // @ts-expect-error - _getActiveRequests is internal but useful
    const activeRequests = process._getActiveRequests?.() || [];

    // Count handle types
    const handleTypes: Record<string, number> = {};
    for (const handle of activeHandles) {
      const type = handle.constructor?.name || 'Unknown';
      handleTypes[type] = (handleTypes[type] || 0) + 1;
    }

    return {
      activeHandles: activeHandles.length,
      activeRequests: activeRequests.length,
      handleTypes,
    };
  }

  /**
   * Run performance sampling for configured duration
   */
  async run(): Promise<PerformanceSample[]> {
    return new Promise((resolve) => {
      this.samples = [];
      this.lastCpuUsage = process.cpuUsage();
      this.lastSampleTime = performance.now();

      // Initial sample
      this.samples.push(this.collectSample());

      // Collect samples at interval
      this.intervalId = setInterval(() => {
        this.samples.push(this.collectSample());
      }, this.config.sampleInterval);

      // Stop after duration
      setTimeout(() => {
        if (this.intervalId) {
          clearInterval(this.intervalId);
          this.intervalId = null;
        }
        resolve(this.samples);
      }, this.config.duration);
    });
  }

  /**
   * Stop sampling early
   */
  stop(): PerformanceSample[] {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    return this.samples;
  }
}

// ═══════════════════════════════════════════════════════════════
// Analysis Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Analyze CPU usage from samples
 */
function analyzeCpu(samples: PerformanceSample[], config: PerformanceConfig): PerformanceAnalysis {
  const cpuValues = samples.map(s => s.cpu.percent);
  const avg = cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length;
  const peak = Math.max(...cpuValues);

  let status: HealthCheckStatus = 'pass';
  let message = `CPU usage normal (avg: ${avg.toFixed(1)}%)`;
  let recommendation: string | undefined;

  if (avg > config.cpuCriticalThreshold) {
    status = 'fail';
    message = `High CPU usage detected (avg: ${avg.toFixed(1)}%)`;
    recommendation = 'Consider profiling with clinic flame or 0x to identify hot spots';
  } else if (avg > config.cpuWarnThreshold) {
    status = 'warn';
    message = `Elevated CPU usage (avg: ${avg.toFixed(1)}%)`;
    recommendation = 'Monitor CPU-intensive operations';
  }

  return {
    category: 'cpu',
    status,
    message,
    value: avg,
    threshold: status === 'fail' ? config.cpuCriticalThreshold :
               status === 'warn' ? config.cpuWarnThreshold : undefined,
    recommendation,
  };
}

/**
 * Analyze memory usage from samples
 */
function analyzeMemory(samples: PerformanceSample[], config: PerformanceConfig): PerformanceAnalysis {
  const heapUsedValues = samples.map(s => s.memory.heapUsed);
  const heapTotalValues = samples.map(s => s.memory.heapTotal);

  const avgUsed = heapUsedValues.reduce((a, b) => a + b, 0) / heapUsedValues.length;
  const avgTotal = heapTotalValues.reduce((a, b) => a + b, 0) / heapTotalValues.length;
  const usagePercent = (avgUsed / avgTotal) * 100;
  const peakUsed = Math.max(...heapUsedValues);

  let status: HealthCheckStatus = 'pass';
  let message = `Memory usage healthy (${formatSize(avgUsed)} / ${formatSize(avgTotal)})`;
  let recommendation: string | undefined;

  if (usagePercent > config.memoryCriticalThreshold) {
    status = 'fail';
    message = `High memory pressure (${usagePercent.toFixed(1)}% heap used)`;
    recommendation = 'Use clinic heapprofiler or --inspect to analyze memory leaks';
  } else if (usagePercent > config.memoryWarnThreshold) {
    status = 'warn';
    message = `Elevated memory usage (${usagePercent.toFixed(1)}% heap used)`;
    recommendation = 'Monitor for memory growth patterns';
  }

  // Check for memory growth (potential leak)
  if (samples.length > 5) {
    const firstHalf = heapUsedValues.slice(0, Math.floor(samples.length / 2));
    const secondHalf = heapUsedValues.slice(Math.floor(samples.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const growth = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (growth > 20 && status === 'pass') {
      status = 'warn';
      message = `Memory growing during sampling (+${growth.toFixed(1)}%)`;
      recommendation = 'Potential memory leak - monitor over longer period';
    }
  }

  return {
    category: 'memory',
    status,
    message,
    value: usagePercent,
    threshold: status === 'fail' ? config.memoryCriticalThreshold :
               status === 'warn' ? config.memoryWarnThreshold : undefined,
    recommendation,
  };
}

/**
 * Analyze event loop from samples
 */
function analyzeEventLoop(samples: PerformanceSample[], config: PerformanceConfig): PerformanceAnalysis {
  const delays = samples.map(s => s.eventLoop.delay);
  const avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
  const maxDelay = Math.max(...delays);

  const utilizations = samples.map(s => s.eventLoop.utilization).filter(u => u > 0);
  const avgUtilization = utilizations.length > 0
    ? utilizations.reduce((a, b) => a + b, 0) / utilizations.length
    : 0;

  let status: HealthCheckStatus = 'pass';
  let message = `Event loop healthy (avg delay: ${avgDelay.toFixed(1)}ms)`;
  let recommendation: string | undefined;

  if (avgDelay > config.delayCriticalThreshold) {
    status = 'fail';
    message = `Event loop blocked (avg delay: ${avgDelay.toFixed(1)}ms)`;
    recommendation = 'Use clinic bubbleprof to identify async bottlenecks';
  } else if (avgDelay > config.delayWarnThreshold) {
    status = 'warn';
    message = `Event loop lag detected (avg delay: ${avgDelay.toFixed(1)}ms)`;
    recommendation = 'Consider using worker threads for CPU-bound tasks';
  }

  return {
    category: 'eventLoop',
    status,
    message,
    value: avgDelay,
    threshold: status === 'fail' ? config.delayCriticalThreshold :
               status === 'warn' ? config.delayWarnThreshold : undefined,
    recommendation,
  };
}

/**
 * Analyze handles from samples
 */
function analyzeHandles(samples: PerformanceSample[]): PerformanceAnalysis {
  const handleCounts = samples.map(s => s.handles.activeHandles);
  const avgHandles = handleCounts.reduce((a, b) => a + b, 0) / handleCounts.length;
  const maxHandles = Math.max(...handleCounts);

  // Get handle type breakdown from last sample
  const lastSample = samples[samples.length - 1];
  const handleTypes = lastSample?.handles.handleTypes || {};

  let status: HealthCheckStatus = 'pass';
  let message = `${Math.round(avgHandles)} active handles`;
  let recommendation: string | undefined;

  // High handle count might indicate resource leaks
  if (maxHandles > 1000) {
    status = 'warn';
    message = `High handle count (${maxHandles} peak)`;
    recommendation = 'Check for unclosed connections or file handles';
  }

  // Check for handle growth
  if (samples.length > 5) {
    const firstHalf = handleCounts.slice(0, Math.floor(samples.length / 2));
    const secondHalf = handleCounts.slice(Math.floor(samples.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    if (secondAvg > firstAvg * 1.5 && status === 'pass') {
      status = 'warn';
      message = `Handle count growing (${Math.round(firstAvg)} → ${Math.round(secondAvg)})`;
      recommendation = 'Potential handle leak - ensure resources are properly closed';
    }
  }

  return {
    category: 'handles',
    status,
    message,
    value: avgHandles,
    recommendation,
  };
}

// ═══════════════════════════════════════════════════════════════
// Main Assessment Function
// ═══════════════════════════════════════════════════════════════

/**
 * Run complete performance assessment
 */
export async function runPerformanceAssessment(
  config: Partial<PerformanceConfig> = {}
): Promise<PerformanceSummary> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const sampler = new PerformanceSampler(fullConfig);

  const samples = await sampler.run();

  // Run analyses
  const analyses: PerformanceAnalysis[] = [
    analyzeCpu(samples, fullConfig),
    analyzeMemory(samples, fullConfig),
    analyzeEventLoop(samples, fullConfig),
    analyzeHandles(samples),
  ];

  // Determine overall status
  let overallStatus: HealthCheckStatus = 'pass';
  if (analyses.some(a => a.status === 'fail')) {
    overallStatus = 'fail';
  } else if (analyses.some(a => a.status === 'warn')) {
    overallStatus = 'warn';
  }

  // Calculate averages
  const cpuValues = samples.map(s => s.cpu.percent);
  const memUsedValues = samples.map(s => s.memory.heapUsed);
  const memRssValues = samples.map(s => s.memory.rss);
  const delayValues = samples.map(s => s.eventLoop.delay);
  const utilValues = samples.map(s => s.eventLoop.utilization);
  const handleValues = samples.map(s => s.handles.activeHandles);

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  return {
    timestamp: new Date().toISOString(),
    duration: fullConfig.duration,
    sampleCount: samples.length,
    overallStatus,
    analyses,
    averages: {
      cpu: avg(cpuValues),
      memoryUsed: avg(memUsedValues),
      memoryRss: avg(memRssValues),
      eventLoopDelay: avg(delayValues),
      eventLoopUtilization: avg(utilValues),
      activeHandles: avg(handleValues),
    },
    peaks: {
      cpu: Math.max(...cpuValues),
      memoryUsed: Math.max(...memUsedValues),
      memoryRss: Math.max(...memRssValues),
      eventLoopDelay: Math.max(...delayValues),
    },
    samples: fullConfig.includeSamples ? samples : undefined,
  };
}

/**
 * Get instant performance snapshot (no sampling)
 */
export function getPerformanceSnapshot(): PerformanceSample {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  // @ts-expect-error - _getActiveHandles is internal
  const activeHandles = process._getActiveHandles?.() || [];
  // @ts-expect-error - _getActiveRequests is internal
  const activeRequests = process._getActiveRequests?.() || [];

  const handleTypes: Record<string, number> = {};
  for (const handle of activeHandles) {
    const type = handle.constructor?.name || 'Unknown';
    handleTypes[type] = (handleTypes[type] || 0) + 1;
  }

  let utilization = 0;
  try {
    const elu = (performance as typeof performance & { eventLoopUtilization?: () => { utilization: number } }).eventLoopUtilization?.();
    if (elu) utilization = elu.utilization;
  } catch {
    // Not available
  }

  return {
    timestamp: Date.now(),
    memory: {
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers || 0,
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system,
      percent: 0, // Requires delta calculation
    },
    eventLoop: {
      delay: 0,
      utilization,
      idlePercent: (1 - utilization) * 100,
    },
    handles: {
      activeHandles: activeHandles.length,
      activeRequests: activeRequests.length,
      handleTypes,
    },
  };
}

/**
 * Get V8 heap statistics
 */
export function getV8HeapStats(): v8.HeapInfo {
  return v8.getHeapStatistics();
}

// ═══════════════════════════════════════════════════════════════
// Display Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Display performance summary to console
 */
export function displayPerformanceSummary(summary: PerformanceSummary): void {
  const statusIcon = summary.overallStatus === 'pass' ? c('green', '✓') :
                     summary.overallStatus === 'warn' ? c('yellow', '⚠') :
                     c('red', '✗');
  const statusText = summary.overallStatus === 'pass' ? c('green', 'Healthy') :
                     summary.overallStatus === 'warn' ? c('yellow', 'Warnings') :
                     c('red', 'Issues Detected');

  console.log();
  console.log(c('cyan', '━'.repeat(66)));
  console.log(`  ${statusIcon} ${bold('Performance Metrics')}  ${statusText}`);
  console.log(c('cyan', '━'.repeat(66)));
  console.log();

  // CPU Section
  const cpuAnalysis = summary.analyses.find(a => a.category === 'cpu');
  const cpuIcon = getStatusIcon(cpuAnalysis?.status || 'pass');
  console.log(`  ${cpuIcon} ${bold('CPU Usage')}`);
  console.log(`    ${dim('Average:')}  ${summary.averages.cpu.toFixed(1)}%`);
  console.log(`    ${dim('Peak:')}     ${summary.peaks.cpu.toFixed(1)}%`);
  if (cpuAnalysis?.recommendation) {
    console.log(`    ${c('cyan', '→')} ${dim(cpuAnalysis.recommendation)}`);
  }
  console.log();

  // Memory Section
  const memAnalysis = summary.analyses.find(a => a.category === 'memory');
  const memIcon = getStatusIcon(memAnalysis?.status || 'pass');
  console.log(`  ${memIcon} ${bold('Memory Usage')}`);
  console.log(`    ${dim('Heap Used:')}  ${formatSize(summary.averages.memoryUsed)} / ${formatSize(summary.peaks.memoryUsed)} peak`);
  console.log(`    ${dim('RSS:')}        ${formatSize(summary.averages.memoryRss)} / ${formatSize(summary.peaks.memoryRss)} peak`);
  if (memAnalysis?.recommendation) {
    console.log(`    ${c('cyan', '→')} ${dim(memAnalysis.recommendation)}`);
  }
  console.log();

  // Event Loop Section
  const loopAnalysis = summary.analyses.find(a => a.category === 'eventLoop');
  const loopIcon = getStatusIcon(loopAnalysis?.status || 'pass');
  console.log(`  ${loopIcon} ${bold('Event Loop')}`);
  console.log(`    ${dim('Avg Delay:')}    ${summary.averages.eventLoopDelay.toFixed(1)}ms`);
  console.log(`    ${dim('Peak Delay:')}   ${summary.peaks.eventLoopDelay.toFixed(1)}ms`);
  if (summary.averages.eventLoopUtilization > 0) {
    console.log(`    ${dim('Utilization:')}  ${(summary.averages.eventLoopUtilization * 100).toFixed(1)}%`);
  }
  if (loopAnalysis?.recommendation) {
    console.log(`    ${c('cyan', '→')} ${dim(loopAnalysis.recommendation)}`);
  }
  console.log();

  // Handles Section
  const handleAnalysis = summary.analyses.find(a => a.category === 'handles');
  const handleIcon = getStatusIcon(handleAnalysis?.status || 'pass');
  console.log(`  ${handleIcon} ${bold('Active Resources')}`);
  console.log(`    ${dim('Handles:')}   ${Math.round(summary.averages.activeHandles)}`);
  if (handleAnalysis?.recommendation) {
    console.log(`    ${c('cyan', '→')} ${dim(handleAnalysis.recommendation)}`);
  }
  console.log();

  // Sampling info
  console.log(c('cyan', '─'.repeat(66)));
  console.log(`  ${dim(`Sampled ${summary.sampleCount} times over ${summary.duration}ms`)}`);
  console.log();
}

/**
 * Display instant snapshot to console
 */
export function displaySnapshot(snapshot: PerformanceSample): void {
  console.log();
  console.log(c('cyan', '━'.repeat(66)));
  console.log(`  ${bold('📊 Performance Snapshot')}`);
  console.log(c('cyan', '━'.repeat(66)));
  console.log();

  // Memory
  console.log(`  ${bold('Memory')}`);
  console.log(`    ${dim('RSS:')}        ${formatSize(snapshot.memory.rss)}`);
  console.log(`    ${dim('Heap Total:')} ${formatSize(snapshot.memory.heapTotal)}`);
  console.log(`    ${dim('Heap Used:')}  ${formatSize(snapshot.memory.heapUsed)}`);
  console.log(`    ${dim('External:')}   ${formatSize(snapshot.memory.external)}`);
  console.log();

  // Event Loop
  console.log(`  ${bold('Event Loop')}`);
  if (snapshot.eventLoop.utilization > 0) {
    console.log(`    ${dim('Utilization:')}  ${(snapshot.eventLoop.utilization * 100).toFixed(1)}%`);
    console.log(`    ${dim('Idle:')}         ${snapshot.eventLoop.idlePercent.toFixed(1)}%`);
  } else {
    console.log(`    ${dim('Utilization:')}  ${dim('(not available)')}`);
  }
  console.log();

  // Handles
  console.log(`  ${bold('Active Resources')}`);
  console.log(`    ${dim('Handles:')}   ${snapshot.handles.activeHandles}`);
  console.log(`    ${dim('Requests:')}  ${snapshot.handles.activeRequests}`);
  if (Object.keys(snapshot.handles.handleTypes).length > 0) {
    console.log(`    ${dim('Types:')}`);
    for (const [type, count] of Object.entries(snapshot.handles.handleTypes)) {
      console.log(`      ${dim('•')} ${type}: ${count}`);
    }
  }
  console.log();
}

/**
 * Format summary as JSON
 */
export function formatAsJSON(summary: PerformanceSummary): string {
  return JSON.stringify(summary, null, 2);
}

// Helper function
function getStatusIcon(status: HealthCheckStatus): string {
  switch (status) {
    case 'pass': return c('green', '✓');
    case 'warn': return c('yellow', '⚠');
    case 'fail': return c('red', '✗');
  }
}
