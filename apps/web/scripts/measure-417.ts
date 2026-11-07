/**
 * Plan 417's frame-time A/B: the mean frame interval at the pad (and optionally another view) of two
 * builds served side by side (BEFORE = main, AFTER = the branch), at Low and High, headed Chromium on
 * the Mac's GPU, rounds interleaved (before low, after low, before high, after high, ...) so a
 * drifting machine hits both. A heavy job: hold `/tmp/orbital-measuring` (the worker brief's rules) on a
 * quiet, plugged-in machine.
 *
 *   BEFORE=http://localhost:5241 AFTER=http://localhost:5242 bun scripts/measure-417.ts out.json
 *
 * Options: SECONDS (15), WARM (6), ROUNDS (3), PRESETS (low,high), VIEWS (pad), BACKEND (webgpu), VW, VH, DSF.
 */
import { chromium, type Page } from './lib/chromium';
import { writeFileSync } from 'node:fs';
import { frameReport, intervalsOf } from '@orbital/renderer';
import os from 'node:os';
import { placeView, record, setupVessel, waitForFlight, type View } from './lib/frame-matrix';

const builds = {
	before: process.env.BEFORE ?? 'http://localhost:5241',
	after: process.env.AFTER ?? 'http://localhost:5242'
};
const seconds = Number(process.env.SECONDS ?? 15);
const warm = Number(process.env.WARM ?? 6);
const rounds = Number(process.env.ROUNDS ?? 3);
const presets = (process.env.PRESETS ?? 'low,high').split(',');
const views = (process.env.VIEWS ?? 'pad').split(',') as View[];
const backend = process.env.BACKEND ?? 'webgpu';

const browser = await chromium.launch({
	headless: false,
	args: [
		'--use-angle=metal',
		'--enable-gpu',
		'--ignore-gpu-blocklist',
		'--enable-unsafe-webgpu',
		'--disable-background-timer-throttling',
		'--disable-renderer-backgrounding',
		'--disable-backgrounding-occluded-windows'
	]
});

interface Cell {
	build: string;
	preset: string;
	view: string;
	round: number;
	meanMs: number;
	p50Ms: number;
	p95Ms: number;
	gpuMs: number | null;
	load1: number;
}
const cells: Cell[] = [];

async function run(build: 'before' | 'after', preset: string, round: number): Promise<void> {
	const context = await browser.newContext({
		viewport: { width: Number(process.env.VW ?? 1512), height: Number(process.env.VH ?? 945) },
		deviceScaleFactor: Number(process.env.DSF ?? 2),
		baseURL: builds[build]
	});
	await context.addInitScript(() => {
		localStorage.setItem('orbital.vab.hideStart', '1');
		localStorage.setItem('orbital.onboarding.off', '1');
	});
	const setup = await context.newPage();
	await setupVessel(setup);
	await setup.close();
	const page: Page = await context.newPage();
	await page.addInitScript(
		([b, p]) => {
			localStorage.setItem('orbital.graphics.renderer', b!);
			localStorage.setItem('orbital.graphics', p!);
			localStorage.setItem('orbital.graphics.auto', 'off');
		},
		[backend, preset]
	);
	await page.goto('/flight');
	await waitForFlight(page);
	await page.waitForTimeout(3000);
	for (const view of views) {
		await placeView(page, view);
		await page.waitForTimeout(warm * 1000);
		const r = await record(page, seconds);
		const intervals = intervalsOf(r.stamps);
		const rep = frameReport(intervals);
		const mean = rep.meanMs;
		const cell: Cell = {
			build,
			preset,
			view,
			round,
			meanMs: mean,
			p50Ms: rep.p50Ms,
			p95Ms: rep.p95Ms,
			gpuMs: r.gpuMs,
			load1: os.loadavg()[0]!
		};
		cells.push(cell);
		console.log(
			`${build.padEnd(6)} ${preset.padEnd(4)} ${view.padEnd(6)} r${round} mean ${mean.toFixed(2)} ms  p50 ${rep.p50Ms.toFixed(2)}  p95 ${rep.p95Ms.toFixed(2)}  gpu ${r.gpuMs?.toFixed(2) ?? '-'}  load ${cell.load1.toFixed(2)}`
		);
	}
	await context.close();
}

for (let round = 1; round <= rounds; round++)
	for (const preset of presets)
		for (const build of round % 2 ? (['before', 'after'] as const) : (['after', 'before'] as const))
			await run(build, preset, round);
await browser.close();

console.log('\nmean of the rounds (ms), after minus before:');
for (const preset of presets)
	for (const view of views) {
		const m = (b: string) => {
			const xs = cells.filter((c) => c.build === b && c.preset === preset && c.view === view);
			return xs.reduce((a, c) => a + c.meanMs, 0) / xs.length;
		};
		console.log(
			`${preset} ${view}: before ${m('before').toFixed(2)}  after ${m('after').toFixed(2)}  delta ${(m('after') - m('before')).toFixed(2)}`
		);
	}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(cells, null, '\t'));
