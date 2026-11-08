/**
 * Where the main thread spends its time (plan 418): V8's CPU sampler (200 us) over a scene, headed, the
 * functions ranked by self time and by inclusive time, in ms per second. Run against a build made with
 * `ORBITAL_PROFILE=1` (no minifying: the names are the source's) and served by `scripts/serve.ts`,
 * under `/tmp/orbital-measuring`:
 *
 *   SHOT_URL=http://localhost:5290 SCENE=pad SECONDS=20 bun scripts/profile-cpu.ts
 *
 * SCENE is pad, orbit, ascent or space-center; SETTLE is the seconds to wait for the warming (240);
 * TOP the rows of each table (30); PRESET (high).
 */
import { chromium } from './lib/chromium';

const base = process.env.SHOT_URL ?? 'http://localhost:5290';
const scene = process.env.SCENE ?? 'pad';
const seconds = Number(process.env.SECONDS ?? 30);
const preset = process.env.PRESET ?? 'high';
const top = Number(process.env.TOP ?? 30);

const browser = await chromium.launch({
	headless: false,
	args: [
		`--use-angle=${process.platform === 'darwin' ? 'metal' : 'vulkan'}`,
		'--enable-gpu',
		'--ignore-gpu-blocklist',
		'--enable-unsafe-webgpu',
		'--enable-precise-memory-info'
	]
});
try {
	const context = await browser.newContext({
		viewport: { width: 1512, height: 945 },
		deviceScaleFactor: 2,
		baseURL: base
	});
	await context.addInitScript((p) => {
		localStorage.setItem('orbital.vab.hideStart', '1');
		localStorage.setItem('orbital.onboarding.off', '1');
		localStorage.setItem('orbital.graphics', p);
		localStorage.setItem('orbital.graphics.auto', 'off');
	}, preset);
	const waitWorld = async (page: import('@playwright/test').Page): Promise<void> => {
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
				{ timeout: Number(process.env.SETTLE ?? 240) * 1000 }
			)
			.catch(() => console.log('(the warming did not settle: profiling anyway)'));
		await page.waitForTimeout(3000);
	};
	if (scene !== 'space-center') {
		const setup = await context.newPage();
		await setup.goto('/vab');
		await setup.waitForFunction(
			() => typeof (window as any).__orbitalVab?.loadBooster === 'function'
		);
		await setup.evaluate(() => (window as any).__orbitalVab.loadBooster());
		await setup.waitForTimeout(1500);
		await setup.close();
	}
	const page = await context.newPage();
	await page.goto(scene === 'space-center' ? '/space-center' : '/flight');
	await waitWorld(page);
	if (scene !== 'space-center') {
		await page.reload();
		await waitWorld(page);
	}
	if (scene === 'orbit') {
		await page.evaluate(() =>
			(window as any).__orbitalDebug.setOrbit({
				body: 'stock.home',
				apoapsis: 100_000,
				periapsis: 100_000
			})
		);
		await page.waitForTimeout(4000);
	}
	if (scene === 'ascent')
		await page.evaluate(async () => {
			const d = (window as any).__orbitalDebug;
			const v = d.vessel();
			await d.send({ type: 'throttle', vessel: v.id, value: 1 });
			await d.send({ type: 'stage', vessel: v.id });
		});
	const cdp = await context.newCDPSession(page);
	await cdp.send('Profiler.enable');
	await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
	await cdp.send('Profiler.start');
	await page.waitForTimeout(seconds * 1000);
	const { profile } = (await cdp.send('Profiler.stop')) as unknown as {
		profile: {
			nodes: Array<{
				id: number;
				callFrame: { functionName: string; url: string; lineNumber: number };
				children?: number[];
			}>;
			samples: number[];
			timeDeltas: number[];
		};
	};
	const parent = new Map<number, number>();
	const frame = new Map<number, string>();
	for (const n of profile.nodes) {
		const f = n.callFrame;
		frame.set(n.id, `${f.functionName || '(anonymous)'} ${f.url.split('/').pop()}:${f.lineNumber}`);
		for (const c of n.children ?? []) parent.set(c, n.id);
	}
	const self = new Map<string, number>();
	const incl = new Map<string, number>();
	let total = 0;
	profile.samples.forEach((id, i) => {
		const dt = profile.timeDeltas[i] ?? 0;
		total += dt;
		const own = frame.get(id) ?? '?';
		self.set(own, (self.get(own) ?? 0) + dt);
		const seen = new Set<string>();
		for (let at: number | undefined = id; at !== undefined; at = parent.get(at)) {
			const key = frame.get(at) ?? '?';
			if (seen.has(key)) continue;
			seen.add(key);
			incl.set(key, (incl.get(key) ?? 0) + dt);
		}
	});
	const show = (title: string, m: Map<string, number>): void => {
		console.log(
			`\n${title} (${scene} at ${preset}, ${seconds} s, ${(total / 1e3).toFixed(0)} ms sampled)`
		);
		for (const [site, us] of [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top))
			console.log(
				`${((us / total) * 100).toFixed(1).padStart(6)} %  ${(us / 1e3 / seconds).toFixed(1).padStart(7)} ms/s  ${site}`
			);
	};
	show('self time', self);
	show('inclusive time', incl);
} finally {
	await browser.close();
}
