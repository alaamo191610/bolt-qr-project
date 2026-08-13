import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Node 22.4+ exposes an experimental global `localStorage` that shadows
// jsdom's own implementation, leaving `window.localStorage` undefined in
// tests. Disable it in the worker pool when the running Node supports the
// flag; older Node versions never had the experimental global, so nothing
// to disable there.
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
const supportsNoWebStorageFlag = nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 4);

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    poolOptions: supportsNoWebStorageFlag ? {
      forks: { execArgv: ['--no-experimental-webstorage'] },
      threads: { execArgv: ['--no-experimental-webstorage'] },
    } : undefined,
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/services/**/*.ts', 'src/components/common/**/*.tsx'],
    },
  },
}));
