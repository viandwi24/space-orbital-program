import { test, type Page } from '@playwright/test';
import { launchTwoStage } from './support';

/**
 * Plans 272 and 273 (the v3 design package): screenshots of Flight and the Space Center for the
 * journal, side by side with `refs/space-orbital-program-ui-v3`. Only with SHOTS_DIR set (they are
 * pictures, not checks): `SHOTS_DIR=… SHOTS_TAG=after E2E_PORT=5174 bunx playwright test v3-screens
 * --project=chromium` against a running dev server.
 */
const dir = process.env.SHOTS_DIR;
const tag = process.env.SHOTS_TAG ?? 'after';
test.skip(!dir, 'screenshots only on request (SHOTS_DIR)');

const shot = (page: Page, name: string) =>
	page.screenshot({ path: `${dir}/${tag}-${name}.png`, animations: 'disabled' });

test('Flight at 1440, 1280 and 1024', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	// the first-flight guide is not in the design's frame
	await page.addInitScript(() => {
		const stored = JSON.parse(localStorage.getItem('orbital.settings') ?? '{}');
		localStorage.setItem(
			'orbital.settings',
			JSON.stringify({ ...stored, v: 4, tutorial: { status: 'skipped', step: 0 } })
		);
	});
	await launchTwoStage(page);
	// the vessel panel: the v3 dock's Overview, or the v2 toggle
	const overview = page.getByTestId('dock-tab-host.vessel');
	if (await overview.count()) {
		if ((await overview.getAttribute('aria-selected')) !== 'true') await overview.click();
	} else await page.getByRole('button', { name: 'Vessel panel' }).click();
	await page.waitForTimeout(1500);
	await shot(page, 'flight-1440');
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.waitForTimeout(1200);
	await shot(page, 'flight-1280');
	await page.setViewportSize({ width: 1024, height: 768 });
	await page.waitForTimeout(1200);
	await shot(page, 'flight-1024');
	await page.setViewportSize({ width: 1440, height: 900 });
	const chip = page.getByTestId('hud-uncontrolled').or(page.getByTestId('hud-link')).first();
	if (await chip.count()) {
		await chip.click().catch(() => {});
		await page.waitForTimeout(500);
		await shot(page, 'flight-chip');
	}
	const parts = page.getByTestId('dock-tab-host.parts');
	if (await parts.count()) {
		await parts.click();
		await page.waitForTimeout(800);
		await shot(page, 'flight-parts');
	}
});

test('Space Center: overview, buildings, build, demolish, focus', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/worlds');
	await page.getByTestId('worlds-create').click();
	const form = page.getByTestId('create-world');
	await form.getByTestId('world-name').fill('Screens');
	await form.getByRole('radio', { name: 'Career', exact: true }).click();
	await form.getByTestId('world-create').click();
	await page.getByTestId('world-enter').click();
	await page.waitForURL('**/space-center');
	await page.waitForTimeout(6000);
	await shot(page, 'sc-overview');
	const list = page.getByTestId('sc-buildings');
	if (await list.count()) {
		await list.click();
		await page.waitForTimeout(500);
		await shot(page, 'sc-buildings');
		await list.click();
		await page.getByTestId('sc-build').click();
		await page
			.getByTestId('sc-cat-stock.production')
			.click()
			.catch(() => {});
		await page.waitForTimeout(800);
		await shot(page, 'sc-build');
		await page.getByTestId('sc-tool-demolish').click();
		await page.getByTestId('sc-label-stock.hangar').click();
		await page.waitForTimeout(500);
		await shot(page, 'sc-demolish');
		await page.getByTestId('sc-confirm-cancel').click();
		await page.getByTestId('sc-build-done').click();
	}
	await page.getByTestId('sc-label-stock.hangar').click();
	await page.waitForTimeout(1500);
	await shot(page, 'sc-focus');
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.waitForTimeout(1000);
	await shot(page, 'sc-focus-1280');
});
