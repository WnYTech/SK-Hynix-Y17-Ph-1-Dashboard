import { expect, test, type Page } from './fixtures';

const viewer = (page: Page) => page.locator('.program-workspace:visible .viewer-container:visible');
const openProgram = (page: Page, name: 'M14N Acell LogViewer' | 'ARC LMS') =>
  page.locator('nav').getByRole('button', { name, exact: true }).click();

// Exercise the unconfigured-source UI independently of the optional local dummy database.
// The real API contract is also covered by backend/tests/test_api.py.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/metadata', (route) =>
    route.fulfill({
      json: {
        source_status: 'unconfigured',
        source_kind: 'none',
        total_records: 0,
        generated_at: null,
        earliest_at: null,
        latest_at: null,
        exports_available: false,
        fabs: [],
        systems: [],
        processes: [],
        core_biz: [],
        log_types: [],
        retention_days: 7,
        max_page_size: 1000,
        timezone: 'Asia/Seoul',
      },
    }),
  );
  await page.route('**/api/logs/search', (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: {
          code: 'SOURCE_NOT_CONFIGURED',
          message:
            '로그 데이터 소스가 연결되지 않았습니다. 연결 후 조회와 다운로드를 사용할 수 있습니다.',
        },
      },
    }),
  );
});

test('starts without fabricated logs and distinguishes an unconfigured source', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('로그 데이터 소스를 연결해 주세요')).toBeVisible();
  await expect(viewer(page).getByText('로그 탐색을 시작하세요')).toBeVisible();
  await expect(page.locator('.log-table tbody tr')).toHaveCount(0);
  await viewer(page).getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('G 트랜잭션 ID가 필요');
  await viewer(page).getByLabel('G 트랜잭션 ID', { exact: true }).fill('condition-only');
  const response = page.waitForResponse((response) => response.url().endsWith('/api/logs/search'));
  await viewer(page).getByRole('button', { name: '검색', exact: true }).click();
  expect((await response).status()).toBe(503);
  await expect(page.getByRole('alert')).toContainText('로그 데이터 소스가 연결되지 않았습니다');
  expect(errors).toEqual([]);
});

test('checks typed dates before querying', async ({ page }) => {
  await page.goto('/');
  await viewer(page).getByLabel('G 트랜잭션 ID', { exact: true }).fill('condition-only');
  await viewer(page).getByLabel('시작 시간', { exact: true }).fill('2026-02-30 12:00:00');
  await viewer(page).getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('유효한 날짜');
  await viewer(page).getByLabel('시작 시간', { exact: true }).fill('2000-01-01 00:00:00');
  await viewer(page).getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('최근 7일');
  await viewer(page).getByRole('combobox', { name: '조회 기간 프리셋' }).click();
  await page.getByRole('option', { name: '최근 7일', exact: true }).click();
  await viewer(page).getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('데이터 소스가 연결되지 않았습니다');
});

test('sidebar separates program fields, columns, detail tabs and request payloads', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveTitle('M14N Acell LogViewer · Y17');
  await viewer(page).getByRole('button', { name: '상세 검색조건' }).click();
  await expect(viewer(page).getByLabel('Full Text')).toHaveCount(0);
  await expect(viewer(page).getByLabel('트랜잭션 키', { exact: true })).toHaveCount(0);
  await expect(viewer(page).getByLabel('서버', { exact: true })).toBeVisible();
  await expect(viewer(page).getByRole('combobox', { name: '로그 종류' })).toBeVisible();
  await expect(
    viewer(page).getByRole('columnheader', { name: 'G 트랜잭션 컬럼', exact: true }),
  ).toBeVisible();
  await expect(
    viewer(page).getByRole('columnheader', { name: '소요 (ms) 컬럼', exact: true }),
  ).toBeVisible();
  for (const name of ['단일 로그', 'S 트랜잭션', 'E 트랜잭션', 'G 트랜잭션']) {
    await expect(viewer(page).getByRole('tab', { name, exact: true })).toBeVisible();
  }
  await viewer(page).getByLabel('G 트랜잭션 ID', { exact: true }).fill('condition-only');
  await viewer(page).getByLabel('S 트랜잭션 ID', { exact: true }).fill('service-condition');
  const acellRequest = page.waitForRequest((request) => request.url().endsWith('/api/logs/search'));
  await viewer(page).getByRole('button', { name: '검색', exact: true }).click();
  const acellBody = (await acellRequest).postDataJSON();
  expect(acellBody.program).toBe('acell');
  expect(acellBody.filters.service_transaction_id).toEqual(['service-condition']);
  expect(acellBody.filters.transaction_key).toEqual([]);
  await expect(page.getByRole('alert')).toContainText('데이터 소스가 연결되지 않았습니다');

  await openProgram(page, 'ARC LMS');
  await expect(page).toHaveTitle('ARC LMS · Y17');
  await viewer(page).getByRole('button', { name: '상세 검색조건' }).click();
  await expect(viewer(page).getByLabel('G 트랜잭션 ID', { exact: true })).toHaveCount(0);
  await expect(viewer(page).getByLabel('서버', { exact: true })).toHaveCount(0);
  await expect(viewer(page).getByRole('textbox', { name: '로그 종류' })).toBeVisible();
  await expect(
    viewer(page).getByRole('columnheader', { name: '트랜잭션 키 컬럼', exact: true }),
  ).toBeVisible();
  await expect(
    viewer(page).getByRole('columnheader', { name: 'G 트랜잭션 컬럼', exact: true }),
  ).toHaveCount(0);
  await expect(viewer(page).getByRole('tab', { name: '트랜잭션 전체 로그' })).toBeVisible();
  await expect(viewer(page).getByRole('tab', { name: 'S 트랜잭션' })).toHaveCount(0);
  await viewer(page).getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('트랜잭션 키가 필요');
  await viewer(page).getByLabel('트랜잭션 키', { exact: true }).fill('key-condition');
  await viewer(page).getByLabel('Full Text').fill('message condition');
  await viewer(page).getByLabel('로그 종류', { exact: true }).fill('A Q Z');
  await viewer(page).getByRole('checkbox', { name: '트랜잭션 연관검색' }).check();
  const response = page.waitForResponse((response) => response.url().endsWith('/api/logs/search'));
  await viewer(page).getByRole('button', { name: '검색', exact: true }).click();
  const arcResponse = await response;
  expect(arcResponse.status()).toBe(503);
  const arcBody = arcResponse.request().postDataJSON();
  expect(arcBody.program).toBe('arc');
  expect(arcBody.filters.transaction_key).toEqual(['key-condition']);
  expect(arcBody.filters.full_text).toBe('message condition');
  expect(arcBody.filters.log_types).toEqual(['A', 'Q', 'Z']);
  expect(arcBody.filters.global_transaction_id).toEqual([]);
  expect(arcBody.correlate).toBe(true);

  await openProgram(page, 'M14N Acell LogViewer');
  await expect(viewer(page).getByLabel('G 트랜잭션 ID', { exact: true })).toHaveValue(
    'condition-only',
  );
  await expect(viewer(page).getByLabel('S 트랜잭션 ID', { exact: true })).toHaveValue(
    'service-condition',
  );
  await openProgram(page, 'ARC LMS');
  await expect(viewer(page).getByLabel('Full Text')).toHaveValue('message condition');
});

test('saved conditions reopen the correct program and viewers remain independent', async ({
  page,
}) => {
  await page.goto('/#program=arc');
  await viewer(page).getByLabel('트랜잭션 키', { exact: true }).fill('saved-key');
  await viewer(page).getByRole('button', { name: '상세 검색조건' }).click();
  await viewer(page).getByLabel('Full Text').fill('saved-text');
  await viewer(page).getByRole('combobox', { name: '조회 기간 프리셋' }).click();
  await page.getByRole('option', { name: '최근 1시간', exact: true }).click();
  await viewer(page).getByRole('button', { name: '조건 저장', exact: true }).click();
  await page.getByLabel('검색조건 이름').fill('ARC 기간 조건');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.reload();
  await openProgram(page, 'M14N Acell LogViewer');
  await viewer(page).getByLabel('G 트랜잭션 ID', { exact: true }).fill('acell-independent');
  await page.getByRole('button', { name: '저장된 검색조건' }).click();
  await expect(page.locator('.saved-item')).toContainText('ARC LMS');
  await page.getByRole('button', { name: '불러오기', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ARC LMS', exact: false })).toBeVisible();
  await expect(viewer(page).getByRole('combobox', { name: '조회 기간 프리셋' })).toHaveText(
    '최근 1시간',
  );
  await expect(viewer(page).getByLabel('트랜잭션 키', { exact: true })).toHaveValue('saved-key');
  await viewer(page).getByRole('button', { name: '상세 검색조건' }).click();
  await expect(viewer(page).getByLabel('Full Text')).toHaveValue('saved-text');
  await page.getByRole('tab', { name: '조회창 01' }).click();
  await expect(viewer(page).getByLabel('트랜잭션 키', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: '수평으로 나란히 보기' }).click();
  await expect(viewer(page)).toHaveCount(2);
  await openProgram(page, 'M14N Acell LogViewer');
  await expect(viewer(page)).toHaveCount(1);
  await expect(viewer(page).getByLabel('G 트랜잭션 ID', { exact: true })).toHaveValue(
    'acell-independent',
  );
  await openProgram(page, 'ARC LMS');
  await expect(viewer(page)).toHaveCount(2);
  await page.getByRole('button', { name: '조회창 02 닫기' }).click();
  await expect(viewer(page)).toHaveCount(1);
});

test('legacy saved program conditions migrate and hidden fields are omitted from requests', async ({
  page,
}) => {
  await page.goto('/#program=arc');
  await viewer(page).getByLabel('트랜잭션 키', { exact: true }).fill('legacy-key');
  await viewer(page).getByRole('button', { name: '조건 저장', exact: true }).click();
  await page.getByLabel('검색조건 이름').fill('이전 ARC 조건');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('y17:conditions:v1')!);
    delete saved[0].conditions.program;
    saved[0].conditions.profile = 'arc';
    saved[0].conditions.fields.global_transaction_id = 'old-hidden-input';
    localStorage.setItem('y17:conditions:v1', JSON.stringify(saved));
  });
  await page.reload();
  await page.getByRole('button', { name: '저장된 검색조건' }).click();
  await page.getByRole('button', { name: '불러오기', exact: true }).click();
  await expect(viewer(page).getByLabel('트랜잭션 키', { exact: true })).toHaveValue('legacy-key');
  const response = page.waitForResponse((response) => response.url().endsWith('/api/logs/search'));
  await viewer(page).getByRole('button', { name: '검색', exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(503);
  expect(result.request().postDataJSON().filters.global_transaction_id).toEqual([]);
});

test('program links and a new window retain the selected program', async ({ page, context }) => {
  await page.goto('/#program=arc&key=linked-condition');
  await expect(viewer(page).getByLabel('트랜잭션 키', { exact: true })).toHaveValue(
    'linked-condition',
  );
  const newPage = context.waitForEvent('page');
  await page.getByRole('button', { name: '새 창 열기' }).click();
  const opened = await newPage;
  await expect(opened).toHaveTitle('ARC LMS · Y17');
  await expect(viewer(opened).getByLabel('트랜잭션 키', { exact: true })).toHaveValue('');
  await opened.close();
  await page.goto('/#program=acell&g=linked-global');
  // Deep-link conditions are read when the app mounts, not on a hash-only change.
  await page.reload();
  await expect(viewer(page).getByLabel('G 트랜잭션 ID', { exact: true })).toHaveValue(
    'linked-global',
  );
});

test('download stays unavailable without a real source and never creates a fake file', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('로그 데이터 소스를 연결해 주세요').waitFor();
  await viewer(page).getByLabel('G 트랜잭션 ID', { exact: true }).fill('condition-only');
  await viewer(page).getByRole('button', { name: '다운로드', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('아직 생성된 파일은 없습니다.', { exact: false })).toBeVisible();
  await dialog.getByLabel('Excel', { exact: false }).check();
  await expect(dialog.getByRole('button', { name: '다운로드 요청' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.locator('nav').getByRole('button', { name: '다운로드', exact: true }).click();
  await expect(page.getByText('아직 다운로드한 로그가 없습니다')).toBeVisible();
});

test('API failure has its own state', async ({ page }) => {
  await page.route('**/api/metadata', (route) => route.abort('connectionrefused'));
  await page.goto('/');
  await expect(page.getByText('API 서버에 연결할 수 없습니다', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '연결 상태 확인', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'API 서버' })).toBeVisible();
  await expect(page.getByText('연결 안 됨', { exact: true })).toBeVisible();
});

test('larger typography stays readable on desktop and narrow layouts', async ({ page }) => {
  await page.goto('/');
  await page.getByText('로그 데이터 소스를 연결해 주세요').waitFor();
  for (const name of ['M14N Acell LogViewer', 'ARC LMS'] as const) {
    await openProgram(page, name);
    const program = name === 'ARC LMS' ? 'arc' : 'acell';
    await viewer(page).getByRole('button', { name: '상세 검색조건' }).click();
    for (const selector of [
      '.field > span',
      '.field input',
      '.detail-tabs button',
      '.log-table th',
      '.button',
    ]) {
      const sizes = await viewer(page)
        .locator(selector)
        .evaluateAll((elements) =>
          elements.map((element) => parseFloat(getComputedStyle(element).fontSize)),
        );
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
    }
    await page.screenshot({ path: `test-results/${program}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(viewer(page).getByRole('button', { name: '검색', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await page.screenshot({ path: `test-results/${program}-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
});

test('WeshBoard design keeps controls aligned and popovers bounded and keyboard accessible', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('로그 데이터 소스를 연결해 주세요').waitFor();
  const active = viewer(page);
  const submit = active.getByRole('button', { name: '검색', exact: true });
  await expect(submit).toHaveCSS('background-color', 'rgb(234, 0, 44)');
  await submit.hover();
  await expect(submit).toHaveCSS('background-color', 'rgb(196, 0, 37)');
  await expect(active.getByRole('button', { name: '로그 복사' })).toBeDisabled();
  const inputBox = await active.getByLabel('시작 시간', { exact: true }).boundingBox();
  const select = active.getByRole('combobox', { name: '조회 기간 프리셋' });
  const selectBox = await select.boundingBox();
  const buttonBox = await submit.boundingBox();
  expect(inputBox!.height).toBe(42);
  expect(selectBox!.height).toBe(inputBox!.height);
  expect(buttonBox!.height).toBe(inputBox!.height);
  await select.click();
  const list = page.getByRole('listbox', { name: '조회 기간 프리셋' });
  const popup = await list.boundingBox();
  expect(Math.abs(popup!.width - selectBox!.width)).toBeLessThan(1);
  expect(popup!.height).toBeLessThanOrEqual(224);
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.screenshot({ path: 'test-results/design-dropdown.png' });
  await select.press('End');
  await select.press('Enter');
  await expect(select).toHaveText('직접 입력');
  await expect(list).not.toBeVisible();
  await expect(select).toBeFocused();
  await select.press('ArrowUp');
  await select.press('Escape');
  await expect(select).toHaveText('직접 입력');
  await expect(list).not.toBeVisible();
  await select.click();
  await page.getByRole('heading', { name: '검색조건', exact: true }).click();
  await expect(list).not.toBeVisible();
  await select.click();
  await select.press('Home');
  await select.press('Tab');
  await expect(list).not.toBeVisible();
  await expect(active.getByLabel('시작 시간', { exact: true })).toBeFocused();
  for (const width of [1280, 900, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await select.click();
    const trigger = await select.boundingBox();
    const bounds = await list.boundingBox();
    expect(Math.abs(bounds!.width - trigger!.width)).toBeLessThan(1);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await select.press('Escape');
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '연결 상태 확인', exact: true }).click();
  await expect(page.locator('.app-shell')).toHaveClass(/log-design/);
  await page.locator('nav').getByRole('button', { name: 'ARC LMS', exact: true }).click();
  await expect(page.locator('.app-shell')).toHaveClass(/log-design/);
  await expect(viewer(page).getByRole('button', { name: '검색', exact: true })).toHaveCSS(
    'background-color',
    'rgb(234, 0, 44)',
  );
});

test('query loading and errors use the same readable design without fake results', async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/logs/search', async (route) => {
    await held;
    await route.fallback();
  });
  await page.goto('/#program=arc');
  await viewer(page).getByLabel('트랜잭션 키', { exact: true }).fill('style-check-condition');
  await viewer(page).getByRole('button', { name: '검색', exact: true }).click();
  try {
    const busy = viewer(page).getByRole('button', { name: '조회 중…' });
    await expect(busy).toBeDisabled();
    await expect(busy).toHaveAttribute('aria-busy', 'true');
    await expect(viewer(page).locator('.results-panel')).toHaveAttribute('aria-busy', 'true');
    await expect(busy).toHaveCSS('background-color', 'rgb(253, 230, 235)');
    await page.screenshot({ path: 'test-results/design-loading.png', fullPage: true });
  } finally {
    release();
  }
  await expect(page.getByRole('alert')).toContainText('데이터 소스가 연결되지 않았습니다');
  await expect(page.getByRole('alert')).toHaveCSS('color', 'rgb(159, 18, 57)');
  await expect(viewer(page).locator('.log-table tbody tr')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/design-error.png', fullPage: true });
  await viewer(page).getByRole('button', { name: '다운로드', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Excel', { exact: false }).check();
  await expect(page.getByRole('dialog').locator('.format-options .checked')).toHaveCSS(
    'border-top-color',
    'rgb(234, 0, 44)',
  );
  await page.screenshot({ path: 'test-results/design-download-dialog.png', fullPage: true });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await viewer(page).getByRole('button', { name: '로그 상세 확대' }).click();
  const detail = page.getByRole('dialog');
  await expect(detail).toBeVisible();
  expect(await detail.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(detail.getByRole('combobox', { name: '로그 표시 형식' })).toBeDisabled();
  await page.screenshot({ path: 'test-results/design-detail-dialog-mobile.png' });
  await detail.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(detail).not.toBeVisible();
});

test('management pages keep the viewer theme for empty, saved and connection states at every width', async ({
  page,
}) => {
  await page.goto('/');
  await viewer(page).getByRole('button', { name: '조건 저장', exact: true }).click();
  await page.getByLabel('검색조건 이름', { exact: true }).fill('MES 조회 조건');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [hash, selector] of [
      ['saved', '.saved-icon'],
      ['downloads', '.management-empty > svg'],
      ['connection', '.connection-card-icon'],
    ]) {
      await page
        .locator('.sidebar')
        .getByRole('button', {
          name:
            hash === 'saved' ? '저장된 검색조건' : hash === 'downloads' ? '다운로드' : '연결 상태',
          exact: true,
        })
        .click();
      await expect(page.locator('.app-shell')).toHaveClass(/log-design/);
      await expect(page.locator(selector).first()).toBeVisible();
      await expect(page.locator(selector).first()).toHaveCSS(
        'background-color',
        'rgb(255, 240, 225)',
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      await page.screenshot({
        path: `test-results/management-${hash}-${width}.png`,
        fullPage: true,
      });
    }
  }
});
