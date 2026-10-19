import { expect, test } from '@playwright/test';
import { launchTwoStage, watchErrors } from './support';

/**
 * Plan 200 (ADR 0216): the pad before liftoff. In a Career world with nobody hired the pod is
 * empty, so the vessel is uncontrolled and Space does not stage; a crewed vessel starts at 50 %.
 */
test('an empty pod is uncontrolled on the pad and Space does not stage it', async ({ page }) => {
	test.skip(test.info().project.name !== 'chromium', 'one engine is enough for the HUD flow');
	const errors = watchErrors(page);
	await page.goto('/worlds');
	await page.getByTestId('worlds-create').click();
	const form = page.getByTestId('create-world');
	await form.getByTestId('world-name').fill('Empty seats');
	await form.getByRole('radio', { name: 'Career', exact: true }).click();
	await form.getByTestId('world-create').click();
	await page.getByTestId('world-enter').click();
	await page.waitForURL('**/space-center');

	await launchTwoStage(page);
	await expect(page.getByTestId('hud-uncontrolled')).toContainText('no crew or probe core', {
		timeout: 30_000
	});
	await expect(page.getByTestId('hud-phase-text')).toHaveText('On the pad, ready to launch');
	await expect(page.getByTestId('hud-met')).toHaveText(/T\+/);
	await page
		.locator('canvas')
		.first()
		.click({ position: { x: 20, y: 20 } })
		.catch(() => {});
	await page.keyboard.press('Space');
	await expect(page.getByText('Cannot stage')).toBeVisible({ timeout: 10_000 });
	await page.waitForTimeout(1000);
	await expect(page.getByTestId('hud-phase-text')).toHaveText('On the pad, ready to launch');
	expect(errors).toEqual([]);
});

test('a crewed vessel starts at 50 % throttle and stages into liftoff', async ({ page }) => {
	test.skip(test.info().project.name !== 'chromium', 'one engine is enough for the HUD flow');
	const errors = watchErrors(page);
	// the default world has no economy: the launch hires and seats a pilot (ADR 0216 point 2)
	await launchTwoStage(page);
	await expect(page.getByTestId('hud-uncontrolled')).toHaveCount(0);
	await expect(page.getByTestId('hud-throttle')).toHaveText('50%', { timeout: 30_000 });
	await expect(page.getByTestId('hud-phase-text')).toHaveText('On the pad, ready to launch');
	await page
		.locator('canvas')
		.first()
		.click({ position: { x: 20, y: 20 } })
		.catch(() => {});
	await page.keyboard.press('Space');
	await expect(page.getByTestId('hud-phase-text')).not.toHaveText('On the pad, ready to launch', {
		timeout: 20_000
	});
	expect(errors).toEqual([]);
});
