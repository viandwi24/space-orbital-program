/**
 * Screenshots of the Hangar from four angles (plan 220: the roomier towers), with the moon shot on
 * the platform, at 1920x1080. Playwright's bundled Chromium with software WebGL, against a running
 * dev server or build:
 *
 *   SHOT_URL=http://localhost:5211 bun scripts/capture-hangar.ts
 *
 * Output: `docs/journal/assets/220-hangar-<angle>.jpg`; prints the vessel's triangles.
 */
import { chromium } from '@playwright/test';
import { join } from 'node:path';

const base = process.env.SHOT_URL ?? 'http://localhost:5211';
const out = process.env.SHOT_OUT ?? join(import.meta.dir, '../../../docs/journal/assets');

/** Yaw, pitch (rad) and distance (m) of each view, looking at 8 m up the stack. */
const ANGLES = [
	{ name: 'front', yaw: 0, pitch: 0.12, distance: 36 },
	{ name: 'side', yaw: Math.PI / 2, pitch: 0.12, distance: 36 },
	{ name: 'high', yaw: Math.PI / 4, pitch: Math.PI / 4, distance: 42 },
	{ name: 'top', yaw: 0, pitch: 1.35, distance: 28 } // under the crane: the debug camera skips the room limits
] as const;

type Hook = {
	aim(yaw: number, pitch: number, distance: number, target?: [number, number, number]): void;
	stats(): { vesselTriangles: number; vesselDrawCalls: number } | null;
};

const browser = await chromium.launch({
	args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
});
const context = await browser.newContext({
	viewport: { width: 1920, height: 1080 },
	baseURL: base
});
const page = await context.newPage();
page.on('pageerror', (e) => console.log('  pageerror', e.message));
await page.goto('/vab');
await page.waitForFunction(() => '__orbitalVab' in window, null, { timeout: 60_000 });
await page.getByRole('button', { name: 'Load the moon shot' }).click();
const skip = page.getByTestId('tutorial-skip');
if (await skip.isVisible().catch(() => false)) await skip.click();
await page.waitForTimeout(3000);
for (const a of ANGLES) {
	await page.evaluate(
		(v) =>
			(window as unknown as { __orbitalVab: Hook }).__orbitalVab.aim(
				v.yaw,
				v.pitch,
				v.distance,
				[0, 8, 0]
			),
		a
	);
	await page.waitForTimeout(1500);
	await page.screenshot({
		path: join(out, `220-hangar-${a.name}.jpg`),
		type: 'jpeg',
		quality: 82
	});
	console.log(`  220-hangar-${a.name}`);
}
const stats = await page.evaluate(() =>
	(window as unknown as { __orbitalVab: Hook }).__orbitalVab.stats()
);
console.log('  vessel', stats);
await context.close();
await browser.close();
