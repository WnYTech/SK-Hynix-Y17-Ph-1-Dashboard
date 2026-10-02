import type { LogRecord, Metadata, Program } from '../../frontend/src/types';
import { expect, test, type Page } from './fixtures';

const viewer = (page: Page) => page.locator('.program-workspace:visible .viewer-container:visible');
const row = (page: Page, id: string) => viewer(page).locator(`tr[data-log-id="${id}"]`);
const cell = (page: Page, id: string, column: keyof LogRecord) =>
  row(page, id).locator(`td[data-column="${column}"]`);

function log(id: string, overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    id,
    datetime: new Date().toISOString(),
    system: 'MES',
    process: 'MES-CORE',
    server: 'shared-value',
    sequence: '1',
    log_type: 'Q',
    transaction_name: 'LotStart',
    class_name: 'shared-value',
    transaction_key: `key-${id}`,
    global_transaction_id: `global-${id}`,
    global_transaction_sequence: '0',
    event_transaction_id: `event-${id}`,
    service_transaction_id: `service-${id}`,
    lot: 'LOT-1',
    eqp: 'EQP-1',
    elapsed_ms: 1,
    message: 'status=OK',
    ...overrides,
  };
}

async function searchFixture(page: Page, program: Program) {
  // Deliberately vary names independently of IDs and repeat values across columns.
  const first = [
    log('a'),
    log('b', { system: 'EAP' }),
    log('c', {
      transaction_name: 'LotComplete',
      transaction_key: 'key-a',
      global_transaction_id: 'global-a',
    }),
    log('empty', { transaction_name: '' }),
    log('spaces', { transaction_name: '   ' }),
    log('no-id', { global_transaction_id: '', transaction_key: '' }),
    log('prefix', { transaction_name: 'LotStartExtra' }),
    log('case', { transaction_name: 'lotstart' }),
  ];
  const second = [log('next-match'), log('next-other', { transaction_name: 'LotComplete' })];
  first.push(
    ...Array.from({ length: 92 }, (_, index) =>
      log(`filler-${index}`, { transaction_name: 'Unrelated', class_name: 'filler' }),
    ),
  );
  const metadata: Metadata = {
    source_status: 'connected',
    source_kind: 'none',
    total_records: first.length + second.length,
    generated_at: null,
    earliest_at: null,
    latest_at: null,
    exports_available: false,
    fabs: ['Y17'],
    systems: ['MES', 'EAP'],
    processes: [],
    core_biz: [],
    log_types: ['Q'],
    retention_days: 7,
    max_page_size: 1000,
    timezone: 'Asia/Seoul',
  };
  await page.route('**/api/metadata', (route) => route.fulfill({ json: metadata }));
  await page.route('**/api/logs/search', (route) => {
    const body = route.request().postDataJSON();
    const next = body.page === 2;
    const all = [...first, ...second];
    const transaction = all.filter(
      (row) =>
        body.highlight?.transaction_name &&
        row.transaction_name.trim() === body.highlight.transaction_name,
    );
    const cells = all.filter((row) => body.highlight?.column && row.id === body.highlight.row_id);
    return route.fulfill({
      json: {
        items: next ? second : first,
        current_cursor: next ? 'second' : 'first',
        next_cursor: next ? null : 'second',
        total: metadata.total_records,
        page: next ? 2 : 1,
        total_pages: 2,
        highlight_counts: !body.count_only
          ? null
          : {
              transaction: transaction.length,
              cell: cells.length,
              any: new Set([...transaction, ...cells].map((row) => row.id)).size,
            },
        took_ms: 1,
      },
    });
  });
  await page.goto(`/#program=${program}&system=MES`);
  await viewer(page).getByRole('combobox', { name: '페이지당 행 수' }).click();
  await page.getByRole('option', { name: '100 rows', exact: true }).click();
  await viewer(page).getByRole('button', { name: '검색', exact: true }).click();
  await expect(row(page, 'a')).toBeVisible();
}

for (const program of ['acell', 'arc'] as const) {
  test(`${program}: highlights only identical transaction names across different IDs and systems`, async ({
    page,
  }) => {
    await searchFixture(page, program);
    await row(page, 'a').locator('.number-column button').click();
    await expect(viewer(page).locator('.related-row')).toHaveCount(3);
    for (const id of ['a', 'b', 'no-id']) {
      await expect(row(page, id)).toHaveClass(/related-row/);
      await expect(cell(page, id, 'transaction_name')).toHaveCSS(
        'background-color',
        'rgb(248, 216, 232)',
      );
    }
    for (const id of ['c', 'empty', 'spaces', 'prefix', 'case']) {
      await expect(row(page, id)).not.toHaveClass(/related-row/);
    }
    await cell(page, 'b', 'transaction_name').hover();
    await expect(cell(page, 'b', 'transaction_name')).toHaveCSS(
      'background-color',
      'rgb(248, 216, 232)',
    );
    await row(page, 'c').locator('.number-column button').click();
    await expect(viewer(page).locator('.related-row')).toHaveCount(1);
    await expect(row(page, 'c')).toHaveClass(/related-row/);
    for (const id of ['empty', 'spaces']) {
      await row(page, id).locator('.number-column button').click();
      await expect(viewer(page).locator('.related-row')).toHaveCount(0);
      await expect(row(page, id)).toHaveClass(/selected-row/);
    }
  });

  test(`${program}: exactly one cell is selected despite duplicate values, persists across pages and clears`, async ({
    page,
  }) => {
    await searchFixture(page, program);
    const clicked = cell(page, 'a', 'class_name');
    await clicked.getByRole('button').click();
    await expect(viewer(page).locator('.highlighted-cell')).toHaveCount(1);
    await expect(clicked).toHaveCSS('background-color', 'rgb(255, 230, 128)');
    await page.mouse.move(0, 0);
    await expect(clicked).toHaveCSS('background-color', 'rgb(255, 230, 128)');
    await expect(cell(page, 'a', 'server')).not.toHaveClass(/highlighted-cell/);
    await expect(cell(page, 'b', 'class_name')).not.toHaveClass(/highlighted-cell/);
    await expect(viewer(page).getByTestId('cell-count')).toHaveText('1');
    await expect(viewer(page).getByTestId('transaction-count')).toHaveText('4');
    await viewer(page).getByRole('button', { name: '다음 페이지', exact: true }).click();
    await expect(viewer(page).locator('.current-page')).toHaveText('2');
    await expect(row(page, 'next-match')).toHaveClass(/related-row/);
    await expect(row(page, 'next-other')).not.toHaveClass(/related-row/);
    await expect(viewer(page).locator('.highlighted-cell')).toHaveCount(0);
    await viewer(page).getByRole('button', { name: '이전 페이지', exact: true }).click();
    await expect(viewer(page).locator('.current-page')).toHaveText('1');
    await expect(clicked).toHaveClass(/highlighted-cell/);
    await expect(viewer(page).locator('.highlighted-cell')).toHaveCount(1);
    await row(page, 'c').locator('.number-column button').click();
    await expect(viewer(page).locator('.highlighted-cell')).toHaveCount(0);
    await cell(page, 'a', 'class_name').getByRole('button').click();
    await viewer(page).getByRole('combobox', { name: 'System', exact: true }).click();
    await page.getByRole('option', { name: 'EAP', exact: true }).click();
    await viewer(page).getByRole('button', { name: '검색', exact: true }).click();
    await expect(row(page, 'a')).toBeVisible();
    await expect(viewer(page).locator('.related-row')).toHaveCount(0);
    await expect(viewer(page).locator('.highlighted-cell')).toHaveCount(0);
  });

  test(`${program}: a named row without an ID highlights but does not open an invalid related search`, async ({
    page,
  }) => {
    await searchFixture(page, program);
    await row(page, 'no-id').locator('.number-column button').click({ button: 'right' });
    await expect(viewer(page).locator('.related-row')).toHaveCount(3);
    await page.getByRole('menuitem', { name: '트랜잭션 연관검색', exact: true }).click();
    await expect(
      page.getByText(
        `선택한 로그에 ${program === 'acell' ? 'G 트랜잭션 ID' : '트랜잭션 키'}가 없습니다.`,
      ),
    ).toBeVisible();
    expect(page.context().pages()).toHaveLength(1);
  });
}
