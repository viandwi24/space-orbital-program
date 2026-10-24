/**
 * The cost of the site's shadow casters (plan 369, ADR 0357): the pad with the site's casters on and
 * off in turn, in one page so drift cancels, `ROUNDS` rounds of `SECONDS` each. Prints the p50 and p95
 * rAF interval and the mean GPU ms per state. A heavy job (the lock); against a development build:
 *
 *   SHOT_URL=http://localhost:5241 bun scripts/measure-site-shadow.ts
 */
import { chromium } from '@playwright/test';

const base = process.env.SHOT_URL ?? 'http://localhost:5241';
const rounds = Number(process.env.ROUNDS ?? 4);
const seconds = Number(process.env.SECONDS ?? 12);
const presets = (process.env.PRESETS ?? 'high,medium').split(',');
const browser = await chromium.launch({
	headless: false,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
for (const preset of presets) {
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
	await page.waitForFunction(
		() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0,
		null,
		{ timeout: 300_000 }
	);
	await page.getByTestId('world-loading').waitFor({ state: 'detached', timeout: 300_000 });
	await page.waitForTimeout(6000);
	// the site's casters: every casting mesh that is not under a vessel, a moon or the effects
	await page.evaluate(() => {
		const r = (window as any).__orbital.renderer();
		const sc = r.debug.scene;
		const root = typeof sc === 'function' ? sc() : sc;
		const found: any[] = [];
		for (const top of root.children) {
			if (
				top.name?.startsWith('vessel-') ||
				top.name?.startsWith('body:') ||
				top.name === 'effects'
			)
				continue;
			top.traverse((m: any) => {
				if (m.isMesh && m.castShadow) found.push(m);
			});
		}
		(window as any).__siteCasters = found;
	});
	const n = await page.evaluate(() => (window as any).__siteCasters.length);
	const result: Record<string, { p50: number[]; p95: number[]; gpu: number[] }> = {
		on: { p50: [], p95: [], gpu: [] },
		off: { p50: [], p95: [], gpu: [] }
	};
	for (let round = 0; round < rounds; round++) {
		for (const state of ['on', 'off'] as const) {
			await page.evaluate((on) => {
				for (const m of (window as any).__siteCasters) m.castShadow = on;
			}, state === 'on');
			await page.waitForTimeout(2500);
			const r = await page.evaluate(async (secs) => {
				const stamps: number[] = [];
				const gpu: number[] = [];
				const rr = (window as any).__orbital.renderer();
				await new Promise<void>((resolve) => {
					const end = performance.now() + secs * 1000;
					const tick = (t: number): void => {
						stamps.push(t);
						if (rr.gpuFrameMs != null) gpu.push(rr.gpuFrameMs);
						if (t < end) requestAnimationFrame(tick);
						else resolve();
					};
					requestAnimationFrame(tick);
				});
				const iv = stamps.slice(1).map((t, i) => t - stamps[i]!);
				iv.sort((a, b) => a - b);
				const q = (f: number): number => iv[Math.floor(f * (iv.length - 1))]!;
				return {
					p50: q(0.5),
					p95: q(0.95),
					gpu: gpu.reduce((a, b) => a + b, 0) / Math.max(1, gpu.length)
				};
			}, seconds);
			result[state]!.p50.push(r.p50);
			result[state]!.p95.push(r.p95);
			result[state]!.gpu.push(r.gpu);
		}
	}
	const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
	for (const state of ['on', 'off'] as const)
		console.log(
			`${preset} casters ${state} (${n} meshes): p50 ${mean(result[state]!.p50).toFixed(2)} ms, p95 ${mean(result[state]!.p95).toFixed(2)} ms, GPU ${mean(result[state]!.gpu).toFixed(2)} ms  [${result[state]!.gpu.map((g) => g.toFixed(1)).join(' ')}]`
		);
	await context.close();
}
await browser.close();
