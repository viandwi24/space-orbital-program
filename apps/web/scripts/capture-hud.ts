/**
 * Screenshots of the flight HUD for plan 088's review (pad, map, orbit at 1920x1080; the pad at
 * 1024x768). Playwright's bundled Chromium (software WebGL), one page at a time, against a running
 * dev server or build:
 *
 *   SHOT_URL=http://localhost:5211 SHOT_SAVES=/path/to/saves bun scripts/capture-hud.ts
 *
 * `SHOT_SAVES` holds `orbit.json` from `bun packages/sim/test/release-saves.tool.ts <folder>`.
 * Output: `docs/journal/assets/088-<scene>-<height>.png`.
 */
import { chromium, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.SHOT_URL ?? 'http://localhost:5211';
const out = process.env.SHOT_OUT ?? join(import.meta.dir, '../../../docs/journal/assets');
const saves = process.env.SHOT_SAVES ?? '';

async function shot(page: Page, name: string): Promise<void> {
	await page.waitForTimeout(1500);
	const h = page.viewportSize()!.height;
	await page.screenshot({ path: join(out, `088-${name}-${h}.png`) });
	console.log(`  ${name}-${h}`);
}

async function launchTwoStage(page: Page): Promise<void> {
	await page.goto('/vab');
	await page.getByRole('button', { name: 'Load the two-stage example' }).click();
	await page.getByRole('button', { name: /^Launch/ }).click();
	const anyway = page.getByRole('button', { name: 'Launch anyway' });
	if (await anyway.isVisible().catch(() => false)) await anyway.click();
	await page.waitForURL('**/flight');
	await page.getByTestId('hud-met').waitFor({ timeout: 90_000 });
	await page.waitForTimeout(6000);
	// the first-flight guide covers the top left; skip it so the HUD itself is reviewed
	const skip = page.getByTestId('tutorial-skip');
	if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function openSave(page: Page, file: string): Promise<void> {
	await page.goto('/');
	await page.getByTestId('menu-load').click();
	await page.locator('dialog[open] input[type=file]').setInputFiles({
		name: `${file}.json`,
		mimeType: 'application/json',
		buffer: Buffer.from(readFileSync(join(saves, `${file}.json`), 'utf8'))
	});
	await page.getByText(/^Imported/).waitFor();
	await page.locator('dialog[open]').getByRole('button', { name: 'Load', exact: true }).first().click();
	await page.waitForURL('**/flight?load=*');
	await page.getByTestId('hud-met').waitFor({ timeout: 90_000 });
	await page.waitForTimeout(6000);
}

const browser = await chromium.launch({
	args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
});
for (const size of [
	{ width: 1920, height: 1080 },
	{ width: 1024, height: 768 }
]) {
	console.log(`${size.width}x${size.height}`);
	const context = await browser.newContext({ viewport: size, baseURL: base });
	const page = await context.newPage();
	page.on('pageerror', (e) => console.log('  pageerror', e.message));
	await launchTwoStage(page);
	await shot(page, 'pad');
	if (size.height === 1080) {
		await page.keyboard.press('m');
		await shot(page, 'map');
		if (saves) {
			await openSave(page, 'orbit');
			await shot(page, 'orbit');
		}
	}
	await context.close();
}
await browser.close();
