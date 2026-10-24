/**
 * Where a governor step's frame goes (plan 342, 373): the booster at the pad on WebGPU, the world loaded and
 * warmed, then a step to `TO` (default medium) as the governor takes it, with a CPU profile of the
 * seconds after. Prints the worst frame and the self time by function. Against a development build:
 *
 *   NODE_ENV=development ORBITAL_PROFILE=1 bun run build && bun scripts/serve.ts 5241 &
 *   SHOT_URL=http://localhost:5241 bun scripts/profile-governor-step.ts
 */
import { chromium } from '@playwright/test';

const base = process.env.SHOT_URL ?? 'http://localhost:5241';
const to = process.env.TO ?? 'medium';
const noTaauFollow = process.env.KEEP_TAAU === '1';
/** RUNGS=0.75,0.6,0.5: instead of a preset step, TAAU rung changes in turn (the governor's fast axis). */
const rungs = (process.env.RUNGS ?? '').split(',').filter(Boolean).map(Number);
const b = await chromium.launch({
	headless: false,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, baseURL: base });
if (process.env.NO_BATCH === '1')
	await c.addInitScript(() => ((window as any).__orbitalNoBatch = true));
await c.addInitScript(() => {
	localStorage.setItem('orbital.vab.hideStart', '1');
	localStorage.setItem('orbital.onboarding.off', '1');
	localStorage.setItem('orbital.graphics.renderer', 'webgpu');
});
const s = await c.newPage();
await s.goto('/vab');
await s.waitForFunction(() => typeof (window as any).__orbitalVab?.loadBooster === 'function');
await s.evaluate(() => (window as any).__orbitalVab.loadBooster());
await s.waitForTimeout(1500);
await s.close();
const p = await c.newPage();
await p.goto('/flight?renderer=webgpu');
await p.waitForFunction(() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0, null, {
	timeout: 300_000
});
await p.getByTestId('world-loading').waitFor({ state: 'detached', timeout: 300_000 });
await p.evaluate(() => (window as any).__orbital.renderer().precompile());
await p.waitForTimeout(3000);
if (rungs.length > 0) {
	for (const rung of rungs) {
		const worst = await p.evaluate(async (rung) => {
			(window as any).__orbital.renderer().setTaau(rung);
			let last = performance.now();
			let worst = 0;
			const t0 = last;
			while (performance.now() - t0 < 2500) {
				await new Promise((res) => requestAnimationFrame(res));
				const n = performance.now();
				worst = Math.max(worst, n - last);
				last = n;
			}
			return worst;
		}, rung);
		console.log(`TAAU rung ${rung}: worst frame ${Math.round(worst)} ms`);
	}
	await b.close();
	process.exit(0);
}
const cdp = await c.newCDPSession(p);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
await cdp.send('Profiler.start');
const worst = await p.evaluate(
	async ([to, keep]) => {
		const r = (window as any).__orbital.renderer();
		r.setPreset(to, { governed: true });
		if (!keep) r.setTaau(null);
		let last = performance.now();
		let worst = 0;
		const t0 = last;
		while (performance.now() - t0 < 3000) {
			await new Promise((res) => requestAnimationFrame(res));
			const n = performance.now();
			worst = Math.max(worst, n - last);
			last = n;
		}
		return worst;
	},
	[to, noTaauFollow] as const
);
const { profile } = await cdp.send('Profiler.stop');
console.log(`step to ${to}: worst frame ${Math.round(worst)} ms`);
const byId = new Map<number, any>(profile.nodes.map((n: any) => [n.id, n]));
const self = new Map<string, number>();
const dt = profile.timeDeltas as number[];
const samples = profile.samples as number[];
for (let i = 0; i < samples.length; i++) {
	const n = byId.get(samples[i]!);
	const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`;
	self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0) / 1000);
}
// inclusive time by function (a function's own time and what it called)
const total = new Map<number, number>();
for (let i = 0; i < samples.length; i++)
	total.set(samples[i]!, (total.get(samples[i]!) ?? 0) + (dt[i] ?? 0) / 1000);
const parent = new Map<number, number>();
for (const n of profile.nodes as any[]) for (const c of n.children ?? []) parent.set(c, n.id);
const inclusive = new Map<string, number>();
for (const [id, t] of total) {
	const seen = new Set<string>();
	for (let cur: number | undefined = id; cur !== undefined; cur = parent.get(cur)) {
		const n = byId.get(cur);
		const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`;
		if (seen.has(k)) continue;
		seen.add(k);
		inclusive.set(k, (inclusive.get(k) ?? 0) + t);
	}
}
console.log('inclusive:');
for (const [k, v] of [...inclusive]
	.filter(([k]) => !/^\((root|idle|program)/.test(k))
	.sort((a, b) => b[1] - a[1])
	.slice(0, 28))
	console.log(v.toFixed(0).padStart(6), 'ms', k);
console.log('self:');
for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 16))
	console.log(v.toFixed(0).padStart(6), 'ms', k);
await b.close();
