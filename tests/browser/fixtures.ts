import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { test as base } from '@playwright/test';

// Exercise an isolated build against an existing API without starting a server
// or replacing the assets currently served to users.
export const test = base.extend<{ compiledAssets: void }>({
  compiledAssets: [
    async ({ context, baseURL }, use) => {
      const buildDir = process.env.Y17_TEST_BUILD_DIR;
      if (buildDir && baseURL) {
        const root = resolve(buildDir);
        const origin = new URL(baseURL).origin;
        const contentTypes: Record<string, string> = {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.woff2': 'font/woff2',
        };
        await context.route('**/*', async (route) => {
          const url = new URL(route.request().url());
          if (
            url.origin !== origin ||
            url.pathname.startsWith('/api/') ||
            route.request().method() !== 'GET'
          ) {
            await route.fallback();
            return;
          }
          const file = resolve(root, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
          if (!file.startsWith(`${root}${sep}`)) throw new Error('Invalid build asset path');
          await route.fulfill({
            body: await readFile(file),
            contentType: contentTypes[extname(file)] ?? 'application/octet-stream',
          });
        });
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect, type Page } from '@playwright/test';
