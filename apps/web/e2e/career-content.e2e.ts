/**
 * Career content for the new parts (plan 231, ADR 0231): in a Career world the R&D page shows the
 * new nodes; with the plan 203 cheat "unlock all tech" every new part is in the Hangar catalogue;
 * once the debug tools have put a vessel in orbit (the `orbit:stock.home` first) and the days have
 * passed, the contracts board offers one of the new templates.
 */
import { expect, test, type Page } from '@playwright/test';
import { launchTwoStage, watchErrors } from './support';

test.describe.configure({ timeout: 1_200_000 });

/**
 * A new Career world, entered, whose debug tools are always on (the `stock.debug-tools` rule picked
 * at creation, ADR 0213 point 1): the debug API is there on every in-world page.
 */
async function careerWorld(page: Page, name: string): Promise<void> {
	await page.goto('/worlds');
	await page.getByTestId('worlds-create').click();
	const form = page.getByTestId('create-world');
	await form.getByTestId('world-name').fill(name);
	await form.getByRole('radio', { name: 'Career', exact: true }).click();
	await form.getByTestId('rule-stock.debug-tools').selectOption('always');
	await form.getByTestId('world-create').click();
	await expect(page.getByTestId('world-card').first()).toContainText(name);
	await page.getByTestId('world-enter').click();
	await page.waitForURL('**/space-center', { timeout: 120_000 });
}

async function debugCall(page: Page, method: string, ...args: unknown[]): Promise<unknown> {
	await page.waitForFunction(() => '__orbitalDebug' in window, null, { timeout: 300_000 });
	return page.evaluate(
		([m, a]) =>
			(
				window as unknown as {
					__orbitalDebug: Record<string, (...x: unknown[]) => Promise<unknown>>;
				}
			).__orbitalDebug[m as string]!(...(a as unknown[])),
		[method, args] as const
	);
}

const NEW_NODES = ['stock.rcs', 'stock.docking', 'stock.heavy-lift', 'stock.nuclear-power'];
/** One new part from each of plans 207 to 225, by its catalogue title. */
const NEW_PARTS = [
	'BST-0 Small Solid Booster',
	'LV-909 Vacuum Engine',
	'RCS Block',
	'Docking Port 1.25 m',
	'Fairing Base 1.25 m',
	'Ladder',
	'Radioisotope Generator'
];

test('the R&D page shows the new nodes; with all tech unlocked the new parts are in the Hangar', async ({
	page
}) => {
	const errors = watchErrors(page);
	await careerWorld(page, 'Career content');
	const granted = (await debugCall(page, 'grant', { tech: true })) as { ok: boolean };
	expect(granted.ok).toBe(true);
	await page.goto('/rnd');
	await expect(page.getByTestId('rnd-tiers')).toBeVisible({ timeout: 60_000 });
	for (const id of NEW_NODES) await expect(page.getByTestId(`rnd-node-${id}`)).toBeVisible();
	await page.goto('/vab');
	const search = page
		.getByRole('searchbox', { name: 'Search parts' })
		.or(page.getByLabel('Search parts'));
	const parts = page.getByRole('group', { name: 'Parts' });
	for (const title of NEW_PARTS) {
		await search.first().fill(title);
		await expect(parts.getByText(title, { exact: true })).toBeVisible({ timeout: 20_000 });
	}
	expect(errors).toEqual([]);
});

test('after the first orbit the contracts board offers one of the new templates', async ({
	page
}) => {
	const errors = watchErrors(page);
	await careerWorld(page, 'Career contracts');
	await launchTwoStage(page);
	const placed = (await debugCall(page, 'setOrbit', { apoapsis: 100_000, periapsis: 100_000 })) as {
		ok: boolean;
	};
	expect(placed.ok).toBe(true);
	// the first orbit is a world first. The board draws one random template a day, keeps five offers and
	// lets each go after ten days, so what shows is a random set: leave Flight in the app (the sim keeps
	// running), open the Administration, and step one game day at a time until a new template is offered
	await page.getByTestId('nav-space-center').click();
	const anyway = page.getByTestId('leave-anyway');
	if (await anyway.isVisible({ timeout: 3000 }).catch(() => false)) await anyway.click();
	await page.waitForURL('**/space-center');
	await page.getByTestId('sc-label-stock.administration').click({ timeout: 60_000 });
	await page.getByTestId('sc-open').click();
	await page.waitForURL('**/administration');
	const list = page.getByTestId('contracts-list');
	await expect(list).toBeVisible({ timeout: 120_000 });
	const row = list
		.getByTestId('contract-row')
		.filter({ hasText: /Rescue a crew member|A satellite at/ })
		.first();
	const clock = async (): Promise<number> =>
		Number(await page.getByTestId('world-clock').getAttribute('data-t'));
	const DAY = 21_600;
	for (let day = 0; day < 80 && !(await row.isVisible()); day++) {
		const to = (await clock()) + DAY;
		const warped = (await debugCall(page, 'send', {
			type: 'warp-to',
			time: to,
			factor: 10_000
		})) as { ok: boolean; reason?: string };
		expect(warped).toMatchObject({ ok: true });
		await expect.poll(clock, { timeout: 60_000 }).toBeGreaterThanOrEqual(to - 60);
	}
	await expect(row).toBeVisible({ timeout: 20_000 });
	expect(errors).toEqual([]);
});
