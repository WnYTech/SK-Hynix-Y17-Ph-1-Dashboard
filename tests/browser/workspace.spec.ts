import { expect, test } from '@playwright/test';

test('starts without fabricated logs and distinguishes an unconfigured source', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('로그 데이터 소스를 연결해 주세요')).toBeVisible();
  await expect(page.getByText('로그 탐색을 시작하세요')).toBeVisible();
  await expect(page.locator('.log-table tbody tr')).toHaveCount(0);
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('G 트랜잭션 ID가 필요');
  await page.getByLabel('G 트랜잭션 ID', { exact: true }).fill('condition-only');
  const response = page.waitForResponse((response) => response.url().endsWith('/api/logs/search'));
  await page.getByRole('button', { name: '검색', exact: true }).click();
  expect((await response).status()).toBe(503);
  await expect(page.getByRole('alert')).toContainText('로그 데이터 소스가 연결되지 않았습니다');
  expect(errors).toEqual([]);
});

test('checks typed dates before querying', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('G 트랜잭션 ID', { exact: true }).fill('condition-only');
  await page.getByLabel('시작 시간', { exact: true }).fill('2026-02-30 12:00:00');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('유효한 날짜');
  await page.getByLabel('시작 시간', { exact: true }).fill('2000-01-01 00:00:00');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('최근 7일');
  await page.getByLabel('조회 기간 프리셋').selectOption('7d');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('데이터 소스가 연결되지 않았습니다');
});

test('ARC and Acell have separate fields, columns and log tabs', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ARC LMS', exact: true }).click();
  await page.getByRole('button', { name: '상세 검색조건' }).click();
  await expect(page.getByLabel('Full Text')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '트랜잭션 키', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: '트랜잭션 전체 로그' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'G 트랜잭션', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Acell LogViewer', exact: true }).click();
  await expect(page.getByLabel('E 트랜잭션 ID')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'S 트랜잭션' })).toBeVisible();
  await expect(page.getByLabel('Full Text')).toHaveCount(0);
});

test('saved conditions survive reload and viewers remain independent', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('G 트랜잭션 ID', { exact: true }).fill('saved-condition');
  await page.getByLabel('조회 기간 프리셋').selectOption('1h');
  await page.getByRole('button', { name: '조건 저장', exact: true }).click();
  await page.getByLabel('검색조건 이름').fill('기간 조건');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '저장된 검색조건' }).click();
  await page.getByRole('button', { name: '불러오기', exact: true }).click();
  const activeViewer = page.locator('.viewer-container:visible');
  await expect(activeViewer.getByLabel('G 트랜잭션 ID', { exact: true })).toHaveValue(
    'saved-condition',
  );
  await expect(activeViewer.getByLabel('조회 기간 프리셋')).toHaveValue('1h');
  await page.getByRole('tab', { name: 'LogViewer 01' }).click();
  await expect(
    page.locator('.viewer-container:visible').getByLabel('G 트랜잭션 ID', { exact: true }),
  ).toHaveValue('');
  await page.getByRole('button', { name: '수평으로 나란히 보기' }).click();
  await expect(page.locator('.viewer-container:visible')).toHaveCount(2);
  await page.getByRole('button', { name: 'LogViewer 02 닫기' }).click();
  await expect(page.locator('.viewer-container:visible')).toHaveCount(1);
});

test('download stays unavailable without a real source and never creates a fake file', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('로그 데이터 소스를 연결해 주세요').waitFor();
  await page.getByLabel('G 트랜잭션 ID', { exact: true }).fill('condition-only');
  await page
    .locator('.search-panel')
    .getByRole('button', { name: '다운로드', exact: true })
    .click();
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

test('desktop and narrow layouts remain usable', async ({ page }) => {
  await page.goto('/');
  await page.getByText('로그 데이터 소스를 연결해 주세요').waitFor();
  await page.screenshot({ path: 'test-results/acell-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'ARC LMS', exact: true }).click();
  await page.getByRole('button', { name: '상세 검색조건' }).click();
  await page.screenshot({ path: 'test-results/arc-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '검색', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});
