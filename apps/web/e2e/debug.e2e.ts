import { expect, test } from '@playwright/test';
import {
	debugAmount,
	debugCheat,
	debugSetOrbit,
	launchTwoStage,
	watchErrors
} from './support';

/** Plan 203 (ADR 0200): the debug API in a Sandbox world, and the "used cheats" mark of Debug mode. */

const altitudeKm = async (page: import('@playwright/test').Page): Promise<number> => {
	const deck = page.getByTestId('hud-altitude');
	const unit = (await deck.locator('xpath=following-sibling::*[1]').innerText()).trim();
	const n = Number((await deck.innerText()).replace(/[^0-9.]/g, ''));
	return unit === 'km' ? n : unit === 'm' ? n / 1000 : NaN;
};

test('in a Sandbox world debugSetOrbit puts the vessel in a 100 km orbit and the HUD shows it', async ({
	page
}) => {
	const errors = watchErrors(page);
	await launchTwoStage(page);
	await debugSetOrbit(page, { apoapsis: 100_000, periapsis: 100_000 });
	await expect.poll(() => altitudeKm(page), { timeout: 20_000 }).toBeGreaterThan(99);
	expect(await altitudeKm(page)).toBeLessThan(101);
	expect(errors).toEqual([]);
});

test('infinite fuel keeps the tanks full during a burn', async ({ page }) => {
	const errors = watchErrors(page);
	await launchTwoStage(page);
	await expect.poll(() => debugAmount(page, 'stock.liquid-fuel')).toBeGreaterThan(0);
	const full = await debugAmount(page, 'stock.liquid-fuel');
	await debugCheat(page, 'infinite-fuel');
	await page.locator('canvas').first().click({ position: { x: 20, y: 20 } }).catch(() => {});
	await page.keyboard.press('KeyZ');
	await page.keyboard.press('Space');
	// burning: the vessel climbs while the tanks stay full
	await expect.poll(() => altitudeKm(page), { timeout: 30_000 }).toBeGreaterThan(0.2);
	expect(await debugAmount(page, 'stock.liquid-fuel')).toBe(full);
	expect(errors).toEqual([]);
});

test('in a Career world with Debug mode on, the world card shows "Used cheats"', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('/worlds');
	await page.getByTestId('worlds-create').click();
	const form = page.getByTestId('create-world');
	await form.getByTestId('world-name').fill('Cheat career');
	await form.getByRole('radio', { name: 'Career', exact: true }).click();
	await form.getByTestId('world-create').click();
	await expect(page.getByTestId('world-card').first()).toContainText('Cheat career');
	await expect(page.getByTestId('used-cheats')).toHaveCount(0);
	await page.getByTestId('world-enter').click();
	await page.waitForURL('**/space-center');

	await page.goto('/');
	await page.getByTestId('menu-settings').click();
	await page.getByRole('tab', { name: 'Game' }).click();
	await page.getByTestId('setting-debug').click();
	await expect(page.getByTestId('setting-debug')).toHaveAttribute('aria-checked', 'true');
	await expect(page.getByTestId('debug-marked')).toBeVisible();

	await page.goto('/worlds');
	const card = page.getByTestId('world-card').filter({ hasText: 'Cheat career' });
	await expect(card.getByTestId('used-cheats')).toHaveText('Used cheats');
	expect(errors).toEqual([]);
});
