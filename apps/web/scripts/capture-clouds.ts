/**
 * The look check of plan 397 (clouds v2): the flight view under the cumulus, inside the slab, over the
 * clouds and in orbit, standing and with the camera turning, TAAU off and on (the temporal cloud march
 * integrates its offsets in TAAU's history). Against a `NODE_ENV=development` build served by `serve.ts`:
 *
 *   SHOT_TAG=before SHOT_URL=http://localhost:5231 bun scripts/capture-clouds.ts
 *
 * Output: `docs/journal/assets/397-<tag>-<view>-<mode>.jpg` (canvas only).
 */
import { chromium, type Page } from '@playwright/test';
import { join } from 'node:path';

const base = process.env.SHOT_URL ?? 'http://localhost:5231';
const tag = process.env.SHOT_TAG ?? 'after';
const scale = Number(process.env.SHOT_SCALE ?? 0.5);
const out = process.env.SHOT_OUT ?? join(import.meta.dir, '../../../docs/journal/assets');
const views = (process.env.SHOT_VIEWS ?? 'under,inside,over,orbit').split(',');

const browser = await chromium.launch({
	headless: false,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
const context = await browser.newContext({
	viewport: { width: 1512, height: 945 },
	deviceScaleFactor: 2,
	baseURL: base
});
await context.addInitScript(() => {
	localStorage.setItem('orbital.vab.hideStart', '1');
	localStorage.setItem('orbital.onboarding.off', '1');
	localStorage.setItem('orbital.graphics.renderer', 'webgpu');
	localStorage.setItem('orbital.graphics', 'high');
	localStorage.setItem('orbital.graphics.auto', 'off');
});
const setup = await context.newPage();
await setup.goto('/vab');
await setup.waitForFunction(() => typeof (window as any).__orbitalVab?.loadBooster === 'function');
await setup.evaluate(() => (window as any).__orbitalVab.loadBooster());
await setup.waitForTimeout(1500);
await setup.close();

const page = await context.newPage();
page.on('pageerror', (e) => console.log('  pageerror', e.message));
page.on('console', (m) => {
	if (m.type() === 'error' || m.type() === 'warning')
		console.log(`  console ${m.type()}: ${m.text().slice(0, 300)}`);
});
await page.goto('/flight');
await page.waitForFunction(
	() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0,
	null,
	{
		timeout: 300_000
	}
);
await page.getByTestId('world-loading').waitFor({ state: 'detached', timeout: 300_000 });
await page.waitForTimeout(3000);

const shoot = async (name: string): Promise<void> => {
	await page
		.locator('canvas')
		.first()
		.screenshot({ path: join(out, `397-${tag}-${name}.jpg`), type: 'jpeg', quality: 88 });
};
const frames = (n: number): Promise<void> =>
	page.evaluate(
		(count) =>
			new Promise<void>((resolve) => {
				let i = 0;
				const tick = (): void => (++i >= count ? resolve() : void requestAnimationFrame(tick));
				requestAnimationFrame(tick);
			}),
		n
	);
async function turn(page: Page): Promise<void> {
	const box = (await page.locator('canvas').first().boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 30, { steps: 6 });
	// the camera is moving while it is shot
	await shoot2();
	await page.mouse.up();
}
const shoot2 = async (): Promise<void> => {};

const AIR: Record<string, number> = { under: 1_800, inside: 4_000, over: 7_500 };
for (const view of views) {
	if (view === 'orbit') {
		await page.evaluate(() =>
			(window as any).__orbitalDebug.setOrbit({ apoapsis: 100_000, periapsis: 100_000 })
		);
		await page.waitForTimeout(4000);
	} else {
		await page.evaluate(
			(alt) =>
				(window as any).__orbitalDebug.setLocation({
					kind: 'air',
					latitude: 0.009,
					longitude: 0.02,
					altitude: alt,
					speed: 0,
					climb: 0
				}),
			AIR[view]
		);
		await page.waitForTimeout(3000);
	}
	await page.evaluate(() => (window as any).__orbital.renderer().setTaau(0));
	await frames(60);
	await shoot(`${view}-off`);
	await page.evaluate((s) => (window as any).__orbital.renderer().setTaau(s), scale);
	await frames(90);
	await shoot(`${view}-on`);
	// the camera turns: orbit drag, then shoot while the history is being reprojected
	const box = (await page.locator('canvas').first().boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 40, { steps: 12 });
	await frames(2);
	await shoot(`${view}-turn`);
	await page.mouse.up();
	await frames(60);
	await shoot(`${view}-after`);
	await page.evaluate(() => (window as any).__orbital.renderer().setTaau(0));
}
await browser.close();
