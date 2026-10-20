/**
 * The map's look check (plan 258): the booster example in a 100 km orbit after its first stage
 * went, in the map view at 1440 x 900: the styles and icons, the Vessels filter open, and debris
 * switched off. Against a dev server:
 *
 *   SHOT_TAG=after SHOT_URL=http://localhost:5231 bun scripts/capture-map.ts
 *
 * Output: `docs/journal/assets/258-<tag>-{map,filters,others-off}.jpg`.
 */
import { chromium } from '@playwright/test';
import { join } from 'node:path';

const base = process.env.SHOT_URL ?? 'http://localhost:5231';
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
await page.addInitScript(() => localStorage.removeItem('orbital.map.filters'));
const shot = (name: string) =>
	page.screenshot({ path: join(out, `258-${tag}-${name}.jpg`), type: 'jpeg', quality: 88 });

await page.goto('/vab');
await page.getByRole('button', { name: 'Load the booster rocket' }).click();
await page.waitForTimeout(1500);
await page.goto('/flight');
await page.waitForFunction(
	() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0,
	null,
	{
		timeout: 180_000
	}
);
await page.waitForTimeout(3000);
await page.evaluate(() =>
	(window as any).__orbitalDebug.setOrbit({ apoapsis: 150_000, periapsis: 150_000 })
);
await page.waitForTimeout(2000);
// drop the stages: boosters and a spent stage become vessels of their own
for (let i = 0; i < 3; i++) {
	await page.keyboard.press('Space');
	await page.waitForTimeout(600);
}
await page.waitForTimeout(2000);
await page.keyboard.press('m');
await page.waitForTimeout(3500);
await shot('map');
await page.getByTestId('map-filter-vessels').click();
await page.waitForTimeout(400);
await shot('filters');
await page.getByTestId('map-filter-type-debris').click();
await page.getByTestId('map-filter-type-ship').click();
await page.getByTestId('map-filter-type-probe').click();
await page.waitForTimeout(800);
await shot('others-off');
await browser.close();
