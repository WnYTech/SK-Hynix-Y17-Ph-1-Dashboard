import { expect, test, type Page } from './fixtures';
import type { Response } from '@playwright/test';

const viewer = (page: Page) => page.locator('.program-workspace:visible .viewer-container:visible');
const rowsResponse = (page: Page) =>
  page.waitForResponse(
    (response: Response) =>
      response.url().endsWith('/api/logs/search') && !response.request().postDataJSON().count_only,
  );
async function openData(page: Page, program: string) {
  await page.goto(`/#program=${program}`);
  const response = rowsResponse(page);
  await viewer(page).getByRole('button', { name: '더미 로그 조회', exact: true }).click();
  const first = await (await response).json();
  await expect(viewer(page).locator('.log-table')).toHaveAttribute('data-loaded-rows', '1000');
  return first;
}
async function setColor(page: Page, label: string, value: string) {
  await viewer(page)
    .getByLabel(label, { exact: true })
    .evaluate((element, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        element,
        value,
      );
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
}

for (const program of ['acell', 'arc']) {
  test(`${program}: calendar and text selection keep KST and do not submit until search`, async ({
    page,
  }) => {
    await page.goto(`/#program=${program}&system=MES`);
    const active = viewer(page);
    let searches = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/logs/search')) searches++;
    });
    await active.getByRole('button', { name: '최근 1시간', exact: true }).click();
    await expect(active.getByRole('combobox', { name: '조회 기간 프리셋' })).toHaveText(
      '최근 1시간',
    );
    const target = new Date(Date.now() - 3 * 86400000 + 9 * 3600000).toISOString().slice(0, 10);
    const [year, month, day] = target.split('-').map(Number);
    await active.getByRole('button', { name: '시작 시간 달력 열기', exact: true }).click();
    const calendar = page.getByRole('dialog', { name: '시작 시간 선택', exact: true });
    await expect(calendar).toBeVisible();
    await expect(calendar).not.toContainText(/오전|오후|AM|PM/);
    if (target.slice(0, 7) !== new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 7))
      await calendar.getByRole('button', { name: '이전 달', exact: true }).click();
    await calendar
      .getByRole('button', { name: `${year}년 ${month}월 ${day}일`, exact: true })
      .click();
    for (const [unit, value] of [
      ['시', '13'],
      ['분', '14'],
      ['초', '15'],
      ['밀리초 (ms)', '123'],
    ])
      await calendar.getByLabel(`시작 시간 ${unit}`, { exact: true }).fill(value);
    await expect(active.getByLabel('시작 시간', { exact: true })).toHaveValue(
      `${target} 13:14:15.123`,
    );
    await expect(calendar.locator('output')).toHaveText(`${target} 13:14:15.123`);
    await expect(active.getByRole('combobox', { name: '조회 기간 프리셋' })).toHaveText(
      '직접 입력',
    );
    expect(searches).toBe(0);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 740 });
      const bounds = await calendar.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(740);
      expect(await calendar.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(
        1,
      );
      await calendar.screenshot({ path: `test-results/calendar-${program}-${width}.png` });
    }
    await calendar.getByLabel('시작 시간 초', { exact: true }).fill('60');
    await expect(calendar.getByRole('alert')).toContainText('00~59');
    await calendar.getByLabel('시작 시간 초', { exact: true }).fill('15');
    await calendar.getByLabel('시작 시간 초', { exact: true }).press('Escape');
    await expect(calendar).not.toBeVisible();
    const response = rowsResponse(page);
    await active.getByRole('button', { name: '검색', exact: true }).click();
    const request = (await response).request().postDataJSON();
    expect(request.time_range.start).toBe(`${target}T04:14:15.123Z`);
    await expect(active.getByLabel('시작 시간', { exact: true })).toHaveValue(
      `${target} 13:14:15.123`,
    );
    await active.getByLabel('시작 시간', { exact: true }).fill(`${target} 13:14:15.1234`);
    await active.getByRole('button', { name: '검색', exact: true }).click();
    await expect(active.getByRole('alert')).toContainText('최대 3자리');
    await active.getByLabel('시작 시간', { exact: true }).fill(`${target} 13:14:15.123`);
    await active.getByLabel('종료 시간', { exact: true }).fill(`${target} 13:14:15.124`);
    const millisecondResponse = rowsResponse(page);
    await active.getByRole('button', { name: '검색', exact: true }).click();
    const result = await millisecondResponse;
    expect(result.status()).toBe(200);
    expect(result.request().postDataJSON().time_range).toEqual({
      start: `${target}T04:14:15.123Z`,
      end: `${target}T04:14:15.124Z`,
    });
  });

  test(`${program}: virtual rows, direct pages, final page and global sorting`, async ({
    page,
  }) => {
    const first = await openData(page, program);
    const active = viewer(page);
    await expect(active.getByTestId('total-pages')).toHaveText(
      String(Math.ceil(first.total / 1000)),
    );
    expect(await active.locator('tbody tr[data-log-id]').count()).toBeLessThanOrEqual(30);
    expect(await active.locator('.log-table td').count()).toBeLessThan(600);
    await active.locator('.table-scroll').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(active.locator('tbody tr[data-log-id]').last()).toHaveAttribute(
      'data-log-id',
      first.items[999].id,
    );
    await page.clock.install();
    await page.clock.fastForward(13 * 60000);
    let response = rowsResponse(page);
    await active.getByLabel('이동할 페이지', { exact: true }).fill('3');
    await active.locator('.page-jump').getByRole('button', { name: '이동', exact: true }).click();
    let result = await (await response).json();
    expect(result.page).toBe(3);
    await expect(active.locator('.current-page')).toHaveText('3');
    await expect(
      active.locator('tbody tr[data-log-id]').first().locator('.number-column'),
    ).toHaveText('2001');
    let requests = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/logs/search')) requests++;
    });
    await active.getByRole('button', { name: '첫 페이지', exact: true }).click();
    await expect(active.locator('.current-page')).toHaveText('1');
    expect(requests).toBe(0);
    // Cache expiry follows the original query, including pages first visited later.
    await page.clock.fastForward(2 * 60000);
    response = rowsResponse(page);
    await active.getByRole('button', { name: '3페이지', exact: true }).click();
    expect((await (await response).json()).page).toBe(3);
    expect(requests).toBe(1);
    response = rowsResponse(page);
    await active.getByRole('button', { name: '마지막 페이지', exact: true }).click();
    result = await (await response).json();
    expect(result.next_cursor).toBeNull();
    await expect(active.getByRole('button', { name: '다음 페이지', exact: true })).toBeDisabled();
    response = rowsResponse(page);
    await active.getByRole('combobox', { name: '페이지당 행 수' }).click();
    await page.getByRole('option', { name: '100 rows', exact: true }).click();
    result = await (await response).json();
    expect(result.page).toBe(1);
    await expect(active.getByTestId('total-pages')).toHaveText(
      String(Math.ceil(first.total / 100)),
    );
    for (const direction of ['asc', 'desc']) {
      response = rowsResponse(page);
      await active.locator('th[data-column="transaction_name"] button').click();
      const sorted = await response;
      expect(sorted.request().postDataJSON().sort).toEqual({
        field: 'transaction_name',
        direction,
      });
      result = await sorted.json();
      const names = result.items.map((row: { transaction_name: string }) => row.transaction_name);
      expect(names).toEqual(
        [...names].sort((a, b) => (direction === 'asc' ? a.localeCompare(b) : b.localeCompare(a))),
      );
      await expect(active.locator('th[data-column="transaction_name"]')).toHaveAttribute(
        'aria-sort',
        direction === 'asc' ? 'ascending' : 'descending',
      );
    }
  });

  test(`${program}: whole-query highlight counts, union filter and clear`, async ({ page }) => {
    const first = await openData(page, program);
    const active = viewer(page);
    const row = first.items[0];
    const statsResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/logs/search') && response.request().postDataJSON().count_only,
    );
    await active
      .locator('tbody tr[data-log-id]')
      .first()
      .locator('td[data-column="log_type"] button')
      .click();
    const stats = await (await statsResponse).json();
    expect(stats.highlight_counts.transaction).toBeGreaterThan(1000);
    await expect(active.getByTestId('transaction-count')).toHaveText(
      stats.highlight_counts.transaction.toLocaleString(),
    );
    await expect(active.getByTestId('cell-count')).toHaveText(
      stats.highlight_counts.cell.toLocaleString(),
    );
    for (const [mode, label] of [
      ['transaction', '동일 트랜잭션만'],
      ['cell', '선택 셀만'],
      ['any', '하이라이트만 보기'],
    ]) {
      const response = rowsResponse(page);
      await active.getByRole('button', { name: label, exact: true }).click();
      const filtered = await (await response).json();
      expect(filtered.total).toBe(stats.highlight_counts[mode]);
      expect(filtered.base_total).toBe(first.total);
      expect(
        filtered.items.every((item: { id: string; transaction_name: string; log_type: string }) =>
          mode === 'transaction'
            ? item.transaction_name === row.transaction_name
            : mode === 'cell'
              ? item.id === row.id
              : item.transaction_name === row.transaction_name || item.id === row.id,
        ),
      ).toBe(true);
      await expect(active.locator('.current-page')).toHaveText('1');
    }
    const response = rowsResponse(page);
    await active.getByRole('button', { name: '강조 해제', exact: true }).click();
    expect((await (await response).json()).total).toBe(first.total);
    await expect(active.getByTestId('cell-count')).toHaveText('0');
    await expect(active.locator('.highlighted-cell')).toHaveCount(0);
    await expect(active.locator('.related-row')).toHaveCount(0);
  });

  test(`${program}: column drag, keyboard order and custom colors persist without narrow overflow`, async ({
    page,
  }) => {
    await openData(page, program);
    const active = viewer(page);
    const headers = active.locator('thead th[data-column]');
    const resize = active.getByRole('separator', { name: 'Datetime 너비 조절', exact: true });
    const initialWidth = Number(await resize.getAttribute('aria-valuenow'));
    await resize.scrollIntoViewIfNeeded();
    const handle = await resize.boundingBox();
    await page.mouse.move(handle!.x + 4, handle!.y + 15);
    await page.mouse.down();
    await page.mouse.move(handle!.x + 104, handle!.y + 15, { steps: 5 });
    await page.mouse.up();
    await expect(resize).toHaveAttribute('aria-valuenow', String(initialWidth + 100));
    await resize.focus();
    await resize.press('ArrowLeft');
    await expect(resize).toHaveAttribute('aria-valuenow', String(initialWidth + 80));
    await expect(active.locator('th[data-column="datetime"]')).toHaveAttribute(
      'aria-sort',
      'descending',
    );

    const firstKey = await headers.nth(0).getAttribute('data-column');
    const secondKey = await headers.nth(1).getAttribute('data-column');
    await headers.nth(1).dragTo(headers.nth(0));
    await expect(headers.nth(0)).toHaveAttribute('data-column', secondKey!);
    await active.getByRole('button', { name: '컬럼 순서', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Datetime 앞으로 이동', exact: true })
      .click();
    await page.getByRole('button', { name: '완료', exact: true }).click();
    await expect(headers.nth(0)).toHaveAttribute('data-column', firstKey!);
    await setColor(page, '트랜잭션 강조 색상', '#dd6633');
    await setColor(page, '선택 셀 강조 색상', '#662200');
    await active
      .locator('tbody tr[data-log-id]')
      .first()
      .locator('td[data-column="log_type"] button')
      .click();
    await expect(active.locator('.highlighted-cell').first()).toHaveCSS(
      'background-color',
      'rgb(102, 34, 0)',
    );
    await expect(active.locator('.highlighted-cell').first()).toHaveCSS(
      'color',
      'rgb(255, 255, 255)',
    );
    await expect(
      active.locator('.related-row').first().locator('td[data-column="transaction_name"]'),
    ).toHaveCSS('background-color', 'rgb(221, 102, 51)');
    await page.screenshot({ path: `test-results/table-${program}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await page.screenshot({ path: `test-results/table-${program}-mobile.png`, fullPage: true });
    await page.reload();
    await expect(
      viewer(page).getByRole('separator', { name: 'Datetime 너비 조절', exact: true }),
    ).toHaveAttribute('aria-valuenow', String(initialWidth + 80));
    await expect(viewer(page).getByLabel('선택 셀 강조 색상', { exact: true })).toHaveValue(
      '#662200',
    );
    await expect(viewer(page).getByLabel('트랜잭션 강조 색상', { exact: true })).toHaveValue(
      '#dd6633',
    );
  });
}
