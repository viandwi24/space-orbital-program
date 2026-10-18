/**
 * Silhouette anti-aliasing of the planet pass (plan 133, journal 133): screenshots and frame times
 * of four pad scenes with the coverage off and on, and a reference at four samples per pixel.
 * Playwright's Chromium on the Metal GPU, against a development build (`__orbital` exists) that is
 * already being served:
 *
 *   NODE_ENV=development bunx vite build --mode development   (then serve `build/` with a page fallback)
 *   AA_PRESET=high bun scripts/measure-silhouette.ts http://localhost:5301 after /tmp/out
 *
 * Writes `133-<label>-<scene>-{off,on,ref}.png`, JPEGs of off and on, and `133-<label>.json` with
 * the minimum of six `benchmark(8)` runs per scene. A build without the coverage (no
 * `debug.silhouetteAA`) gives the baseline: `off` and `on` are then the same frame.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [base, label, out] = [process.argv[2]!, process.argv[3]!, process.argv[4]!];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
	headless: true,
	args: [
		'--use-angle=metal',
		'--enable-gpu',
		'--ignore-gpu-blocklist',
		'--enable-unsafe-swiftshader=false'
	]
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, baseURL: base });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => {
	if (m.type() === 'error') console.log('console', m.text().slice(0, 300));
});
await page.goto('/vab');
await page.getByRole('button', { name: 'Load the two-stage example' }).click();
await page.getByRole('button', { name: /^Launch/ }).click();
const anyway = page.getByRole('button', { name: 'Launch anyway' });
if (await anyway.isVisible().catch(() => false)) await anyway.click();
await page.waitForURL('**/launch');
await page.getByTestId('launch-go').click();
await page.waitForURL('**/flight');
await page.getByTestId('hud-met').waitFor({ timeout: 120_000 });
await page.waitForTimeout(6000);
const PRESET = process.env.AA_PRESET ?? 'high';
await page.evaluate((p) => (window as any).__orbital.renderer().setPreset(p), PRESET);
await page.waitForTimeout(4000);
const info = await page.evaluate(() => (window as any).__orbital.renderer().debug.info());
console.log(label, 'gpu', JSON.stringify(info).slice(0, 300));
const scenes = [
	{ name: 'pad-low-sun', preset: 'pad-low-sun', rig: null },
	{ name: 'pad-noon', preset: 'pad-noon', rig: null },
	{ name: 'horizon', preset: 'pad-noon', rig: { yaw: 2.6, pitch: 0.0, distance: 40 } },
	{ name: 'ridge', preset: 'pad-low-sun', rig: { yaw: -1.2, pitch: -0.02, distance: 40 } }
];
const result: Record<string, unknown> = {};
for (const sc of scenes) {
	const r = await page.evaluate(async (sc) => {
		const o = (window as any).__orbital;
		const d = o.renderer().debug;
		d.setPixelRatio(1);
		d.applyPreset(sc.preset);
		if (sc.rig) d.setCamera(sc.rig);
		const canvas = document.querySelector('canvas') as HTMLCanvasElement;
		const grab = (): ImageData => {
			o.renderer().render();
			const c = document.createElement('canvas');
			c.width = canvas.width;
			c.height = canvas.height;
			const x = c.getContext('2d')!;
			x.drawImage(canvas, 0, 0);
			return x.getImageData(0, 0, c.width, c.height);
		};
		const has = typeof d.silhouetteAA === 'function';
		const bench = (): number => {
			const runs: number[] = [];
			for (let k = 0; k < 6; k++) runs.push(d.benchmark(8));
			return Math.min(...runs);
		};
		const shot = (): string => {
			o.renderer().render();
			return canvas.toDataURL('image/jpeg', 0.9);
		};
		if (has) d.silhouetteAA(false);
		bench();
		const offMs = bench();
		let onMs = offMs;
		if (has) {
			d.silhouetteAA(true);
			bench();
			onMs = bench();
			d.silhouetteAA(false);
		}
		const off = grab();
		const offJpg = shot();
		const offPng = canvas.toDataURL('image/png');
		if (has) d.silhouetteAA(true);
		const on = has ? grab() : off;
		const onJpg = has ? shot() : offJpg;
		const onPng = canvas.toDataURL('image/png');
		// the reference: four samples per pixel (ratio 2, no coverage), box-filtered down
		if (has) d.silhouetteAA(false);
		d.setPixelRatio(2);
		o.renderer().render();
		const big = document.createElement('canvas');
		big.width = canvas.width;
		big.height = canvas.height;
		big.getContext('2d')!.drawImage(canvas, 0, 0);
		const small = document.createElement('canvas');
		small.width = big.width / 2;
		small.height = big.height / 2;
		const sx = small.getContext('2d')!;
		const bd = big.getContext('2d')!.getImageData(0, 0, big.width, big.height).data;
		const sd = sx.createImageData(small.width, small.height);
		for (let y = 0; y < small.height; y++)
			for (let x = 0; x < small.width; x++)
				for (let c = 0; c < 4; c++) {
					let sum = 0;
					for (const [dx, dy] of [
						[0, 0],
						[1, 0],
						[0, 1],
						[1, 1]
					])
						sum += bd[((2 * y + dy) * big.width + 2 * x + dx) * 4 + c]!;
					sd.data[(y * small.width + x) * 4 + c] = sum / 4;
				}
		sx.putImageData(sd, 0, 0);
		const refPng = small.toDataURL('image/png');
		d.setPixelRatio(1);
		if (has) d.silhouetteAA(true);
		// stair steps: in each column, the rows the AA changed (the silhouette); a vertical pair there
		// whose luminance jump is over 60 % of the column's sky-ground contrast is a hard step
		const W = on.width,
			H = on.height;
		const L = (img: ImageData, x: number, y: number): number => {
			const i = (y * W + x) * 4;
			return 0.2126 * img.data[i]! + 0.7152 * img.data[i + 1]! + 0.0722 * img.data[i + 2]!;
		};
		let hardOff = 0,
			hardOn = 0,
			edgeCols = 0,
			changed = 0;
		for (let x = 0; x < W; x++) {
			let lo = -1,
				hi = -1;
			for (let y = 0; y < H; y++) {
				const i = (y * W + x) * 4;
				const diff =
					Math.abs(on.data[i]! - off.data[i]!) +
					Math.abs(on.data[i + 1]! - off.data[i + 1]!) +
					Math.abs(on.data[i + 2]! - off.data[i + 2]!);
				if (diff > 30) {
					changed++;
					if (lo < 0) lo = y;
					hi = y;
				}
			}
			if (lo < 0) continue;
			edgeCols++;
			const y0 = Math.max(1, lo - 3),
				y1 = Math.min(H - 1, hi + 3);
			for (const [img, add] of [
				[off, (n: number) => (hardOff += n)],
				[on, (n: number) => (hardOn += n)]
			] as const) {
				let mn = 1e9,
					mx = -1e9;
				for (let y = y0 - 1; y <= y1; y++) {
					const l = L(img, x, y);
					mn = Math.min(mn, l);
					mx = Math.max(mx, l);
				}
				const contrast = mx - mn;
				if (contrast < 12) continue;
				let n = 0;
				for (let y = y0; y <= y1; y++)
					if (Math.abs(L(img, x, y) - L(img, x, y - 1)) > 0.6 * contrast) n++;
				add(n);
			}
		}
		return {
			has,
			offMs,
			onMs,
			edgeCols,
			changed,
			hardOff,
			hardOn,
			offJpg,
			onJpg,
			offPng,
			onPng,
			refPng
		};
	}, sc);
	const { offJpg, onJpg, offPng, onPng, refPng, ...nums } = r as any;
	for (const [k, v] of [
		['off', offPng],
		['on', onPng],
		['ref', refPng]
	] as const)
		writeFileSync(
			join(out, `133-${label}-${sc.name}-${k}.png`),
			Buffer.from(v.split(',')[1], 'base64')
		);
	writeFileSync(
		join(out, `133-${label}-${sc.name}-off.jpg`),
		Buffer.from(offJpg.split(',')[1], 'base64')
	);
	writeFileSync(
		join(out, `133-${label}-${sc.name}-on.jpg`),
		Buffer.from(onJpg.split(',')[1], 'base64')
	);
	console.log(label, sc.name, JSON.stringify(nums));
	result[sc.name] = nums;
}
writeFileSync(join(out, `133-${label}.json`), JSON.stringify(result, null, 2));
await browser.close();
