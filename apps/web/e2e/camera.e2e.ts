import { statSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { debugSetOrbit, launchTwoStage, watchErrors } from './support';

/** Plan 226 (ADR 0226): V cycles the camera modes with a toast, F2 hides the HUD, F10 saves a PNG. */
test('camera modes, hide UI and a screenshot', async ({ page }) => {
	const errors = watchErrors(page);
	const toast = (name: string) =>
		page.locator('.toast').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) });
	await launchTwoStage(page);
	await debugSetOrbit(page, { apoapsis: 100_000, periapsis: 100_000 });
	await page
		.locator('canvas')
		.first()
		.click({ position: { x: 10, y: 10 } });

	// a new world starts in Free: V goes Orbital, Locked, Auto
	for (const name of ['Orbital', 'Locked', 'Auto']) {
		await page.keyboard.press('KeyV');
		await expect(toast(name)).toBeVisible();
	}
	// the toolbar's Change camera is the same action
	await page.getByTestId('tb-camera').click();
	await expect(toast('Free')).toBeVisible();

	// F2: no HUD element is visible; Escape brings it back
	await expect(page.getByTestId('hud-met')).toBeVisible();
	await page.keyboard.press('F2');
	await expect(page.locator('[data-testid^="hud-"]:visible')).toHaveCount(0);
	await expect(page.getByTestId('status-bar')).toBeHidden();
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('hud-met')).toBeVisible();

	// F10: a PNG download named by world and MET, over 10 KB
	const download = page.waitForEvent('download');
	await page.keyboard.press('F10');
	const file = await download;
	expect(file.suggestedFilename()).toMatch(/\.png$/);
	const path = await file.path();
	expect(statSync(path).size).toBeGreaterThan(10_000);
	expect(errors).toEqual([]);
});
