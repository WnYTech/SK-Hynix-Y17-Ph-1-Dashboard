import { expect, test, type Page } from '@playwright/test';

const viewer = (page: Page) => page.locator('.program-workspace:visible .viewer-container:visible');
const openProgram = (page: Page, name: 'M14N Acell LogViewer' | 'ARC LMS') =>
  page.locator('nav').getByRole('button', { name, exact: true }).click();

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
  await viewer(page).getByLabel('조회 기간 프리셋').selectOption('7d');
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
    viewer(page).getByRole('columnheader', { name: 'G 트랜잭션', exact: true }),
  ).toBeVisible();
  await expect(
    viewer(page).getByRole('columnheader', { name: '소요 (ms)', exact: true }),
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
    viewer(page).getByRole('columnheader', { name: '트랜잭션 키', exact: true }),
  ).toBeVisible();
  await expect(
    viewer(page).getByRole('columnheader', { name: 'G 트랜잭션', exact: true }),
  ).toHaveCount(0);
  await expect(viewer(page).getByRole('tab', { name: '트랜잭션 전체 로그' })).toBeVisible();
  await expect(viewer(page).getByRole('tab', { name: 'S 트랜잭션' })).toHaveCount(0);
  await viewer(page).getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('트랜잭션 키가 필요');
  await viewer(page).getByLabel('트랜잭션 키', { exact: true }).fill('key-condition');
  await viewer(page).getByLabel('Full Text').fill('message condition');
  await viewer(page).getByLabel('로그 종류').fill('A Q Z');
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
  await viewer(page).getByLabel('조회 기간 프리셋').selectOption('1h');
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
  await expect(viewer(page).getByLabel('조회 기간 프리셋')).toHaveValue('1h');
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
