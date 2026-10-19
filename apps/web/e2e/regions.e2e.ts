import { expect, test } from '@playwright/test';
import { launchTwoStage, watchErrors } from './support';

/** Plan 192 (ADR 0180): the Regions layer of map view tints the planet and names the region under the cursor. */
test('map view: the Regions layer names the region under the cursor', async ({ page }) => {
	test.skip(test.info().project.name !== 'chromium', 'one engine is enough for the overlay');
	const errors = watchErrors(page);
	await launchTwoStage(page);
	await page.getByTestId('nav-map').click();
	const toggle = page.getByTestId('map-regions');
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');
	// walk the pointer across the middle of the canvas until it is over the planet
	const box = (await page.locator('canvas').first().boundingBox())!;
	const hover = page.getByTestId('map-region-hover');
	let found = false;
	for (let f = 0.95; f > 0.05 && !found; f -= 0.05) {
		await page.mouse.move(box.x + box.width * f, box.y + box.height * 0.45);
		found = await hover.isVisible();
	}
	expect(found).toBe(true);
	await expect(hover).toContainText(/^Home · /);
	await page.screenshot({ path: 'test-results/regions-map-on.png' });
	await toggle.click();
	await expect(hover).toBeHidden();
	await page.screenshot({ path: 'test-results/regions-map-off.png' });
	expect(errors).toEqual([]);
});
