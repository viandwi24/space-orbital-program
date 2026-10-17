/**
 * Screenshots of the menus and public pages for plan 089's review (Home, Settings, Mods, Credits,
 * Roadmap at 1920x1080; Home at 1024x768). Playwright's bundled Chromium, against a running dev
 * server or build:
 *
 *   SHOT_URL=http://localhost:5211 bun scripts/capture-menus.ts
 *
 * A world is created first so Home shows Continue and the last-world card.
 * Output: `docs/journal/assets/089-<page>-<height>.png`.
 */
import { chromium, type Page } from '@playwright/test';
import { join } from 'node:path';

const base = process.env.SHOT_URL ?? 'http://localhost:5211';
const out = process.env.SHOT_OUT ?? join(import.meta.dir, '../../../docs/journal/assets');

async function shot(page: Page, name: string): Promise<void> {
	await page.waitForTimeout(800);
	const h = page.viewportSize()!.height;
	await page.screenshot({ path: join(out, `089-${name}-${h}.png`) });
	console.log(`  ${name}-${h}`);
}

const browser = await chromium.launch();
for (const size of [
	{ width: 1920, height: 1080 },
	{ width: 1024, height: 768 }
]) {
	console.log(`${size.width}x${size.height}`);
	const context = await browser.newContext({ viewport: size, baseURL: base });
	const page = await context.newPage();
	page.on('pageerror', (e) => console.log('  pageerror', e.message));
	await page.goto('/worlds');
	await page.getByTestId('worlds-create').click();
	await page.locator('dialog[open]').getByRole('button', { name: 'Create world' }).click();
	await page.getByTestId('world-card').first().waitFor();
	await page.goto('/');
	await page.getByTestId('last-world').waitFor();
	await shot(page, 'home');
	if (size.height === 1080) {
		await page.getByTestId('menu-settings').click();
		await shot(page, 'settings');
		for (const path of ['mods', 'credits', 'roadmap']) {
			await page.goto(`/${path}`);
			await shot(page, path);
		}
	}
	await context.close();
}
await browser.close();
