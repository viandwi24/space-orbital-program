/**
 * The Resources tab (plan 214 on plan 213): two half tanks; a transfer from the tab's picker moves
 * fuel, the draining tank shows its rate and time to empty, and a locked tank says "Locked".
 */
import { expect, test, type Page } from '@playwright/test';
import { debugSetOrbit, debugSetResource, launchTwoStage, watchErrors, openDock } from './support';

const LF = 'stock.liquid-fuel';

async function tanks(page: Page): Promise<Array<{ id: number; amount: number }>> {
	return page.evaluate((lf) => {
		const v = (
			window as unknown as {
				__orbitalDebug: {
					vessel(): {
						parts: Array<{ id: number; resources?: Array<{ resource: string; amount: number }> }>;
					} | null;
				};
			}
		).__orbitalDebug.vessel()!;
		return v.parts
			.filter((p) => p.resources?.some((r) => r.resource === lf))
			.map((p) => ({ id: p.id, amount: p.resources!.find((r) => r.resource === lf)!.amount }));
	}, LF);
}

test('the Resources tab: a transfer from the picker, rate and time to empty, a lock', async ({
	page
}) => {
	test.skip(test.info().project.name !== 'chromium', 'one engine is enough for the panel');
	const errors = watchErrors(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await launchTwoStage(page);
	await debugSetOrbit(page, { apoapsis: 100_000, periapsis: 100_000 });
	const [upper, lower] = await tanks(page);
	for (const t of [upper!, lower!])
		await debugSetResource(page, { part: t.id, resource: LF, fraction: 0.5 });
	const half = await tanks(page);

	await openDock(page, 'host.resources');
	await expect(page.getByTestId(`container-${upper!.id}-${LF}`)).toBeVisible();
	const picker = page.getByTestId('transfer-picker');
	await picker.getByTestId('transfer-resource').selectOption(LF);
	await picker.getByTestId('transfer-from').selectOption(String(lower!.id));
	await picker.getByTestId('transfer-to').selectOption(String(upper!.id));
	await picker.getByTestId('transfer-start').click();

	// the draining tank shows its rate and when it runs dry
	await expect(page.getByTestId(`container-${lower!.id}-${LF}-rate`)).toContainText('empty in', {
		timeout: 20_000
	});
	await expect(page.getByTestId(`container-${lower!.id}-${LF}-rate`)).toContainText('/s');
	await expect
		.poll(async () => (await tanks(page))[0]!.amount, { timeout: 20_000 })
		.toBeGreaterThan(half[0]!.amount + 20);
	await picker.getByTestId('transfer-stop').click();

	// a locked tank says so in text
	await page.getByTestId(`lock-${upper!.id}-${LF}`).click();
	await expect(page.getByTestId(`container-${upper!.id}-${LF}`)).toContainText('Locked');
	expect(errors).toEqual([]);
});
