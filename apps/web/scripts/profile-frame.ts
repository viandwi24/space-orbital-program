/**
 * Where the main thread's time and allocations go in one flight scene (plan 363): a CPU profile and a
 * sampled allocation profile over the same seconds, summed by function, per drawn frame.
 *
 * Against a development build without minification, so the functions keep their names:
 *
 *   ORBITAL_PROFILE=1 NODE_ENV=development bun run build && bun scripts/serve.ts 5211 &
 *   SHOT_URL=http://localhost:5211 bun scripts/profile-frame.ts out.json
 *
 * Options (environment): CFG `<backend>:<preset>:<adjust>` (default webgpu:medium:off), SECONDS (10),
 * SCENE `orbit` (Kronos V + Selene at 100 km, default) or `pad` (the same vessel on the pad), TOP (30).
 */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { setupVessel } from './lib/frame-matrix';

const base = process.env.SHOT_URL ?? 'http://localhost:5211';
const out = process.argv[2];
const [backend, preset, adjust] = (process.env.CFG ?? 'webgpu:medium:off').split(':');
const seconds = Number(process.env.SECONDS ?? 10);
const scene = process.env.SCENE ?? 'orbit';
const top = Number(process.env.TOP ?? 30);

const browser = await chromium.launch({
	headless: false,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
const context = await browser.newContext({
	viewport: { width: 1512, height: 945 },
	deviceScaleFactor: 2,
	baseURL: base
});
await context.addInitScript(
	([b, p, a]) => {
		localStorage.setItem('orbital.vab.hideStart', '1');
		localStorage.setItem('orbital.graphics.renderer', b!);
		localStorage.setItem('orbital.graphics', p!);
		localStorage.setItem('orbital.graphics.auto', a!);
	},
	[backend, preset, adjust]
);
// the Hangar's booster (the start buttons are gone): the pad is where it starts
const setup = await context.newPage();
await setupVessel(setup);
await setup.close();

const page = await context.newPage();
await page.goto('/flight');
await page.waitForFunction(
	() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0,
	null,
	{ timeout: 240_000 }
);
await page.getByTestId('world-loading').waitFor({ state: 'detached', timeout: 240_000 });
if (scene === 'orbit')
	await page.evaluate(() =>
		(window as any).__orbitalDebug.setOrbit({ apoapsis: 100_000, periapsis: 100_000 })
	);
await page.waitForTimeout(10_000);

const cdp = await context.newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('HeapProfiler.enable');
await page.evaluate(() => (window as any).__orbital.resetFrameStats?.());
await cdp.send('Profiler.start');
// garbage too: the churn is what costs GC pauses
await cdp.send('HeapProfiler.startSampling', {
	samplingInterval: 16_384,
	includeObjectsCollectedByMajorGC: true,
	includeObjectsCollectedByMinorGC: true
} as never);
await page.waitForTimeout(seconds * 1000);
const { profile: heap } = (await cdp.send('HeapProfiler.stopSampling')) as any;
const { profile } = (await cdp.send('Profiler.stop')) as any;
const frames = await page.evaluate(() => (window as any).__orbital.frameStats?.());
await browser.close();

const drawn = Math.max(1, frames?.count ?? 1);
const name = (cf: { functionName: string; url: string; lineNumber: number }): string =>
	`${cf.functionName || '(anonymous)'} ${cf.url.split('/').pop() ?? ''}:${cf.lineNumber + 1}`;

// CPU: self time per function (sample count × interval)
const dt = new Map<number, number>();
for (let i = 0; i < profile.samples.length; i++)
	dt.set(profile.samples[i], (dt.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i] ?? 0));
const cpu = new Map<string, number>();
let busy = 0;
for (const node of profile.nodes) {
	const us = dt.get(node.id) ?? 0;
	const key = name(node.callFrame);
	if (node.callFrame.functionName !== '(idle)' && node.callFrame.functionName !== '(program)')
		busy += us;
	cpu.set(key, (cpu.get(key) ?? 0) + us);
}
const cpuRows = [...cpu.entries()]
	.sort((a, b) => b[1] - a[1])
	.slice(0, top)
	.map(([k, us]) => ({ fn: k, msPerFrame: Math.round((us / 1000 / drawn) * 1000) / 1000 }));

// allocations: bytes sampled per function (self)
const alloc = new Map<string, number>();
let allocTotal = 0;
const walk = (n: any): void => {
	alloc.set(name(n.callFrame), (alloc.get(name(n.callFrame)) ?? 0) + n.selfSize);
	allocTotal += n.selfSize;
	for (const c of n.children ?? []) walk(c);
};
walk(heap.head);
// CALLERS=<regex>: for allocations in functions matching it, the call chains (4 frames up) they come from
const callers = new Map<string, number>();
const pattern = process.env.CALLERS ? new RegExp(process.env.CALLERS) : null;
const chains = (n: any, stack: string[]): void => {
	const here = [...stack, name(n.callFrame)];
	if (pattern && pattern.test(n.callFrame.functionName) && n.selfSize > 0) {
		const outside = here
			.filter((f) => !pattern.test(f))
			.slice(-4)
			.join(' < ');
		callers.set(outside, (callers.get(outside) ?? 0) + n.selfSize);
	}
	for (const c of n.children ?? []) chains(c, here);
};
if (pattern) chains(heap.head, []);
const callerRows = [...callers.entries()]
	.sort((a, b) => b[1] - a[1])
	.slice(0, top)
	.map(([k, bytes]) => ({ chain: k, kbPerFrame: Math.round(bytes / 1024 / drawn) }));
const allocRows = [...alloc.entries()]
	.sort((a, b) => b[1] - a[1])
	.slice(0, top)
	.map(([k, bytes]) => ({ fn: k, kbPerFrame: Math.round(bytes / 1024 / drawn) }));

const result = {
	config: `${backend}:${preset}:${adjust}`,
	scene,
	seconds,
	frames,
	busyMsPerFrame: Math.round((busy / 1000 / drawn) * 100) / 100,
	allocKbPerFrame: Math.round(allocTotal / 1024 / drawn),
	cpu: cpuRows,
	alloc: allocRows,
	...(pattern ? { callers: callerRows } : {})
};
console.log(JSON.stringify(result, null, 1));
if (out) writeFileSync(out, JSON.stringify(result, null, 1));
