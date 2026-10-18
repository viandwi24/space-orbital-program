/**
 * Plan 115's screenshots (ADR 0158): the link badge of the two-stage example (no antenna) and of a
 * probe on the pad (linked), the vessel panel's Comms tab, and the Network layer in map view with a
 * second probe in orbit. Against a `NODE_ENV=development` build (the `__orbital` hook) served by
 * `scripts/serve.ts`:
 *
 *   bun scripts/serve.ts 5211 &  SHOT_URL=http://localhost:5211 bun scripts/capture-comms.ts <folder>
 */
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? '.';
const DRAFT_KEY = 'orbital.design';
const base = process.env.SHOT_URL ?? 'http://localhost:5211';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage({
	viewport: { width: 1440, height: 900 },
	deviceScaleFactor: 1
});
await page.addInitScript(() => localStorage.setItem('orbital.graphics', 'low'));
await page.goto(base + '/vab');
await page.getByRole('button', { name: 'Load the two-stage example' }).click();
await page
	.getByRole('button', { name: /^Launch/ })
	.first()
	.click();
const anyway = page.getByRole('button', { name: 'Launch anyway' });
if (await anyway.isVisible({ timeout: 2000 }).catch(() => false)) await anyway.click();
await page.waitForURL('**/launch');
await page.getByTestId('launch-go').click();
await page.waitForURL('**/flight');
await page.getByTestId('hud-link').waitFor({ timeout: 90_000 });
await page.waitForTimeout(3000);
console.log('badge:', await page.getByTestId('hud-link').innerText());
await page.screenshot({ path: `${out}/115-badge-no-antenna.png` });
// a probe core (its own whip antenna) from the pad: linked to the site's station
await page.evaluate((key) => {
	const design = {
		formatVersion: 1,
		name: 'Probe',
		parts: [{ index: 0, part: 'stock.probe-core', parent: null }],
		stages: []
	};
	localStorage.setItem(key, JSON.stringify(design));
}, DRAFT_KEY);
await page.goto(base + '/launch');
await page.getByTestId('launch-go').click();
await page.waitForURL('**/flight');
await page.getByTestId('hud-link').waitFor({ timeout: 90_000 });
await page.waitForTimeout(4000);
console.log('badge:', await page.getByTestId('hud-link').innerText());
await page.screenshot({ path: `${out}/115-badge-linked.png` });
// a second probe in a 100 km circular orbit, for the Network layer
await page.evaluate(async () => {
	const o = (window as any).__orbital;
	const s = o.snapshot();
	const v = s.vessels[0];
	const n = Math.hypot(v.position.x, v.position.y, v.position.z);
	const r = 700_000;
	const p = { x: (v.position.x / n) * r, y: (v.position.y / n) * r, z: (v.position.z / n) * r };
	const c = { x: p.z, y: 0, z: -p.x };
	const cn = Math.hypot(c.x, c.y, c.z);
	const speed = Math.sqrt(3.5316e12 / r);
	const velocity = { x: (c.x / cn) * speed, y: 0, z: (c.z / cn) * speed };
	const design = {
		formatVersion: 1,
		name: 'Relay',
		parts: [{ index: 0, part: 'stock.probe-core', parent: null }],
		stages: []
	};
	return o.send({
		type: 'load-vessel',
		design,
		placement: { kind: 'state', body: 'stock.home', position: p, velocity }
	});
});
await page.waitForTimeout(3000);
await page.getByRole('button', { name: 'Vessel panel' }).click();
await page.getByTestId('vessel-tab-comms').click();
await page.getByTestId('vessel-comms').waitFor();
console.log(
	'comms tab:',
	(await page.getByTestId('vessel-comms').innerText()).replace(/\n+/g, ' | ')
);
await page.screenshot({ path: `${out}/115-comms-tab.png` });
await page.getByRole('button', { name: 'Vessel panel' }).click();
await page.keyboard.press('KeyM');
await page.waitForTimeout(4000);
console.log('network lines:', await page.locator('[data-testid=network-layer] line').count());
await page.screenshot({ path: `${out}/115-network-map.png` });
await browser.close();
