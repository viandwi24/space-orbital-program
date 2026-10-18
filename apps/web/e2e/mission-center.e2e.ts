import { expect, test } from '@playwright/test';
import { watchErrors } from './support';

/**
 * The Mission Center (plan 113, ADR 0118): from the Space Center's building, a new world's system
 * with its bodies in Tracking, a body's card, and the way back.
 */
test('open the Mission Center from its building and select a body', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('/worlds');
	await page.getByTestId('worlds-create').click();
	const form = page.getByTestId('create-world');
	await form.getByTestId('world-name').fill('Planners');
	await form.getByTestId('world-create').click();
	await page.getByTestId('world-enter').click();
	await page.waitForURL('**/space-center');
	await page.getByTestId('sc-label-stock.mission-center').click({ timeout: 60_000 });
	await page.getByTestId('sc-open').click();
	await page.waitForURL('**/mission-center');
	await expect(page.getByTestId('world-capsule')).toContainText('Planners');
	const rows = page.locator('[data-testid^="mc-row-body:"]');
	// the Sun, the home planet and its moon (plan 122)
	await expect(rows).toHaveCount(3, { timeout: 60_000 });
	// a world without a flight: nothing to fly, nothing scheduled
	await expect(page.getByTestId('mc-tab-map')).toBeDisabled();
	await page.getByTestId('mc-row-body:stock.cinder').click();
	await expect(page.getByTestId('mc-card')).toContainText('Moon of Home');
	await page.getByTestId('mc-filter').getByText('Relays').click();
	await expect(page.getByTestId('mc-tracking')).toContainText('No relays yet');

	// comms planning (plan 118, ADR 0163): answered by the planning Worker
	await page.getByTestId('mc-planning-toggle').click();
	const planning = page.getByTestId('mc-planning');
	await expect(planning).toContainText('No vessel with an antenna');
	await planning.getByTestId('mc-planning-tab').getByText('Constellation').click();
	await planning.getByTestId('mc-plan-constellation').click();
	await expect(planning.getByTestId('mc-const-plan')).toContainText('4/3 of the target');
	await expect(planning.getByTestId('mc-const-plan')).toContainText('120°');
	await planning.getByTestId('mc-const-side').selectOption('below');
	await planning.getByTestId('mc-const-altitude').fill('100');
	await planning.getByTestId('mc-plan-constellation').click();
	await expect(planning.getByTestId('mc-plan-error')).toContainText('deploy from above');
	await planning.getByTestId('mc-planning-tab').getByText('Coverage').click();
	await planning.getByTestId('mc-plan-coverage').click();
	await expect(planning.getByTestId('mc-cover-mean')).toContainText('Covered', { timeout: 30_000 });
	// a new world has no relays: the ground station sees only its horizon
	await expect(planning.getByTestId('mc-cover-none')).toBeVisible();
	await planning.getByTestId('mc-planning-close').click();
	await expect(planning).toBeHidden();
	await page.getByTestId('mc-home').click();
	await page.waitForURL('**/space-center');
	expect(errors).toEqual([]);
});
