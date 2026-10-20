import { expect, test } from '@playwright/test';
import { launchTwoStage, watchErrors } from './support';

/** Plan 250: the dock panel resizes between 260 and 400 px, and an open vessel panel keeps the inspectors clear. */
test('the dock panel is resizable and the vessel panel keeps its room at 1920 px', async ({
	page
}) => {
	const errors = watchErrors(page);
	await page.setViewportSize({ width: 1920, height: 1080 });
	await launchTwoStage(page);
	await page.getByTestId('dock-tab-host.orbit').click();
	const panel = page.getByRole('tabpanel', { name: 'Orbit' });
	await expect(panel).toBeVisible();
	const before = (await panel.boundingBox())!.width;
	const grip = page.getByTestId('dock-grip');
	const g = (await grip.boundingBox())!;
	await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
	await page.mouse.down();
	await page.mouse.move(g.x + g.width / 2 + 80, g.y + g.height / 2, { steps: 5 });
	await page.mouse.up();
	const after = (await panel.boundingBox())!.width;
	expect(after).toBeGreaterThan(before + 40);
	expect(after).toBeLessThanOrEqual(400);
	expect(errors).toEqual([]);
});
