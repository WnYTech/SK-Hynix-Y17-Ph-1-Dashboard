import { expect, test, type Page } from './fixtures';

// Keep large DOM snapshots from competing with another 1,000-row browser case.
test.describe.configure({ mode: 'default', timeout: 60000 });

const viewer = (page: Page) => page.locator('.program-workspace:visible .viewer-container:visible');

test.beforeEach(async ({ request }) => {
  const metadata = await (await request.get('/api/metadata')).json();
  test.skip(
    metadata.source_kind !== 'dummy',
    'Generate the optional dataset with npm run data:generate.',
  );
  expect(metadata.total_records).toBe(3_000_000);
});

for (const [program, title, transactionTab] of [
  ['acell', 'M14N Acell LogViewer', 'G 트랜잭션'],
  ['arc', 'ARC LMS', '트랜잭션 전체 로그'],
] as const) {
  test(`${title}: real dummy search, pagination, selection and cross-system detail`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/#program=${program}`);
    const active = viewer(page);
    const detail = active.locator('.detail-panel');
    await expect(active.getByText('더미 데이터 · 3,000,000건')).toBeVisible();
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/api/logs/search') && !r.request().postDataJSON().count_only,
    );
    await active
      .locator('.dummy-source-banner')
      .getByRole('button', { name: '더미 로그 조회' })
      .click();
    const first = await (await response).json();
    expect(first.items).toHaveLength(1000);
    expect(first.total).toBeGreaterThan(1000);
    await expect(active.locator('.log-table')).toHaveAttribute('data-loaded-rows', '1000');
    await expect(
      active.locator('.search-panel').getByRole('combobox', { name: 'System', exact: true }),
    ).toHaveText('MES');
    await active
      .locator('.log-table tbody tr')
      .first()
      .getByRole('button', { name: '1', exact: true })
      .click();
    await expect(active.locator('.message-content')).toHaveText(first.items[0].message);
    await expect
      .poll(async () =>
        Number((await active.getByTestId('transaction-count').innerText()).replaceAll(',', '')),
      )
      .toBeGreaterThan(3);
    await detail.getByRole('combobox', { name: '로그 표시 형식' }).click();
    await page.getByRole('option', { name: 'JSON', exact: true }).click();
    await expect(active.locator('.message-content')).toContainText('"dummy": true');
    // Preserve the transaction name and selected cell when paging away and back.
    await active
      .locator('.log-table tbody tr')
      .first()
      .getByRole('button', { name: 'TransactionHandler', exact: true })
      .click();
    await expect(active.locator('.highlighted-cell')).toHaveCount(1);
    const nextResponse = page.waitForResponse(
      (r) => r.url().endsWith('/api/logs/search') && !r.request().postDataJSON().count_only,
    );
    await active
      .locator('.pagination')
      .getByRole('button', { name: '다음 페이지', exact: true })
      .click();
    await nextResponse;
    await expect(active.locator('.current-page')).toHaveText('2');
    await expect(active.locator('.log-table')).toHaveAttribute('data-loaded-rows', '1000');
    await expect(active.locator('.highlighted-cell')).toHaveCount(0);
    await active
      .locator('.pagination')
      .getByRole('button', { name: '이전 페이지', exact: true })
      .click();
    await expect(active.locator('.current-page')).toHaveText('1');
    await expect(active.locator('.log-table .selected-row')).toHaveCount(1);
    await expect(active.locator('.highlighted-cell')).toHaveCount(1);
    await expect(active.locator('.selected-row td[data-column="class_name"]')).toHaveClass(
      /highlighted-cell/,
    );
    await detail.getByRole('tab', { name: transactionTab, exact: true }).click();
    await expect(active.locator('.transaction-content article')).toHaveCount(12);
    for (const system of ['MES', 'EAP', 'FDC', 'APC']) {
      await expect(active.locator('.transaction-content')).toContainText(
        `${system} · DEMO-${system}`,
      );
    }
    if (program === 'acell') {
      await detail.getByRole('tab', { name: 'S 트랜잭션', exact: true }).click();
      await expect(active.locator('.transaction-content article')).toHaveCount(2);
      await detail.getByRole('tab', { name: 'E 트랜잭션', exact: true }).click();
      await expect(active.locator('.transaction-content article')).toHaveCount(4);
    }
    await page.screenshot({ path: `test-results/dummy-${program}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await expect(
      active.locator('.dummy-source-banner').getByRole('button', { name: '더미 로그 조회' }),
    ).toBeVisible();
    await page.screenshot({ path: `test-results/dummy-${program}-mobile.png`, fullPage: true });
    await active
      .locator('.search-panel')
      .getByRole('button', { name: '다운로드', exact: true })
      .click();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: '다운로드 요청' }),
    ).toBeDisabled();
    await expect(page.getByRole('dialog')).toContainText(
      '전체 로그 내보내기는 아직 연결되지 않았습니다',
    );
    expect(errors).toEqual([]);
  });
}

test('ARC Full Text and correlation return real matching transactions', async ({ page }) => {
  await page.goto('/#program=arc');
  const active = viewer(page);
  await active
    .locator('.dummy-source-banner')
    .getByRole('button', { name: '더미 로그 조회' })
    .click();
  await expect(active.locator('.log-table')).toHaveAttribute('data-loaded-rows', '1000');
  await active.locator('.search-panel').getByRole('button', { name: '상세 검색조건' }).click();
  await active.getByLabel('Full Text').fill('"status":"ERROR"');
  await active
    .locator('.search-panel')
    .getByRole('checkbox', { name: '트랜잭션 연관검색' })
    .check();
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/logs/search') && !r.request().postDataJSON().count_only,
  );
  await active.locator('.search-panel').getByRole('button', { name: '검색', exact: true }).click();
  const result = await (await response).json();
  expect(result.total).toBeGreaterThan(0);
  expect(result.total % 12).toBe(0);
  expect(new Set(result.items.map((row: { system: string }) => row.system))).toEqual(
    new Set(['MES', 'EAP', 'FDC', 'APC']),
  );
  await expect(active.locator('.log-table')).toHaveAttribute(
    'data-loaded-rows',
    String(result.items.length),
  );
  await active.getByLabel('Full Text').fill('there-is-no-such-dummy-message');
  await active.locator('.search-panel').getByRole('button', { name: '검색', exact: true }).click();
  await expect(active.getByText('검색조건에 맞는 로그가 없습니다')).toBeVisible();
});
