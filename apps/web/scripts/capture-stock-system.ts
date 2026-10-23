/**
 * The look check of plan 381 (the wider stock system): every new body from orbit in the map view,
 * framed at a fixed size with the sun behind the camera's shoulder, and the system overview. Against
 * a dev server (the `__orbital` hook):
 *
 *   SHOT_URL=http://localhost:5173 SHOT_RENDERER=webgpu bun scripts/capture-stock-system.ts
 *
 * Options: SHOT_RENDERER (webgpu or webgl), SHOT_BODIES (comma list of ids, default all new bodies),
 * SHOT_OUT (default docs/journal/assets). Output: `381-<renderer>-<body>.jpg`, `381-<renderer>-system.jpg`.
 */
import { chromium, type Page } from '@playwright/test';
import { join } from 'node:path';

const base = process.env.SHOT_URL ?? 'http://localhost:5173';
const out = process.env.SHOT_OUT ?? join(import.meta.dir, '../../../docs/journal/assets');
const backend = process.env.SHOT_RENDERER ?? 'webgpu';

/** Radius and the orbit the vessel is put on (m above the datum), per body. */
const BODIES: Record<string, { radius: number; altitude: number }> = {
	'stock.kiln': { radius: 260e3, altitude: 300e3 },
	'stock.vesper': { radius: 700e3, altitude: 900e3 },
	'stock.ochre': { radius: 330e3, altitude: 400e3 },
	'stock.mote': { radius: 13e3, altitude: 12e3 },
	'stock.flick': { radius: 9e3, altitude: 15e3 },
	'stock.vagrant': { radius: 7e3, altitude: 20e3 },
	'stock.tempest': { radius: 5_500e3, altitude: 20_000e3 },
	'stock.forge': { radius: 300e3, altitude: 400e3 },
	'stock.rime': { radius: 260e3, altitude: 400e3 },
	'stock.bastion': { radius: 520e3, altitude: 700e3 },
	'stock.husk': { radius: 45e3, altitude: 60e3 },
	'stock.glim': { radius: 200e3, altitude: 300e3 }
};
const ids = (process.env.SHOT_BODIES ?? Object.keys(BODIES).join(',')).split(',');

const browser = await chromium.launch({
	headless: false,
	args: [
		'--use-angle=metal',
		'--enable-gpu',
		'--ignore-gpu-blocklist',
		'--enable-unsafe-webgpu',
		'--enable-features=Vulkan,WebGPU'
	]
});
const context = await browser.newContext({
	viewport: { width: 1280, height: 800 },
	deviceScaleFactor: 1,
	baseURL: base
});
const page: Page = await context.newPage();
page.on('pageerror', (e) => console.log('  pageerror', e.message));
page.on('console', (m) => {
	if (m.type() === 'error' || /lost|uncaptured|validation/i.test(m.text()))
		console.log('  console', m.type(), m.text().slice(0, 300));
});
await page.addInitScript(() => {
	localStorage.setItem('orbital.graphics', 'high');
	localStorage.setItem('orbital.graphics.auto', 'off');
	localStorage.setItem('orbital.vab.hideStart', '1');
});
const flightReady = () =>
	page.waitForFunction(() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0, null, {
		timeout: 240_000
	});
await page.goto('/vab');
await page.waitForFunction(
	() => typeof (window as any).__orbitalVab?.loadTwoStage === 'function',
	null,
	{
		timeout: 120_000
	}
);
await page.evaluate(() => (window as any).__orbitalVab.loadTwoStage());
await page.getByTestId('menu-launch').click();
const anyway = page.getByRole('button', { name: 'Launch anyway' });
if (await anyway.isVisible().catch(() => false)) await anyway.click();
await page.waitForURL('**/launch');
await page.getByTestId('launch-go').click();
await page.waitForURL('**/flight');
await flightReady();
if (backend !== 'webgpu') {
	await page.goto(`/flight?renderer=${backend}`);
	await flightReady();
}
await page.waitForFunction(
	() => !document.body.innerText.includes('Drawing the first frame'),
	null,
	{
		timeout: 240_000
	}
);
await page.waitForTimeout(4000);
await page.keyboard.press('m');
await page.waitForTimeout(1500);
await page.keyboard.press('F2');

/** Frame `id` at `px` pixels of radius, the camera turned so the sun is behind its shoulder. */
async function frame(id: string, radius: number, px: number, turn = true): Promise<void> {
	await page.evaluate(
		async ([id, radius, px, turn]) => {
			const o = (window as any).__orbital;
			const R = o.renderer();
			const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
			R.setMapView(true);
			R.setMapFocus(id);
			// the map's camera eases to its focus first; input before then is lost
			await wait(3000);
			const bodyAt = () => o.snapshot().bodies.find((b: any) => b.id === id).position;
			const sunAt = () => o.snapshot().bodies.find((b: any) => b.id === 'stock.sun').position;
			const size = (): number => {
				const c = bodyAt();
				const p0 = R.project(c);
				if (!p0) return 0;
				let best = 0;
				for (const ax of ['x', 'y', 'z']) {
					const q = { ...c };
					q[ax] += radius;
					const p = R.project(q);
					if (p) best = Math.max(best, Math.hypot(p.x - p0.x, p.y - p0.y));
				}
				return best;
			};
			for (let k = 0; k < 40; k++) {
				await wait(100);
				const s = size();
				if (!s) {
					R.orbitCamera({ zoomFactor: 1.4 });
					continue;
				}
				const f = s / px;
				if (Math.abs(f - 1) < 0.04) break;
				R.orbitCamera({ zoomFactor: Math.min(3, Math.max(1 / 3, f)) });
			}
			if (!turn) return;
			// turn until the sunward point of the body is nearest its centre on screen: sun behind us
			const sunward = () => {
				const c = bodyAt();
				const s = sunAt();
				const d = Math.hypot(s.x - c.x, s.y - c.y, s.z - c.z);
				const k = (1.02 * radius) / d;
				const p = { x: c.x + (s.x - c.x) * k, y: c.y + (s.y - c.y) * k, z: c.z + (s.z - c.z) * k };
				const a = R.project(c);
				const b = R.project(p);
				return a && b && !b.hidden ? Math.hypot(b.x - a.x, b.y - a.y) : Infinity;
			};
			// yaw round and pitch up and down: the sun may stand well off the camera's horizon
			const PITCHES = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05];
			let best = { yaw: 0, pitch: 0, score: Infinity };
			for (const pitch of PITCHES) {
				R.orbitCamera({ dPitch: pitch });
				for (let step = 0; step < 24; step++) {
					const score = sunward();
					if (score < best.score) best = { yaw: step, pitch, score };
					R.orbitCamera({ dYaw: (2 * Math.PI) / 24 });
					await wait(40);
				}
				R.orbitCamera({ dPitch: -pitch });
			}
			R.orbitCamera({ dPitch: best.pitch, dYaw: ((2 * Math.PI) / 24) * best.yaw + 0.55 });
		},
		[id, radius, px, turn] as const
	);
}

for (const id of ids) {
	const b = BODIES[id];
	if (!b) throw new Error(`unknown body "${id}"`);
	await page.evaluate(
		async ([id, alt]) => {
			const o = (window as any).__orbital;
			await o.send({ type: 'pause', on: false });
			const r = await (window as any).__orbitalDebug.setOrbit({
				body: id,
				apoapsis: alt,
				periapsis: alt
			});
			if (!r.ok) console.log('setOrbit', id, r.reason);
		},
		[id, b.altitude] as const
	);
	await page.waitForTimeout(2500);
	await frame(id, b.radius, 280);
	// the body wakes and bakes its full colour map over a few frames
	await page.waitForTimeout(Number(process.env.SHOT_WAIT ?? 5000));
	await page.screenshot({
		path: join(out, `381-${backend}-${id.split('.')[1]}.jpg`),
		type: 'jpeg',
		quality: 88
	});
	console.log('shot', id);
}

// the overview: the whole system from the Sun, out to Glim's aphelion, seen from above at a slant,
// with the interface back on for the body labels
await page.keyboard.press('F2');
await page.evaluate(() => {
	const R = (window as any).__orbital.renderer();
	R.setMapScope('system');
	R.orbitCamera({ dPitch: 0.6 });
});
await frame('stock.sun', 1.2e11, 360, false);
await page.waitForTimeout(3000);
await page.screenshot({ path: join(out, `381-${backend}-system.jpg`), type: 'jpeg', quality: 88 });
console.log('shot system');
// the inner system: Kiln to Ochre
await frame('stock.sun', 2.4e10, 360, false);
await page.waitForTimeout(2500);
await page.screenshot({ path: join(out, `381-${backend}-inner.jpg`), type: 'jpeg', quality: 88 });
console.log('shot inner');
await browser.close();
