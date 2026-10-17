/**
 * Screenshots of the Hangar for plan 093's review (the two-stage example at 1920x1080 and
 * 1024x768). Playwright's bundled Chromium with software WebGL, against a running dev server or build:
 *
 *   SHOT_URL=http://localhost:5211 bun scripts/capture-hangar.ts
 *
 * Output: `docs/journal/assets/093-hangar-<height>.png`.
 */
import { chromium } from '@playwright/test';
import { join } from 'node:path';

const base = process.env.SHOT_URL ?? 'http://localhost:5211';
const out = process.env.SHOT_OUT ?? join(import.meta.dir, '../../../docs/journal/assets');

const browser = await chromium.launch({
	args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
});
for (const size of [
	{ width: 1920, height: 1080 },
	{ width: 1024, height: 768 }
]) {
	const context = await browser.newContext({ viewport: size, baseURL: base });
	const page = await context.newPage();
	page.on('pageerror', (e) => console.log('  pageerror', e.message));
	await page.goto('/vab');
	await page.getByRole('button', { name: 'Load the two-stage example' }).click();
	const skip = page.getByTestId('tutorial-skip');
	if (await skip.isVisible().catch(() => false)) await skip.click();
	await page.waitForTimeout(4000);
	await page.screenshot({ path: join(out, `093-hangar-${size.height}.png`) });
	console.log(`  hangar-${size.height}`);
	await context.close();
}
await browser.close();
