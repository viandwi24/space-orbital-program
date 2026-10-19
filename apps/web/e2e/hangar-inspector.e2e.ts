/**
 * The Hangar's part inspector (plan 218, ADR 0225): on the moon shot, a click on a side booster
 * shows its build settings; the thrust limiter typed as 50 goes to all four boosters, and in
 * flight the vessel panel shows 50 % for each of them.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './support';

interface Hook {
	partAt(index: number): { x: number; y: number } | null;
}

test('a limiter set in the Hangar flies: 50 % on the boosters in the vessel panel', async ({
	page
}) => {
	test.setTimeout(180_000);
	const errors = watchErrors(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/vab');
	await page.waitForFunction(() => '__orbitalVab' in window, null, { timeout: 60_000 });
	await page.getByRole('button', { name: 'Load the moon shot' }).click();
	await page.waitForTimeout(800); // the camera frames the vessel

	// a side booster (design indices 21, 24, 27, 30): the first one the click selects
	let typed = page.locator('[data-testid^="build-"][data-testid$="-setLimiter-typed"]');
	for (const index of [21, 24, 27, 30]) {
		const at = await page.evaluate(
			(i) => (window as unknown as { __orbitalVab: Hook }).__orbitalVab.partAt(i),
			index
		);
		if (!at) continue;
		await page.mouse.click(at.x, at.y);
		typed = page.getByTestId(`build-${index}-setLimiter-typed`);
		if (await typed.isVisible().catch(() => false)) break;
		await page.keyboard.press('Escape');
	}
	await expect(typed).toBeVisible();
	await expect(page.getByTestId('build-settings')).toContainText('Thrust limiter');
	await typed.fill('50');
	await typed.press('Enter');
	await expect(typed).toHaveValue('50 %');

	// the moon shot is heavier than the Legacy pad takes: Shift+Launch flies it directly (ADR 0150)
	await page.getByRole('button', { name: /^Launch/ }).click({ modifiers: ['Shift'] });
	const anyway = page.getByRole('button', { name: 'Launch anyway' });
	if (await anyway.isVisible().catch(() => false)) await anyway.click();
	await page.waitForURL('**/flight');
	await expect(page.getByTestId('hud-met')).toBeVisible({ timeout: 60_000 });
	await page.waitForFunction(() => '__orbitalDebug' in window, null, { timeout: 60_000 });

	const boosters = await page.evaluate(() =>
		(
			window as unknown as {
				__orbitalDebug: { vessel(): { parts: Array<{ id: number; definition: string }> } };
			}
		).__orbitalDebug
			.vessel()
			.parts.filter((p) => p.definition === 'stock.booster')
			.map((p) => p.id)
	);
	expect(boosters).toHaveLength(4);
	await page.getByRole('button', { name: 'Vessel panel' }).click();
	await page.getByTestId('vessel-tab-parts').click();
	for (const id of boosters) {
		const slider = page.getByTestId(`part-${id}-setLimiter`);
		await expect(slider).toHaveValue('0.5', { timeout: 20_000 });
		await expect(slider.locator('xpath=..')).toContainText('50 %');
	}
	expect(errors).toEqual([]);
});
