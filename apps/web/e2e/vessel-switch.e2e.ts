import { expect, test, type Page } from '@playwright/test';
import { debugSetOrbit, launchTwoStage, watchErrors } from './support';

/** Plan 221 (ADR 0208): every vessel keeps a design; `[`/`]` and Fly switch without a reload. */
/** Low orbit, then the two stages: the lower engine and the decoupler. */
async function dropTheStage(page: Page): Promise<void> {
	await launchTwoStage(page);
	await debugSetOrbit(page, { apoapsis: 120_000, periapsis: 120_000 });
	await page
		.locator('canvas')
		.first()
		.click({ position: { x: 10, y: 10 } });
	await page.keyboard.press('Space'); // stage 0: the lower engine
	await expect(page.getByText('Stage 1 fired')).toBeVisible();
	await page.keyboard.press('Space'); // stage 1: the decoupler and the upper engine
	await expect(page.getByText('Stage 2 fired')).toBeVisible();
}

test('] flies the spent stage, [ comes back; no reload', async ({ page }) => {
	const errors = watchErrors(page);
	await dropTheStage(page);
	await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 7));
	const title = page.getByTestId('status-place');
	await expect(title).toHaveText('Two-stage');
	await page.keyboard.press(']');
	await expect(title).toHaveText('Two-stage debris');
	await expect(page.getByTestId('staging')).toBeVisible();
	await page.keyboard.press('[');
	await expect(title).toHaveText('Two-stage');
	expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(7);
	expect(errors).toEqual([]);
});

test('Fly on a vessel that is not the focus opens Flight on it (Mission Center)', async ({
	page
}) => {
	const errors = watchErrors(page);
	await dropTheStage(page);
	// the Mission Center is the Space Center's page action (plan 233)
	await page.getByTestId('nav-space-center').click();
	const anyway = page.getByTestId('leave-anyway');
	if (await anyway.isVisible({ timeout: 3000 }).catch(() => false)) await anyway.click();
	await page.waitForURL('**/space-center');
	await page.getByTestId('nav-mission-center').click();
	await page.waitForURL('**/mission-center');
	const debris = page.locator('[data-testid^="mc-row-vessel:"]').filter({ hasText: 'debris' });
	await debris.first().click({ timeout: 60_000 });
	await page.getByTestId('mc-fly').click();
	await page.waitForURL('**/flight');
	await expect(page.getByTestId('status-place')).toHaveText('Two-stage debris', {
		timeout: 60_000
	});
	expect(errors).toEqual([]);
});
