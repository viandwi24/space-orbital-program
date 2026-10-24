/**
 * The sunrise stall check (plan 373): the booster example in a 100 km circular orbit at 50x warp, the
 * frames longer than 100 ms and the pipelines compiled in them, across sunrises and sunsets.
 *
 * Against a `NODE_ENV=development` build (the `__orbital` hook) served by `scripts/serve.ts`:
 *
 *   SHOT_URL=http://localhost:5211 R=webgpu START=night bun scripts/measure-sunrise.ts
 *
 * Options (environment): R `webgpu` | `webgl`; START `night` | `day` (where on the orbit the vessel
 * starts, by its mean anomaly); SECONDS of warp (default 120, about three orbits); M0 to set the mean
 * anomaly directly; STEP_TO a comma list of presets the run steps to as the governor does
 * (`setPreset(p, { governed: true })`), one each `seconds / (n + 1)`.
 */
import { chromium } from '@playwright/test';

const base = process.env.SHOT_URL ?? 'http://localhost:5211';
const backend = process.env.R ?? 'webgpu';
const seconds = Number(process.env.SECONDS ?? 120);
const start = process.env.START ?? 'night';

const browser = await chromium.launch({
	headless: false,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: base });
await context.addInitScript(() => localStorage.setItem('orbital.vab.hideStart', '1'));
const page = await context.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('/vab');
await page.waitForFunction(() => (window as any).__orbitalVab?.loadBooster, null, {
	timeout: 90_000
});
await page.evaluate(() => (window as any).__orbitalVab.loadBooster());
await page.waitForTimeout(1500);
await page.goto(`/flight?renderer=${backend}`);
await page.waitForFunction(
	() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0,
	null,
	{
		timeout: 240_000
	}
);
await page.getByTestId('world-loading').waitFor({ state: 'detached', timeout: 240_000 });
// the presets the governor can reach warm in the background; it waits for them, and so do the steps here
const warmed = Date.now();
await page.evaluate(() => (window as any).__orbital.renderer().precompile());
console.log('background warm-up', Date.now() - warmed, 'ms');
console.log(
	'planet pipelines by phase',
	await page.evaluate(() =>
		(window as any).__orbital
			.renderer()
			.compiles.pipelines.filter((p: any) => /planet/.test(p.label))
			.map((p: any) => `${p.phase}:${p.label.replace("renderPipeline_", "")}`)
			.join(' ')
	)
);
await page.waitForTimeout(3000);

/** The sun's elevation at the vessel for mean anomaly `m0` (rad), after a moment to settle. */
async function orbitAt(m0: number): Promise<number> {
	await page.evaluate(
		(m0) => (window as any).__orbitalDebug.setOrbit({ a: 700_000, e: 0, i: 0, m0 }),
		m0
	);
	await page.waitForTimeout(2500);
	return page.evaluate(() => (window as any).__orbital.renderer().debug.info().sunElevationDeg);
}
// pick the start: try the anomalies around the orbit, keep the first that is night (or day)
let m0 = process.env.M0 !== undefined ? Number(process.env.M0) : 0;
let elevation = await orbitAt(m0);
if (process.env.M0 === undefined) {
	for (let k = 0; k < 8; k++) {
		const night = elevation < -5;
		if ((start === 'night') === night) break;
		m0 = ((k + 1) * Math.PI) / 4;
		elevation = await orbitAt(m0);
	}
}
console.log('start', start, 'm0', m0.toFixed(2), 'sun elevation', Math.round(elevation));
await page.mouse.click(720, 300);
for (let i = 0; i < 4; i++) {
	await page.keyboard.press('Period');
	await page.waitForTimeout(300);
}
const steps = (process.env.STEP_TO ?? '').split(',').filter(Boolean);
const result = await page.evaluate(
	async ([seconds, steps]) => {
		const o = (window as any).__orbital;
		const r = o.renderer();
		let seen = r.compiles.pipelines.length;
		const stalls: Array<{ ms: number; t: number; sun: number; level: string; added?: string[] }> =
			[];
		let last = performance.now();
		const t0 = last;
		let n = 0;
		let worst = 0;
		let sunrises = 0;
		let wasUp: boolean | null = null;
		// info() reads the GPU name, a stall on WebGL: the sun is read every 30th frame on WebGPU only,
		// and on a long frame (after it, so it does not add to it)
		const webgpu = r.debug.counters().renderer === 'webgpu';
		let sun = Number.NaN;
		let stepped = 0;
		while (performance.now() - t0 < seconds * 1000) {
			if (
				stepped < steps.length &&
				performance.now() - t0 > ((stepped + 1) * seconds * 1000) / (steps.length + 1)
			) {
				r.setPreset(steps[stepped], { governed: true });
				// the governor's rung of that preset (plan 395): TAAU follows the preset's own share
				r.setTaau?.(null);
				stepped++;
			}
			await new Promise((res) => requestAnimationFrame(res));
			const now = performance.now();
			const d = now - last;
			last = now;
			n++;
			if (webgpu && n % 30 === 0) {
				sun = r.debug.info().sunElevationDeg as number;
				const up = sun > -2;
				if (wasUp === false && up) sunrises++;
				wasUp = up;
			}
			const list = r.compiles.pipelines;
			const added =
				list.length > seen
					? list
							.slice(seen)
							.map((p: any) => `${p.label}${p.ms != null ? ' ' + Math.round(p.ms) + 'ms' : ''}`)
					: undefined;
			seen = list.length;
			worst = Math.max(worst, d);
			if (d > 100 || added) {
				if (!webgpu) sun = r.debug.info().sunElevationDeg as number;
				const l = o.level?.();
				stalls.push({
					ms: Math.round(d),
					t: Math.round(o.snapshot()?.t ?? 0),
					sun: Math.round(sun),
					level: l ? `${l.preset} ${Math.round(l.scale * 100)}%` : '?',
					...(added ? { added } : {})
				});
			}
		}
		return {
			frames: n,
			worst: Math.round(worst),
			sunrises,
			over100: stalls.filter((s) => s.ms > 100).length,
			stalls
		};
	},
	[seconds, steps] as const
);
console.log(backend, start, JSON.stringify(result));
await browser.close();
