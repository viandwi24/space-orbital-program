import { expect, test } from '@playwright/test';
import { watchErrors } from './support';

/**
 * The Space Center (plan 091, ADR 0117): enter a new world, place a building in build mode, and
 * open the Hangar from its label. In a Career world the building is under construction (plan 096).
 */
test('enter a world, place a building, open the Hangar from its label', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('/worlds');
	await page.getByTestId('worlds-create').click();
	const form = page.getByTestId('create-world');
	await form.getByTestId('world-name').fill('Builders');
	await form.getByRole('radio', { name: 'Career', exact: true }).click();
	await form.getByTestId('world-create').click();
	await page.getByTestId('world-enter').click();
	await page.waitForURL('**/space-center');
	await expect(page.getByTestId('status-bar')).toContainText('Builders');
	const rows = page.locator('[data-testid^="sc-row-"]');
	await expect(rows).toHaveCount(4, { timeout: 60_000 });

	// the build menu (plan 235): Comms, then the dish's card
	await page.getByTestId('sc-cat-stock.comms').click();
	await page.getByTestId('sc-build-stock.tracking-dish').click();
	// build mode: walk the pointer over the canvas until the ghost may be placed, then click
	const canvas = page.getByTestId('sc-canvas');
	const box = (await canvas.boundingBox())!;
	let placed = false;
	for (const [fx, fy] of [
		[0.7, 0.7],
		[0.8, 0.6],
		[0.3, 0.75],
		[0.6, 0.85],
		[0.2, 0.6],
		[0.85, 0.8]
	] as const) {
		await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
		await page.waitForTimeout(150);
		const text = await page.getByTestId('sc-ghost').innerText();
		if (text.includes('Click to place')) {
			await page.mouse.down();
			await page.mouse.up();
			placed = true;
			break;
		}
	}
	expect(placed).toBe(true);
	await expect(rows).toHaveCount(5, { timeout: 10_000 });
	// a Career world pays for it and builds it over game days (plan 096, ADR 0123)
	await expect(page.getByTestId('sc-attention')).toContainText(
		/Tracking dish: Under construction · ready in 2 days/
	);
	// the read-only Market panel of a Career world (plan 097, ADR 0124 point 8)
	await expect(page.getByTestId('sc-market-stock.liquid-fuel')).toContainText('0.80 / u');
	await page.getByTestId('sc-build-stop').click();

	await page.getByTestId('sc-label-stock.hangar').click();
	await expect(page.getByTestId('sc-detail')).toContainText('Hangar');
	await page.getByTestId('sc-open').click();
	await page.waitForURL('**/vab');
	expect(errors).toEqual([]);
});
