/**
 * Smoke suite (plan 032, ADR 0040): the pages load, the two-stage example launches, a script runs
 * in the sandbox, the sandbox reports itself isolated, time warp works while a script runs, and
 * nothing logs an error. One test per concern; each starts a fresh page.
 */
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
	launchTwoStage,
	metSeconds,
	runScript,
	scriptLog,
	scriptStatus,
	watchErrors
} from './support';

const repo = fileURLToPath(new URL('../../../', import.meta.url));

test('the start page and the VAB load without errors', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('/');
	// the product name (plan 074, ADR 0105)
	await expect(page).toHaveTitle(/^Space Orbital Program: /);
	await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible();
	await expect(page.getByRole('link', { name: /New flight/ })).toBeVisible();
	await expect(page.getByTestId('menu-continue')).toBeDisabled();
	await expect(page.getByTestId('browser-notice')).toHaveCount(0);

	await page.goto('/vab');
	await expect(page.getByRole('button', { name: 'Load the two-stage example' })).toBeVisible();
	await page.getByRole('button', { name: 'Load the two-stage example' }).click();
	await expect(page.getByRole('button', { name: /^Launch/ })).toBeEnabled();
	expect(errors).toEqual([]);
});

test('keyboard only (plan 089): Tab to Settings, open it, Escape returns focus to the menu', async ({
	page,
	browserName
}) => {
	// WebKit on macOS moves to buttons and links with Alt+Tab, as Safari does by default
	const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
	const errors = watchErrors(page);
	await page.goto('/');
	await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible();
	const settings = page.getByTestId('menu-settings');
	for (let i = 0; i < 20 && !(await settings.evaluate((el) => el === document.activeElement)); i++)
		await page.keyboard.press(tab);
	await expect(settings).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden();
	await expect(settings).toBeFocused();
	expect(errors).toEqual([]);
});

test('the main menu: settings persist across a reload, roadmap and credits load', async ({
	page
}) => {
	const errors = watchErrors(page);
	await page.goto('/');
	await page.getByTestId('menu-settings').click();
	const dialog = page.getByRole('dialog', { name: 'Settings' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('tab', { name: 'Game' }).click();
	await dialog.getByRole('radio', { name: 'Imperial' }).click();
	await dialog.getByRole('tab', { name: 'Graphics' }).click();
	await dialog.getByRole('radio', { name: 'Low' }).click();
	await dialog.getByRole('button', { name: 'Done' }).click();
	await page.reload();
	await page.getByTestId('menu-settings').click();
	await expect(page.getByRole('radio', { name: 'Low' })).toBeChecked();
	await page.getByRole('tab', { name: 'Game' }).click();
	await expect(page.getByRole('radio', { name: 'Imperial' })).toBeChecked();
	await page.keyboard.press('Escape');

	await page.goto('/roadmap');
	await expect(page.getByRole('heading', { name: 'Roadmap' })).toBeVisible();
	// Plan 076: the foundation roadmap by phase, in order (ADR 0108).
	await expect(page.locator('section.phase > h2')).toHaveText([
		'Product',
		'Foundation',
		'Worlds and Space Center',
		'Career',
		'Network and control',
		'Time and the real sky',
		'Living world'
	]);
	await page.goto('/credits');
	await expect(page.getByRole('heading', { name: 'Credits' })).toBeVisible();
	// Plan 075: the game's licence is decided (ADR 0106).
	await expect(page.getByText('Apache License, Version 2.0')).toBeVisible();
	await expect(page.getByText('To be decided')).toHaveCount(0);
	await page.goto('/no-such-page');
	await expect(page.getByTestId('error-screen')).toBeVisible();
	expect(errors.filter((e) => !/404/.test(e))).toEqual([]);
});

test('a mod installs from a file and its part appears in the hangar (plan 046, CSP)', async ({
	page
}) => {
	const errors = watchErrors(page);
	// `dist/` is not committed: build the sample package the way the README says.
	execFileSync('bun', ['run', 'tools/mod-build/build-mod.ts', 'examples/mod-sample'], {
		cwd: repo
	});
	await page.goto('/mods');
	await page
		.getByLabel('Mod package file')
		.setInputFiles(`${repo}examples/mod-sample/dist/sample-1.0.0.orbital-mod.json`);
	await expect(page.getByRole('dialog', { name: 'Install this mod?' })).toBeVisible();
	await page.getByRole('button', { name: 'Trust and install' }).click();
	await page.getByRole('button', { name: 'Reload to apply' }).click();
	await expect(page.getByText('Sample mod').first()).toBeVisible();
	await page.goto('/vab');
	await page.getByPlaceholder('Search parts').fill('beacon');
	await expect(page.getByText('Sample Telemetry Beacon').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('the capability gate shows the notice instead of the game when WebGL2 is missing', async ({
	page
}) => {
	await page.addInitScript(() => {
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
	await page.goto('/vab');
	const notice = page.getByTestId('browser-notice');
	await expect(notice).toBeVisible();
	await expect(notice).toContainText('WebGL 2');
	await expect(page.getByRole('button', { name: 'Load the two-stage example' })).toHaveCount(0);
});

test('launch, run the sample: liftoff, climbing, sandbox isolated, no errors', async ({ page }) => {
	const errors = watchErrors(page);
	await launchTwoStage(page);
	await runScript(page, 'sample');
	await expect(scriptStatus(page)).toHaveText('running', { timeout: 60_000 });
	await expect(scriptLog(page)).toContainText('liftoff', { timeout: 60_000 });

	// above 1 km within 60 s of real time (the HUD shows metres or km)
	await expect
		.poll(
			async () => {
				const text = await page.getByTestId('hud-altitude').locator('..').innerText();
				const match = /([\d.,]+)\s*(km|m)\b/.exec(text.replace(/\s+/g, ' '));
				if (!match) return 0;
				return Number(match[1]!.replace(/,/g, '')) * (match[2] === 'km' ? 1000 : 1);
			},
			{ timeout: 60_000, intervals: [1000] }
		)
		.toBeGreaterThan(1000);

	// the sandbox: "Runs isolated" and every probe blocked in both contexts
	await expect(page.getByTestId('sandbox-note')).toContainText('Runs isolated');
	await page.getByTestId('sandbox-report').locator('summary').click();
	const probes = page.getByTestId('sandbox-report').locator('.probe');
	await expect(probes).toHaveCount(10);
	for (const text of await probes.allInnerTexts()) expect(text).toMatch(/(blocked|isolated)$/);
	await expect(page.getByTestId('sandbox-report')).toContainText('opaque');

	await page.getByRole('button', { name: 'Stop' }).click();
	await expect(scriptStatus(page)).toHaveText('stopped');
	expect(errors).toEqual([]);
});

test('time warp works while a script holds an attitude (ADR 0039)', async ({ page }) => {
	const errors = watchErrors(page);
	await launchTwoStage(page);
	// a new, tiny, non-zero attitude demand every tick: before plan 032 this kept the vessel awake
	await runScript(
		page,
		`let n = 0;\nwhile (true) { ship.attitude = { pitch: 0.001 + 1e-6 * n++ }; await nextTick(); }`
	);
	await expect(scriptStatus(page)).toHaveText('running', { timeout: 60_000 });
	// the time bar's segments (plan 233, BASE_LAYOUT §2): one button per warp level
	const level = (x: string) => page.getByRole('button', { name: `Time warp ${x}`, exact: true });
	await expect(level('2×')).toBeEnabled();
	// 1x -> 2x -> 4x -> 10x (plan 206 levels); the first press waits for the vessel to settle on the pad
	// A machine under load can need longer than the host waits (8 s); pressing again is what a player does.
	for (let attempt = 0; attempt < 3; attempt++) {
		await level('2×').click();
		const reached = await expect(page.getByTestId('hud-warp'))
			.toHaveText('2×', { timeout: 12_000 })
			.then(
				() => true,
				() => false
			);
		if (reached) break;
	}
	await expect(page.getByTestId('hud-warp')).toHaveText('2×');
	await level('4×').click();
	await expect(page.getByTestId('hud-warp')).toHaveText('4×');
	await level('10×').click();
	await expect(page.getByTestId('hud-warp')).toHaveText('10×');

	const before = await metSeconds(page);
	const started = Date.now();
	await page.waitForTimeout(3000);
	const gained = (await metSeconds(page)) - before;
	const wall = (Date.now() - started) / 1000;
	// about 10x real time (tolerant: the HUD shows whole seconds and the machine may be loaded)
	expect(gained).toBeGreaterThan(wall * 5);
	await expect(scriptStatus(page)).toHaveText('running');

	// The keyboard path (plan 023: journal 043 could not exercise it): `,` and `.` step the warp.
	await page.keyboard.press(',');
	await expect(page.getByTestId('hud-warp')).toHaveText('4×');
	await page.keyboard.press('.');
	await expect(page.getByTestId('hud-warp')).toHaveText('10×');
	await level('1×').click();
	await expect(page.getByTestId('hud-warp')).toHaveText('1×');
	await expect(scriptStatus(page)).toHaveText('running');
	expect(errors).toEqual([]);
});
