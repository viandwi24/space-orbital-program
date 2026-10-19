/**
 * Tank transfer (plan 213): the two-stage rocket in orbit with both tanks half full; a `transfer`
 * sent through the debug API moves liquid fuel from the lower tank to the upper one, and the
 * snapshot read back through the page shows the new amounts and the rate.
 */
import { expect, test, type Page } from '@playwright/test';
import { debugSetOrbit, debugSetResource, launchTwoStage, watchErrors } from './support';

const LF = 'stock.liquid-fuel';

interface Row {
	resource: string;
	amount: number;
	rate: number;
}
interface Tank {
	id: number;
	lf: Row;
}

async function tanks(page: Page): Promise<Tank[]> {
	return page.evaluate((lf) => {
		const v = (
			window as unknown as {
				__orbitalDebug: {
					vessel(): {
						parts: Array<{ id: number; definition: string; resources?: Row[] }>;
					} | null;
				};
			}
		).__orbitalDebug.vessel()!;
		return v.parts
			.filter((p) => p.resources?.some((r) => r.resource === lf))
			.map((p) => ({ id: p.id, lf: p.resources!.find((r) => r.resource === lf)! }));
	}, LF);
}

async function send(page: Page, command: unknown): Promise<{ ok: boolean; reason?: string }> {
	return page.evaluate(
		(c) =>
			(
				window as unknown as {
					__orbitalDebug: { send(c: unknown): Promise<{ ok: boolean; reason?: string }> };
				}
			).__orbitalDebug.send(c),
		command
	);
}

test('a transfer sent through the debug API moves fuel between two half tanks', async ({
	page
}) => {
	const errors = watchErrors(page);
	await launchTwoStage(page);
	await debugSetOrbit(page, { apoapsis: 100_000, periapsis: 100_000 });
	const [upper, lower] = await tanks(page);
	expect(upper && lower).toBeTruthy();
	for (const t of [upper!, lower!]) {
		await debugSetResource(page, { part: t.id, resource: LF, fraction: 0.5 });
	}
	const half = (await tanks(page)).map((t) => t.lf.amount);
	const vessel = await page.evaluate(
		() =>
			(
				window as unknown as { __orbitalDebug: { vessel(): { id: number } | null } }
			).__orbitalDebug.vessel()!.id
	);
	expect(
		await send(page, { type: 'transfer', vessel, resource: LF, from: [lower!.id], to: [upper!.id] })
	).toEqual({ ok: true });
	await expect
		.poll(async () => (await tanks(page))[0]!.lf.amount, { timeout: 20_000 })
		.toBeGreaterThan(half[0]! + 20);
	const now = await tanks(page);
	expect(now[1]!.lf.amount).toBeLessThan(half[1]! - 20);
	// moved one for one, and the snapshot shows the flow
	expect(now[0]!.lf.amount + now[1]!.lf.amount).toBeCloseTo(half[0]! + half[1]!, 3);
	expect(now[0]!.lf.rate).toBeGreaterThan(5);
	expect(errors).toEqual([]);
});
