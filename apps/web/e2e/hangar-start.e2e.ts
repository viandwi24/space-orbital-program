/** Plan 350 (ADR 0299): the empty Hangar opens with "Start a vessel"; Build my own points at the parts. */
import { expect, test } from '@playwright/test';
import { watchErrors } from './support';

// the suite turns the modal off (playwright.config.ts); this spec starts from a clean profile
test.use({ storageState: { cookies: [], origins: [] } });

test("Start a vessel: Build my own, Escape, a blueprint and Don't show again", async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('/vab');
	const modal = page.getByTestId('vab-start');
	await expect(modal).toBeVisible({ timeout: 60_000 });
	await expect(modal.getByRole('heading', { name: 'Start a vessel' })).toBeVisible();
	await expect(modal.getByText('Recommended').first()).toBeVisible();

	// Build my own closes it and shows the coach mark at the parts list
	await page.getByTestId('vab-build-own').click();
	await expect(modal).toBeHidden();
	await expect(page.getByTestId('vab-coach')).toBeVisible();

	// New brings it back; Escape is Build my own too
	await page.getByTestId('menu-new').click();
	await expect(modal).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(modal).toBeHidden();
	await expect(page.getByTestId('vab-coach')).toBeVisible();

	// a recommended blueprint loads it and ends the coach mark
	await page.getByTestId('menu-new').click();
	await page.getByTestId('vab-start-stock.two-stage').click();
	await expect(modal).toBeHidden();
	await expect(page.getByTestId('vab-coach')).toBeHidden();

	// Don't show this again: an empty Hangar goes straight to the coach mark
	await page.getByTestId('menu-new').click();
	await page.getByTestId('vab-start-hide').check();
	await page.getByTestId('vab-build-own').click();
	await page.reload();
	await expect(page.getByTestId('vab-coach')).toBeVisible({ timeout: 60_000 });
	await expect(modal).toBeHidden();
	expect(errors).toEqual([]);
});
