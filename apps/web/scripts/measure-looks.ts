/**
 * What each look costs, on and off (plans 403 and 410, ADR 0364): the p95 frame interval at the pad,
 * 12 km, in orbit and in the Space Center with one look switched off and on (`renderer.debug.setLookOff`):
 * the bakes of other bodies, the far cloud shell, the ground rocks and a mod planet's far images (the
 * sample planet mod is installed in the page's store). Rounds alternate on and off so a drifting
 * machine hits both. A heavy job: hold `/tmp/orbital-measuring` on a quiet, plugged-in machine.
 * Against a `NODE_ENV=development` build served on a port:
 *
 *   SHOT_URL=http://localhost:5211 bun scripts/measure-looks.ts out.json
 *
 * Options: SECONDS (12), WARM (4), ROUNDS (2), SCENES (pad,12km,orbit,space-center,cinder,verdant), LOOKS
 * (bakes,farShell,rocks,images), VW, VH, DSF (1512 x 945 at 2), BACKEND (webgpu), PRESET (high).
 */
import { chromium, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { frameReport, intervalsOf } from '@orbital/renderer';
import { modPackageFingerprint } from '@orbital/core';
import { buildMod } from '../../../tools/mod-build/build-mod.ts';
import { placeView, record, setupVessel, waitForFlight, type View } from './lib/frame-matrix';

const base = process.env.SHOT_URL ?? 'http://localhost:5211';
const seconds = Number(process.env.SECONDS ?? 12);
const warm = Number(process.env.WARM ?? 4);
const rounds = Number(process.env.ROUNDS ?? 2);
const scenes = (process.env.SCENES ?? 'pad,12km,orbit,space-center,cinder,verdant').split(',');
const looks = (process.env.LOOKS ?? 'bakes,farShell,rocks,images').split(',') as Array<
	'bakes' | 'farShell' | 'rocks' | 'images'
>;
const backend = process.env.BACKEND ?? 'webgpu';
const preset = process.env.PRESET ?? 'high';

const built = await buildMod(join(import.meta.dir, '../../../examples/mod-planet-sample'));
const pkg = JSON.parse(built.text);
const sha256 = await modPackageFingerprint(pkg.code, pkg.assets);
const record0 = {
	id: pkg.manifest.id,
	manifest: pkg.manifest,
	code: pkg.code,
	assets: pkg.assets,
	sha256,
	trusted: sha256,
	source: { kind: 'file', name: 'mod-planet-sample.json' },
	installedAt: Date.now(),
	enabled: true,
	order: 0
};

const browser = await chromium.launch({
	args: [
		'--use-angle=metal',
		'--enable-gpu',
		'--ignore-gpu-blocklist',
		'--enable-unsafe-webgpu',
		'--disable-background-timer-throttling',
		'--disable-renderer-backgrounding'
	]
});
const context = await browser.newContext({
	viewport: { width: Number(process.env.VW ?? 1512), height: Number(process.env.VH ?? 945) },
	deviceScaleFactor: Number(process.env.DSF ?? 2),
	baseURL: base
});
await context.addInitScript(
	([b, p]) => {
		localStorage.setItem('orbital.vab.hideStart', '1');
		localStorage.setItem('orbital.onboarding.off', '1');
		localStorage.setItem('orbital.graphics.renderer', b!);
		localStorage.setItem('orbital.graphics', p!);
		localStorage.setItem('orbital.graphics.auto', 'off');
		localStorage.removeItem('orbital.graphics.learned');
	},
	[backend, preset]
);
// the sample planet mod goes into the page's IndexedDB store, then the booster into the Hangar
{
	const seed = await context.newPage();
	await seed.goto('/vab');
	await seed.evaluate(
		(rec) =>
			new Promise<void>((resolve, reject) => {
				const open = indexedDB.open('orbital-mods', 1);
				open.onupgradeneeded = () => open.result.createObjectStore('mods', { keyPath: 'id' });
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const tx = open.result.transaction('mods', 'readwrite');
					tx.objectStore('mods').put(rec);
					tx.oncomplete = () => resolve();
					tx.onerror = () => reject(tx.error);
				};
			}),
		record0
	);
	await seed.reload();
	await seed.close();
}
await setupVessel(await context.newPage());

interface Row {
	scene: string;
	look: string;
	state: 'on' | 'off';
	round: number;
	p95: number;
	over16: number;
	over8: number;
	gpuMs: number | null;
}
const rows: Row[] = [];

async function open(scene: string): Promise<Page> {
	const page = await context.newPage();
	page.on('pageerror', (e) => console.log('  pageerror', e.message));
	page.on('console', (m) => m.type() === 'error' && console.log('  console', m.text().slice(0, 200)));
	if (scene === 'space-center') {
		await page.goto('/space-center');
		await page.waitForFunction(() => (window as any).__orbital?.renderer?.(), null, {
			timeout: 300_000
		});
		await page.getByTestId('world-loading').waitFor({ state: 'detached', timeout: 300_000 });
	} else {
		await page.goto('/flight');
		await waitForFlight(page);
	}
	await page.waitForTimeout(4000);
	// the other bodies from 300 and 900 km up: where the bakes and the mod planet's images are drawn
	const farFrom: Record<string, [string, number]> = {
		cinder: ['stock.cinder', 300_000],
		verdant: ['planet-sample.verdant', 900_000]
	};
	const far = farFrom[scene];
	if (far)
		await page.evaluate(
			([body, altitude]) =>
				(window as any).__orbitalDebug.setLocation({
					kind: 'air',
					body,
					latitude: 0.3,
					longitude: 0.2,
					altitude,
					speed: 0,
					climb: 0
				}),
			far
		);
	else if (scene !== 'space-center') await placeView(page, scene as View);
	return page;
}

for (const scene of scenes) {
	const page = await open(scene);
	for (const look of looks) {
		for (let round = 1; round <= rounds; round++) {
			for (const state of round % 2 ? (['on', 'off'] as const) : (['off', 'on'] as const)) {
				await page.evaluate(
					([l, off]) => (window as any).__orbital.renderer().debug.setLookOff(l, off),
					[look, state === 'off'] as [string, boolean]
				);
				await page.waitForTimeout(warm * 1000);
				const r = await record(page, seconds);
				const rep = frameReport(intervalsOf(r.stamps));
				rows.push({
					scene,
					look,
					state,
					round,
					p95: rep.p95Ms,
					over16: rep.over16,
					over8: rep.over8,
					gpuMs: r.gpuMs
				});
				console.log(
					`${scene.padEnd(12)} ${look.padEnd(9)} ${state.padEnd(3)} r${round} p95 ${rep.p95Ms.toFixed(1)} ms, >16.7 ${(rep.over16 * 100).toFixed(0)} %, gpu ${r.gpuMs?.toFixed(1) ?? '-'}`
				);
			}
		}
		await page.evaluate(
			(l) => (window as any).__orbital.renderer().debug.setLookOff(l, false),
			look
		);
	}
	await page.close();
}
await browser.close();

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const lines = [
	'| scene | look | p95 ms on | p95 ms off | > 16.7 on | > 16.7 off | GPU ms on | GPU ms off |',
	'|---|---|---|---|---|---|---|---|'
];
for (const scene of scenes)
	for (const look of looks) {
		const pick = (state: 'on' | 'off', f: (r: Row) => number | null): string => {
			const v = rows
				.filter((r) => r.scene === scene && r.look === look && r.state === state)
				.map(f)
				.filter((x): x is number => x !== null);
			return v.length ? mean(v).toFixed(1) : '-';
		};
		const pct = (state: 'on' | 'off'): string =>
			`${(mean(rows.filter((r) => r.scene === scene && r.look === look && r.state === state).map((r) => r.over16)) * 100).toFixed(0)} %`;
		lines.push(
			`| ${scene} | ${look} | ${pick('on', (r) => r.p95)} | ${pick('off', (r) => r.p95)} | ${pct('on')} | ${pct('off')} | ${pick('on', (r) => r.gpuMs)} | ${pick('off', (r) => r.gpuMs)} |`
		);
	}
console.log('\n' + lines.join('\n'));
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({ rows, lines }, null, 2));
