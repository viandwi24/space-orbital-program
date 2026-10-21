import { expect, test } from '@playwright/test';
import { watchErrors } from './support';

/**
 * The Space Center's build menu (plan 235, ADR 0227): the category bar along the bottom, a row of
 * cards with drawn thumbnails, the details of a card, a disabled card's reason, the keyboard, and
 * a card that starts the placement preview; the placed dish goes under construction.
 */
test('open Comms, see the dish card with its thumbnail, place it, construction starts', async ({
	page
}) => {
	test.skip(test.info().project.name !== 'chromium', 'one engine is enough for the menu');
	const errors = watchErrors(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/worlds');
	await page.getByTestId('worlds-create').click();
	const form = page.getByTestId('create-world');
	await form.getByTestId('world-name').fill('Menu builders');
	await form.getByRole('radio', { name: 'Career', exact: true }).click();
	await form.getByTestId('world-create').click();
	await page.getByTestId('world-enter').click();
	await page.waitForURL('**/space-center');
	await expect(page.locator('[data-testid^="sc-row-"]')).toHaveCount(4, { timeout: 60_000 });

	// v3 (plan 273, V3 §1.2): Build opens the build bar at bottom 52 with the seven stock categories
	await page.getByTestId('sc-build').click();
	const bar = page.getByRole('tablist', { name: 'Building categories' });
	await expect(bar.getByRole('tab')).toHaveText([
		'Launch',
		'Comms',
		'Science',
		'Crew',
		'Administration',
		'Production',
		'Infrastructure'
	]);
	const dock = (await page.getByTestId('build-menu').boundingBox())!;
	expect(Math.round(900 - (dock.y + dock.height))).toBe(52);
	for (const b of await bar.getByRole('tab').all()) {
		const r = (await b.boundingBox())!;
		expect(Math.round(r.height)).toBe(36);
	}

	// the keyboard walks the tabs; Enter opens a row; Escape closes the bar (ADR 0254 point 1)
	await page.getByTestId('sc-cat-stock.launch').focus();
	await page.keyboard.press('ArrowRight');
	await expect(page.getByTestId('sc-cat-stock.comms')).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('build-row')).toBeVisible();
	await page.keyboard.press('Escape');
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('build-row')).toHaveCount(0);
	await expect(page.getByTestId('sc-overview-bar')).toBeVisible();
	await page.getByTestId('sc-build').click();

	// a disabled card says why: the off-world kinds at home
	await page.getByTestId('sc-cat-stock.production').click();
	await expect(page.getByTestId('sc-build-stock.isru-plant')).toHaveAttribute(
		'aria-disabled',
		'true'
	);
	await expect(page.getByTestId('sc-build-stock.isru-plant')).toContainText(
		'Only at an off-world base'
	);

	// Launch: four cards with their pictures, for the journal
	await page.getByTestId('sc-cat-stock.launch').click();
	for (const id of ['launchpad-s', 'launchpad-m', 'launchpad-l', 'runway'])
		await expect(page.getByTestId(`sc-thumb-stock.${id}`)).toHaveAttribute(
			'src',
			/^data:image\/png/,
			{
				timeout: 30_000
			}
		);
	await page.getByTestId('sc-build-stock.launchpad-m').hover();
	await expect(page.getByTestId('build-detail')).toContainText('Level 3');
	await page.waitForTimeout(300);
	await page.screenshot({ path: test.info().outputPath('235-build-menu.jpg'), quality: 85 });

	// Comms: the dish's card, its thumbnail, and its facts
	await page.getByTestId('sc-cat-stock.comms').click();
	const dish = page.getByTestId('sc-build-stock.tracking-dish');
	await expect(dish).toContainText('Tracking dish');
	await expect(dish).toContainText('20,000 funds · 20 × 20 m · 2 days · levels 1–3');
	await expect(page.getByTestId('sc-thumb-stock.tracking-dish')).toHaveAttribute(
		'src',
		/^data:image\/png/,
		{ timeout: 30_000 }
	);
	const picture = await page
		.getByTestId('sc-thumb-stock.tracking-dish')
		.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
	expect(picture).toEqual([256, 160]);
	await page.screenshot({ path: test.info().outputPath('235-build-menu-comms.jpg'), quality: 85 });

	// choosing it starts the placement preview; a valid cell takes it and construction starts
	await dish.click();
	await expect(page.getByTestId('sc-ghost')).toBeVisible();
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
		if ((await page.getByTestId('sc-ghost').innerText()).includes('Click to place')) {
			await page.mouse.down();
			await page.mouse.up();
			placed = true;
			break;
		}
	}
	expect(placed).toBe(true);
	await expect(page.getByTestId('sc-attention')).toContainText(
		/Tracking dish: Under construction · ready in 2 days/,
		{ timeout: 10_000 }
	);
	await page.getByTestId('sc-build-stop').click();
	await expect(page.getByTestId('build-menu')).toBeVisible();
	expect(errors).toEqual([]);
});
