/**
 * The look check of plan 263: the ground of Cinder close to the surface at grazing angles, where
 * thin black slivers showed. The booster example is put in the air low over Cinder through the debug
 * API, at several latitudes and headings, and the canvas is shot. Against a dev server:
 *
 *   SHOT_TAG=before SHOT_URL=http://localhost:5231 bun scripts/capture-cinder.ts
 *
 * Output: `docs/journal/assets/263-<tag>-<n>.jpg`.
 */
import { chromium } from '@playwright/test';
import { join } from 'node:path';

const base = process.env.SHOT_URL ?? 'http://localhost:5231';
const tag = process.env.SHOT_TAG ?? 'before';
const out = process.env.SHOT_OUT ?? join(import.meta.dir, '../../../docs/journal/assets');
const altitude = Number(process.env.SHOT_ALT ?? 30);
const views = Number(process.env.SHOT_VIEWS ?? 6);

const browser = await chromium.launch({
	headless: false,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
});
const context = await browser.newContext({
	viewport: { width: 1512, height: 945 },
	deviceScaleFactor: 1,
	baseURL: base
});
const page = await context.newPage();
page.on('pageerror', (e) => console.log('  pageerror', e.message));
await page.addInitScript(() => {
	localStorage.setItem('orbital.graphics', 'high');
	localStorage.setItem('orbital.graphics.auto', 'off');
});
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
for (let i = 0; i < views; i++) {
	const result = await page.evaluate(
		async ([lat, lon, heading, alt]) =>
			(window as any).__orbitalDebug.setLocation({
				kind: 'air',
				body: 'stock.cinder',
				latitude: lat,
				longitude: lon,
				altitude: alt,
				speed: 2,
				heading,
				climb: 0
			}),
		[0.1 + i * 0.37, 0.2 + i * 1.1, (i * Math.PI) / 3, altitude] as const
	);
	if (!result.ok) console.log('  setLocation:', result.reason);
	await page.waitForTimeout(7000);
	// orbit the camera down to the horizon: a grazing view of the ground
	const box = (await page.locator('canvas').first().boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(
		box.x + box.width / 2,
		box.y + box.height / 2 - Number(process.env.SHOT_DRAG ?? 260),
		{
			steps: 12
		}
	);
	await page.mouse.up();
	await page.waitForTimeout(1500);
	await page
		.locator('canvas')
		.first()
		.screenshot({ path: join(out, `263-${tag}-${i}.jpg`), type: 'jpeg', quality: 85 });
}
await browser.close();
