/**
 * Long frames per minute (plan 408): the booster at the pad on `/flight` and the Space Center, after the
 * loading screen and 10 s of settling, for `SECONDS` (default 120) each: the frames over twice the
 * median interval, counted from the page's own rAF stamps (so it runs on a build without the recorder),
 * with their causes where the build has the log (`__orbitalLongFrames`). A heavy job: set
 * `/tmp/orbital-measuring` before, and say when a headed window is open. Against a development build:
 *
 *   SHOT_URL=http://localhost:5241 SECONDS=120 bun scripts/measure-long-frames.ts
 *
 * Options (environment): PAGES (flight,space-center), PRESET (high), BACKEND (webgpu), AUTO (on).
 */
import { chromium, type Page } from '@playwright/test';

const base = process.env.SHOT_URL ?? 'http://localhost:5241';
const seconds = Number(process.env.SECONDS ?? 120);
const pages = (process.env.PAGES ?? 'flight,space-center').split(',');
const preset = process.env.PRESET ?? 'high';
const backend = process.env.BACKEND ?? 'webgpu';
/** AUTO=off keeps the governor still, to see the stalls of the page alone (default on, as a player plays). */
const auto = process.env.AUTO ?? 'on';

const browser = await chromium.launch({
	headless: false,
	args: [
		'--use-angle=metal',
		'--enable-gpu',
		'--ignore-gpu-blocklist',
		'--enable-unsafe-webgpu',
		// a window behind another must keep drawing, or the timings are of a paused page
		'--disable-backgrounding-occluded-windows',
		'--disable-renderer-backgrounding',
		'--disable-background-timer-throttling'
	]
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: base });
await context.addInitScript(
	([p, b, a]) => {
		localStorage.setItem('orbital.vab.hideStart', '1');
		localStorage.setItem('orbital.onboarding.off', '1');
		localStorage.setItem('orbital.graphics.renderer', b!);
		localStorage.setItem('orbital.graphics', p!);
		localStorage.setItem('orbital.graphics.auto', a!);
	},
	[preset, backend, auto]
);
const setup = await context.newPage();
await setup.goto('/vab');
await setup.waitForFunction(() => typeof (window as any).__orbitalVab?.loadBooster === 'function');
await setup.evaluate(() => (window as any).__orbitalVab.loadBooster());
await setup.waitForTimeout(1500);
await setup.close();

async function run(page: Page, label: string): Promise<void> {
	const r = await page.evaluate(async (secs) => {
		const stamps: number[] = [];
		await new Promise<void>((resolve) => {
			const end = performance.now() + secs * 1000;
			const tick = (t: number): void => {
				stamps.push(t);
				if (t < end) requestAnimationFrame(tick);
				else resolve();
			};
			requestAnimationFrame(tick);
		});
		const iv = stamps.slice(1).map((t, i) => t - stamps[i]!);
		const sorted = [...iv].sort((a, b) => a - b);
		const p50 = sorted[Math.floor(sorted.length / 2)]!;
		const long = iv
			.map((v, i) => ({ v, at: stamps[i + 1]! }))
			.filter((x) => x.v > 2 * p50 && x.v < 5000);
		const rr = (window as any).__orbital?.renderer?.() ?? (window as any).__orbital?.renderer;
		const state = rr
			? {
					preset: rr.preset,
					drawn: rr.presetDrawn,
					taau: rr.taau,
					planet: rr.planetScale,
					scale: rr.renderScale
				}
			: null;
		const log = (globalThis as any).__orbitalLongFrames?.();
		return {
			frames: iv.length,
			p50,
			p95: sorted[Math.floor(sorted.length * 0.95)]!,
			max: sorted[sorted.length - 1]!,
			long: long.length,
			worst: long
				.sort((a, b) => b.v - a.v)
				.slice(0, 8)
				.map((x) => Math.round(x.v)),
			causes: log ? log.counts() : null,
			state
		};
	}, seconds);
	const perMin = (r.long / seconds) * 60;
	console.log(
		`${label}: ${r.frames} frames, p50 ${r.p50.toFixed(1)} ms, p95 ${r.p95.toFixed(1)} ms, max ${Math.round(r.max)} ms; ${r.long} long frames (${perMin.toFixed(1)} a minute), worst ${r.worst.join(', ')} ms; state ${JSON.stringify(r.state)}${r.causes ? `; causes ${JSON.stringify(Object.fromEntries(Object.entries(r.causes).filter(([, n]) => (n as number) > 0)))}` : ''}`
	);
}

for (const name of pages) {
	const page = await context.newPage();
	page.on('pageerror', (e) => console.log('  pageerror', e.message));
	await page.goto(name === 'flight' ? '/flight' : `/${name}`);
	if (name === 'flight') {
		await page.waitForFunction(
			() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0,
			null,
			{
				timeout: 300_000
			}
		);
	}
	await page.getByTestId('world-loading').waitFor({ state: 'detached', timeout: 300_000 });
	await page.waitForTimeout(10_000);
	// a page that stops drawing (a window that went to the background) must not hold the run
	await Promise.race([
		run(page, `${name} (${preset}, ${backend})`),
		new Promise<void>((_, reject) =>
			setTimeout(
				() => reject(new Error(`${name}: no frames in ${seconds + 60} s`)),
				(seconds + 60) * 1000
			)
		)
	]).catch((e: Error) => console.log(`${name}: ${e.message}`));
	await page.close();
}
await browser.close();
