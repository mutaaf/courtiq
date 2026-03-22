import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov', 'json-summary'],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
      include: ['src/lib/**', 'src/app/api/**', 'src/hooks/**'],
      exclude: ['src/types/**', '**/*.d.ts', 'src/components/ui/**'],
    },
    exclude: ['**/node_modules/**', '**/e2e/**', '**/*.spec.ts'],
    pool: 'forks',
  },
});
