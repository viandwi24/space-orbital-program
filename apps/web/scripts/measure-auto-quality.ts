/**
 * The auto-quality check (plan 362): the owner's scene, Kronos V + Selene in a 100 km circular orbit,
 * drawn for a while under several graphics configurations, with the frame intervals the player gets,
 * the governor's level over time, the GPU time WebGPU's timestamps report and the canvas size.
 *
 * Against a `NODE_ENV=development` build (the `__orbital` hook) served by `scripts/serve.ts`:
 *
 *   NODE_ENV=development bun run build && bun scripts/serve.ts 5211 &
 *   SHOT_URL=http://localhost:5211 bun scripts/measure-auto-quality.ts out.json
 *
 * Options (environment):
 *   VW, VH, DSF   CSS viewport and device scale factor (default 1512 x 945 at 2, the 14" MacBook Pro)
 *   CONFIGS       comma list of `<backend>:<preset>:<adjust>` (backend webgpu or webgl, preset
 *                 low/medium/high/auto, adjust on/off); default the owner's three on WebGPU and WebGL
 *   SECONDS       seconds traced per configuration (default 40), after WARM seconds (default 10)
 *   MEASURE_NOTES free text kept in the JSON: power state, commit
 */
import { chromium, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const base = process.env.SHOT_URL ?? 'http://localhost:5211';
const out = process.argv[2];
const VW = Number(process.env.VW ?? 1512);
const VH = Number(process.env.VH ?? 945);
const DSF = Number(process.env.DSF ?? 2);
const seconds = Number(process.env.SECONDS ?? 40);
const warm = Number(process.env.WARM ?? 10);
const configs = (
	process.env.CONFIGS ??
	'webgpu:medium:off,webgpu:high:off,webgpu:auto:on,webgl:medium:off,webgl:high:off,webgl:auto:on'
).split(',');

const browser = await chromium.launch({
	headless: false,
	args: [
		'--use-angle=metal',
		'--enable-gpu',
		'--ignore-gpu-blocklist',
		'--enable-unsafe-webgpu',
		// a background window must not be throttled while another config runs
		'--disable-background-timer-throttling',
		'--disable-renderer-backgrounding',
		'--disable-backgrounding-occluded-windows'
	]
});
const context = await browser.newContext({
	viewport: { width: VW, height: VH },
	deviceScaleFactor: DSF,
	baseURL: base
});
await context.addInitScript(() => {
	localStorage.setItem('orbital.vab.hideStart', '1');
	localStorage.setItem('orbital.onboarding.off', '1');
});

// The design: Kronos V + Selene from the Hangar's start modal (it is kept for /flight).
{
	const setup = await context.newPage();
	await setup.addInitScript(() => localStorage.removeItem('orbital.vab.hideStart'));
	await setup.goto('/vab');
	await setup.getByTestId('vab-start-kronos-selene').click({ timeout: 120_000 });
	await setup.waitForTimeout(2500);
	await setup.close();
}

async function waitForFlight(page: Page): Promise<void> {
	await page.waitForFunction(
		() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0,
		null,
		{ timeout: 240_000 }
	);
	// the world's loading screen (plan 340) is up while the programs compile
	await page.getByTestId('world-loading').waitFor({ state: 'detached', timeout: 240_000 });
}

async function run(config: string): Promise<Record<string, unknown>> {
	const [backend, preset, adjust] = config.split(':') as [string, string, string];
	const page = await context.newPage();
	page.on('pageerror', (e) => console.log('  pageerror', e.message));
	await page.addInitScript(
		([b, p, a]) => {
			localStorage.setItem('orbital.graphics.renderer', b!);
			if (p === 'auto') localStorage.removeItem('orbital.graphics');
			else localStorage.setItem('orbital.graphics', p!);
			localStorage.setItem('orbital.graphics.auto', a!);
			// each configuration starts without what an earlier one taught Automatic (plan 362)
			if (!sessionStorage.getItem('measure.started')) {
				localStorage.removeItem('orbital.graphics.learned');
				sessionStorage.setItem('measure.started', '1');
			}
		},
		[backend, preset, adjust]
	);
	const loadStart = Date.now();
	await page.goto('/flight');
	await waitForFlight(page);
	const loadMs = Date.now() - loadStart;
	await page.waitForTimeout(3000);
	await page.evaluate(() =>
		(window as any).__orbitalDebug.setOrbit({ apoapsis: 100_000, periapsis: 100_000 })
	);
	await page.waitForTimeout(warm * 1000);
	const trace = await page.evaluate(async (seconds) => {
		const o = (window as any).__orbital;
		const r = o.renderer();
		o.resetFrameStats?.();
		const intervals: number[] = [];
		const levels: { t: number; level: string }[] = [];
		const gpu: number[] = [];
		let last = performance.now();
		const t0 = last;
		const end = last + seconds * 1000;
		let lastLevel = '';
		let lastGpuAt = 0;
		const webgpu = r.debug.counters().renderer === 'webgpu';
		await new Promise<void>((resolve) => {
			const tick = (now: number): void => {
				intervals.push(now - last);
				last = now;
				const l = o.level?.();
				const c = document.querySelector('canvas');
				const text = `${l?.preset} ${Math.round((l?.scale ?? 1) * 100)}% ${c?.width}x${c?.height}`;
				if (text !== lastLevel) {
					levels.push({ t: Math.round((now - t0) / 100) / 10, level: text });
					lastLevel = text;
				}
				// info() reads the GPU name, a stall on WebGL: only WebGPU's timestamps, twice a second
				if (webgpu && now - lastGpuAt > 500) {
					const ms = r.debug.info().gpuMs;
					if (ms != null) gpu.push(ms);
					lastGpuAt = now;
				}
				if (now < end) requestAnimationFrame(tick);
				else resolve();
			};
			requestAnimationFrame(tick);
		});
		// the frames the flight view drew (the governor may skip rAFs to pace them)
		const stats = o.frameStats?.();
		const sorted = intervals.slice(1).sort((a, b) => a - b);
		const at = (p: number): number => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]!;
		const hist: Record<string, number> = {};
		for (const v of sorted) {
			const bin =
				v < 9
					? '<9'
					: v < 18
						? '9-18'
						: v < 26
							? '18-26'
							: v < 35
								? '26-35'
								: v < 50
									? '35-50'
									: '>50';
			hist[bin] = (hist[bin] ?? 0) + 1;
		}
		const g = gpu.slice().sort((a, b) => a - b);
		const info = r.debug.info();
		return {
			rafs: sorted.length,
			rafP50: Math.round(at(0.5) * 10) / 10,
			rafP95: Math.round(at(0.95) * 10) / 10,
			hist,
			drawn: stats,
			gpuMsP50: g.length ? Math.round(g[Math.floor(g.length / 2)]! * 100) / 100 : null,
			levels,
			governor: o.governor?.() ?? null,
			renderer: info.renderer,
			gpu: info.gpu,
			presetWarmMs: info.presetWarmMs ?? null,
			drawCalls: info.drawCalls,
			triangles: info.triangles,
			memory: (performance as any).memory?.usedJSHeapSize ?? null
		};
	}, seconds);
	// STEPS=1: the longest frame after each switch the governor can make, against the steady frames
	// (a resolution rung, a preset change), with the governor out of the way
	const steps = process.env.STEPS
		? await page.evaluate(async () => {
				const o = (window as any).__orbital;
				const r = o.renderer();
				const longest = (ms: number): Promise<number> =>
					new Promise((resolve) => {
						let last = performance.now();
						let worst = 0;
						const end = last + ms;
						const f = (now: number): void => {
							worst = Math.max(worst, now - last);
							last = now;
							if (now < end) requestAnimationFrame(f);
							else resolve(Math.round(worst));
						};
						requestAnimationFrame(f);
					});
				const out: Record<string, number[]> = { steady: [], scale: [], preset: [] };
				const start = r.preset;
				for (let i = 0; i < 4; i++) {
					out.steady!.push(await longest(1000));
					r.setRenderScale(i % 2 === 0 ? 0.85 : 1);
					out.scale!.push(await longest(1000));
				}
				for (const p of ['low', start, 'medium', start]) {
					r.setPreset(p);
					out.preset!.push(await longest(1500));
				}
				return out;
			})
		: null;
	if (steps) console.log('steps', config, JSON.stringify(steps));
	if (process.env.SHOTS)
		await page.screenshot({
			path: `${process.env.SHOTS}/${config.replaceAll(':', '-')}.jpg`,
			type: 'jpeg',
			quality: 80
		});
	await page.close();
	return { config, loadMs, ...trace, steps };
}

const rows: Record<string, unknown> = {
	when: new Date().toISOString(),
	viewport: `${VW}x${VH} css @${DSF}`,
	notes: process.env.MEASURE_NOTES ?? '',
	runs: [] as unknown[]
};
for (const c of configs) {
	const res = await run(c);
	(rows.runs as unknown[]).push(res);
	console.log(JSON.stringify(res));
}
await browser.close();
if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
