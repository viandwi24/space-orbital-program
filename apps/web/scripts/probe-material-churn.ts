/**
 * What keeps making new materials and buffers in flight: the booster in orbit on `/flight`, headed, the
 * scene's materials and geometries by uuid every few seconds, and what is new since the last look, by
 * object path; the JS heap beside it. A heavy job: hold `/tmp/orbital-measuring`. Against a development
 * build:
 *
 *   SHOT_URL=http://localhost:5173 bun scripts/probe-material-churn.ts
 *
 * Options: VIEW (orbit), PRESET (medium), SECONDS (90), EVERY (5), TURN=1 (the vessel yaws now and then).
 */
import { chromium } from '@playwright/test';
import { placeView, setupVessel, waitForFlight, type View } from './lib/frame-matrix';

const base = process.env.SHOT_URL ?? 'http://localhost:5173';
const view = (process.env.VIEW ?? 'orbit') as View;
const preset = process.env.PRESET ?? 'medium';
const seconds = Number(process.env.SECONDS ?? 90);
const every = Number(process.env.EVERY ?? 5);

const browser = await chromium.launch({
	headless: false,
	args: [
		'--use-angle=metal',
		'--enable-gpu',
		'--ignore-gpu-blocklist',
		'--enable-unsafe-webgpu',
		'--enable-precise-memory-info',
		'--disable-background-timer-throttling',
		'--disable-renderer-backgrounding',
		'--disable-backgrounding-occluded-windows'
	]
});
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
const hangar = await context.newPage();
await setupVessel(hangar);
await hangar.close();
const page = await context.newPage();
page.on('pageerror', (e) => console.log('  pageerror', e.message));
await page.goto('/flight');
await waitForFlight(page, 180_000);
await page.waitForTimeout(4000);
await placeView(page, view);
await page.waitForTimeout(8000);

/** Every material and geometry in the scene now, uuid → where. */
const look = () =>
	page.evaluate(() => {
		const scene = (window as any).__orbital.renderer().debug.scene;
		const mats: Record<string, string> = {};
		const geos: Record<string, string> = {};
		let bytes = 0;
		scene.traverse((o: any) => {
			const path: string[] = [];
			for (let p = o; p && path.length < 4; p = p.parent) path.push(p.name || p.type);
			const where = path.reverse().join('/');
			for (const m of [o.material].flat().filter(Boolean))
				mats[m.uuid] = `${m.type}:${m.name || '-'} @ ${where}`;
			if (o.geometry) {
				geos[o.geometry.uuid] = `${o.geometry.type} @ ${where}`;
				for (const a of Object.values(o.geometry.attributes ?? {}) as any[])
					bytes += a.array?.byteLength ?? 0;
			}
		});
		const heap = ((performance as any).memory?.usedJSHeapSize ?? 0) / 1e6;
		const rep = (window as any).__orbitalLoadReport?.()?.data?.compile;
		return { mats, geos, bytes, heap, pipelines: rep?.pipelines ?? -1, pending: rep?.pending ?? -1 };
	});

let prev = await look();
console.log(
	`start: ${Object.keys(prev.mats).length} materials, ${Object.keys(prev.geos).length} geometries, attributes ${(prev.bytes / 1e6).toFixed(1)} MB, heap ${prev.heap.toFixed(0)} MB, pipelines ${prev.pipelines} pending ${prev.pending}`
);
const tally = new Map<string, number>();
for (let t = every; t <= seconds; t += every) {
	if (process.env.TURN) {
		await page.keyboard.down('d');
		await page.waitForTimeout(1500);
		await page.keyboard.up('d');
		await page.waitForTimeout(every * 1000 - 1500);
	} else await page.waitForTimeout(every * 1000);
	const now = await look();
	const newMats = Object.entries(now.mats).filter(([k]) => !(k in prev.mats));
	const newGeos = Object.entries(now.geos).filter(([k]) => !(k in prev.geos));
	for (const [, w] of [...newMats, ...newGeos]) tally.set(w, (tally.get(w) ?? 0) + 1);
	console.log(
		`t=${t}s materials ${Object.keys(now.mats).length} (+${newMats.length}) geometries ${Object.keys(now.geos).length} (+${newGeos.length}) attributes ${(now.bytes / 1e6).toFixed(1)} MB heap ${now.heap.toFixed(0)} MB pipelines ${now.pipelines} pending ${now.pending}`
	);
	for (const [, w] of newMats.slice(0, 4)) console.log('   new material', w);
	for (const [, w] of newGeos.slice(0, 4)) console.log('   new geometry', w);
	prev = now;
}
console.log('\nmost often new:');
for (const [w, n] of [...tally].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${n}x ${w}`);
await browser.close();
