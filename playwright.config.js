import { defineConfig, devices } from '@playwright/test';

// Tests run against the built single file (dist/diptych.html); `npm test` rebuilds it first.
// No web server: tests/helpers.js serves the page through request interception.
export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
});
