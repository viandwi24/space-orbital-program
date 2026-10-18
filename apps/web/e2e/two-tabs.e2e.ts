import { expect, test } from '@playwright/test';
import { watchErrors } from './support';

/** Plan 204 (ADR 0201 point 12): a second tab on the same world is told so; Take over moves the lock. */
test('a second tab on the same world is blocked until it takes over', async ({ page, context }) => {
	const errors = watchErrors(page);
	await page.goto('/space-center');
	await expect(page.getByTestId('time-bar')).toBeVisible({ timeout: 30_000 });

	const second = await context.newPage();
	const errors2 = watchErrors(second);
	await second.goto('/space-center');
	const blocked = second.getByTestId('world-blocked');
	await expect(blocked).toContainText('This world is open in another tab');
	await expect(second.getByTestId('time-bar')).toHaveCount(0);

	await second.getByTestId('world-take-over').click();
	await expect(second.getByTestId('time-bar')).toBeVisible({ timeout: 30_000 });
	await expect(page.getByTestId('world-blocked')).toBeVisible();
	expect(errors).toEqual([]);
	expect(errors2).toEqual([]);
});
