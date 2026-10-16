/**
 * Smoke suite (plan 032, ADR 0040): the pages load, the two-stage example launches, a script runs
 * in the sandbox, the sandbox reports itself isolated, time warp works while a script runs, and
 * nothing logs an error. One test per concern; each starts a fresh page.
 */
import { expect, test } from '@playwright/test';
import {
	launchTwoStage,
	metSeconds,
	runScript,
	scriptLog,
	scriptStatus,
	watchErrors
} from './support';

test('the start page and the VAB load without errors', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Orbital' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Build a vessel' })).toBeVisible();
	await expect(page.getByTestId('browser-notice')).toHaveCount(0);

	await page.goto('/vab');
	await expect(page.getByRole('button', { name: 'Load the two-stage example' })).toBeVisible();
	await page.getByRole('button', { name: 'Load the two-stage example' }).click();
	await expect(page.getByRole('button', { name: /^Launch/ })).toBeEnabled();
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
	const faster = page.getByRole('button', { name: 'Faster time warp' });
	await expect(faster).toBeEnabled();
	// 1x -> 2x -> 5x -> 10x; the first press waits for the vessel to settle on the pad
	// A machine under load can need longer than the host waits (8 s); pressing again is what a player does.
	for (let attempt = 0; attempt < 3; attempt++) {
		await faster.click();
		const reached = await expect(page.getByTestId('hud-warp'))
			.toHaveText('2x', { timeout: 12_000 })
			.then(
				() => true,
				() => false
			);
		if (reached) break;
	}
	await expect(page.getByTestId('hud-warp')).toHaveText('2x');
	await faster.click();
	await expect(page.getByTestId('hud-warp')).toHaveText('5x');
	await faster.click();
	await expect(page.getByTestId('hud-warp')).toHaveText('10x');

	const before = await metSeconds(page);
	const started = Date.now();
	await page.waitForTimeout(3000);
	const gained = (await metSeconds(page)) - before;
	const wall = (Date.now() - started) / 1000;
	// about 10x real time (tolerant: the HUD shows whole seconds and the machine may be loaded)
	expect(gained).toBeGreaterThan(wall * 5);
	await expect(scriptStatus(page)).toHaveText('running');

	await page.getByRole('button', { name: 'Slower time warp' }).click();
	await page.getByRole('button', { name: 'Slower time warp' }).click();
	await page.getByRole('button', { name: 'Slower time warp' }).click();
	await expect(page.getByTestId('hud-warp')).toHaveText('1x');
	await expect(scriptStatus(page)).toHaveText('running');
	expect(errors).toEqual([]);
});
