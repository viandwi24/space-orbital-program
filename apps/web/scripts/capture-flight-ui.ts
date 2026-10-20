/**
 * The Flight look check (plan 256): the vessel panel's Parts tab, the dock with the Script panel
 * open and the map's tabs, at 1440 x 900. Against a dev server:
 *
 *   SHOT_TAG=after SHOT_URL=http://localhost:5231 bun scripts/capture-flight-ui.ts
 *
 * Output: `docs/journal/assets/256-<tag>-{vessel,dock,map}.jpg`.
 */
import { chromium } from '@playwright/test';
import { join } from 'node:path';

const base = process.env.SHOT_URL ?? 'http://localhost:5231';
const tag = process.env.SHOT_TAG ?? 'after';
const out = process.env.SHOT_OUT ?? join(import.meta.dir, '../../../docs/journal/assets');

const browser = await chromium.launch({
	headless: false,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
});
const context = await browser.newContext({
	viewport: { width: 1440, height: 900 },
	deviceScaleFactor: 1,
	baseURL: base
});
const page = await context.newPage();
page.on('pageerror', (e) => console.log('  pageerror', e.message));
const shot = (name: string) =>
	page.screenshot({ path: join(out, `256-${tag}-${name}.jpg`), type: 'jpeg', quality: 88 });

await page.goto('/vab');
await page.getByRole('button', { name: 'Load the booster rocket' }).click();
await page.waitForTimeout(1500);
await page.goto('/flight');
await page.waitForFunction(
	() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0,
	null,
	{
		timeout: 180_000
	}
);
await page.waitForTimeout(4000);

// the vessel panel, Parts tab
await page.getByRole('button', { name: 'Vessel panel' }).click();
await page.getByTestId('vessel-tab-parts').click();
await page.waitForTimeout(600);
await shot('vessel');

// the dock with the Script panel (a tall panel): the rail keeps its own height
await page.getByRole('button', { name: 'Vessel panel' }).click();
await page.getByTestId('dock-tab-host.script').click();
await page.waitForTimeout(800);
await shot('dock');

// the map and its tabs on the bars' row
await page.getByRole('link', { name: 'Map' }).first().click();
await page.waitForTimeout(2500);
await shot('map');
await browser.close();
