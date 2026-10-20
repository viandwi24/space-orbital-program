/**
 * Frame time by pixel ratio on a Retina-sized viewport (graphics research, refs/graphics-performance,
 * 02-measurements.md). The journal 054 method, as `apps/web/scripts/measure-devices.ts`, with the
 * viewport, scale factor and pixel ratios as options, plus the half planet pass and render scale 0.67
 * rungs at ratio 2.
 *
 * Run it from `apps/web` (Playwright resolves there), against a development build served locally,
 * with the browser window in view (a headless or hidden Chromium reads frames about 3x slow):
 *
 *   NODE_ENV=development bun run build && bun scripts/serve.ts 5211 &
 *   SHOT_URL=http://localhost:5211 bun ../../refs/graphics-performance/tools/measure-dpr.ts out.json
 *
 * Options (environment):
 *   VW, VH    CSS viewport (default 1512 x 945, the 14" MacBook Pro default)
 *   DSF       device scale factor (default 2)
 *   PRESETS   comma list (default medium,high)
 *   RATIOS    comma list of pixel ratios forced with `debug.setPixelRatio` (default 1,1.5,2)
 *
 * The numbers are "sync ms": the minimum over 10 windows of the mean of 6 single frames
 * (`renderer.debug.benchmark(1)`, draw plus a readPixels stall). Measure plugged in, after 10
 * minutes idle, with nothing else running.
 */
import { chromium, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const base = process.env.SHOT_URL ?? 'http://localhost:5211';
const browser = await chromium.launch({
	headless: false,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
});
const context = await browser.newContext({
	viewport: { width: Number(process.env.VW ?? 1512), height: Number(process.env.VH ?? 945) },
	deviceScaleFactor: Number(process.env.DSF ?? 2),
	baseURL: base
});

async function bench(page: Page, up: number | null): Promise<number> {
	return page.evaluate((up) => {
		const o = (window as any).__orbital;
		const r = o.renderer();
		if (up !== null) {
			const s = structuredClone(o.snapshot());
			const v = s.vessels[0];
			const hp = s.bodies.find((b: any) => b.id === 'stock.home').position;
			const rel = { x: v.position.x - hp.x, y: v.position.y - hp.y, z: v.position.z - hp.z };
			const n = Math.hypot(rel.x, rel.y, rel.z);
			const k = (n + up) / n;
			v.position = { x: hp.x + rel.x * k, y: hp.y + rel.y * k, z: hp.z + rel.z * k };
			r.update(s);
			r.debug.benchmark(8);
		}
		let sync = Infinity;
		for (let w = 0; w < 10; w++) {
			let sum = 0;
			for (let i = 0; i < 6; i++) sum += r.debug.benchmark(1);
			sync = Math.min(sync, sum / 6);
		}
		if (up !== null) r.update(o.snapshot());
		return Math.round(sync * 100) / 100;
	}, up);
}

async function waitForFlight(page: Page): Promise<void> {
	await page.waitForFunction(
		() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0,
		null,
		{ timeout: 180_000 }
	);
	await page.waitForTimeout(3000);
}

// A profile with the two-stage example in the Hangar and the governor off.
const setup = await context.newPage();
await setup.addInitScript(() => localStorage.setItem('orbital.graphics.auto', 'off'));
await setup.goto('/vab');
await setup.getByRole('button', { name: 'Load the two-stage example' }).click();
await setup.waitForTimeout(1500);
await setup.close();

const rows: Record<string, unknown> = {
	when: new Date().toISOString(),
	viewport: `${process.env.VW ?? 1512}x${process.env.VH ?? 945} css, deviceScaleFactor ${process.env.DSF ?? 2}`
};
const presets = (process.env.PRESETS ?? 'medium,high').split(',');
const ratios = (process.env.RATIOS ?? '1,1.5,2').split(',').map(Number);
for (const preset of presets) {
	const page = await context.newPage();
	await page.addInitScript((p) => {
		localStorage.setItem('orbital.graphics', p);
		localStorage.setItem('orbital.graphics.auto', 'off');
	}, preset);
	// the first load compiles the programs; the second is measured
	await page.goto('/flight');
	await waitForFlight(page);
	await page.goto('/flight');
	await waitForFlight(page);
	await page.evaluate(async () => {
		await (window as any).__orbital.renderer().precompile();
	});
	// let the bakes a preset starts finish
	await page.waitForTimeout(8000);
	const res: Record<string, unknown> = {};
	for (const ratio of ratios) {
		await page.evaluate((x) => (window as any).__orbital.renderer().debug.setPixelRatio(x), ratio);
		await page.waitForTimeout(500);
		const size = await page.evaluate(() => {
			const c = document.querySelector('canvas')!;
			return `${c.width}x${c.height}`;
		});
		res[`ratio ${ratio} (${size})`] = {
			pad: await bench(page, null),
			'3 km': await bench(page, 3000),
			'12 km': await bench(page, 12000),
			'orbit 100 km': await bench(page, 100000)
		};
		console.log(preset, ratio, JSON.stringify(res[`ratio ${ratio} (${size})`]));
	}
	await page.evaluate(() => (window as any).__orbital.renderer().debug.setPixelRatio(2));
	await page.evaluate(() => (window as any).__orbital.renderer().setPlanetScale(0.5));
	res['ratio 2, planet pass at half'] = { pad: await bench(page, null), '3 km': await bench(page, 3000) };
	await page.evaluate(() => (window as any).__orbital.renderer().setPlanetScale(1));
	await page.evaluate(() => (window as any).__orbital.renderer().setRenderScale(0.67));
	res['ratio 2, render scale 0.67'] = { pad: await bench(page, null), '3 km': await bench(page, 3000) };
	rows[preset] = res;
	await page.close();
}
await browser.close();
const out = process.argv[2];
if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
console.log(JSON.stringify(rows, null, 1));
