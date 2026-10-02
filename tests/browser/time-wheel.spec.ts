import { expect, test } from './fixtures';

for (const program of ['acell', 'arc']) {
  test(`${program}: cyclic time wheels coexist with typing, mouse, touch and keyboard`, async ({
    page,
  }) => {
    await page.goto(`/#program=${program}&system=MES`);
    const active = page.locator('.program-workspace:visible .viewer-container:visible');
    const date = new Date(Date.now() - 3 * 86400000 + 9 * 3600000).toISOString().slice(0, 10);
    await active.getByLabel('시작 시간', { exact: true }).fill(`${date} 23:59:59.999999999`);
    let searches = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/logs/search')) searches++;
    });
    await active.getByRole('button', { name: '시작 시간 달력 열기', exact: true }).click();
    const calendar = page.getByRole('dialog', { name: '시작 시간 선택', exact: true });
    const input = (unit: string) => calendar.getByLabel(`시작 시간 ${unit}`, { exact: true });
    const wheel = (unit: string) =>
      calendar.getByRole('spinbutton', { name: `시작 시간 ${unit} 스크롤 선택`, exact: true });
    for (const [unit, max, zero] of [
      ['시', '23', '00'],
      ['분', '59', '00'],
      ['초', '59', '00'],
      ['나노초 (ns)', '999999999', '000000000'],
    ]) {
      await wheel(unit).hover();
      const before = await calendar.evaluate((el) => [el.scrollTop, window.scrollY]);
      await page.mouse.wheel(0, 30);
      await expect(input(unit)).toHaveValue(zero);
      await expect(wheel(unit)).toHaveAttribute('aria-valuenow', '0');
      expect(await calendar.evaluate((el) => [el.scrollTop, window.scrollY])).toEqual(before);
      await page.mouse.wheel(0, -30);
      await expect(input(unit)).toHaveValue(max);
      await expect(wheel(unit).locator('.time-wheel-values > span')).toHaveCount(5);
    }
    await wheel('시').hover();
    await page.mouse.wheel(0, 30 * (24 * 5 + 3));
    await expect(input('시')).toHaveValue('02');
    await input('시').fill('13');
    await expect(wheel('시')).toHaveAttribute('aria-valuenow', '13');
    await wheel('시').press('ArrowDown');
    await expect(input('시')).toHaveValue('14');
    await wheel('시').press('Home');
    await expect(input('시')).toHaveValue('00');
    await wheel('시').press('End');
    await expect(input('시')).toHaveValue('23');
    await wheel('시').click({ position: { x: 15, y: 15 } });
    await expect(input('시')).toHaveValue('22');
    await wheel('시').scrollIntoViewIfNeeded();
    const handle = await wheel('시').boundingBox();
    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + 45);
    await page.mouse.down();
    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y - 45, { steps: 6 });
    await page.mouse.up();
    await expect(input('시')).toHaveValue('01');
    await input('나노초 (ns)').fill('123456789');
    await wheel('나노초 (ns)').hover();
    await page.mouse.wheel(0, 30);
    await expect(input('나노초 (ns)')).toHaveValue('123456790');
    await page.setViewportSize({ width: 320, height: 740 });
    await wheel('분').scrollIntoViewIfNeeded();
    const touch = await page.context().newCDPSession(page);
    const area = await wheel('분').boundingBox();
    const x = area!.x + area!.width / 2,
      y = area!.y + 60;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y - 30 }],
    });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(input('분')).toHaveValue('00');
    await touch.detach();
    expect(await calendar.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await expect(calendar.locator('output')).toHaveText(`${date} 01:00:59.123456790`);
    await expect(calendar).not.toContainText(/오전|오후|AM|PM/);
    expect(searches).toBe(0);
    await calendar.screenshot({ path: `test-results/wheel-${program}-320.png` });
    await wheel('분').press('Escape');
    await expect(calendar).not.toBeVisible();
    await active.getByRole('button', { name: '시작 시간 달력 열기', exact: true }).click();
    await expect(input('나노초 (ns)')).toHaveValue('123456790');
    await expect(wheel('분')).toHaveAttribute('aria-valuenow', '0');
  });
}
