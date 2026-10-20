import { expect, test } from '@playwright/test';
import { launchTwoStage, watchErrors } from './support';

/** Plan 132 (ADR 0113 point 6): in a Career world, recover a vessel on the pad; the funds rise by its credit. */
const fundsOf = (text: string): number => Number(text.replace(/[^0-9.]/g, ''));

test('recover on the pad in a Career world credits the funds', async ({ page }) => {
	test.skip(test.info().project.name !== 'chromium', 'one engine is enough for the HUD flow');
	const errors = watchErrors(page);
	await page.goto('/worlds');
	await page.getByTestId('worlds-create').click();
	const form = page.getByTestId('create-world');
	await form.getByTestId('world-name').fill('Recoverers');
	await form.getByRole('radio', { name: 'Career', exact: true }).click();
	await form.getByTestId('world-create').click();
	await page.getByTestId('world-enter').click();
	await page.waitForURL('**/space-center');

	await launchTwoStage(page);
	const funds = page.getByTestId('hud-funds');
	await expect(funds).toBeVisible({ timeout: 60_000 });
	const recover = page.getByTestId('hud-recover');
	await expect(recover).toBeVisible({ timeout: 60_000 });
	const before = fundsOf(await funds.innerText());
	await recover.click();
	const lines = page.getByTestId('recover-lines');
	// on the pad the factor is 100 % (plan 223's distance curve; 98 % is the Space Center's)
	await expect(lines).toContainText('100 %');
	const credit = fundsOf(await lines.locator('dd').last().innerText());
	expect(credit).toBeGreaterThan(0);
	await page.getByTestId('recover-confirm').click();
	await page.waitForURL('**/vab');

	// the next flight resumes the world's newest save (plan 108): its funds carry the credit
	// the Hangar still holds the design: launch it again
	await page.getByRole('button', { name: /^Launch/ }).click();
	const anyway = page.getByRole('button', { name: 'Launch anyway' });
	if (await anyway.isVisible().catch(() => false)) await anyway.click();
	await page.waitForURL('**/launch');
	await page.getByTestId('launch-go').click();
	await page.waitForURL('**/flight');
	await expect(funds).toBeVisible({ timeout: 60_000 });
	// the second launch pays the vessel's price again: on the pad the recovery factor is 100 % (plan 223), so
	// its value at the pad is the credit and the funds come back to where they were
	const after = fundsOf(await funds.innerText());
	expect(
		Math.abs(after - before),
		`before ${before} credit ${credit} after ${after}`
	).toBeLessThanOrEqual(2);
	expect(errors).toEqual([]);
});
