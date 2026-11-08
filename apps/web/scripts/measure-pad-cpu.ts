/**
 * Is the pad's launch site a CPU cost or a GPU cost (plan 418, step 5)? `renderer.debug.benchmark(n)`
 * draws n frames back to back and returns the main thread's milliseconds per frame (the draw calls, the
 * culling and the sorting of every object, the submit; not the GPU's time). This runs it at the pad
 * with one part of the launch site hidden at a time (`setLookOff`) and with the whole site hidden,
 * states alternating over rounds. If the site's 3 to 4 ms are in this number, the pad is CPU-bound by
 * the site's objects; if not, they are on the GPU. Headed, against a `NODE_ENV=development` build,
 * under `/tmp/orbital-measuring`:
 *
 *   SHOT_URL=http://localhost:5294 bun scripts/measure-pad-cpu.ts
 *
 * Environment: LOOKS (site,vegetation,structures,floods,people,steam,siteRocks,trees,tufts,bushes),
 * ROUNDS (3), FRAMES (200), PRESET (high), SETTLE (seconds to wait for the warming, 40).
 */
import { chromium, type Page } from './lib/chromium';

const base = process.env.SHOT_URL ?? 'http://localhost:5294';
const looks = (
	process.env.LOOKS ?? 'site,vegetation,structures,floods,people,steam,siteRocks,trees,tufts,bushes'
).split(',');
const rounds = Number(process.env.ROUNDS ?? 3);
const frames = Number(process.env.FRAMES ?? 200);
const preset = process.env.PRESET ?? 'high';
const settle = Number(process.env.SETTLE ?? 40);

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

try {
	const context = await browser.newContext({
		viewport: { width: 1512, height: 945 },
		deviceScaleFactor: 2,
		baseURL: base
	});
	await context.addInitScript((p) => {
		localStorage.setItem('orbital.vab.hideStart', '1');
		localStorage.setItem('orbital.onboarding.off', '1');
		localStorage.setItem('orbital.graphics.renderer', 'webgpu');
		localStorage.setItem('orbital.graphics', p);
		localStorage.setItem('orbital.graphics.auto', 'off');
	}, preset);
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
	const bench = (look: string | null, off: boolean): Promise<number> =>
		page.evaluate(
			([look, off, frames]) => {
				const r = (window as any).__orbital.renderer();
				if (look) r.debug.setLookOff(look, off);
				const ms = r.debug.benchmark(frames) as number;
				if (look) r.debug.setLookOff(look, false);
				return ms;
			},
			[look, off, frames] as const
		);
	await bench(null, false); // warm
	const acc = new Map<string, number[]>();
	const push = (k: string, v: number): void => void acc.set(k, [...(acc.get(k) ?? []), v]);
	for (let r = 0; r < rounds; r++) {
		push('everything on', await bench(null, false));
		for (const look of looks) push(`${look} off`, await bench(look, true));
	}
	console.log(
		`pad, ${preset}, CPU ms per frame (the main thread), ${rounds} rounds of ${frames} frames`
	);
	const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
	const base0 = mean(acc.get('everything on')!);
	for (const [k, xs] of acc)
		console.log(
			`  ${k.padEnd(18)} ${mean(xs).toFixed(2)} ms  (${(mean(xs) - base0 >= 0 ? '+' : '') + (mean(xs) - base0).toFixed(2)})  [${xs.map((x) => x.toFixed(1)).join(', ')}]`
		);
} finally {
	await browser.close();
}
