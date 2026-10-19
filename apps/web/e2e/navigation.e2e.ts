import { expect, test, type Page } from '@playwright/test';
import { debugSetOrbit, launchTwoStage, watchErrors } from './support';

/**
 * Plan 224 (ADR 0223): the node panel takes typed delta-v for any node, warp-to an ascending node
 * stops before it, and an alarm stops the warp and lands in the bell.
 */
const simTime = async (page: Page): Promise<number> =>
	Number(await page.getByTestId('world-clock').getAttribute('data-t'));

type Debug = {
	vessel(): { id: number } | null;
	send(command: Record<string, unknown>): Promise<{ ok: boolean; reason?: string }>;
};

async function send(page: Page, command: Record<string, unknown>): Promise<void> {
	const r = await page.evaluate(async (c) => {
		const api = (window as unknown as { __orbitalDebug: Debug }).__orbitalDebug;
		const id = api.vessel()!.id;
		return api.send({ ...c, ...('vessel' in c ? { vessel: id } : {}) });
	}, command);
	if (!r.ok) throw new Error(`${String(command.type)} refused: ${r.reason}`);
}

const metres = (text: string): number => {
	const m = /([\d.,]+)\s*(km|m)\b/.exec(text.replace(/ | /g, ' '));
	if (!m) return NaN;
	const n = Number(m[1]!.replace(/,/g, ''));
	return m[2] === 'km' ? n * 1000 : n;
};

async function warpUp(page: Page): Promise<void> {
	await page
		.locator('canvas')
		.first()
		.click({ position: { x: 10, y: 10 } });
	for (let i = 0; i < 6; i++) await page.keyboard.press('.');
	await expect(page.getByTestId('hud-warp')).not.toHaveText('1x', { timeout: 10_000 });
}

test('typed delta-v on the second node, warp to AN, and an alarm that stops the warp', async ({
	page
}) => {
	test.setTimeout(240_000);
	const errors = watchErrors(page);
	await launchTwoStage(page);
	// a 100 km orbit of Home, tilted 5 degrees so the equator gives an AN and a DN
	await debugSetOrbit(page, { apoapsis: 100_000, periapsis: 100_000, i: (5 * Math.PI) / 180, m0: 0.3 });
	const t0 = await simTime(page);
	await send(page, { type: 'node-set', vessel: 0, time: t0 + 3_000, prograde: 0, normal: 0, radial: 0 });
	await send(page, { type: 'node-set', vessel: 0, time: t0 + 3_600, prograde: 0, normal: 0, radial: 0 });

	// the map view: the panel shows node 1 of 2; the next button shows the second node
	await page.keyboard.press('KeyM');
	await expect(page.getByText('Maneuver (1 of 2)')).toBeVisible({ timeout: 20_000 });
	await page.getByTestId('maneuver-next').click();
	await expect(page.getByText('Maneuver (2 of 2)')).toBeVisible();
	const ap = page.getByTestId('maneuver-planned-ap');
	await expect(ap).toBeVisible({ timeout: 20_000 });
	const before = metres(await ap.innerText());
	expect(before).toBeLessThan(120_000);
	const prograde = page.getByTestId('node-prograde');
	await prograde.fill('250');
	await prograde.press('Enter');
	await expect(page.getByTestId('maneuver-dv')).toContainText('250', { timeout: 20_000 });
	await expect
		.poll(async () => metres(await ap.innerText()), { timeout: 20_000 })
		.toBeGreaterThan(before + 100_000);

	// warp to the ascending node: the warp stops before it
	const an = page.getByTestId('marker-ascending');
	await expect(an).toHaveCount(1, { timeout: 20_000 });
	const anTime = Number(await an.getAttribute('data-time'));
	expect(anTime).toBeGreaterThan(t0);
	await page.getByTestId('mark-ascending').dispatchEvent('click');
	await page.getByTestId('mark-ascending-warp').dispatchEvent('click');
	await expect(page.getByTestId('hud-warp')).not.toHaveText('1x', { timeout: 10_000 });
	await expect(page.getByTestId('hud-warp')).toHaveText('1x', { timeout: 120_000 });
	const atAn = await simTime(page);
	expect(atAn).toBeLessThan(anTime);
	expect(anTime - atAn).toBeLessThan(25); // the 15 s margin, and the frames since

	// a 5-minute alarm: any warp stops at it, and the bell has it
	const t1 = await simTime(page);
	await send(page, { type: 'add-alarm', name: 'Five minutes', time: t1 + 300 });
	await warpUp(page);
	await expect(page.getByTestId('hud-warp')).toHaveText('1x', { timeout: 60_000 });
	const stopped = await simTime(page);
	expect(stopped).toBeLessThanOrEqual(t1 + 300 + 1);
	expect(stopped).toBeGreaterThan(t1 + 250);
	await page.getByTestId('status-bell').click();
	await expect(page.getByTestId('bell-feed')).toContainText('Alarm: Five minutes');
	expect(errors).toEqual([]);
});
