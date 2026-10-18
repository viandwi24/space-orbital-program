/**
 * The script editor from the keyboard (plan 036, 058): auto-indent, a completion accepted with Tab, a
 * problem reported, find, undo, and Escape then Tab leaving the field without opening the pause menu;
 * then replace, go to line, comments, moving lines, the engine's syntax error before Run, input-method
 * keys left alone, the second suggest key (plan 072), and the on-screen keys on a touch screen. Run in
 * Chromium, Firefox and WebKit. Also the Hangar's mark on a joint whose sizes differ (plan 207).
 */
import { expect, test, type Page } from '@playwright/test';
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

const selected = (page: Page): Promise<string> =>
	page
		.getByLabel('Script source')
		.evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionEnd));

test('replace, go to line, comments, moving lines, and a syntax error before Run', async ({
	page
}) => {
	const errors = watchErrors(page);
	await launchTwoStage(page);
	await page.getByRole('button', { name: 'Script panel' }).click();
	const editor = page.getByLabel('Script source');
	await editor.fill('a ship\nship b\nshipment');
	await editor.click();

	// Whole word leaves "shipment" alone; replace all rewrites the others in one undo step.
	await page.keyboard.press('Control+f');
	await page.getByLabel('Find in the script').fill('ship');
	await expect(page.locator('.find .count')).toHaveText('1 of 3');
	await page.getByRole('button', { name: 'Whole word' }).click();
	await expect(page.locator('.find .count')).toHaveText('1 of 2');
	await page.getByLabel('Replace with').fill('craft');
	await page.getByRole('button', { name: 'Replace all' }).click();
	await expect(editor).toHaveValue('a craft\ncraft b\nshipment');
	await page.keyboard.press('Escape');
	await expect(page.getByLabel('Find in the script')).toHaveCount(0);
	await expect(editor).toBeFocused();
	await page.keyboard.press('Control+z');
	await expect(editor).toHaveValue('a ship\nship b\nshipment');
	await page.keyboard.press('Control+Shift+z');
	await expect(editor).toHaveValue('a craft\ncraft b\nshipment');

	// Replace one at a time.
	await page.keyboard.press('Control+f');
	await page.getByLabel('Find in the script').fill('craft');
	await page.getByLabel('Replace with').fill('ship');
	// Typing the query selected the first match; Replace swaps it and moves on to the next.
	await page.getByRole('button', { name: 'Replace', exact: true }).click();
	await expect(editor).toHaveValue('a ship\ncraft b\nshipment');
	await page.keyboard.press('Escape');

	// Go to line 2 selects it; a bad number says so.
	await page.keyboard.press('Control+g');
	await page.getByRole('textbox', { name: 'Go to line' }).fill('x');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('alert')).toContainText('Type a line number from 1 to 3');
	await page.getByRole('textbox', { name: 'Go to line' }).fill('2');
	await page.keyboard.press('Enter');
	await expect(editor).toBeFocused();
	expect(await selected(page)).toBe('craft b');

	// Comment, uncomment, move up, copy down.
	await page.keyboard.press('Control+/');
	await expect(editor).toHaveValue('a ship\n// craft b\nshipment');
	await page.keyboard.press('Control+/');
	await expect(editor).toHaveValue('a ship\ncraft b\nshipment');
	await page.keyboard.press('Alt+ArrowUp');
	await expect(editor).toHaveValue('craft b\na ship\nshipment');
	await page.keyboard.press('Shift+Alt+ArrowDown');
	await expect(editor).toHaveValue('craft b\ncraft b\na ship\nshipment');

	// Input-method keys are left to the browser: Tab, Enter and Ctrl+Z during a composition, with
	// keyCode 229 (Safari) and as a plain composing event change nothing.
	const before = await editor.inputValue();
	const swallowed = await editor.evaluate((el: HTMLTextAreaElement) => {
		const out: boolean[] = [];
		const press = (init: KeyboardEventInit & { keyCode?: number }): void => {
			const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
			el.dispatchEvent(e);
			out.push(e.defaultPrevented);
		};
		el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
		press({ key: 'Tab' });
		press({ key: 'Enter' });
		press({ key: 'z', ctrlKey: true });
		el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
		press({ key: 'Tab', keyCode: 229 });
		press({ key: 'Enter', keyCode: 229 });
		press({ key: 'Process' });
		return out;
	});
	expect(swallowed).toEqual([false, false, false, false, false, false]);
	await expect(editor).toHaveValue(before);

	// The engine's own syntax error shows before anything is run.
	await editor.fill('print(1);\nlet a = ;');
	await expect(page.getByLabel(/Problems in the script/)).toContainText('Syntax error', {
		timeout: 30_000
	});
	await expect(page.getByLabel(/Problems in the script/)).toContainText('Line 2');
	await expect(page.getByTestId('script-status')).toHaveText('idle');
	await editor.fill('print("checked");\nlet a = 2;');
	await expect(page.getByLabel(/Problems in the script/)).toHaveCount(0);

	// The checker's sandbox is not the Run's: Run still works and, while the script runs, the page
	// still says it is isolated (both contexts of the Run's sandbox reported all probes shut).
	await editor.fill('print("checked");\nawait wait(1000);');
	await page.getByRole('button', { name: 'Run', exact: true }).click();
	await expect(page.getByLabel('Script output')).toContainText('checked', { timeout: 60_000 });
	await expect(page.getByTestId('script-status')).toHaveText('running');
	await expect(page.getByTestId('sandbox-note')).toContainText('Runs isolated');
	await page.getByRole('button', { name: 'Stop' }).click();
	expect(errors).toEqual([]);
});

test('nested suggestions and the keys of a node', async ({ page }) => {
	await launchTwoStage(page);
	await page.getByRole('button', { name: 'Script panel' }).click();
	const editor = page.getByLabel('Script source');
	await editor.fill('');
	await editor.click();
	await page.keyboard.type('ship.target.dis');
	await expect(page.getByRole('option', { name: /distance/ })).toBeVisible();
	await page.keyboard.press('Tab');
	await expect(editor).toHaveValue('ship.target.distance');
	await editor.fill('');
	await page.keyboard.type('await addNode({ pro');
	await expect(page.getByRole('option', { name: /prograde/ })).toBeVisible();
	await page.keyboard.press('Enter');
	await expect(editor).toHaveValue('await addNode({ prograde: ');

	// The second "suggest" key (ADR 0162): Cmd+I and Ctrl+I open the list and type nothing.
	const list = page.getByRole('listbox', { name: 'Suggestions' });
	for (const chord of ['Meta+i', 'Control+i']) {
		await editor.fill('');
		await expect(list).toBeHidden();
		await page.keyboard.press(chord);
		await expect(list).toBeVisible();
		await expect(editor).toHaveValue('');
		await expect(editor).toBeFocused();
		await page.keyboard.press('Escape');
	}
});

test('the on-screen keys appear on a touch screen and indent, undo and suggest', async ({
	browser,
	browserName
}) => {
	test.skip(browserName === 'firefox', 'Firefox has no isMobile (touch screen emulation)');
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		hasTouch: true,
		isMobile: true
	});
	// The flight's own touch overlay is turned off: it sits over the corners of a small screen and
	// is not what this test is about (the editor's keys follow the pointer, not that setting).
	await context.addInitScript(() =>
		localStorage.setItem('orbital.settings', JSON.stringify({ v: 2, touch: 'off' }))
	);
	const page = await context.newPage();
	try {
		await launchTwoStage(page);
		await page.getByRole('button', { name: 'Script panel' }).click();
		const editor = page.getByLabel('Script source');
		await editor.fill('while (true) {');
		await editor.click();
		await page.keyboard.press('End');
		const bar = page.getByRole('toolbar', { name: 'Editor keys' });
		await expect(bar).toBeVisible();
		await bar.getByRole('button', { name: /Indent/ }).click();
		await expect(editor).toHaveValue('while (true) {\t');
		await expect(editor).toBeFocused(); // pressing a key does not take the focus away
		await bar.getByRole('button', { name: 'Undo' }).click();
		await expect(editor).toHaveValue('while (true) {');
		await bar.getByRole('button', { name: 'Redo' }).click();
		await expect(editor).toHaveValue('while (true) {\t');
		await editor.fill('\tindented');
		await bar.getByRole('button', { name: /Outdent/ }).click();
		await expect(editor).toHaveValue('indented');
		await editor.fill('');
		await bar.getByRole('button', { name: 'Suggest' }).click();
		await expect(page.getByRole('listbox', { name: 'Suggestions' })).toBeVisible();
	} finally {
		await context.close();
	}
});

test('the Hangar marks a joint whose sizes differ, and not a cone on the booster (plan 207)', async ({
	page
}) => {
	const errors = watchErrors(page);
	await page.goto('/vab');
	await page.getByRole('button', { name: 'Load the booster rocket' }).click();
	const checks = page.getByRole('region', { name: 'Pre-flight checks' });
	await expect(checks).toBeVisible();
	await expect(checks.getByTestId('size-mismatch-mark')).toHaveCount(0);
	await expect(checks).not.toContainText('Size mismatch');

	// A 0.625 m nose cone straight on a 1.25 m tank, imported as a design file.
	const design = {
		formatVersion: 3,
		name: 'Cone mismatch',
		parts: [
			{ index: 0, part: 'stock.tank-small', parent: null },
			{
				index: 1,
				part: 'stock.nose-cone-small',
				parent: { index: 0, parentNode: 'top', node: 'bottom' }
			}
		],
		stages: []
	};
	await page.goto('/vab?library');
	const library = page.getByRole('dialog', { name: 'Vessel library' });
	await expect(library).toBeVisible();
	await library.locator('input[type=file]').setInputFiles({
		name: 'cone-mismatch.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(design))
	});
	await expect(library.getByRole('status')).toHaveText('Imported Cone mismatch.');
	await library
		.getByRole('listitem')
		.filter({ hasText: 'Cone mismatch' })
		.getByRole('button', { name: 'Open' })
		.click();
	await expect(checks.getByTestId('size-mismatch-mark')).toBeVisible();
	await expect(checks).toContainText('Size mismatch: a 0.625 m part sits on a 1.25 m joint.');
	expect(errors).toEqual([]);
});
