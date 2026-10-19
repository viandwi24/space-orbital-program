import { expect, test } from '@playwright/test';
import { debugSetOrbit, launchTwoStage, watchErrors } from './support';

/**
 * Tooltips and the glossary (plan 228): in a low orbit (plan 203's debug API), Tab reaches the
 * Orbit panel's Apoapsis term, whose tooltip explains it and links to `/glossary#apoapsis`; the
 * glossary search for TWR shows one entry.
 */
test('the Apoapsis term explains itself and links to the glossary', async ({ page }) => {
	test.setTimeout(180_000);
	const errors = watchErrors(page);
	await launchTwoStage(page);
	await debugSetOrbit(page, { apoapsis: 120_000, periapsis: 100_000 });
	// the Orbit panel is the dock's default; open it only when it is not (a click would close it)
	const term = page.getByTestId('term-apoapsis');
	await expect(page.getByText('Orbiting Home')).toBeVisible({ timeout: 30_000 });
	if (!(await term.isVisible())) await page.getByTestId('dock-tab-host.orbit').click();
	await expect(term).toBeVisible({ timeout: 30_000 });

	// keyboard: Tab until the term has focus (the tooltip shows at once on keyboard focus)
	for (let i = 0; i < 80; i++) {
		if (await term.evaluate((el) => el === document.activeElement)) break;
		await page.keyboard.press('Tab');
	}
	await expect(term).toBeFocused();
	const tip = page.getByTestId('tooltip');
	await expect(tip).toBeVisible();
	await expect(tip).toContainText('Apoapsis');
	await expect(term).toHaveAttribute('aria-describedby', 'orbital-tooltip');
	// the tooltip stays inside the viewport
	const box = (await tip.boundingBox())!;
	const view = page.viewportSize()!;
	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.y).toBeGreaterThanOrEqual(0);
	expect(box.x + box.width).toBeLessThanOrEqual(view.width);
	expect(box.y + box.height).toBeLessThanOrEqual(view.height);
	// Escape closes it
	await page.keyboard.press('Escape');
	await expect(tip).toBeHidden();

	// with the mouse: hovering shows it after a moment; its "More" link opens the glossary entry
	await term.hover();
	await expect(tip).toBeVisible();
	await tip.getByTestId('tooltip-more').click();
	await page.waitForURL('**/glossary#apoapsis');
	await expect(page.locator('#apoapsis')).toContainText('Apoapsis');

	await page.getByTestId('glossary-search').fill('TWR');
	await expect(page.getByTestId('glossary-entry')).toHaveCount(1);
	await expect(page.getByTestId('glossary-entry')).toContainText('Thrust-to-weight ratio');
	expect(errors).toEqual([]);
});
