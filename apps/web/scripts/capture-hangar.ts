/**
 * The Hangar's look check (plan 255): the booster example at 1440 x 900, the right panel as it
 * starts and with the trip opened, for the journal's before and after. Against a dev server:
 *
 *   SHOT_TAG=after SHOT_URL=http://localhost:5230 bun scripts/capture-hangar.ts
 *
 * Output: `docs/journal/assets/255-<tag>-hangar.jpg` and `255-<tag>-hangar-trip.jpg`.
 */
import { chromium } from '@playwright/test';
import { join } from 'node:path';

const base = process.env.SHOT_URL ?? 'http://localhost:5230';
const tag = process.env.SHOT_TAG ?? 'after';
const out = process.env.SHOT_OUT ?? join(import.meta.dir, '../../../docs/journal/assets');

const browser = await chromium.launch({
	headless: false,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
});
const context = await browser.newContext({
	viewport: { width: 1440, height: 900 },
	deviceScaleFactor: 1,
	baseURL: base
});
const page = await context.newPage();
page.on('pageerror', (e) => console.log('  pageerror', e.message));
await page.addInitScript(() => {
	localStorage.removeItem('orbital.vab.folds');
});
await page.goto('/vab');
await page.getByRole('button', { name: 'Load the booster rocket' }).click();
await page.waitForTimeout(4000);
await page.screenshot({ path: join(out, `255-${tag}-hangar.jpg`), type: 'jpeg', quality: 88 });
const trip = page.getByTestId('trip').locator('summary').first();
if (await trip.count()) {
	await trip.click();
	await page.waitForTimeout(400);
	await page.screenshot({
		path: join(out, `255-${tag}-hangar-trip.jpg`),
		type: 'jpeg',
		quality: 88
	});
}
await browser.close();
