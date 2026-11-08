/**
 * Low on a Retina display with TAAU (plan 418, step 6): Low today caps the pixel ratio at 1 and draws
 * with no TAAU; the variant draws at the display's ratio with TAAU taking an input of half the side,
 * which is the same number of scene pixels on a ratio-2 display. This measures the two in one page,
 * interleaved (A, B, A, B ...) at the pad and in orbit, headed, and prints the mean frame interval and
 * the shares over 8.4 and 16.7 ms. Needs a `NODE_ENV=development` build (the `__orbital` hook), served
 * by `scripts/serve.ts`, under `/tmp/orbital-measuring`:
 *
 *   NODE_ENV=development bun run build && SERVE_ROOT=$PWD/build bun scripts/serve.ts 5294 &
 *   SHOT_URL=http://localhost:5294 bun scripts/eval-low-taau.ts
 *
 * Environment: VIEWS (pad,orbit), ROUNDS (3), SECONDS (10), WARM (5), SETTLE (seconds to wait for the
 * warming, 60), INPUT (the TAAU share of the side, 0.5), RATIO (the variant's pixel ratio, 2).
 */
import { chromium, type Page } from './lib/chromium';
import os from 'node:os';

const base = process.env.SHOT_URL ?? 'http://localhost:5294';
const views = (process.env.VIEWS ?? 'pad,orbit').split(',');
const rounds = Number(process.env.ROUNDS ?? 3);
const seconds = Number(process.env.SECONDS ?? 10);
const warm = Number(process.env.WARM ?? 5);
const settle = Number(process.env.SETTLE ?? 60);
const input = Number(process.env.INPUT ?? 0.5);
const ratio = Number(process.env.RATIO ?? 2);

const browser = await chromium.launch({
	headless: false,
	args: [
		`--use-angle=${process.platform === 'darwin' ? 'metal' : 'vulkan'}`,
		'--enable-gpu',
		'--ignore-gpu-blocklist',
		'--enable-unsafe-webgpu'
	]
});

async function waitWorld(page: Page): Promise<void> {
	await page
		.getByTestId('world-loading')
		.waitFor({ state: 'detached', timeout: 300_000 })
		.catch(() => undefined);
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
			{ timeout: settle * 1000 }
		)
		.catch(() => console.log('(the warming did not settle: measuring anyway)'));
	await page.waitForTimeout(3000);
}

function sample(page: Page): Promise<number[]> {
	return page.evaluate(async (secs) => {
		const out: number[] = [];
		await new Promise<void>((resolve) => {
			let last = performance.now();
			const t0 = last;
			const tick = (now: number): void => {
				out.push(now - last);
				last = now;
				if (now - t0 < secs * 1000) requestAnimationFrame(tick);
				else resolve();
			};
			requestAnimationFrame(tick);
		});
		return out.slice(1);
	}, seconds);
}

const stats = (xs: number[]): { mean: number; over84: number; over167: number; max: number } => ({
	mean: xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length),
	over84: xs.filter((x) => x > 8.4).length / Math.max(1, xs.length),
	over167: xs.filter((x) => x > 16.7).length / Math.max(1, xs.length),
	max: Math.max(0, ...xs)
});

try {
	const context = await browser.newContext({
		viewport: { width: 1512, height: 945 },
		deviceScaleFactor: 2,
		baseURL: base
	});
	await context.addInitScript(() => {
		localStorage.setItem('orbital.vab.hideStart', '1');
		localStorage.setItem('orbital.onboarding.off', '1');
		localStorage.setItem('orbital.graphics.renderer', 'webgpu');
		localStorage.setItem('orbital.graphics', 'low');
		localStorage.setItem('orbital.graphics.auto', 'off');
	});
	const setup = await context.newPage();
	await setup.goto('/vab');
	await setup.waitForFunction(
		() => typeof (window as any).__orbitalVab?.loadBooster === 'function'
	);
	await setup.evaluate(() => (window as any).__orbitalVab.loadBooster());
	await setup.waitForTimeout(1500);
	await setup.close();
	const page = await context.newPage();
	await page.goto('/flight');
	await waitWorld(page);
	await page.reload();
	await waitWorld(page);
	// Low draws straight into the canvas (`post: false`), so TAAU needs the post chain: the variants that
	// have it are Medium's. The two with the same scene pixels as Low (the same ratio-2 canvas, an input
	// of half the side) tell what the chain costs; Medium as shipped is smaller (ratio 1.5, input 0.5).
	const set = (preset: string, pixelRatio: number | null, taau: number | null) => async () => {
		await page.evaluate(
			([preset, pixelRatio, taau]) => {
				const r = (window as any).__orbital.renderer();
				r.setPreset(preset);
				r.debug.setPixelRatio(pixelRatio);
				r.setTaau(taau);
			},
			[preset, pixelRatio, taau] as const
		);
	};
	const variants: Record<string, () => Promise<void>> = {
		'low (ratio 1, no post, no TAAU)': set('low', null, null),
		[`medium forced to ratio ${ratio}, TAAU ${input} (Low's scene pixels)`]: set(
			'medium',
			ratio,
			input
		),
		'medium as shipped (ratio 1.5, TAAU 0.5)': set('medium', null, null)
	};
	console.log(`load ${os.loadavg()[0]!.toFixed(1)} at start`);
	for (const view of views) {
		if (view === 'orbit')
			await page.evaluate(() =>
				(window as any).__orbitalDebug.setOrbit({ apoapsis: 100_000, periapsis: 100_000 })
			);
		const acc = new Map<string, number[]>();
		for (let r = 0; r < rounds; r++)
			for (const [name, apply] of Object.entries(variants)) {
				await apply();
				await page.waitForTimeout(warm * 1000);
				const xs = await sample(page);
				acc.set(name, [...(acc.get(name) ?? []), ...xs]);
			}
		console.log(
			`\n${view}, ${rounds} interleaved rounds of ${seconds} s, load ${os.loadavg()[0]!.toFixed(1)}`
		);
		for (const [name, xs] of acc) {
			const s = stats(xs);
			console.log(
				`  ${name.padEnd(34)} mean ${s.mean.toFixed(2)} ms, over 8.4 ms ${(s.over84 * 100).toFixed(1)} %, over 16.7 ms ${(s.over167 * 100).toFixed(1)} %, max ${s.max.toFixed(0)} ms (${xs.length} frames)`
			);
		}
	}
} finally {
	await browser.close();
}
