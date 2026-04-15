import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node environment: RopeStateMachine has zero browser/DOM deps.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
