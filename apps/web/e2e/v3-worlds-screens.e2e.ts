import { test, type Page } from '@playwright/test';

/**
 * Plan 317 (the v3-2 design package): screenshots of Worlds, Achievements and the three Create World
 * steps for the journal. Only with SHOTS_DIR set: `SHOTS_DIR=… E2E_PORT=… bunx playwright test
 * v3-worlds-screens --project=chromium`.
 */
const dir = process.env.SHOTS_DIR;
test.skip(!dir, 'screenshots only on request (SHOTS_DIR)');
const shot = (page: Page, name: string) =>
	page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled' });

for (const [width, height] of [
	[1440, 900],
	[1280, 800]
] as const) {
	test(`Worlds and Create World at ${width}`, async ({ page }) => {
		await page.setViewportSize({ width, height });
		await page.goto('/worlds');
		await page.getByTestId('worlds-create').click();
		const form = page.getByTestId('create-world');
		await form.getByTestId('world-name').fill('Kerbin Dawn');
		await form.getByRole('radio', { name: 'Career', exact: true }).click();
		await page.waitForTimeout(400);
		await shot(page, `create-mode-${width}`);
		await page.getByTestId('create-step-world').click();
		await page.getByTestId('world-system-sol').check({ force: true });
		await page.waitForTimeout(400);
		await shot(page, `create-world-${width}`);
		await page.getByTestId('create-step-rules').click();
		await page.getByTestId('rules-crew').click();
		await page.waitForTimeout(300);
		await shot(page, `create-rules-${width}`);
		await page.getByTestId('world-create').click();
		await page.getByTestId('world-details').waitFor();
		// a second world so the tile row has two
		await page.getByTestId('worlds-create').click();
		await page.getByTestId('world-name').fill('Sandbox lab');
		await page.getByTestId('world-create').click();
		await page.getByTestId('world-details').waitFor();
		await page.waitForTimeout(800);
		await shot(page, `worlds-${width}`);
		await page.getByRole('button', { name: 'Delete world' }).click();
		await page.waitForTimeout(300);
		await shot(page, `worlds-delete-${width}`);
		await page.getByRole('button', { name: 'Delete world' }).click();
		await page.getByTestId('achievements-tab').click();
		await page.waitForTimeout(500);
		await shot(page, `achievements-${width}`);
	});
}
