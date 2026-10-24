/**
 * The performance gate (plan 411): fixed scenes, headed, on WebGPU and WebGL, the governor off at a
 * fixed preset and again on; per scene the frame interval p50 and p95, long frames a minute, pipelines
 * compiled after the load and the JS heap range, held to the budgets of `apps/web/perf-budgets.json`.
 * A plan that touches `packages/renderer`, the looks or the page loops runs it on the M5 (under
 * `/tmp/orbital-measuring`, the machine idle and plugged in) and puts the table in its journal.
 *
 *   bun run perf:gate                      the M5 tier, every scene, both backends, governor off and on
 *   bun run perf:gate --quick              pad, orbit and the Space Center on the default backend, governor
 *                                          off: for the owner on the M2 or Windows, prints a table to paste back
 *   bun run perf:gate --tier m2|windows    the tier whose budgets apply (default m5)
 *   bun run perf:gate --freeze             write what was measured as the tier's budgets
 *
 * Options: --scenes pad,orbit  --backends webgpu,webgl  --governor off|on|both  --preset high|medium|low
 *   --seconds 12  --out file.json  --headless (a smoke run: the numbers mean nothing)  --no-build  --no-fail
 *   --url http://localhost:5173 (an already running server: no build)
 * Environment: MEASURE_ANGLE (metal on a Mac, d3d11 on Windows, vulkan or gl on Linux).
 */
import { chromium, type Page } from '@playwright/test';
import { createTerrainField, latLonDirection, LEGACY_TERRAIN_SEED } from '@orbital/core';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	QUICK_SCENES,
	SCENES,
	TIERS,
	budgetFor,
	failures,
	formatTable,
	freeze,
	summarizeFrames,
	type Backend,
	type Budgets,
	type SceneId,
	type SceneRun,
	type TierId
} from '../src/lib/perf/gate';

const root = join(import.meta.dir, '..');
const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(`--${name}`);
const option = (name: string): string | undefined => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : undefined;
};

const quick = flag('quick');
const tier = (option('tier') ?? 'm5') as TierId;
if (!(tier in TIERS)) throw new Error(`unknown tier "${tier}" (m5, m2, windows)`);
const scenes = (option('scenes')?.split(',') ??
	(quick ? [...QUICK_SCENES] : [...SCENES])) as SceneId[];
for (const s of scenes) if (!SCENES.includes(s)) throw new Error(`unknown scene "${s}"`);
const backends = (option('backends')?.split(',') ??
	(quick ? ['webgpu'] : ['webgpu', 'webgl'])) as Backend[];
const governors = (
	option('governor') === 'both' || (!option('governor') && !quick)
		? ['off', 'on']
		: [option('governor') ?? 'off']
) as Array<'off' | 'on'>;
const preset = option('preset') ?? 'high';
const seconds = Number(option('seconds') ?? (quick ? 5 : 12));
const angle =
	process.env.MEASURE_ANGLE ??
	(process.platform === 'win32' ? 'd3d11' : process.platform === 'darwin' ? 'metal' : 'vulkan');
const targetHz = TIERS[tier].targetHz;

// ---- the build and the server
let server: ChildProcess | null = null;
let base = option('url') ?? '';
if (!base) {
	if (!flag('no-build') || !existsSync(join(root, 'build'))) {
		console.log('building once (bun run build) ...');
		const built = spawnSync('bun', ['run', 'build'], { cwd: root, stdio: 'inherit' });
		if (built.status !== 0) throw new Error('the build failed');
	}
	const port = 5290 + Math.floor(Math.random() * 100);
	server = spawn('bun', ['scripts/serve.ts', String(port)], { cwd: root, stdio: 'ignore' });
	base = `http://localhost:${port}`;
	await new Promise((r) => setTimeout(r, 1500));
}

// ---- the sea: a spot of the legacy world's home planet where the water is
function seaSpot(): { latitude: number; longitude: number } {
	const field = createTerrainField({ radius: 600_000, seed: LEGACY_TERRAIN_SEED });
	for (let lat = -0.6; lat <= 0.6; lat += 0.05)
		for (let lon = -3; lon <= 3; lon += 0.05)
			if (field.waterAt?.(latLonDirection(lat, lon))) return { latitude: lat, longitude: lon };
	return { latitude: 0.009, longitude: 0.02 };
}
const sea = seaSpot();

// ---- the scenes
type Place =
	| {
			air: {
				latitude: number;
				longitude: number;
				altitude: number;
				speed: number;
				heading?: number;
				climb?: number;
			};
	  }
	| { orbit: number }
	| null;
const FLIGHT: Partial<Record<SceneId, Place>> = {
	pad: null,
	'3km': { air: { latitude: 0.009, longitude: 0.02, altitude: 3_000, speed: 0, climb: 0 } },
	'12km': { air: { latitude: 0.009, longitude: 0.02, altitude: 12_000, speed: 0, climb: 0 } },
	sea: { air: { ...sea, altitude: 40, speed: 0, climb: 0 } },
	orbit: { orbit: 100_000 },
	're-entry': {
		air: {
			latitude: 0.009,
			longitude: 0.02,
			altitude: 60_000,
			speed: 2_000,
			heading: 1.57,
			climb: -0.05
		}
	}
};

/** Frame intervals, long animation frames and the heap over `secs` seconds, in the page; and the compile count either side. */
async function sample(
	page: Page,
	secs: number
): Promise<{ intervals: number[]; heap: number[]; compilesBefore: number; compilesAfter: number }> {
	return page.evaluate(async (secs) => {
		const w = window as unknown as {
			__orbitalLoadReport?: () => { data: { compile: { pipelines: number } } } | null;
		};
		const compiles = (): number => w.__orbitalLoadReport?.()?.data.compile.pipelines ?? 0;
		const before = compiles();
		const intervals: number[] = [];
		const heap: number[] = [];
		const mb = (): number =>
			((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ??
				0) / 1e6;
		heap.push(mb());
		await new Promise<void>((resolve) => {
			let last = performance.now();
			const t0 = last;
			let nextHeap = t0 + 500;
			const tick = (now: number): void => {
				intervals.push(now - last);
				last = now;
				if (now >= nextHeap) {
					heap.push(mb());
					nextHeap = now + 500;
				}
				if (now - t0 < secs * 1000) requestAnimationFrame(tick);
				else resolve();
			};
			requestAnimationFrame(tick);
		});
		return {
			intervals: intervals.slice(1),
			heap,
			compilesBefore: before,
			compilesAfter: compiles()
		};
	}, secs);
}

async function waitForWorld(page: Page): Promise<void> {
	await page
		.getByTestId('world-loading')
		.waitFor({ state: 'detached', timeout: 300_000 })
		.catch(() => undefined);
	// the background warming has finished once the compile report has a `play` phase and nothing pends
	await page
		.waitForFunction(
			() => {
				const r = (
					window as unknown as {
						__orbitalLoadReport?: () => {
							data: { compile: { pending: number; phases: { phase: string }[] } };
						} | null;
					}
				).__orbitalLoadReport?.();
				return (
					!!r &&
					r.data.compile.pending === 0 &&
					r.data.compile.phases.some((p) => p.phase === 'play')
				);
			},
			null,
			{ timeout: 180_000 }
		)
		.catch(() => console.log('  (the warming did not settle in 3 minutes: measuring anyway)'));
	await page.waitForTimeout(3000);
}

async function place(page: Page, where: Place): Promise<void> {
	if (where === null) return;
	const ok = await page.evaluate(async (w) => {
		const d = (
			window as unknown as {
				__orbitalDebug?: Record<string, (x: unknown) => Promise<{ ok: boolean; reason?: string }>>;
			}
		).__orbitalDebug;
		if (!d) return 'no debug API (the world does not allow debug tools)';
		const r =
			'air' in w
				? await d.setLocation!({ kind: 'air', ...w.air })
				: await d.setOrbit!({ body: 'stock.home', apoapsis: w.orbit, periapsis: w.orbit });
		return r.ok ? '' : (r.reason ?? 'refused');
	}, where);
	if (ok) throw new Error(`placing the vessel: ${ok}`);
	await page.waitForTimeout(4000);
}

// ---- the runs
const budgets = JSON.parse(readFileSync(join(root, 'perf-budgets.json'), 'utf8')) as Budgets;
const runs: SceneRun[] = [];
const browser = await chromium.launch({
	headless: flag('headless'),
	args: [
		`--use-angle=${angle}`,
		'--enable-gpu',
		'--ignore-gpu-blocklist',
		'--enable-unsafe-webgpu',
		'--enable-precise-memory-info'
	]
});
try {
	for (const backend of backends)
		for (const governor of governors) {
			const context = await browser.newContext({
				viewport: { width: 1512, height: 945 },
				deviceScaleFactor: 2,
				baseURL: base
			});
			await context.addInitScript(
				([b, p, g]) => {
					localStorage.setItem('orbital.vab.hideStart', '1');
					localStorage.setItem('orbital.onboarding.off', '1');
					localStorage.setItem('orbital.graphics.renderer', b!);
					localStorage.setItem('orbital.graphics', p!);
					localStorage.setItem('orbital.graphics.auto', g!);
				},
				[backend, preset, governor]
			);
			const record = (scene: SceneId, s: Awaited<ReturnType<typeof sample>>): void => {
				runs.push({
					scene,
					backend,
					governor,
					...summarizeFrames(s.intervals, seconds, targetHz),
					compilesInPlay: Math.max(0, s.compilesAfter - s.compilesBefore),
					heapMin: Math.min(...s.heap),
					heapMax: Math.max(...s.heap)
				});
				console.log(
					`  ${backend} governor ${governor} ${scene}: p95 ${runs.at(-1)!.p95.toFixed(1)} ms`
				);
			};
			// the flight scenes share one page: the first load compiles, the second is measured
			const flightScenes = scenes.filter((s) => s in FLIGHT);
			if (flightScenes.length > 0) {
				// a vessel to fly: the Hangar's booster, as the capture scripts load it
				const setup = await context.newPage();
				await setup.goto('/vab');
				await setup.waitForFunction(
					() => typeof (window as any).__orbitalVab?.loadBooster === 'function'
				);
				await setup.evaluate(() => (window as any).__orbitalVab.loadBooster());
				await setup.waitForTimeout(1500);
				await setup.close();
				const page = await context.newPage();
				page.on('pageerror', (e) => console.log('  pageerror', e.message));
				await page.goto('/flight');
				await waitForWorld(page);
				await page.reload();
				await waitForWorld(page);
				for (const scene of flightScenes) {
					await place(page, FLIGHT[scene]!);
					record(scene, await sample(page, seconds));
				}
				await page.close();
			}
			for (const [scene, path] of [
				['space-center', '/space-center'],
				['hangar', '/vab']
			] as const) {
				if (!scenes.includes(scene)) continue;
				const page = await context.newPage();
				await page.goto(path);
				await waitForWorld(page);
				record(scene, await sample(page, seconds));
				await page.close();
			}
			await context.close();
		}
} finally {
	await browser.close();
	server?.kill();
}

// ---- the report
const check = (r: SceneRun): string[] =>
	failures(r, budgetFor(budgets, tier, r.scene), budgets.margin);
const table = formatTable(runs, check);
console.log(
	`\nPerformance gate, ${TIERS[tier].label} (${targetHz} Hz), preset ${preset}, ${seconds} s a scene, budgets ${budgets.basis}${flag('headless') ? ' (HEADLESS: not a measurement)' : ''}\n`
);
console.log(table);
const out = option('out');
if (out)
	writeFileSync(
		out,
		JSON.stringify({ tier, preset, seconds, headless: flag('headless'), runs }, null, '\t')
	);
if (flag('freeze')) {
	const frozen = freeze(runs, tier, budgets.margin);
	const merged: Budgets = {
		...budgets,
		basis: 'measured',
		tiers: {
			...budgets.tiers,
			[tier]: { default: budgets.tiers[tier]?.default ?? {}, scenes: frozen.tiers[tier]!.scenes }
		}
	};
	writeFileSync(join(root, 'perf-budgets.json'), JSON.stringify(merged, null, '\t') + '\n');
	console.log('\nfroze the measured numbers as the budgets of this tier');
}
const failed = runs.filter((r) => check(r).length > 0);
if (failed.length > 0) {
	console.log(`\n${failed.length} of ${runs.length} runs are over their budgets.`);
	if (!flag('no-fail') && !flag('freeze')) process.exitCode = 1;
}
