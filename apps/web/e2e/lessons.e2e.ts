/**
 * Lessons after the first orbit (plan 229): from the Lessons page each lesson starts in a world of
 * its own; the scene is set through the debug API (altitude, orbit or target distance within 5 %);
 * the first card shows; a blocked control says why; leaving returns to the Lessons page and the
 * Worlds list is as it was. The landing lesson completes when `debug.setLocation` puts the lander
 * at rest on Cinder.
 */
import { expect, test, type Page } from '@playwright/test';
import { debugSetLocation, watchErrors } from './support';

const RADIUS = { 'stock.home': 600_000, 'stock.cinder': 190_000 } as const;

interface Seen {
	soi: string;
	radius: number;
	target: number | null;
	targetKind: string | null;
}

/** The focused vessel as the debug API sees it: its sphere, distance from the centre, target distance. */
async function seen(page: Page): Promise<Seen> {
	await page.waitForFunction(() => '__orbitalDebug' in window, null, { timeout: 60_000 });
	return page.evaluate(() => {
		const v = (
			window as unknown as {
				__orbitalDebug: {
					vessel(): {
						soi: string;
						position: { x: number; y: number; z: number };
						target?: { kind: string; distance: number } | null;
					} | null;
				};
			}
		).__orbitalDebug.vessel()!;
		return {
			soi: String(v.soi),
			radius: Math.hypot(v.position.x, v.position.y, v.position.z),
			target: v.target?.distance ?? null,
			targetKind: v.target?.kind ?? null
		};
	});
}

/** The world cards on the Worlds page. */
async function worldIds(page: Page): Promise<string[]> {
	await page.goto('/worlds');
	await expect(page.getByRole('heading', { name: 'Worlds' })).toBeVisible();
	// the list loads from IndexedDB after the page shows
	await page.waitForTimeout(500);
	return page
		.getByTestId('world-card')
		.evaluateAll((cards) => cards.map((c) => c.getAttribute('data-world') ?? ''));
}

async function startLesson(page: Page, id: string): Promise<void> {
	await page.goto('/lessons');
	await page.getByTestId(`lesson-${id}`).click();
	await page.getByTestId('lesson-start').click();
	await page.waitForURL(/\/flight/);
	await expect(page.getByTestId('lesson-card')).toBeVisible({ timeout: 90_000 });
	// the scene is set and the clock waits on the first card until Begin
	await expect(page.getByTestId('lesson-waiting')).toBeVisible({ timeout: 90_000 });
}

/** Begin, then leave back to the Lessons page. */
async function leave(page: Page): Promise<void> {
	await page.getByTestId('lesson-leave').dispatchEvent('click');
	// leaving the world saves it first (minutes on a software-rendered runner)
	await page.waitForURL(/\/lessons/, { timeout: 300_000 });
}

const near = (value: number, expected: number) =>
	expect(Math.abs(value - expected)).toBeLessThanOrEqual(expected * 0.05);

test.describe('lessons (plan 229)', () => {
	// four lesson worlds booted one after another: slow on a software-rendered runner
	test.describe.configure({ timeout: 2_400_000 });

	test('each lesson starts its scene and first card; leaving keeps the Worlds list', async ({
		page
	}) => {
		const errors = watchErrors(page);
		const before = await worldIds(page);

		// landing: 30 km above Cinder; the map is closed in this lesson and says why
		await startLesson(page, 'landing');
		await expect(page.getByTestId('lesson-step-retrograde')).toBeVisible({ timeout: 60_000 });
		let s = await seen(page);
		expect(s.soi).toBe('stock.cinder');
		near(s.radius - RADIUS['stock.cinder'], 30_000);
		await page.getByTestId('lesson-begin').dispatchEvent('click');
		await expect(page.getByTestId('lesson-waiting')).toHaveCount(0);
		await page.keyboard.press('KeyM');
		await expect(page.getByTestId('lesson-notice')).toContainText('the map stays closed');
		await leave(page);

		// maneuver nodes: a 100 km Home orbit
		await startLesson(page, 'nodes');
		await expect(page.getByTestId('lesson-step-map')).toBeVisible({ timeout: 60_000 });
		s = await seen(page);
		expect(s.soi).toBe('stock.home');
		near(s.radius - RADIUS['stock.home'], 100_000);
		await leave(page);

		// rendezvous and docking: the target probe about 2 km ahead
		await startLesson(page, 'docking');
		await expect(page.getByTestId('lesson-step-target')).toBeVisible({ timeout: 60_000 });
		await page.getByTestId('lesson-begin').dispatchEvent('click');
		// the target list goes through the bodies first, then the other vessels
		for (let i = 0; i < 6 && (await seen(page)).targetKind !== 'vessel'; i++) {
			await page.keyboard.press('KeyY');
			await page.waitForTimeout(1_000);
		}
		near((await seen(page)).target!, 2_000);
		await leave(page);

		// transfer: a parking orbit around Home
		await startLesson(page, 'transfer');
		await expect(page.getByTestId('lesson-step-map')).toBeVisible({ timeout: 60_000 });
		s = await seen(page);
		near(s.radius - RADIUS['stock.home'], 100_000);
		await leave(page);

		expect(await worldIds(page)).toEqual(before);
		expect(errors).toEqual([]);
	});

	test('the landing lesson completes when the lander comes to rest on Cinder', async ({ page }) => {
		const errors = watchErrors(page);
		await startLesson(page, 'landing');
		await expect(page.getByTestId('lesson-step-retrograde')).toBeVisible({ timeout: 60_000 });
		await page.getByTestId('lesson-begin').dispatchEvent('click');
		await debugSetLocation(page, {
			kind: 'surface',
			body: 'stock.cinder',
			latitude: 0,
			longitude: 0
		});
		await expect(page.getByTestId('lesson-debrief')).toBeVisible({ timeout: 60_000 });
		await leave(page);
		await expect(page.getByTestId('lesson-landing')).toContainText('Done');
		expect(errors).toEqual([]);
	});
});
