import { expect, test, type Page } from '@playwright/test';
import { debugSetLocation, launchTwoStage, watchErrors } from './support';

/**
 * The audio pack (plan 227, ADR 0210): the Music volume persists; a stage, then a fall from 500 m
 * (plan 203's debug API) into a hard landing play the decouple, touchdown and explosion cues (the
 * director's counts, `data-audio-cues`), and their visual signs show (the toasts). The counts do
 * not need the browser's audio to be unlocked: the director counts what it asks the engine for.
 */
const cues = (page: Page): Promise<string> =>
	page.evaluate(() => document.documentElement.dataset.audioCues ?? '');

test('the Music volume persists across a reload', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('/');
	await page.getByTestId('menu-settings').click();
	const dialog = page.getByRole('dialog', { name: 'Settings' });
	await dialog.getByRole('tab', { name: 'Audio' }).click();
	const music = dialog.getByTestId('volume-music');
	// quiet by default
	await expect(music).toHaveValue('25');
	await music.fill('60');
	await dialog.getByRole('button', { name: 'Done' }).click();
	await page.reload();
	await page.getByTestId('menu-settings').click();
	await page.getByRole('tab', { name: 'Audio' }).click();
	await expect(page.getByTestId('volume-music')).toHaveValue('60');
	expect(errors).toEqual([]);
});

test('a stage and a hard landing play their cues and show their signs', async ({ page }) => {
	test.setTimeout(240_000);
	const errors = watchErrors(page);
	await launchTwoStage(page);
	// stage: the decouple cue, and the stage toast is its sign
	await page.keyboard.press('Space');
	await expect.poll(() => cues(page), { timeout: 15_000 }).toContain('decouple:');
	// 500 m up, falling fast: the landing is hard enough to break parts
	await debugSetLocation(page, {
		kind: 'air',
		latitude: 0,
		longitude: 0.3,
		altitude: 500,
		speed: 60,
		climb: -Math.PI / 2
	});
	await expect.poll(() => cues(page), { timeout: 60_000 }).toContain('touchdown:');
	await expect.poll(() => cues(page), { timeout: 15_000 }).toContain('explosion:');
	await expect(page.getByText(/Touchdown at \d+(\.\d)? m\/s/).first()).toBeVisible({
		timeout: 15_000
	});
	await expect(page.getByText(/destroyed/i).first()).toBeVisible({ timeout: 15_000 });
	expect(errors).toEqual([]);
});
