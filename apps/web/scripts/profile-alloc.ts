/**
 * Who allocates (plan 418): V8's sampling heap profiler over a scene, headed, the functions ranked by
 * the bytes they allocated (and the share still alive at the end is not what this is: it is the rate
 * that matters for the minor and major collections). Run against a production build served by
 * `scripts/serve.ts`, under `/tmp/orbital-measuring`:
 *
 *   SHOT_URL=http://localhost:5290 SCENE=pad SECONDS=30 bun scripts/profile-alloc.ts
 *
 * SCENE is pad, orbit, ascent or space-center; SETTLE is the seconds to wait for the warming (240). Prints the top functions by allocated MB.
 */
import { chromium } from './lib/chromium';

const base = process.env.SHOT_URL ?? 'http://localhost:5290';
const scene = process.env.SCENE ?? 'pad';
const seconds = Number(process.env.SECONDS ?? 30);
const preset = process.env.PRESET ?? 'high';
const top = Number(process.env.TOP ?? 30);

interface ProfileNode {
	callFrame: { functionName: string; url: string; lineNumber: number };
	selfSize: number;
	children: ProfileNode[];
}

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
	await cdp.send('HeapProfiler.enable');
	await cdp.send('HeapProfiler.startSampling', {
		samplingInterval: 16384,
		includeObjectsCollectedByMajorGC: true,
		includeObjectsCollectedByMinorGC: true
	});
	await page.waitForTimeout(seconds * 1000);
	const { profile } = (await cdp.send('HeapProfiler.stopSampling')) as unknown as {
		profile: { head: ProfileNode };
	};
	const bySite = new Map<string, number>();
	let total = 0;
	const walk = (n: ProfileNode): void => {
		const f = n.callFrame;
		const key = `${f.functionName || '(anonymous)'} ${f.url.split('/').pop()}:${f.lineNumber}`;
		bySite.set(key, (bySite.get(key) ?? 0) + n.selfSize);
		total += n.selfSize;
		for (const c of n.children) walk(c);
	};
	walk(profile.head);
	console.log(
		`${scene} at ${preset}, ${seconds} s: ${(total / 1e6).toFixed(0)} MB allocated (sampled, collected objects included)`
	);
	for (const [site, bytes] of [...bySite.entries()].sort((a, b) => b[1] - a[1]).slice(0, top))
		console.log(`${(bytes / 1e6).toFixed(2).padStart(8)} MB  ${site}`);
} finally {
	await browser.close();
}
