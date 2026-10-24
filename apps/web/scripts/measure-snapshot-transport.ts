/**
 * The cost of the snapshot message on the main thread (plan 365, ADR 0358): in a flight page, a real
 * snapshot grown to N vessels is structured-cloned the way `postMessage` does (full, and as the
 * delta encoder posts it) and decoded, per message, in V8. Against a development build:
 *
 *   SHOT_URL=http://localhost:5241 bun scripts/measure-snapshot-transport.ts
 */
import { chromium } from '@playwright/test';

const base = process.env.SHOT_URL ?? 'http://localhost:5241';
const counts = (process.env.VESSELS ?? '1,5,20').split(',').map(Number);
const code = new Bun.Transpiler({ loader: 'ts' }).transformSync(
	await Bun.file(new URL('../src/lib/snapshot-delta.ts', import.meta.url)).text()
);
const browser = await chromium.launch({
	headless: false,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
const context = await browser.newContext({ viewport: { width: 1200, height: 800 }, baseURL: base });
await context.addInitScript(() => {
	localStorage.setItem('orbital.vab.hideStart', '1');
	localStorage.setItem('orbital.onboarding.off', '1');
	localStorage.setItem('orbital.graphics.renderer', 'webgpu');
	localStorage.setItem('orbital.graphics', 'low');
	localStorage.setItem('orbital.graphics.auto', 'off');
});
const setup = await context.newPage();
await setup.goto('/vab');
await setup.waitForFunction(() => typeof (window as any).__orbitalVab?.loadBooster === 'function');
await setup.evaluate(() => (window as any).__orbitalVab.loadBooster());
await setup.waitForTimeout(1500);
await setup.close();
const page = await context.newPage();
await page.goto('/flight');
await page.waitForFunction(
	() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0,
	null,
	{
		timeout: 300_000
	}
);
await page.waitForTimeout(3000);
for (const n of counts) {
	const out = await page.evaluate(
		({ code, n }) => {
			const mod: Record<string, any> = {};
			new Function('exports', code.replace(/export class (\w+)/g, 'exports.$1 = class $1'))(mod);
			const real = (window as any).__orbital.snapshot();
			const make = (t: number) => {
				const s = structuredClone(real);
				const base = s.vessels[0];
				s.t = t;
				s.vessels = Array.from({ length: n }, (_, i) => {
					const v = structuredClone(base);
					v.id = i + 1;
					v.position.y += t * 0.01;
					v.parts.forEach((p: any, k: number) => {
						p.id = (i + 1) * 1000 + k;
						p.position.y += t * 0.001;
						p.temperature = (p.temperature ?? 290) + t * 0.01;
					});
					return v;
				});
				return s;
			};
			const parts = make(0).vessels.reduce((a: number, v: any) => a + v.parts.length, 0);
			const frames = 300;
			const snaps = Array.from({ length: frames }, (_, i) => make(i));
			const time = (fn: (s: any) => void): number => {
				for (let i = 0; i < 30; i++) fn(snaps[i]);
				const t0 = performance.now();
				for (let i = 30; i < frames; i++) fn(snaps[i]);
				return (performance.now() - t0) / (frames - 30);
			};
			const full = time((s) => structuredClone(s));
			const enc = new mod.SnapshotEncoder();
			const dec = new mod.SnapshotDecoder();
			const wires = snaps.map((s) => enc.encode(s));
			const bytesFull = JSON.stringify(snaps[100]).length;
			const bytesWire = JSON.stringify(wires[100]).length;
			let i = 0;
			const dec2 = new mod.SnapshotDecoder();
			const wireMain = (() => {
				for (let k = 0; k < 30; k++) dec2.decode(structuredClone(wires[k]));
				const t0 = performance.now();
				for (let k = 30; k < frames; k++) dec2.decode(structuredClone(wires[k]));
				return (performance.now() - t0) / (frames - 30);
			})();
			const encode = (() => {
				const e = new mod.SnapshotEncoder();
				for (let k = 0; k < 30; k++) e.encode(snaps[k]);
				const t0 = performance.now();
				for (let k = 30; k < frames; k++) e.encode(snaps[k]);
				return (performance.now() - t0) / (frames - 30);
			})();
			void dec;
			void i;
			return {
				parts,
				bytesFull,
				bytesWire,
				mainFullMs: full,
				mainWireMs: wireMain,
				workerEncodeMs: encode
			};
		},
		{ code, n }
	);
	console.log(
		`${n} vessels, ${out.parts} parts: full ${out.bytesFull} B, delta ${out.bytesWire} B; main thread per message: full ${out.mainFullMs.toFixed(3)} ms, delta+decode ${out.mainWireMs.toFixed(3)} ms (${(out.mainWireMs / out.mainFullMs).toFixed(2)}x); worker encode ${out.workerEncodeMs.toFixed(3)} ms`
	);
}
await browser.close();
