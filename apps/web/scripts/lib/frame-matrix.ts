/**
 * The frame matrix of the 120 Hz wave (plan 392, ADR 0330): for each backend, preset and governor
 * setting, a flight page is opened and, at each view (pad, 3 km, 12 km, orbit), the rAF intervals,
 * the Long Animation Frames, the GPU's per-pass time and the draw counters are recorded. The
 * numbers that matter are the p95 frame interval and the share of frames over a budget (ADR 0330:
 * not averages). Shared by `measure-120hz.ts` (the M5 baseline) and `measure-tier.ts` (any machine).
 */
import { chromium, type Page } from '@playwright/test';
import {
	deviceTier,
	frameReport,
	intervalsOf,
	lockHeld,
	refreshOf,
	type FrameReport
} from '@orbital/renderer';

export type View = 'pad' | '3km' | '12km' | 'orbit';
export const VIEWS: readonly View[] = ['pad', '3km', '12km', 'orbit'];

export interface MatrixOptions {
	base: string;
	viewport: { width: number; height: number };
	dsf: number;
	backends: readonly string[];
	/** `auto` removes the saved preset: the device's own choice. */
	presets: readonly string[];
	governors: readonly ('on' | 'off')[];
	views: readonly View[];
	seconds: number;
	warm: number;
	/** Chromium's GPU backend (`metal`, `d3d11`, `vulkan`, `gl`). */
	angle: string;
	headless: boolean;
	notes?: string;
	/** TAAU's share of the canvas's side for the run (plan 393), 0 or absent for off. */
	taau?: number;
	log?: (line: string) => void;
}

interface Loaf {
	count: number;
	p95Ms: number;
	worstMs: number;
	/** Total of the frames' blocking time, ms: the main thread's share of the slot. */
	blockingMs: number;
	/** Sums over the recorded frames: script, style and layout, and render (ms). */
	scriptMs: number;
	layoutMs: number;
	renderMs: number;
}

export interface Cell {
	backend: string;
	preset: string;
	governor: string;
	view: View;
	renderer: string;
	gpu: string | null;
	presetNow: string;
	canvas: string;
	intervals: FrameReport;
	loaf: Loaf;
	gpuMs: number | null;
	passMs: Record<string, number> | null;
	passContexts: Record<string, number> | null;
	drawCalls: number;
	triangles: number;
}

export interface Report {
	machine: Record<string, unknown>;
	options: Omit<MatrixOptions, 'log'>;
	tier: ReturnType<typeof deviceTier> | null;
	refreshHz: number | null;
	loads: { backend: string; preset: string; governor: string; loadMs: number; compile: unknown }[];
	cells: Cell[];
}

export async function waitForFlight(page: Page): Promise<void> {
	await page.waitForFunction(
		() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0,
		null,
		{
			timeout: 300_000
		}
	);
	await page.getByTestId('world-loading').waitFor({ state: 'detached', timeout: 300_000 });
}

export async function placeView(page: Page, view: View): Promise<void> {
	// the pad: the flight starts there, and `pad` comes first in a page's views
	if (view === 'pad') return;
	if (view === 'orbit') {
		await page.evaluate(() =>
			(window as any).__orbitalDebug.setOrbit({ apoapsis: 100_000, periapsis: 100_000 })
		);
		return;
	}
	const altitude = view === '3km' ? 3_000 : 12_000;
	await page.evaluate(
		(alt) =>
			(window as any).__orbitalDebug.setLocation({
				kind: 'air',
				latitude: 0.009,
				longitude: 0.02,
				altitude: alt,
				speed: 150,
				climb: 0
			}),
		altitude
	);
}

/** Records for `seconds`: rAF timestamps, long animation frames and the GPU reads, in the page. */
export async function record(page: Page, seconds: number) {
	return page.evaluate(async (secs) => {
		const o = (window as any).__orbital;
		const r = o.renderer();
		const stamps: number[] = [];
		const gpu: number[] = [];
		let passMs: Record<string, number> | null = null;
		let passContexts: Record<string, number> | null = null;
		const loaf: { d: number; b: number; s: number; l: number; r: number }[] = [];
		let observer: PerformanceObserver | null = null;
		try {
			observer = new PerformanceObserver((list) => {
				for (const e of list.getEntries() as any[]) {
					const scripts = (e.scripts ?? []).reduce((a: number, s: any) => a + s.duration, 0);
					loaf.push({
						d: e.duration,
						b: e.blockingDuration ?? 0,
						s: scripts,
						l: e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0,
						r: e.renderStart ? e.startTime + e.duration - e.renderStart : 0
					});
				}
			});
			observer.observe({ type: 'long-animation-frame', buffered: false });
		} catch {
			observer = null;
		}
		const webgpu = r.debug.counters().renderer === 'webgpu';
		await new Promise<void>((resolve) => {
			const end = performance.now() + secs * 1000;
			let lastRead = 0;
			const tick = (now: number): void => {
				stamps.push(now);
				if (webgpu && now - lastRead > 500) {
					lastRead = now;
					const ms = r.gpuFrameMs;
					if (ms != null) gpu.push(ms);
					if (r.passTimes) {
						passMs = r.passTimes.ms;
						passContexts = r.passTimes.contexts;
					}
				}
				if (now < end) requestAnimationFrame(tick);
				else resolve();
			};
			requestAnimationFrame(tick);
		});
		observer?.disconnect();
		const info = r.debug.info();
		const c = document.querySelector('canvas');
		const sorted = loaf.map((x) => x.d).sort((a, b) => a - b);
		const sum = (f: (x: (typeof loaf)[number]) => number): number =>
			loaf.reduce((a, x) => a + f(x), 0);
		const g = gpu.slice().sort((a, b) => a - b);
		return {
			stamps,
			loaf: {
				count: loaf.length,
				p95Ms: sorted.length
					? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!
					: 0,
				worstMs: sorted.at(-1) ?? 0,
				blockingMs: sum((x) => x.b),
				scriptMs: sum((x) => x.s),
				layoutMs: sum((x) => x.l),
				renderMs: sum((x) => x.r)
			},
			gpuMs: g.length ? g[Math.floor(g.length / 2)]! : null,
			passMs,
			passContexts,
			renderer: info.renderer as string,
			gpu: (info.gpu as string | undefined) ?? null,
			presetNow: `${r.preset}`,
			canvas: `${c?.width}x${c?.height}`,
			drawCalls: info.drawCalls as number,
			triangles: info.triangles as number
		};
	}, seconds);
}

/** Opens the booster rocket in the Hangar so `/flight` has a vessel (the Hangar keeps it for the flight). */
export async function setupVessel(page: Page): Promise<void> {
	await page.goto('/vab');
	await page.waitForFunction(
		() => typeof (window as any).__orbitalVab?.loadBooster === 'function',
		null,
		{
			timeout: 120_000
		}
	);
	await page.evaluate(() => (window as any).__orbitalVab.loadBooster());
	await page.waitForTimeout(1500);
}

export async function runMatrix(
	options: MatrixOptions,
	machine: Record<string, unknown>
): Promise<Report> {
	const log = options.log ?? (() => {});
	const browser = await chromium.launch({
		headless: options.headless,
		args: [
			`--use-angle=${options.angle}`,
			'--enable-gpu',
			'--ignore-gpu-blocklist',
			'--enable-unsafe-webgpu',
			'--disable-background-timer-throttling',
			'--disable-renderer-backgrounding',
			'--disable-backgrounding-occluded-windows'
		]
	});
	const context = await browser.newContext({
		viewport: options.viewport,
		deviceScaleFactor: options.dsf,
		baseURL: options.base
	});
	await context.addInitScript(() => {
		localStorage.setItem('orbital.vab.hideStart', '1');
		localStorage.setItem('orbital.onboarding.off', '1');
	});
	const report: Report = {
		machine,
		options: { ...options, log: undefined } as Omit<MatrixOptions, 'log'>,
		tier: null,
		refreshHz: null,
		loads: [],
		cells: []
	};
	// the display's rate, from a short rAF run on a blank page
	{
		const probe = await context.newPage();
		await probe.goto('about:blank');
		const periods = await probe.evaluate(
			() =>
				new Promise<number[]>((resolve) => {
					const out: number[] = [];
					let last = performance.now();
					const tick = (now: number): void => {
						out.push(now - last);
						last = now;
						if (out.length < 90) requestAnimationFrame(tick);
						else resolve(out.slice(10));
					};
					requestAnimationFrame(tick);
				})
		);
		report.refreshHz = refreshOf(periods);
		await probe.close();
		log(`display ${report.refreshHz} Hz`);
	}
	const setup = await context.newPage();
	await setupVessel(setup);
	await setup.close();

	for (const backend of options.backends) {
		for (const preset of options.presets) {
			for (const governor of options.governors) {
				const page = await context.newPage();
				page.on('pageerror', (e) => log(`  pageerror ${e.message}`));
				await page.addInitScript(
					([b, p, a]) => {
						localStorage.setItem('orbital.graphics.renderer', b!);
						if (p === 'auto') localStorage.removeItem('orbital.graphics');
						else localStorage.setItem('orbital.graphics', p!);
						localStorage.setItem('orbital.graphics.auto', a!);
						localStorage.removeItem('orbital.graphics.learned');
					},
					[backend, preset, governor]
				);
				const t0 = Date.now();
				await page.goto('/flight');
				await waitForFlight(page);
				const loadMs = Date.now() - t0;
				const compile = await page.evaluate(() => {
					const s = (window as any).__orbital.renderer().compiles?.summary?.(5);
					return s
						? {
								pipelines: s.pipelines,
								timedMs: s.timedMs,
								phases: s.phases,
								slowest: s.slowest?.map((p: any) => ({ label: p.label, ms: p.ms, bytes: p.bytes }))
							}
						: null;
				});
				report.loads.push({ backend, preset, governor, loadMs, compile });
				log(`${backend} ${preset} governor ${governor}: loaded in ${(loadMs / 1000).toFixed(1)} s`);
				await page.waitForTimeout(3000);
				if (options.taau) {
					await page.evaluate(
						(s) => (window as any).__orbital.renderer().setTaau?.(s),
						options.taau
					);
					await page.waitForTimeout(3000);
				}
				for (const view of options.views) {
					await placeView(page, view);
					await page.waitForTimeout(options.warm * 1000);
					const r = await record(page, options.seconds);
					const intervals = intervalsOf(r.stamps);
					const cell: Cell = {
						backend,
						preset,
						governor,
						view,
						renderer: r.renderer,
						gpu: r.gpu,
						presetNow: r.presetNow,
						canvas: r.canvas,
						intervals: frameReport(intervals),
						loaf: {
							count: r.loaf.count,
							p95Ms: r.loaf.p95Ms,
							worstMs: r.loaf.worstMs,
							blockingMs: r.loaf.blockingMs,
							scriptMs: r.loaf.scriptMs,
							layoutMs: r.loaf.layoutMs,
							renderMs: r.loaf.renderMs
						},
						gpuMs: r.gpuMs,
						passMs: r.passMs,
						passContexts: r.passContexts,
						drawCalls: r.drawCalls,
						triangles: r.triangles
					};
					report.cells.push(cell);
					log(
						`  ${view.padEnd(5)} p95 ${cell.intervals.p95Ms.toFixed(1)} ms, over 16.7 ${(cell.intervals.over16 * 100).toFixed(0)} %, over 8.4 ${(cell.intervals.over8 * 100).toFixed(0)} %, gpu ${cell.gpuMs?.toFixed(1) ?? '-'} ms, ${cell.canvas} ${cell.presetNow}`
					);
				}
				await page.close();
			}
		}
	}
	await browser.close();
	const first = report.cells[0];
	report.tier = deviceTier({ gpu: first?.gpu ?? '', refreshHz: report.refreshHz ?? 60 });
	return report;
}

/** A markdown table of a report, p95 against the lock of its tier. */
export function markdownOf(report: Report): string {
	const hz = report.tier?.hz ?? 60;
	const rows = report.cells.map((c) => {
		const held = lockHeld(c.intervals, hz) ? 'yes' : 'no';
		const pass = c.passMs
			? Object.entries(c.passMs)
					.map(([k, v]) => `${k} ${v.toFixed(1)}`)
					.join(', ')
			: '-';
		return `| ${c.backend} | ${c.preset} → ${c.presetNow} | ${c.governor} | ${c.view} | ${c.intervals.p95Ms.toFixed(1)} | ${(c.intervals.over16 * 100).toFixed(0)} % | ${(c.intervals.over8 * 100).toFixed(0)} % | ${c.gpuMs?.toFixed(1) ?? '-'} | ${pass} | ${c.loaf.count} / ${c.loaf.p95Ms.toFixed(0)} | ${held} |`;
	});
	return [
		`Tier ${report.tier?.id ?? '?'}, display ${report.refreshHz ?? '?'} Hz, lock ${hz}.`,
		'',
		'| backend | preset | governor | view | p95 ms | > 16.7 | > 8.4 | GPU ms | GPU by pass | LoAF n / p95 | lock |',
		'|---|---|---|---|---|---|---|---|---|---|---|',
		...rows
	].join('\n');
}
