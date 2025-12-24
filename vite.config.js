import { defineConfig } from 'vite';
import { builtinModules } from 'module';
import { readFileSync } from 'fs';

// Read version from package.json at build time
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  define: {
    '__APP_VERSION__': JSON.stringify(pkg.version),
  },
  build: {
    target: 'node18',
    outDir: 'out',
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'node-doctor.js',
    },
    rollupOptions: {
      external: [
        // Node.js builtins
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`),
        // Keep external dependencies as ES modules
        '@inquirer/prompts',
        'semver',
      ],
      output: {
        banner: '#!/usr/bin/env node',
      },
    },
    minify: false, // Keep readable for CLI debugging
    emptyOutDir: true,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/types/**'],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    restoreMocks: true,
    clearMocks: true,
  },
});

