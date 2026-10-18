/** The vessel panel (plan 111, ADR 0153): toggle the landing legs from the Parts tab in flight. */
import { expect, test } from '@playwright/test';
import { watchErrors } from './support';

test('toggle the landing legs from the Parts tab', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('/vab');
	await page.getByRole('button', { name: 'Load the moon shot' }).click();
	// the moon shot is heavier than the Legacy pad takes: Shift+Launch flies it directly (ADR 0150)
	await page.getByRole('button', { name: /^Launch/ }).click({ modifiers: ['Shift'] });
	const anyway = page.getByRole('button', { name: 'Launch anyway' });
	if (await anyway.isVisible().catch(() => false)) await anyway.click();
	await page.waitForURL('**/flight');
	await expect(page.getByTestId('hud-met')).toBeVisible({ timeout: 60_000 });

	await page.getByRole('button', { name: 'Vessel panel' }).click();
	await expect(page.getByTestId('vessel-panel')).toBeVisible();
	await page.getByTestId('vessel-tab-parts').click();
	const legs = page.locator('[data-testid$="-setDeployed"]').first();
	await expect(legs).toBeVisible({ timeout: 30_000 });
	const before = await legs.getAttribute('aria-checked');
	await legs.click();
	await expect(legs).not.toHaveAttribute('aria-checked', before ?? '', { timeout: 10_000 });
	expect(errors).toEqual([]);
});
