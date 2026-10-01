import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5177',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'python3.11 -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8017',
      url: 'http://127.0.0.1:8017/api/health',
      reuseExistingServer: !process.env.CI,
    },
    { command: 'npm run dev', url: 'http://127.0.0.1:5177', reuseExistingServer: !process.env.CI },
  ],
});
