/**
 * The trip planner of the VAB (plan 034): the moon shot covers a landing on the stock moon, the
 * two-stage example does not, and the legs name the stages. One short run, one engine.
 */
import { expect, test } from '@playwright/test';
import { watchErrors, loadHangarExample } from './support';

test('the trip planner lays the legs over the stages', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('/vab');
	await loadHangarExample(page, 'loadMoonShot');
	const pick = page.getByLabel('Destination for the trip plan');
	await expect(pick.locator('option')).toHaveCount(6);
	await pick.selectOption('stock.cinder:landing');
	await expect(page.locator('.trip .note')).toContainText('Enough for the trip');
	await page.locator('.legs summary').click();
	await expect(page.locator('.legs li')).toHaveCount(4);
	await expect(page.locator('.legs li').first()).toContainText('Stage 1 (sea level)');
	await expect(page.locator('.legs li').last()).toContainText('Land on Cinder');

	// A new vessel and the two-stage example: short of the moon, enough for low orbit.
	await page.getByTestId('menu-new').click();
	await loadHangarExample(page, 'loadTwoStage');
	await expect(page.locator('.trip .note')).toContainText('Short by about');
	await pick.selectOption('low-orbit');
	await expect(page.locator('.trip .note')).toContainText('Enough for the trip');
	expect(errors).toEqual([]);
});
