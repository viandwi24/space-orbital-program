/**
 * What the pad costs over orbit, piece by piece (plan 415): the booster at the pad on `/flight`, headed,
 * the launch site always off (plan 414 owns it), then one more piece off at a time, and all of them off
 * (the floor), the mean and p95 frame interval of each, states alternating over rounds so a drifting
 * machine hits all. A heavy job: hold `/tmp/orbital-measuring`, say when the window is open. Against a
 * development build:
 *
 *   SHOT_URL=http://localhost:5241 bun scripts/measure-pad-breakdown.ts out.json
 *
 * Options: SECONDS (8), WARM (3), ROUNDS (3), VIEW (pad), PRESET (high), DSF (2), EXTRA (extra looks off in
 * every state, comma separated), SITE=piece (the launch site stays on and is one of the pieces, as the gate draws it).
 */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { frameReport, intervalsOf } from '@orbital/renderer';
import { placeView, record, setupVessel, waitForFlight, type View } from './lib/frame-matrix';

const base = process.env.SHOT_URL ?? 'http://localhost:5241';
const seconds = Number(process.env.SECONDS ?? 8);
const warm = Number(process.env.WARM ?? 3);
const rounds = Number(process.env.ROUNDS ?? 3);
const view = (process.env.VIEW ?? 'pad') as View;
const preset = process.env.PRESET ?? 'high';
const extra = (process.env.EXTRA ?? '').split(',').filter(Boolean);

const sitePiece = process.env.SITE === 'piece';
const PIECES = [
	'mesh',
	'terrain',
	'vessels',
	'shadows',
	'clouds',
	'ocean',
	'rocks',
	...(sitePiece ? ['site'] : [])
];
const tune = process.env.MODE === 'tune';
/** MODE=tune: the mesh's levels and finest range (`__meshTuning`) against mesh off, instead of the pieces. */
const TUNES: Array<[string, { maxLevel: number; range0: number; scale: number } | null]> = [
	['mesh full', { maxLevel: 15, range0: 40, scale: 1 }],
	['mesh off', null]
];
const states: Array<{
	name: string;
	off: string[];
	tuning?: { maxLevel: number; range0: number; scale: number };
}> = tune
	? TUNES.map(([name, t]) => ({ name, off: t ? [] : ['mesh'], tuning: t ?? undefined }))
	: [
			{ name: 'base', off: [] },
			...PIECES.map((p) => ({ name: `-${p}`, off: [p] })),
			{ name: 'floor', off: PIECES.filter((p) => p !== 'mesh') }
		];

const browser = await chromium.launch({
	headless: false,
	args: [
		'--use-angle=metal',
		'--enable-gpu',
		'--ignore-gpu-blocklist',
		'--enable-unsafe-webgpu',
		'--disable-background-timer-throttling',
		'--disable-renderer-backgrounding',
		'--disable-backgrounding-occluded-windows'
	]
});
const context = await browser.newContext({
	viewport: { width: 1512, height: 945 },
	deviceScaleFactor: Number(process.env.DSF ?? 2),
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
await waitForFlight(page, 120_000);
await page.waitForTimeout(4000);
if (process.env.ALT)
	await page.evaluate(
		(alt) =>
			(window as any).__orbitalDebug.setLocation({
				kind: 'air',
				latitude: 0.009,
				longitude: 0.02,
				altitude: alt,
				speed: 0,
				climb: 0
			}),
		Number(process.env.ALT)
	);
else await placeView(page, view);

const all = [...new Set([...PIECES, 'site', ...extra])];
const set = (offs: string[]) =>
	page.evaluate(
		([names, on]) => {
			const d = (window as any).__orbital.renderer().debug;
			for (const n of names as string[]) d.setLookOff(n, (on as string[]).includes(n));
		},
		[all, [...(sitePiece ? [] : ['site']), ...extra, ...offs]] as [string[], string[]]
	);
const rows: Array<{
	state: string;
	round: number;
	mean: number;
	p95: number;
	over8: number;
	gpu: number | null;
}> = [];
for (let round = 1; round <= rounds; round++) {
	const order = round % 2 ? states : [...states].reverse();
	for (const s of order) {
		await set(s.off);
		if (s.tuning)
			await page.evaluate((t) => Object.assign((window as any).__meshTuning, t), s.tuning);
		await page.waitForTimeout(warm * 1000);
		const r = await record(page, seconds);
		const rep = frameReport(intervalsOf(r.stamps));
		rows.push({
			state: s.name,
			round,
			mean: rep.meanMs,
			p95: rep.p95Ms,
			over8: rep.over8,
			gpu: r.gpuMs
		});
		const cpu = await page.evaluate(() => {
			const t = (window as any).__meshTuning;
			return t ? `cpu update ${t.updateMs.toFixed(2)} draw ${t.drawMs.toFixed(2)}` : '';
		});
		console.log(
			`${cpu} ${s.name.padEnd(10)} r${round} mean ${rep.meanMs.toFixed(2)} p95 ${rep.p95Ms.toFixed(1)} >8.4 ${(rep.over8 * 100).toFixed(0)} % gpu ${r.gpuMs?.toFixed(1) ?? '-'}`
		);
	}
}
await browser.close();
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const lines = [
	`| state (${sitePiece ? 'site a piece' : 'site off'}, then) | mean ms | p95 ms | > 8.4 | GPU ms |`,
	'|---|---|---|---|---|'
];
for (const s of states) {
	const rs = rows.filter((r) => r.state === s.name);
	lines.push(
		`| ${s.name} | ${mean(rs.map((r) => r.mean)).toFixed(2)} | ${mean(rs.map((r) => r.p95)).toFixed(1)} | ${(mean(rs.map((r) => r.over8)) * 100).toFixed(0)} % | ${mean(rs.map((r) => r.gpu ?? 0)).toFixed(1)} |`
	);
}
console.log('\n' + lines.join('\n'));
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({ rows, lines }, null, 2));
