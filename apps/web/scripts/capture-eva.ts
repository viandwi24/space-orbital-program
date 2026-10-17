/**
 * Plan 109's EVA screenshot (ADR 0120): launches, then through the dev hook hires a pilot, lands a
 * crewed pod on the moon, steps out, walks a few metres, plants a flag and writes
 * `109-eva-moon.png` to the folder given. Against a `NODE_ENV=development` build:
 *
 *   SHOT_URL=http://localhost:5202 bun scripts/capture-eva.ts <folder>
 */
import { chromium } from '@playwright/test';
const out = process.argv[2] ?? '.';
const base = process.env.SHOT_URL ?? 'http://localhost:5202';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await page.addInitScript(() => { localStorage.setItem('orbital.graphics', 'high'); localStorage.setItem('orbital.graphics.auto', 'off'); });
await page.goto(base + '/vab');
const example = page.getByRole('button', { name: /Load the two-stage example/ });
await example.waitFor({ timeout: 60_000 });
await example.click();
await page.getByRole('button', { name: /^Launch/ }).first().click();
const anyway = page.getByRole('button', { name: 'Launch anyway' });
if (await anyway.isVisible({ timeout: 2000 }).catch(() => false)) await anyway.click();
await page.waitForURL('**/flight**');
await page.waitForFunction(() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0, null, { timeout: 90_000 });
await page.waitForTimeout(2000);
const r = await page.evaluate(async () => {
	const o = (window as any).__orbital;
	await o.send({ type: 'crew-hire', profession: 'pilot' });
	const design = { formatVersion: 1, name: 'Lander', parts: [{ index: 0, part: 'stock.command-pod', parent: null }, { index: 1, part: 'stock.landing-legs', parent: { index: 0, parentNode: 'bottom', node: 'top' } }], stages: [] };
	const pod = await o.send({ type: 'load-vessel', design, placement: { kind: 'surface', body: 'stock.cinder', latitude: 0.1, longitude: 0.5 }, crew: [{ member: 'c1', part: 0 }] });
	if (!pod.ok) return pod;
	o.renderer().setActiveVessel(pod.vessel);
	await new Promise((r) => setTimeout(r, 4000));
	const suit = await o.send({ type: 'crew-eva', vessel: pod.vessel, member: 'c1' });
	if (!suit.ok) return suit;
	o.renderer().setActiveVessel(suit.vessel);
	await new Promise((r) => setTimeout(r, 2500));
	await o.send({ type: 'crew-walk', vessel: suit.vessel, heading: Math.PI / 2, speed: 1.5 });
	await new Promise((r) => setTimeout(r, 2500));
	await o.send({ type: 'crew-walk', vessel: suit.vessel, heading: 0, speed: 0 });
	await new Promise((r) => setTimeout(r, 1500));
	const flag = await o.send({ type: 'plant-flag', vessel: suit.vessel });
	o.renderer().orbitCamera({ zoomFactor: 0.35, dYaw: 0.6, dPitch: -0.15 });
	return { pod, suit, flag };
});
console.log(JSON.stringify(r));
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/109-eva-moon.png` });
await browser.close();
