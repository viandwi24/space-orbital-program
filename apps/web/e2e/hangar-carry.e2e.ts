/**
 * The Hangar's carry loop (plan 217, ADR 0207): a tank from the catalogue snaps to the pod's bottom
 * ring and a click places it; Alt-click puts a copy on the cursor, and the catalogue takes it back;
 * a placed part dragged to the catalogue is deleted, and one undo brings it back. Positions come
 * from the page's read-only Hangar hook (`window.__orbitalVab`).
 */
import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './support';

interface Hook {
	partAt(index: number): { x: number; y: number } | null;
	targetAt(i: number): { x: number; y: number } | null;
	targets(): Array<{ i: number; parent: { index: number; parentNode: string } | null }>;
	active(): number | null;
	parts(): Array<{ index: number; part: string }>;
	armed(): string | null;
}

const partCount = (page: Page) =>
	page.evaluate(() => (window as unknown as { __orbitalVab: Hook }).__orbitalVab.parts().length);
const armed = (page: Page) =>
	page.evaluate(() => (window as unknown as { __orbitalVab: Hook }).__orbitalVab.armed());

async function pickFromCatalogue(page: Page, title: string): Promise<void> {
	await page.getByPlaceholder('Search parts').fill(title);
	await page
		.getByRole('button', { name: new RegExp(title) })
		.first()
		.click();
}

test('carry: snap and place, Alt-copy put back, drag to the catalogue deletes, undo restores', async ({
	page
}) => {
	const errors = watchErrors(page);
	await page.goto('/vab');
	await page.waitForFunction(() => '__orbitalVab' in window, null, { timeout: 60_000 });
	await page.getByTestId('menu-new').click();
	await expect.poll(() => partCount(page)).toBe(0);

	// the pod is the root: Enter places it on the platform
	await pickFromCatalogue(page, 'Command Pod');
	await page.keyboard.press('Enter');
	await expect.poll(() => partCount(page)).toBe(1);

	// a tank rides the cursor; over the pod's bottom ring it snaps there, a click places it
	await pickFromCatalogue(page, 'Small Fuel Tank');
	expect(await armed(page)).toBe('new');
	const ring = await page.evaluate(() => {
		const h = (window as unknown as { __orbitalVab: Hook }).__orbitalVab;
		const t = h.targets().find((x) => x.parent?.index === 0 && x.parent.parentNode === 'bottom')!;
		return { i: t.i, at: h.targetAt(t.i) };
	});
	expect(ring.at).not.toBeNull();
	await page.mouse.move(ring.at!.x + 40, ring.at!.y + 40);
	await page.mouse.move(ring.at!.x, ring.at!.y, { steps: 5 });
	await expect
		.poll(() =>
			page.evaluate(() => (window as unknown as { __orbitalVab: Hook }).__orbitalVab.active())
		)
		.toBe(ring.i);
	await page.mouse.click(ring.at!.x, ring.at!.y);
	await expect.poll(() => partCount(page)).toBe(2);
	const before = await partCount(page);

	// Alt-click the tank: a copy on the cursor; the catalogue takes it back
	await page.waitForTimeout(500); // the camera settles on the new vessel
	const tank = await page.evaluate(() =>
		(window as unknown as { __orbitalVab: Hook }).__orbitalVab.partAt(1)
	);
	expect(tank).not.toBeNull();
	await page.keyboard.down('Alt');
	await page.mouse.click(tank!.x, tank!.y);
	await page.keyboard.up('Alt');
	await expect.poll(() => armed(page)).toBe('copy');
	expect(await partCount(page)).toBe(before);
	await page
		.getByRole('button', { name: /Small Fuel Tank/ })
		.first()
		.click();
	await expect.poll(() => armed(page)).toBeNull();
	expect(await partCount(page)).toBe(before);

	// drag the placed tank onto the catalogue: deleted; one undo brings it back
	const card = await page
		.getByRole('button', { name: /Small Fuel Tank/ })
		.first()
		.boundingBox();
	const at = await page.evaluate(() =>
		(window as unknown as { __orbitalVab: Hook }).__orbitalVab.partAt(1)
	);
	await page.mouse.move(at!.x, at!.y);
	await page.mouse.down();
	await page.mouse.move(at!.x - 20, at!.y, { steps: 4 });
	await expect.poll(() => armed(page)).toBe('carry');
	await page.mouse.move(card!.x + card!.width / 2, card!.y + card!.height / 2, { steps: 10 });
	await page.mouse.up();
	await expect.poll(() => partCount(page)).toBe(1);
	await page.keyboard.press('Control+z');
	await expect.poll(() => partCount(page)).toBe(2);
	expect(errors).toEqual([]);
});
