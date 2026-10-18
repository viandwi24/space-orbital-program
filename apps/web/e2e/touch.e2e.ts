/**
 * Touch and sound (plan 053, ADR 0062 and 0063): a tablet-sized touch context flies the two-stage
 * example with the on-screen controls, and the audio state follows the first gesture. Emulation
 * (touch events and viewport on the desktop engine), not a device.
 */
import { devices, expect, test } from '@playwright/test';

import { launchTwoStage, watchErrors } from './support';

test.use({
	...devices['Desktop Chrome'],
	viewport: { width: 1024, height: 768 },
	hasTouch: true
});

test('on a touch tablet: controls show, Stage fires, the throttle slider sets the throttle', async ({
	page
}, info) => {
	test.skip(info.project.name !== 'chromium', 'touch emulation is checked in one engine');
	const errors = watchErrors(page);
	await page.addInitScript(() => localStorage.setItem('orbital.small-screen-ok', '1'));
	await launchTwoStage(page);

	const controls = page.getByTestId('touch-controls');
	await expect(controls).toBeVisible();
	// the audio context exists only after a gesture; the launch click was one
	await expect
		.poll(() => page.evaluate(() => document.documentElement.dataset.audio))
		.toMatch(/^(running|suspended)$/);

	const track = page.getByTestId('touch-throttle');
	const box = (await track.boundingBox())!;
	// near the top: the track is 72 to 150 px tall, after the room the world bars leave (plan 204)
	await page.touchscreen.tap(box.x + box.width / 2, box.y + 4);
	await expect(track).toHaveAttribute('aria-valuenow', /^(9\d|100)$/);

	await page.getByTestId('touch-stage').tap();
	await expect(page.getByText('Stage 1 fired')).toBeVisible();
	expect(errors).toEqual([]);
});

test('the small-screen notice shows on a phone and is dismissed for the session', async ({
	page
}, info) => {
	test.skip(info.project.name !== 'chromium', 'checked in one engine');
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');
	const notice = page.getByTestId('small-screen-notice');
	await expect(notice).toBeVisible();
	await page.getByTestId('small-screen-continue').tap();
	await expect(notice).toHaveCount(0);
	await page.goto('/vab');
	await expect(page.getByTestId('small-screen-notice')).toHaveCount(0);
});
