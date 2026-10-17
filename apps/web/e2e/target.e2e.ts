/**
 * Target markers and rendezvous aids (plan 057): choosing a target in the card puts its label (or an
 * edge arrow) in the flight view and its marker on the map, and the card lists the aids, each
 * saying why it is not available on the pad.
 */
import { expect, test } from '@playwright/test';
import { launchTwoStage, watchErrors } from './support';

test('a target gets a flight-view indicator, a map marker and the aids list', async ({ page }) => {
	const errors = watchErrors(page);
	await launchTwoStage(page);
	// the Target card is a dock panel (plan 112)
	await page.getByTestId('dock-tab-host.target').click();
	await page.getByTestId('target-select').selectOption({ label: 'Cinder' });
	await expect(page.getByTestId('target-distance')).toBeVisible();
	// The indicator is a label when the moon is in view and an arrow with a label when it is not.
	const label = page.locator('[data-testid=target-flight-label], [data-testid=target-arrow-label]');
	await expect(label.filter({ hasText: 'Cinder' }).first()).toBeVisible();
	// The aids: all five, none usable on the pad, with the reason.
	await expect(page.getByTestId('aid-hohmann')).toBeDisabled();
	await expect(page.getByTestId('aid-match')).toBeDisabled();
	await expect(page.getByText('The vessel is on the ground.').first()).toBeVisible();
	// The map view shows the marker with the target's name.
	await page.keyboard.press('m');
	await expect(page.getByTestId('target-marker')).toContainText('Cinder');
	expect(errors).toEqual([]);
});
