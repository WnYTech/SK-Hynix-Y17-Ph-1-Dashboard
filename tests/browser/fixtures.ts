import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { test as base } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

type ApiReply = { id: number; status: number; body: string };
type LocalApi = (method: string, path: string, body?: unknown) => Promise<ApiReply>;

const worker = base.extend<{}, { localApi: LocalApi | null }>({
  localApi: [
    async ({}, use) => {
      if (process.env.Y17_TEST_LOCAL_API !== '1') {
        await use(null);
        return;
      }
      const child = spawn('python3', ['tests/browser/api_bridge.py'], {
        stdio: ['pipe', 'pipe', 'inherit'],
      });
      let next = 0;
      const pending = new Map<
        number,
        { resolve: (reply: ApiReply) => void; reject: (error: Error) => void }
      >();
      const lines = createInterface({ input: child.stdout });
      lines.on('line', (line) => {
        const reply: ApiReply = JSON.parse(line);
        pending.get(reply.id)?.resolve(reply);
        pending.delete(reply.id);
      });
      const fail = () => {
        for (const item of pending.values()) item.reject(new Error('TestClient bridge closed'));
        pending.clear();
      };
      child.on('error', fail);
      child.on('exit', fail);
      await use(
        (method, path, body) =>
          new Promise((resolve, reject) => {
            const id = ++next;
            pending.set(id, { resolve, reject });
            child.stdin.write(`${JSON.stringify({ id, method, path, body })}\n`);
          }),
      );
      child.stdin.end();
      child.kill();
      lines.close();
    },
    { scope: 'worker' },
  ],
});

// Exercise an isolated build against an existing API without starting a server
// or replacing the assets currently served to users.
export const test = worker.extend<{ compiledAssets: void }>({
  compiledAssets: [
    async ({ context, baseURL, localApi }, use) => {
      if (localApi)
        await context.route('**/api/**', async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          const reply = await localApi(
            request.method(),
            url.pathname + url.search,
            request.postData() ? request.postDataJSON() : undefined,
          );
          await route.fulfill({
            status: reply.status,
            body: reply.body,
            contentType: 'application/json',
          });
        });
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
