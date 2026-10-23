/**
 * Screens of plan 388 (journal 388): a new Career world founds a branch, and the branch's site is
 * shown with its HQ under construction, close to its ground, and in build mode; then the HQ site in
 * build mode (the bar open and folded). Playwright's Chromium on the Mac's GPU, against a running dev server:
 *
 *   SHOT_URL=http://localhost:5173 bun scripts/capture-388.ts [prefix]
 *
 * Output: `docs/journal/assets/<prefix>-*.jpg` (prefix `388` by default).
 */
import { chromium, type Page } from '@playwright/test';
import { join } from 'node:path';

const base = process.env.SHOT_URL ?? 'http://localhost:5173';
const out = process.env.SHOT_OUT ?? join(import.meta.dir, '../../../docs/journal/assets');
const prefix = process.argv[2] ?? '388';
const W = Number(process.env.SHOT_W ?? 1600);
const H = Number(process.env.SHOT_H ?? 900);

type Debug = {
	setCheat(cheat: string, on?: boolean): Promise<unknown>;
	grant(what: { funds?: number }): Promise<unknown>;
};
const debug = (page: Page) => page.evaluate(() => '__orbitalDebug' in window);

async function shot(page: Page, name: string): Promise<void> {
	await page.waitForTimeout(2500);
	await page.screenshot({ path: join(out, `${prefix}-${name}.jpg`), type: 'jpeg', quality: 82 });
	console.log(`  ${prefix}-${name}`);
}

const browser = await chromium.launch({
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
const context = await browser.newContext({ viewport: { width: W, height: H }, baseURL: base });
const page = await context.newPage();
page.on('console', (m) => {
	if (m.type() === 'error') console.log('  console error:', m.text().split('\n')[0]);
});

await page.goto('/worlds');
await page.getByTestId('worlds-create').click();
const form = page.getByTestId('create-world');
await form.getByTestId('world-name').fill('QA branch');
await form.getByRole('radio', { name: 'Career', exact: true }).click();
// SHOT_SEED: the same world each run (before and after shots)
if (process.env.SHOT_SEED) {
	await page.getByTestId('create-step-world').click();
	await form.getByTestId('world-seed').fill(process.env.SHOT_SEED);
}
await form.getByTestId('world-create').click();
await page.getByTestId('world-enter').click();
await page.waitForURL('**/space-center');
await page
	.locator('[data-testid^="sc-row-"]')
	.first()
	.waitFor({ state: 'attached', timeout: 90_000 });
// the welcome: skip the tour
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
await debug(page);
await page.evaluate(() =>
	(window as unknown as { __orbitalDebug: Debug }).__orbitalDebug.grant({ funds: 3_000_000 })
);
await page.waitForTimeout(1000);

// the HQ in build mode
await page.getByTestId('sc-build').click();
await shot(page, 'hq-build');
await page.getByTestId('sc-build-fold').click();
await shot(page, 'hq-build-folded');
await page.getByRole('button', { name: 'Done', exact: true }).click();
await page.waitForTimeout(1000);

// found a branch east of the HQ
await page.getByTestId('sc-found-branch').click();
const map = page.getByTestId('branch-map');
await map.waitFor();
const found = page.getByTestId('branch-found');
let allowed = false;
// SHOT_BRANCH_Y: the picker's row (0.5 is the equator)
const row = Number(process.env.SHOT_BRANCH_Y ?? 0.5);
for (let f = 0.56; f < 0.95 && !allowed; f += 0.01) {
	const box = (await map.boundingBox())!;
	await page.mouse.click(box.x + box.width * f, box.y + box.height * row);
	allowed = await found.isEnabled();
}
await page.getByTestId('branch-name').fill('East Branch');
await found.click();
await page.waitForLoadState('load');
const select = page.getByTestId('sc-site');
await select.waitFor({ state: 'attached', timeout: 90_000 });
await page.getByTestId('sc-buildings').click();
await select.selectOption('branch-1');
await page.waitForTimeout(3000);
await shot(page, 'branch-construction');
// close to the ground: the HQ's own view
await page.getByTestId('sc-buildings').click();
await page.waitForTimeout(500);
const box = (await page.getByTestId('sc-canvas').boundingBox())!;
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 4; i++) {
	await page.mouse.wheel(0, -400);
	await page.waitForTimeout(120);
}
await shot(page, 'branch-ground');
await page.getByTestId('sc-build').click();
await shot(page, 'branch-build');
await browser.close();
