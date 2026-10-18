import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './support';

/** Plan 205 (ADR 0201 points 4, 6 and 7): place pauses, the player's pause and the time bar chip. */
const simTime = async (page: Page): Promise<number> =>
	Number(await page.getByTestId('world-clock').getAttribute('data-t'));

async function runs(page: Page): Promise<void> {
	const t = await simTime(page);
	await expect.poll(() => simTime(page), { timeout: 20_000 }).toBeGreaterThan(t);
}
async function stands(page: Page): Promise<void> {
	const t = await simTime(page);
	await page.waitForTimeout(1500);
	expect(await simTime(page)).toBe(t);
}

test('the Hangar pauses by place, P pauses for good until the player resumes', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('/space-center');
	await expect.poll(() => simTime(page), { timeout: 60_000 }).toBeGreaterThan(0);
	await runs(page);
	await expect(page.getByTestId('time-chip')).toHaveCount(0);

	// into the Hangar: paused by place
	await page.getByTestId('sc-label-stock.hangar').click({ timeout: 60_000 });
	await page.getByTestId('sc-open').click();
	await page.waitForURL('**/vab');
	await expect(page.getByTestId('time-chip')).toHaveText('PAUSED · HANGAR');
	await stands(page);

	// back in the Space Center it runs again
	await page.getByTestId('nav-space-center').click();
	await page.waitForURL('**/space-center');
	await expect(page.getByTestId('time-chip')).toHaveCount(0);
	await runs(page);

	// P pauses; the Hangar and back keep it paused
	await page.keyboard.press('KeyP');
	await expect(page.getByTestId('time-chip')).toHaveText('PAUSED');
	await stands(page);
	await page.getByTestId('sc-label-stock.hangar').click();
	await page.getByTestId('sc-open').click();
	await page.waitForURL('**/vab');
	await expect(page.getByTestId('time-chip')).toHaveText('PAUSED');
	await page.getByTestId('nav-space-center').click();
	await page.waitForURL('**/space-center');
	await expect(page.getByTestId('time-chip')).toHaveText('PAUSED');
	await stands(page);
	await page.keyboard.press('KeyP');
	await runs(page);
	expect(errors).toEqual([]);
});
