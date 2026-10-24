/**
 * The last stalls after the world's loading screen (plan 342): the frames over 100 ms in the first
 * seconds after the loading screen goes, and in the first Flight → Map → Flight toggles, with the
 * pipelines compiled in each. Against a `NODE_ENV=development` build served by `scripts/serve.ts`:
 *
 *   SHOT_URL=http://localhost:5241 bun scripts/measure-first-frames.ts
 *
 * Options (environment): BACKENDS (webgpu,webgl), AFTER seconds recorded after the loading screen (8),
 * PRESET (medium), NO_TAAU (1: the direct path), LONG the frame length counted as a stall, ms (100).
 */
import { chromium } from '@playwright/test';

const base = process.env.SHOT_URL ?? 'http://localhost:5241';
const backends = (process.env.BACKENDS ?? 'webgpu,webgl').split(',');
const after = Number(process.env.AFTER ?? 8);
const preset = process.env.PRESET ?? 'medium';
const long = Number(process.env.LONG ?? 100);
/** NO_TAAU=1 switches TAAU off as the world loads (the direct path), for comparison (plan 393). */
const noTaau = process.env.NO_TAAU === '1';

const browser = await chromium.launch({
	headless: false,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});

/** Records rAF intervals for `ms` in the page; the long ones with the pipelines compiled in them. */
const record = (page: import('@playwright/test').Page, ms: number) =>
	page.evaluate(
		async ([ms, long]) => {
			const r = (window as any).__orbital.renderer();
			let seen = r.compiles.pipelines.length;
			const out: Array<{ ms: number; at: number; added?: string[] }> = [];
			let last = performance.now();
			const t0 = last;
			let worst = 0;
			while (performance.now() - t0 < ms!) {
				await new Promise((res) => requestAnimationFrame(res));
				const now = performance.now();
				const d = now - last;
				last = now;
				worst = Math.max(worst, d);
				const list = r.compiles.pipelines;
				const added =
					list.length > seen ? list.slice(seen).map((p: any) => p.label as string) : undefined;
				seen = list.length;
				if (d > long! || added) out.push({ ms: Math.round(d), at: Math.round(now - t0), added });
			}
			return { worst: Math.round(worst), stalls: out };
		},
		[ms, long] as const
	);
const show = (label: string, r: Awaited<ReturnType<typeof record>>): void => {
	const over = r.stalls.filter((s) => s.ms > long);
	console.log(`  ${label}: worst ${r.worst} ms, ${over.length} frame(s) over ${long} ms`);
	for (const s of r.stalls)
		if (s.ms > long || s.added)
			console.log(
				`    ${s.ms} ms at +${s.at} ms${s.added ? `, compiled ${s.added.join(', ')}` : ''}`
			);
};

for (const backend of backends) {
	console.log(`${backend} ${preset}`);
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		baseURL: base
	});
	await context.addInitScript(
		([p]) => {
			localStorage.setItem('orbital.vab.hideStart', '1');
			localStorage.setItem('orbital.onboarding.off', '1');
			localStorage.setItem('orbital.graphics', p!);
			localStorage.setItem('orbital.graphics.auto', 'off');
		},
		[preset]
	);
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
	await page.goto(`/flight?renderer=${backend}`);
	await page.waitForFunction(
		() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0,
		null,
		{ timeout: 300_000 }
	);
	await page.getByTestId('world-loading').waitFor({ state: 'detached', timeout: 300_000 });
	if (noTaau) await page.evaluate(() => (window as any).__orbital.renderer().setTaau?.(0));
	show(`the ${after} s after the loading screen`, await record(page, after * 1000));
	await page.mouse.click(720, 300);
	for (const [label, key] of [
		['first Flight → Map', 'KeyM'],
		['Map → Flight', 'KeyM'],
		['second Flight → Map', 'KeyM'],
		['second Map → Flight', 'KeyM']
	] as const) {
		await page.keyboard.press(key);
		show(label, await record(page, 2500));
	}
	await context.close();
}
await browser.close();
