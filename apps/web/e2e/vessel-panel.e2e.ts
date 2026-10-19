/** The vessel panel (plan 111, ADR 0153): toggle the landing legs from the Parts tab in flight. */
import { expect, test } from '@playwright/test';
import { launchTwoStage, watchErrors } from './support';

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

/**
 * Plan 214 (ADR 0205 points 1 and 2): the panel is 340 px wide and drags to 440; a click on the
 * engine in the view opens its inspector, and "50 kN" typed there sets its limiter.
 */
test('panel width and resize; click the engine to inspect it and type its limiter', async ({
	page
}) => {
	test.skip(test.info().project.name !== 'chromium', 'one engine is enough for the panel');
	const errors = watchErrors(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await launchTwoStage(page);
	await page.getByRole('button', { name: 'Vessel panel' }).click();
	await expect(page.getByTestId('vessel-panel')).toBeVisible();
	const panel = page.locator('.ui > .vr');
	await expect.poll(async () => Math.round((await panel.boundingBox())!.width)).toBe(340);
	// the grip is the panel's left edge: far to the left is as wide as it goes
	const grip = page.getByTestId('vessel-panel-grip');
	const g = (await grip.boundingBox())!;
	await page.mouse.move(g.x + g.width / 2, g.y + 40);
	await page.mouse.down();
	await page.mouse.move(g.x - 400, g.y + 40, { steps: 8 });
	await page.mouse.up();
	await expect.poll(async () => Math.round((await panel.boundingBox())!.width)).toBe(440);

	// the lower engine of the two-stage example, on screen
	type Api = {
		vessel(): {
			parts: Array<{ id: number; definition: string; modules: Record<string, unknown> }>;
		};
		partOnScreen(part: number): { x: number; y: number } | null;
	};
	const engine = await page.evaluate(() => {
		const api = (window as unknown as { __orbitalDebug: Api }).__orbitalDebug;
		const parts = api.vessel().parts.filter((p) => p.definition === 'stock.engine-lv');
		return parts.at(-1)!.id;
	});
	const at = await page.evaluate(
		(id) => (window as unknown as { __orbitalDebug: Api }).__orbitalDebug.partOnScreen(id),
		engine
	);
	expect(at).not.toBeNull();
	const canvas = (await page.locator('canvas').first().boundingBox())!;
	await page.mouse.click(canvas.x + at!.x, canvas.y + at!.y);
	const inspector = page.getByTestId(`inspector-${engine}`);
	await expect(inspector).toBeVisible({ timeout: 10_000 });
	// its full thrust, read before the limiter changes it
	const thrustKn = Number(
		((await page.getByTestId(`insp-${engine}-thrust`).textContent()) ?? '').match(/(\d+) kN/)?.[1]
	);
	expect(thrustKn).toBeGreaterThan(50);
	const typed = page.getByTestId(`insp-${engine}-setLimiter-typed`);
	await typed.fill('50 kN');
	await typed.press('Enter');
	const limiter = () =>
		page.evaluate(
			(id) =>
				(
					(window as unknown as { __orbitalDebug: Api }).__orbitalDebug
						.vessel()
						.parts.find((p) => p.id === id)!.modules['stock.engine'] as { limiter: number }
				).limiter,
			engine
		);
	await expect.poll(limiter).toBeCloseTo(50 / thrustKn, 3);
	// pinned, it stays; "abc" reverts with a message
	await page.getByTestId(`inspector-${engine}-pin`).click();
	await typed.fill('abc');
	await typed.press('Enter');
	await expect(page.getByTestId(`insp-${engine}-note`)).toContainText('Type a number');
	expect(errors).toEqual([]);
});
