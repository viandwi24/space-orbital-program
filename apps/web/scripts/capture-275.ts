/**
 * Screens of plan 275 (journal 275): the new tank shapes and the separator in the Hangar's
 * catalogue (thumbnails and the size filter), and each one placed in the Hangar. Playwright's
 * Chromium on the Mac's GPU, against a running dev server:
 *
 *   SHOT_URL=http://localhost:5173 bun scripts/capture-275.ts
 *
 * Output: `docs/journal/assets/275-*.jpg`.
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

const search = page.getByRole('searchbox', { name: 'Search parts' });
const shots: Array<[string, string]> = [
	['pebble', 'Pebble'],
	['doughnut', 'Doughnut'],
	['bubble', 'Bubble'],
	['chimney', 'Chimney'],
	['spindle', 'Spindle'],
	['clean-break', 'Clean Break']
];
for (const [name, query] of shots) {
	await search.fill(query);
	await page.waitForTimeout(1500);
	await page.locator('section[aria-label="Part catalogue"]').screenshot({
		path: join(out, `275-catalogue-${name}.jpg`),
		type: 'jpeg',
		quality: 88
	});
	// arm the first card and place it as the vessel's root
	const card = page.locator('button.card').first();
	if ((await card.count()) === 0) {
		console.log(`  no card for ${query}`);
		continue;
	}
	await card.click();
	await page.waitForTimeout(500);
	// the first part goes on the pad's ring; the next ones on the open ring of the stack
	const parts = await page.evaluate(() => (window as any).__orbitalVab.parts().length);
	if (parts === 0) await page.mouse.click(820, 478);
	else {
		const t = await page.evaluate(() => (window as any).__orbitalVab.targetAt(0));
		await page.mouse.click(t?.x ?? 800, t?.y ?? 450);
	}
	await page.waitForTimeout(1500);
	await page.screenshot({ path: join(out, `275-hangar-${name}.jpg`), type: 'jpeg', quality: 88 });
	console.log(name, await page.evaluate(() => (window as any).__orbitalVab.parts()));
	await page.keyboard.press('Escape');
}
// the whole stack, close, from the side and a little above
await page.evaluate(() => (window as any).__orbitalVab.aim(0.6, 0.12, 16, [0, 3.7, 0]));
await page.waitForTimeout(1200);
await page.screenshot({ path: join(out, '275-hangar-stack.jpg'), type: 'jpeg', quality: 88 });
await search.fill('');
await page.waitForTimeout(500);
const xl = page.getByRole('button', { name: 'XXL' });
if (await xl.count()) {
	await xl.click();
	await page.waitForTimeout(1500);
	await page.locator('section[aria-label="Part catalogue"]').screenshot({
		path: join(out, '275-catalogue-xxl.jpg'),
		type: 'jpeg',
		quality: 88
	});
}
await browser.close();
