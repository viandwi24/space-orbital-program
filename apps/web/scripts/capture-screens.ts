/**
 * Screenshots of every screen at 1920x1080 and 1280x720 for the release review (plan 023,
 * journal 023). Playwright's bundled Chromium (software WebGL), one page at a time, against a
 * built copy of the game that is already being served:
 *
 *   SHOT_URL=http://localhost:5213 SHOT_SAVES=/path/to/saves bun scripts/capture-screens.ts [1080|720]
 *
 * `SHOT_SAVES` is a folder with the generated flights (`ascent`, `orbit`, `moon-orbit`
 * as `.json` game saves); they are imported through the real Load dialog. Output:
 * `docs/journal/assets/023-<screen>-<height>.jpg`.
 */
import { chromium, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.SHOT_URL ?? 'http://localhost:5213';
const out = process.env.SHOT_OUT ?? join(import.meta.dir, '../../../docs/journal/assets');
const saves = process.env.SHOT_SAVES ?? '';
const only = process.argv[2];
const SIZES = [
	{ w: 1920, h: 1080 },
	{ w: 1280, h: 720 }
].filter((s) => !only || String(s.h) === only);

async function shot(page: Page, name: string, h: number): Promise<void> {
	await page.waitForTimeout(400);
	await page.screenshot({ path: join(out, `023-${name}-${h}.jpg`), type: 'jpeg', quality: 82 });
	console.log(`  ${name}-${h}`);
}

async function importSave(page: Page, file: string): Promise<void> {
	await page.goto('/');
	await page.getByTestId('menu-load').click();
	const text = readFileSync(join(saves, `${file}.json`), 'utf8');
	await page.locator('dialog[open] input[type=file]').setInputFiles({
		name: `${file}.json`,
		mimeType: 'application/json',
		buffer: Buffer.from(text)
	});
	await page.getByText(/^Imported/).waitFor();
}

async function openFlight(page: Page, file: string): Promise<void> {
	await importSave(page, file);
	await page.keyboard.press('Escape');
	await page.getByTestId('menu-continue').click();
	await page.waitForURL('**/flight?load=*');
	await page.getByTestId('hud-met').waitFor({ timeout: 90_000 });
	await page.waitForTimeout(2500);
}

const browser = await chromium.launch({
	args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
});
for (const { w, h } of SIZES) {
	console.log(`${w}x${h}`);
	const context = await browser.newContext({ viewport: { width: w, height: h }, baseURL: base });
	const page = await context.newPage();
	page.on('pageerror', (e) =>
		console.log('  pageerror', (e.stack ?? e.message).split('\n').slice(0, 6).join(' | '))
	);

	// Menus and public pages
	await page.goto('/');
	await page.getByRole('navigation', { name: 'Main menu' }).waitFor();
	await shot(page, 'menu', h);
	await page.getByTestId('menu-settings').click();
	await shot(page, 'settings-graphics', h);
	await page.getByRole('tab', { name: 'Game' }).click();
	await shot(page, 'settings-game', h);
	await page.getByRole('tab', { name: 'Controls' }).click();
	await shot(page, 'settings-controls', h);
	await page.getByRole('tab', { name: 'Audio' }).click();
	await shot(page, 'settings-audio', h);
	await page.keyboard.press('Escape');
	await page.getByTestId('menu-load').click();
	await shot(page, 'load-empty', h);
	await page.keyboard.press('Escape');
	for (const [route, name] of [
		['/credits', 'credits'],
		['/roadmap', 'roadmap'],
		['/mods', 'mods'],
		['/no-such-page', 'error']
	] as const) {
		await page.goto(route);
		await shot(page, name, h);
	}

	// Building
	await page.goto('/vab');
	await page.getByRole('button', { name: 'Load the two-stage example' }).waitFor();
	await shot(page, 'vab-empty', h);
	await page.getByRole('button', { name: 'Load the two-stage example' }).click();
	await page.waitForTimeout(1500);
	await shot(page, 'vab-built', h);
	await page.goto('/vab?library');
	await page.getByRole('dialog', { name: 'Vessel library' }).waitFor();
	await shot(page, 'vab-library', h);
	await page.keyboard.press('Escape');

	// Loading screen: the first paint of the flight page
	await page.goto('/flight', { waitUntil: 'commit' });
	await page.getByTestId('loading-screen').waitFor();
	await shot(page, 'loading', h);

	// Flight on the pad and on the way up
	await page.getByTestId('hud-met').waitFor({ timeout: 90_000 });
	await page.waitForTimeout(2500);
	await shot(page, 'flight-pad', h);
	await page.keyboard.press('z');
	await page.keyboard.press('Space');
	await page.waitForTimeout(9000);
	await shot(page, 'flight-ascent', h);
	await page.getByRole('button', { name: 'Script panel' }).click();
	await page.getByRole('button', { name: 'Load sample' }).click();
	await shot(page, 'flight-script', h);
	await page.getByRole('button', { name: 'Script panel' }).click();
	await page.keyboard.press('Escape');
	await page.getByRole('dialog', { name: 'Paused' }).waitFor();
	await shot(page, 'pause', h);
	await page.getByTestId('pause-settings').click();
	await shot(page, 'settings-from-pause', h);
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Save the flight' }).click();
	await shot(page, 'save-dialog', h);
	await page.keyboard.press('Escape');
	await page.keyboard.press('Escape');
	await page.keyboard.press('?');
	await shot(page, 'controls', h);
	await page.keyboard.press('Escape');

	// Generated flights
	if (saves) {
		for (const [file, name] of [
			['ascent', 'flight-ascent-12km'],
			['orbit', 'flight-orbit'],
			['moon-orbit', 'flight-moon-orbit']
		] as const) {
			await openFlight(page, file);
			await shot(page, name, h);
			if (file === 'orbit' || file === 'moon-orbit') {
				await page.keyboard.press('m');
				await page.waitForTimeout(1500);
				await shot(page, `${name}-map`, h);
			}
		}
		await page.goto('/');
		await page.getByTestId('menu-load').click();
		await shot(page, 'load-saves', h);
	}

	// A browser without WebGL 2
	const bare = await browser.newContext({ viewport: { width: w, height: h }, baseURL: base });
	const p2 = await bare.newPage();
	await p2.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (
			this: HTMLCanvasElement,
			type: string,
			...rest: unknown[]
		) {
			if (type === 'webgl2') return null;
			return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
		} as typeof original;
	});
	await p2.goto('/');
	await p2.getByTestId('browser-notice').waitFor();
	await shot(p2, 'browser-notice', h);
	await bare.close();
	await context.close();
}
await browser.close();
