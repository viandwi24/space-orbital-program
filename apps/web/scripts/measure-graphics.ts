/**
 * Graphics measurement (plan 251, `refs/graphics-performance`): frame time of the flight view by
 * viewport, device scale factor, preset, pixel ratio and scene; each `high` feature's share of the
 * frame (the debug switches, one at a time against the preset); and a free-flight frame-interval trace
 * with the governor on. The journal 054 method as `measure-devices.ts`, with the options of the older
 * `refs/graphics-performance/tools/measure-dpr.ts` folded in.
 *
 * Against a `NODE_ENV=development` build (the `__orbital` hook) served by `scripts/serve.ts`:
 *
 *   NODE_ENV=development bun run build && bun scripts/serve.ts 5211 &
 *   SHOT_URL=http://localhost:5211 bun scripts/measure-graphics.ts out.json
 *
 * Options (environment):
 *   VW, VH      CSS viewport (default 1512 x 945, the 14" MacBook Pro default)
 *   DSF         device scale factor (default 2)
 *   PRESETS     comma list (default medium,high)
 *   RATIOS      pixel ratios forced with `debug.setPixelRatio` (default 1,1.5,2)
 *   SCENES      pad, 3km, 12km, orbit, hillside (default pad,3km,12km,orbit,hillside)
 *   ABLATE      the ratio to run the per-feature ablation at, on every preset in PRESETS ("" = skip, default 2)
 *   ABLATE_ONLY comma list of switch names (and `all`) to run in the ablation, for a rerun of disturbed rows
 *   TRACE       seconds of free-flight frame intervals with the governor on (default 0 = skip)
 *   MEASURE_ANGLE   the GPU backend (default `metal`; `d3d11` on Windows, `vulkan` or `gl` on Linux)
 *   MEASURE_HEADLESS=1   a quick smoke run only: a headless Chromium reads frames about 3x slow
 *   MEASURE_NOTES   free text stored in the JSON: the power state, `pmset -g therm`, the commit measured
 *
 * Numbers are "sync ms": the minimum over 10 windows of the mean of 6 single frames
 * (`renderer.debug.benchmark(1)`, draw plus a readPixels stall). The browser window must stay in view
 * and the machine plugged in, idle for 10 minutes, with nothing else running.
 */
import { chromium, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const base = process.env.SHOT_URL ?? 'http://localhost:5211';
const angle = process.env.MEASURE_ANGLE ?? 'metal';
const out = process.argv[2];
const VW = Number(process.env.VW ?? 1512);
const VH = Number(process.env.VH ?? 945);
const DSF = Number(process.env.DSF ?? 2);
const presets = (process.env.PRESETS ?? 'medium,high').split(',');
const ratios = (process.env.RATIOS ?? '1,1.5,2').split(',').map(Number);
const sceneNames = (process.env.SCENES ?? 'pad,3km,12km,orbit,hillside').split(',');
const ablate = process.env.ABLATE === undefined ? '2' : process.env.ABLATE;
const traceSeconds = Number(process.env.TRACE ?? 0);
const ablateOnly = process.env.ABLATE_ONLY ? process.env.ABLATE_ONLY.split(',') : null;

type Scene = { up: number } | { latitude: number; longitude: number; ground: number } | null;
/** The scenes of journals 039 and 050; the hillside is at 1.7 km above the sea, latitude 0.009166, longitude 0.04416. */
const SCENES: Record<string, Scene> = {
	pad: null,
	'3km': { up: 3_000 },
	'12km': { up: 12_000 },
	orbit: { up: 100_000 },
	hillside: { latitude: 0.009166, longitude: 0.04416, ground: 1_700 }
};
for (const n of sceneNames) if (!(n in SCENES)) throw new Error(`unknown scene "${n}"`);

const browser = await chromium.launch({
	headless: process.env.MEASURE_HEADLESS === '1',
	args: [`--use-angle=${angle}`, '--enable-gpu', '--ignore-gpu-blocklist']
});
const context = await browser.newContext({
	viewport: { width: VW, height: VH },
	deviceScaleFactor: DSF,
	baseURL: base
});

/** Frame time of the scene the live snapshot shows, with the active vessel moved to `scene` (journal 054). */
async function bench(page: Page, scene: Scene): Promise<number> {
	return page.evaluate((scene) => {
		const o = (window as any).__orbital;
		const r = o.renderer();
		if (scene) {
			const s = structuredClone(o.snapshot());
			const v = s.vessels[0];
			const home = s.bodies.find((b: any) => b.id === 'stock.home');
			const hp = home.position;
			const rel = { x: v.position.x - hp.x, y: v.position.y - hp.y, z: v.position.z - hp.z };
			const n = Math.hypot(rel.x, rel.y, rel.z);
			let dir = { x: rel.x / n, y: rel.y / n, z: rel.z / n };
			let radius = n;
			if ('up' in scene) radius = n + scene.up;
			else {
				// body-fixed direction of the latitude and longitude, turned by the body's rotation
				const la = scene.latitude;
				const lo = scene.longitude;
				const d = {
					x: Math.cos(la) * Math.cos(lo),
					y: Math.sin(la),
					z: -Math.cos(la) * Math.sin(lo)
				};
				const q = home.rotation;
				const ix = q.w * d.x + q.y * d.z - q.z * d.y;
				const iy = q.w * d.y + q.z * d.x - q.x * d.z;
				const iz = q.w * d.z + q.x * d.y - q.y * d.x;
				const iw = -q.x * d.x - q.y * d.y - q.z * d.z;
				dir = {
					x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
					y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
					z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x
				};
				radius = 600_000 + scene.ground + 5;
			}
			v.position = { x: hp.x + dir.x * radius, y: hp.y + dir.y * radius, z: hp.z + dir.z * radius };
			r.update(s);
			r.debug.benchmark(8);
		}
		let sync = Infinity;
		for (let w = 0; w < 10; w++) {
			let sum = 0;
			for (let i = 0; i < 6; i++) sum += r.debug.benchmark(1);
			sync = Math.min(sync, sum / 6);
		}
		if (scene) r.update(o.snapshot());
		return Math.round(sync * 100) / 100;
	}, scene);
}

async function waitForFlight(page: Page): Promise<void> {
	await page.waitForFunction(
		() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0,
		null,
		{ timeout: 180_000 }
	);
	await page.waitForTimeout(3000);
}

/** A page at `preset` on its second load, programs compiled and the preset's bakes finished. */
async function openFlight(preset: string, governor: 'off' | 'on'): Promise<Page> {
	const page = await context.newPage();
	await page.addInitScript(
		([p, g]) => {
			localStorage.setItem('orbital.graphics', p!);
			localStorage.setItem('orbital.graphics.auto', g!);
		},
		[preset, governor]
	);
	// the first load compiles the programs; the second is measured
	await page.goto('/flight');
	await waitForFlight(page);
	await page.goto('/flight');
	await waitForFlight(page);
	await page.evaluate(async () => {
		await (window as any).__orbital.renderer().precompile();
	});
	await page.waitForTimeout(8000);
	return page;
}

async function setRatio(page: Page, ratio: number): Promise<string> {
	await page.evaluate((x) => (window as any).__orbital.renderer().debug.setPixelRatio(x), ratio);
	await page.waitForTimeout(500);
	return page.evaluate(() => {
		const c = document.querySelector('canvas')!;
		return `${c.width}x${c.height}`;
	});
}

/** Whether the page is on screen and focused: a hidden or occluded window reads wrong (a click or a cover can too). */
async function pageState(page: Page): Promise<string> {
	return page.evaluate(
		() => `${document.visibilityState}${document.hasFocus() ? '+focus' : '+nofocus'}`
	);
}

/** A feature switched off cannot cost this many times more than the row it is measured against. */
const BAND = 1.3;
/** Rows that were measured while the page was not visible, or that stayed over the band: not to be trusted. */
const suspect: string[] = [];

/**
 * One scene's frame time, measured again (up to 4 times, 5 s apart) when the page was hidden during it or
 * when it came out over `BAND` times `reference`; the smallest valid reading wins, since a disturbance (a
 * click on the window, a cover, a background job) only ever adds time. -1 when none was valid.
 */
async function steady(
	page: Page,
	scene: Scene,
	label: string,
	reference?: number
): Promise<number> {
	let best = Infinity;
	for (let attempt = 0; attempt < 4; attempt++) {
		const before = await pageState(page);
		const ms = await bench(page, scene);
		const after = await pageState(page);
		if (before.startsWith('visible') && after.startsWith('visible')) best = Math.min(best, ms);
		else suspect.push(`${label}, attempt ${attempt + 1}: page ${before} then ${after}`);
		if (best < Infinity && (reference === undefined || best <= reference * BAND)) return best;
		await page.waitForTimeout(5000);
	}
	suspect.push(
		best === Infinity
			? `${label}: never measured while visible`
			: `${label}: ${best} ms stays over ${BAND} x ${reference} ms`
	);
	return best === Infinity ? -1 : best;
}

async function allScenes(
	page: Page,
	label = '',
	reference?: Record<string, number>
): Promise<Record<string, number>> {
	const res: Record<string, number> = {};
	for (const n of sceneNames)
		res[n] = await steady(page, SCENES[n]!, `${label} ${n}`.trim(), reference?.[n]);
	return res;
}

// A profile with the two-stage example in the Hangar and the governor off.
const setup = await context.newPage();
await setup.addInitScript(() => localStorage.setItem('orbital.graphics.auto', 'off'));
await setup.goto('/vab');
await setup.getByRole('button', { name: 'Load the two-stage example' }).click();
await setup.waitForTimeout(1500);
const gpu = await setup.evaluate(() => {
	const gl = document.createElement('canvas').getContext('webgl2');
	const ext = gl?.getExtension('WEBGL_debug_renderer_info');
	return ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
});
await setup.close();
console.log('gpu', gpu);

const rows: Record<string, unknown> = {
	when: new Date().toISOString(),
	gpu,
	angle,
	viewport: `${VW}x${VH} css, deviceScaleFactor ${DSF}`,
	notes: process.env.MEASURE_NOTES ?? '',
	scenes: sceneNames
};

// 1. Frame time by preset, pixel ratio and scene.
const byRatio: Record<string, unknown> = {};
for (const preset of presets) {
	const page = await openFlight(preset, 'off');
	const res: Record<string, unknown> = {};
	for (const ratio of ratios) {
		const size = await setRatio(page, ratio);
		res[`ratio ${ratio} (${size})`] = await allScenes(page, `${preset} ratio ${ratio}`);
		console.log(preset, ratio, JSON.stringify(res[`ratio ${ratio} (${size})`]));
	}
	byRatio[preset] = res;
	await page.close();
}
rows.byRatio = byRatio;

// 2. Each feature's share: one switch on at a time, on every preset's own table, against none.
if (ablate !== '') {
	const ratio = Number(ablate);
	const ablation: Record<string, unknown> = {};
	for (const preset of presets) {
		const page = await openFlight(preset, 'off');
		const size = await setRatio(page, ratio);
		const allNames: string[] = await page.evaluate(() => [
			...(window as any).__orbital.renderer().debug.featureNames
		]);
		const names = ablateOnly ? allNames.filter((n) => ablateOnly.includes(n)) : allNames;
		const none = await allScenes(page, `${preset} none`);
		const res: Record<string, Record<string, number>> = { none };
		for (const name of names) {
			await page.evaluate(
				(n) => (window as any).__orbital.renderer().debug.setFeature(n, true),
				name
			);
			await page.waitForTimeout(1500);
			res[name] = await allScenes(page, `${preset} ${name}`, none);
			await page.evaluate(
				(n) => (window as any).__orbital.renderer().debug.setFeature(n, false),
				name
			);
			console.log(preset, 'ablate', name, JSON.stringify(res[name]));
		}
		// every switch at once: what the preset would cost with all its extras taken down
		if (!ablateOnly || ablateOnly.includes('all')) {
			for (const name of allNames)
				await page.evaluate(
					(n) => (window as any).__orbital.renderer().debug.setFeature(n, true),
					name
				);
			await page.waitForTimeout(1500);
			res.all = await allScenes(page, `${preset} all`, none);
			await page.evaluate(() => (window as any).__orbital.renderer().debug.resetFeatures());
		}
		// the plain preset again at the end: it must read as it did at the start, or the run drifted
		const noneEnd = await allScenes(page, `${preset} none (end)`);
		res.noneEnd = noneEnd;
		for (const n of sceneNames)
			if (Math.abs(noneEnd[n]! - none[n]!) > 0.25 * none[n]!)
				suspect.push(
					`${preset} ablation drifted on ${n}: ${none[n]} ms at the start, ${noneEnd[n]} at the end`
				);
		ablation[`${preset}, ratio ${ratio} (${size})`] = res;
		await page.close();
	}
	rows.ablation = ablation;
}

// 3. Free flight with the governor on: the frame intervals a player gets, from the flight's histogram.
if (traceSeconds > 0) {
	const preset = presets.at(-1)!;
	const page = await openFlight(preset, 'on');
	await setRatio(page, ratios.at(-1)!);
	await page.evaluate(() => (window as any).__orbital.resetFrameStats?.());
	const trace = await page.evaluate(async (seconds) => {
		const o = (window as any).__orbital;
		const out: number[] = [];
		const levels: string[] = [];
		let last = performance.now();
		const end = last + seconds * 1000;
		await new Promise<void>((resolve) => {
			const tick = (now: number): void => {
				out.push(now - last);
				last = now;
				const info = o.level?.();
				if (info) levels.push(`${info.preset} ${Math.round(info.scale * 100)}%`);
				if (now < end) requestAnimationFrame(tick);
				else resolve();
			};
			requestAnimationFrame(tick);
		});
		const sorted = out.slice(1).sort((a, b) => a - b);
		const at = (p: number): number => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]!;
		const changes = levels.filter((l, i) => i === 0 || l !== levels[i - 1]);
		return {
			frames: sorted.length,
			p50: at(0.5),
			p95: at(0.95),
			p99: at(0.99),
			over16_7: sorted.filter((v) => v > 1000 / 60).length / sorted.length,
			over33_3: sorted.filter((v) => v > 1000 / 30).length / sorted.length,
			levels: changes
		};
	}, traceSeconds);
	rows.governorTrace = { preset, seconds: traceSeconds, ...trace };
	console.log('trace', JSON.stringify(rows.governorTrace));
	await page.close();
}

rows.suspect = suspect;
if (suspect.length > 0) console.log('SUSPECT rows:\n' + suspect.join('\n'));
await browser.close();
if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
console.log(JSON.stringify(rows, null, 1));
