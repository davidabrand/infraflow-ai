import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:8787', headless: true, screenshot: 'only-on-failure' },
  reporter: 'list',
  webServer: {
    command: 'npx wrangler dev --local --ip 127.0.0.1 --port 8787',
    url: 'http://127.0.0.1:8787/api/health',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
