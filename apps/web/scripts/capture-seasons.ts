/**
 * Plan 122's seasons check (ADR 0119): creates a world, launches, places a pod at latitude 40
 * degrees, warps to noon at both solstices and the equinox, and prints the sun elevation the
 * renderer computes beside the one the stock orbit predicts; writes `122-<date>.png` to the folder
 * given. Against a `NODE_ENV=development` build (the `__orbital` hook):
 *
 *   SHOT_URL=http://localhost:5202 bun scripts/capture-seasons.ts <folder>
 */
import { chromium } from '@playwright/test';
import { bodyOrientation, positionFromStar, subSolarLatitude } from '../../../packages/core/src/index.ts';
import { HomeBody, MoonBody, SunBody } from '../../../mods/stock/src/bodies.ts';
type V = { x: number; y: number; z: number };
type Q = V & { w: number };
const out = process.argv[2] ?? '.';
const base = process.env.SHOT_URL ?? 'http://localhost:5202';
const bodies = [SunBody, HomeBody, MoonBody];
const rot = (q: Q, v: V): V => {
	const ix = q.w * v.x + q.y * v.z - q.z * v.y, iy = q.w * v.y + q.z * v.x - q.x * v.z, iz = q.w * v.z + q.x * v.y - q.y * v.x, iw = -q.x * v.x - q.y * v.y - q.z * v.z;
	return { x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y, y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z, z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x };
};
const conj = (q: Q): Q => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
const norm = (v: V): V => { const n = Math.hypot(v.x, v.y, v.z); return { x: v.x / n, y: v.y / n, z: v.z / n }; };
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await page.addInitScript(() => { localStorage.setItem('orbital.graphics', 'high'); localStorage.setItem('orbital.graphics.auto', 'off'); });
await page.goto(base + '/worlds');
await page.getByTestId('worlds-create').click();
const form = page.getByTestId('create-world');
await form.getByTestId('world-name').fill('Seasons');
await form.locator('input[name=site][value="stock.mid-latitude-coast"]').check();
await page.getByTestId('site-consequences').waitFor({ timeout: 60_000 });
await form.getByTestId('world-create').click();
await page.getByTestId('world-enter').click();
await page.waitForURL('**/space-center');
await page.goto(base + '/vab');
const example = page.getByRole('button', { name: /Load the two-stage example/ });
await example.waitFor({ timeout: 60_000 });
await example.click();
await page.getByRole('button', { name: /^Launch/ }).first().click();
const anyway = page.getByRole('button', { name: 'Launch anyway' });
if (await anyway.isVisible({ timeout: 2000 }).catch(() => false)) await anyway.click();
await page.waitForURL('**/flight**');
await page.waitForFunction(() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0, null, { timeout: 90_000 });
await page.waitForTimeout(3000);
// a pod at latitude 40 degrees (the flight launches at 0, 0 until plan 094): the renderer follows it
const LAT = (40 * Math.PI) / 180;
const placed = await page.evaluate(async (lat) => {
	const o = (window as any).__orbital;
	const design = { formatVersion: 1, name: 'Sundial', parts: [{ index: 0, part: 'stock.command-pod', parent: null }], stages: [] };
	const r = await o.send({ type: 'load-vessel', design, placement: { kind: 'surface', latitude: lat, longitude: 0.3 } });
	if (r.ok) o.renderer().setActiveVessel(r.vessel);
	return r;
}, LAT);
console.log('placed', JSON.stringify(placed));
await page.waitForTimeout(4000);
const s0 = await page.evaluate((id) => { const s = (window as any).__orbital.snapshot(); const h = s.bodies.find((b: any) => b.id === 'stock.home'); const v = s.vessels.find((x: any) => x.id === id); return { t: s.t, r: v.position, q: h.rotation }; }, placed.vessel);
const upBF = rot(conj(s0.q), norm(s0.r));
const lat = Math.asin(upBF.y) * 180 / Math.PI;
const elevation = (t: number): number => {
	const up = rot(bodyOrientation(HomeBody, t) as Q, upBF);
	const p = positionFromStar(bodies, 'stock.home', t)!;
	return Math.asin(dot(norm({ x: -p.x, y: -p.y, z: -p.z }), up)) * 180 / Math.PI;
};
const noonNear = (t: number): number => {
	let best = t, bestE = -999;
	for (let dt = -11_000; dt <= 11_000; dt += 60) { const e = elevation(t + dt); if (e > bestE) { bestE = e; best = t + dt; } }
	for (let step = 30; step > 0.05; step /= 2) for (const d of [-step, step]) if (elevation(best + d) > bestE) { best += d; bestE = elevation(best); }
	return best;
};
const year = 9_203_393;
let tMax = 0, tMin = 0, tEq = 0, dMax = -9, dMin = 9;
for (let k = 0; k < 4000; k++) { const t = s0.t + 100 + (k / 4000) * year; const d = subSolarLatitude(bodies, 'stock.home', t)!; if (d > dMax) { dMax = d; tMax = t; } if (d < dMin) { dMin = d; tMin = t; } }
// the equinox after the earlier solstice
const a = Math.min(tMax, tMin);
for (let k = 0; k < 4000; k++) { const t = a + (k / 4000) * (year / 2); if (Math.abs(subSolarLatitude(bodies, 'stock.home', t)!) < 0.002) { tEq = t; break; } }
const marks = [['solstice-north', tMax], ['equinox', tEq], ['solstice-south', tMin]].sort((x, y) => (x[1] as number) - (y[1] as number)) as [string, number][];
const results: Record<string, unknown> = { latitudeDeg: lat };
for (const [name, tApprox] of marks) {
	const t = noonNear(tApprox);
	// a pad vessel goes on surface rails after a few seconds at rest; warp-to needs that
	await page.waitForFunction(() => (window as any).__orbital.snapshot().vessels.every((v: any) => v.mode === 'on-rails'), null, { timeout: 60_000 });
	const res = await page.evaluate((time) => (window as any).__orbital.send({ type: 'warp-to', time, factor: 100_000 }), t);
	console.log(name, 'warp-to', JSON.stringify(res), 'now', await page.evaluate(() => (window as any).__orbital.snapshot().t));
	await page.waitForFunction((time) => { const o = (window as any).__orbital; return o.snapshot().t >= time - 1; }, t, { timeout: 180_000, polling: 500 });
	await page.waitForTimeout(2500);
	const got = await page.evaluate(() => { const o = (window as any).__orbital; return { t: o.snapshot().t, elev: o.renderer().debug.info().sunElevationDeg, ms: o.renderer().debug.benchmark(30) }; });
	results[name] = { tNoon: t, predicted: elevation(got.t), rendered: got.elev, benchMs: got.ms, declinationDeg: subSolarLatitude(bodies, 'stock.home', got.t)! * 180 / Math.PI };
	await page.screenshot({ path: `${out}/122-${name}.png` });
}
console.log(JSON.stringify(results, null, 1));
await browser.close();
