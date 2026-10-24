/**
 * Screens of plan 276 (journal 276): the engines and boosters of the plan in the Hangar's
 * catalogue, each placed in the Hangar. Playwright's
 * Chromium on the Mac's GPU, against a running dev server:
 *
 *   SHOT_URL=http://localhost:5173 bun scripts/capture-276.ts
 *
 * Output: `docs/journal/assets/276-*.jpg`.
 */
import { chromium } from '@playwright/test';
import { join } from 'node:path';

const base = process.env.SHOT_URL ?? 'http://localhost:5173';
const out = process.env.SHOT_OUT ?? join(import.meta.dir, '../../../docs/journal/assets');

const browser = await chromium.launch({
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, baseURL: base });
await context.addInitScript(() => {
	localStorage.setItem('orbital.vab.hideStart', '1');
	localStorage.setItem('orbital.onboarding.off', '1');
});
const page = await context.newPage();
page.on('pageerror', (e) => console.log('  pageerror', e.message));
await page.goto('/vab');
await page.waitForFunction(() => typeof (window as any).__orbitalVab?.parts === 'function');
await page.waitForTimeout(3000);

const search = () => page.getByRole('searchbox', { name: 'Search parts' });
const shots: Array<[string, string]> = [
	['lv', 'LV-T30'],
	['vacuum', 'LV-909'],
	['wide', 'RE-I5'],
	['quartet', 'Quartet'],
	['spark', 'Spark'],
	['nudge', 'Nudge'],
	['srb-large', 'BST-3'],
	['bst-1', 'BST-1'],
	['bst-0', 'BST-0'],
	['liquid-booster', 'LB-1']
];
for (const [name, query] of shots) {
	await page.goto('/vab');
	await page.waitForFunction(() => typeof (window as any).__orbitalVab?.parts === 'function');
	await page.waitForTimeout(2500);
	await search().fill(query);
	await page.waitForTimeout(1500);
	await page.locator('section[aria-label="Part catalogue"]').screenshot({
		path: join(out, `276-catalogue-${name}.jpg`),
		type: 'jpeg',
		quality: 88
	});
}
await browser.close();
