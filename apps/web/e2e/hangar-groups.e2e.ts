/**
 * The Hangar's action group editor (plan 218, ADR 0174 and 0225): on the moon shot the landing legs
 * go into Custom 1; launched, the 1 key (KSP profile) fires the group and the legs deploy.
 */
import { expect, test, type Page } from '@playwright/test';
import { watchErrors, loadHangarExample } from './support';

const legsDeployed = (page: Page) =>
	page.evaluate(() => {
		const v = (
			window as unknown as {
				__orbitalDebug: {
					vessel(): {
						parts: Array<{ definition: string; modules: Record<string, unknown> }>;
					} | null;
				};
			}
		).__orbitalDebug.vessel();
		const legs = v?.parts.find((p) => p.definition === 'stock.landing-legs');
		return (legs?.modules['stock.landing-leg'] as { deployed?: boolean } | undefined)?.deployed;
	});

test('legs in Custom 1 from the Hangar deploy on the 1 key in flight', async ({ page }) => {
	test.setTimeout(180_000);
	const errors = watchErrors(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/vab');
	await page.waitForFunction(() => '__orbitalVab' in window, null, { timeout: 60_000 });
	await loadHangarExample(page, 'loadMoonShot');
	await page.waitForTimeout(800); // the camera frames the vessel

	// the editor opens on Custom 1; the selected legs list their switch
	await page.getByTestId('group-editor-toggle').click();
	await expect(page.getByTestId('group-pick')).toHaveValue('custom.1');
	// the legs sit in no stage: the staging panel's tray selects them (the view hides them behind the engine)
	await page.getByRole('button', { name: 'Landing Legs, no stage' }).click();
	const member = page.getByTestId('group-member-setDeployed');
	await expect(member).toBeVisible();
	await member.check();
	await expect(page.getByTestId('group-status')).toContainText('Custom 1: 1 part');

	await page.getByRole('button', { name: /^Launch/ }).click({ modifiers: ['Shift'] });
	const anyway = page.getByRole('button', { name: 'Launch anyway' });
	if (await anyway.isVisible().catch(() => false)) await anyway.click();
	await page.waitForURL('**/flight');
	await expect(page.getByTestId('hud-met')).toBeVisible({ timeout: 60_000 });
	await page.waitForFunction(() => '__orbitalDebug' in window, null, { timeout: 60_000 });
	expect(await legsDeployed(page)).toBe(false);

	await page
		.locator('canvas')
		.first()
		.click({ position: { x: 20, y: 20 } });
	await page.keyboard.press('Digit1');
	await expect.poll(() => legsDeployed(page), { timeout: 20_000 }).toBe(true);
	expect(errors).toEqual([]);
});
