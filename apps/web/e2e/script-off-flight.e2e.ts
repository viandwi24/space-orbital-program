import { expect, test, type Page } from '@playwright/test';
import { launchTwoStage, runScript, scriptLog, scriptStatus, watchErrors } from './support';

/**
 * Plan 239 (ADR 0201 point 9, ADR 0232): a running script keeps flying the vessel when the player
 * leaves Flight; outside Flight a sign says so, goes back, or stops it.
 */
const radius = (page: Page): Promise<number> =>
	page.evaluate(() => {
		const api = (
			window as unknown as {
				__orbitalDebug: { vessel(): { position: { x: number; y: number; z: number } } | null };
			}
		).__orbitalDebug;
		const p = api.vessel()?.position;
		return p ? Math.hypot(p.x, p.y, p.z) : NaN;
	});

/** The script panel open (its state is the page's, not the world's). */
async function scriptPanel(page: Page): Promise<void> {
	const button = page.getByRole('button', { name: 'Script panel' });
	if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
}

async function leaveFlight(page: Page): Promise<void> {
	await page.getByTestId('nav-space-center').click();
	const anyway = page.getByTestId('leave-anyway');
	if (await anyway.isVisible({ timeout: 3_000 }).catch(() => false)) await anyway.click();
	await page.waitForURL('**/space-center');
}

test('the sample script keeps climbing in the Space Center; the sign goes back or stops it', async ({
	page
}) => {
	test.setTimeout(240_000);
	const errors = watchErrors(page);
	await launchTwoStage(page);
	await runScript(page, 'sample');
	await expect(scriptStatus(page)).toHaveText('running', { timeout: 60_000 });
	await expect(scriptLog(page)).toContainText('liftoff', { timeout: 60_000 });

	await leaveFlight(page);
	await expect(page.getByTestId('script-running')).toBeVisible({ timeout: 20_000 });
	const first = await radius(page);
	expect(Number.isFinite(first)).toBe(true);
	// the script still flies it: up by more than 200 m while the player looks elsewhere
	await expect
		.poll(() => radius(page), { timeout: 60_000, intervals: [2_000] })
		.toBeGreaterThan(first + 200);

	// back to Flight: the panel shows it still running
	await page.getByTestId('script-back').click();
	await page.waitForURL('**/flight');
	await scriptPanel(page);
	await expect(scriptStatus(page)).toHaveText('running', { timeout: 30_000 });

	// out again, and Stop from the sign ends it
	await leaveFlight(page);
	await page.getByTestId('script-stop').click();
	await expect(page.getByTestId('script-running')).toHaveCount(0);
	await page.getByTestId('nav-vessel').click();
	await page.waitForURL('**/flight');
	await scriptPanel(page);
	await expect(scriptStatus(page)).not.toHaveText('running', { timeout: 30_000 });
	expect(errors).toEqual([]);
});
