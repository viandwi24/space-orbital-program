/**
 * The script editor from the keyboard (plan 036): auto-indent, a completion accepted with Tab, a
 * problem reported, find, undo, and Escape then Tab leaving the field without opening the pause menu.
 */
import { expect, test } from '@playwright/test';
import { launchTwoStage, watchErrors } from './support';

test('the script editor works from the keyboard and does not trap it', async ({ page }) => {
	const errors = watchErrors(page);
	await launchTwoStage(page);
	await page.getByRole('button', { name: 'Script panel' }).click();
	const editor = page.getByLabel('Script source');
	await editor.fill('');
	await editor.click();

	// Auto-indent after an opening brace, and the closing brace lines up with its opener.
	await page.keyboard.type('while (ship.altitude < 5) {');
	await page.keyboard.press('Enter');
	await page.keyboard.type('ship.thr');
	// The completion list names the member; Tab takes it instead of indenting.
	await expect(page.getByRole('option', { name: /throttle/ })).toBeVisible();
	await page.keyboard.press('Tab');
	await page.keyboard.type(' = 1;');
	await page.keyboard.press('Enter');
	await page.keyboard.type('wait(1);');
	await page.keyboard.press('Enter');
	await page.keyboard.type('}');
	await expect(editor).toHaveValue(
		'while (ship.altitude < 5) {\n\tship.throttle = 1;\n\twait(1);\n}'
	);
	// A bare wait() is reported, with a way to jump to its line.
	await expect(page.getByLabel(/Problems in the script/)).toContainText(
		'wait() does nothing unless you await it'
	);

	// Undo steps back through the edits, redo returns.
	await page.keyboard.press('Control+z');
	await expect(editor).toHaveValue(
		'while (ship.altitude < 5) {\n\tship.throttle = 1;\n\twait(1);\n\t'
	);
	await page.keyboard.press('Control+Shift+z');
	await expect(editor).toHaveValue(
		'while (ship.altitude < 5) {\n\tship.throttle = 1;\n\twait(1);\n}'
	);

	// Find highlights the matches and counts them.
	await page.keyboard.press('Control+f');
	await page.getByLabel('Find in the script').fill('ship');
	await expect(page.locator('.find .count')).toHaveText('1 of 2');
	await page.keyboard.press('Enter');
	await expect(page.locator('.find .count')).toHaveText('2 of 2');
	await page.keyboard.press('Escape');
	await expect(page.getByLabel('Find in the script')).toHaveCount(0);

	// Escape, then Tab, leaves the editor; the page's own Escape (the pause menu) did not fire.
	await expect(editor).toBeFocused();
	await page.keyboard.press('Escape');
	await page.keyboard.press('Tab');
	await expect(editor).not.toBeFocused();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	expect(errors).toEqual([]);
});
