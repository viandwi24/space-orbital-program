/**
 * Plan 388's night and close-up check: a new Sandbox world's Space Center through time warp into
 * the night (a screen every few seconds), then back to 1× and close to a building's walls and
 * roof for z-fighting. Playwright's Chromium on the Mac's GPU, against a running dev server:
 *
 *   SHOT_URL=http://localhost:5173 bun scripts/capture-388-night.ts [prefix]
 */
import { chromium, type Page } from '@playwright/test';
import { join } from 'node:path';

const base = process.env.SHOT_URL ?? 'http://localhost:5173';
const out = process.env.SHOT_OUT ?? join(import.meta.dir, '../../../docs/journal/assets');
const prefix = process.argv[2] ?? '388';
const warp = Number(process.env.SHOT_WARP ?? 1000);
const frames = Number(process.env.SHOT_FRAMES ?? 8);

type Debug = { send(command: unknown): Promise<unknown> };
const send = (page: Page, command: unknown) =>
	page.evaluate(
		(c) => (window as unknown as { __orbitalDebug: Debug }).__orbitalDebug.send(c),
		command
	);

async function shot(page: Page, name: string): Promise<void> {
	await page.screenshot({ path: join(out, `${prefix}-${name}.jpg`), type: 'jpeg', quality: 82 });
	console.log(`  ${prefix}-${name}`);
}

const browser = await chromium.launch({
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
const page = await (
	await browser.newContext({ viewport: { width: 1600, height: 900 }, baseURL: base })
).newPage();
page.on('console', (m) => {
	if (m.type() === 'error') console.log('  console error:', m.text().split('\n')[0]);
});
await page.goto('/worlds');
await page.getByTestId('worlds-create').click();
const form = page.getByTestId('create-world');
await form.getByTestId('world-name').fill('QA night');
await form.getByRole('radio', { name: 'Sandbox', exact: true }).click();
await form.getByTestId('world-create').click();
await page.getByTestId('world-enter').click();
await page.waitForURL('**/space-center');
await page
	.locator('[data-testid^="sc-row-"]')
	.first()
	.waitFor({ state: 'attached', timeout: 90_000 });
await page
	.getByRole('button', { name: 'Skip' })
	.click({ timeout: 5_000 })
	.catch(() => undefined);
await page.getByTestId('nav-menu').click();
await page.getByTestId('nav-settings').click();
await page.getByRole('tab', { name: 'Game' }).click();
await page.getByTestId('setting-debug').click();
await page.keyboard.press('Escape');
await page.waitForFunction(() => '__orbitalDebug' in window, null, { timeout: 20_000 });
await page.waitForTimeout(3000);
await shot(page, 'night-0');
console.log('  warp', JSON.stringify(await send(page, { type: 'warp', factor: warp })));
for (let i = 1; i <= frames; i++) {
	await page.waitForTimeout(3000);
	await shot(page, `night-${i}`);
}
await send(page, { type: 'warp', factor: 1 });
await page.waitForTimeout(2000);
await shot(page, 'night-after');
// close to a building: the Hangar from the strip, then the wheel in
await page.getByTestId('sc-buildings').click();
await page.locator('[data-testid^="sc-row-"]').nth(1).click();
await page.waitForTimeout(2500);
const box = (await page.getByTestId('sc-canvas').boundingBox())!;
await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45);
for (let i = 0; i < 5; i++) {
	await page.mouse.wheel(0, -300);
	await page.waitForTimeout(150);
}
await page.waitForTimeout(2000);
await shot(page, 'close-1');
await page.waitForTimeout(500);
await shot(page, 'close-2');
await browser.close();
