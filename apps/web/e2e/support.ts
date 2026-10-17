import { expect, type Page } from '@playwright/test';

/**
 * The sandbox self-test (ADR 0038) deliberately tries a same-origin fetch of `/robots.txt` from
 * inside the sandbox; the CSP blocks it and the browser logs that as a console error. That one
 * message pair is expected; anything else is not.
 */
const EXPECTED_PROBE_BLOCK = /robots\.txt/;

/**
 * zod probes whether the page may compile code (`new Function`) when it builds its first schema and
 * falls back to interpreted parsers when it may not. Under the production Content-Security-Policy
 * (no `'unsafe-eval'`, `docs/architecture/hosting.md`) Firefox logs that caught probe as a console
 * error. It is expected and harmless; any other CSP message is not.
 */
const EXPECTED_EVAL_PROBE =
	/Content-Security-Policy: The page.s settings blocked a JavaScript eval/;

/** Everything the page logs as an error, to be asserted empty at the end of a test. */
export function watchErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('console', (message) => {
		if (message.type() !== 'error') return;
		const text = message.text();
		if (EXPECTED_EVAL_PROBE.test(text)) return;
		if (EXPECTED_PROBE_BLOCK.test(text) && /Content Security Policy|connect-src/i.test(text))
			return;
		errors.push(`console: ${text}`);
	});
	page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
	return errors;
}

/** /vab -> load the two-stage example -> Launch -> /flight with the vessel flying. */
export async function launchTwoStage(page: Page): Promise<void> {
	await page.goto('/vab');
	await page.getByRole('button', { name: 'Load the two-stage example' }).click();
	const launch = page.getByRole('button', { name: /^Launch/ });
	await expect(launch).toBeEnabled();
	await launch.click();
	const anyway = page.getByRole('button', { name: 'Launch anyway' });
	if (await anyway.isVisible().catch(() => false)) await anyway.click();
	await page.waitForURL('**/flight');
	await expect(page.getByTestId('hud-met')).toBeVisible({ timeout: 60_000 });
}

/** Open the script panel, put `source` in the editor (or load the sample) and press Run. */
export async function runScript(page: Page, source: string | 'sample'): Promise<void> {
	const panel = page.getByRole('button', { name: 'Script panel' });
	if ((await panel.getAttribute('aria-pressed')) !== 'true') await panel.click();
	if (source === 'sample') {
		await page.getByRole('button', { name: 'Load sample' }).click();
	} else {
		await page.getByLabel('Script source').fill(source);
	}
	// Run is disabled until the sim has loaded the vessel and the editor holds text.
	const run = page.getByRole('button', { name: 'Run', exact: true });
	try {
		await expect(run).toBeEnabled({ timeout: 60_000 });
	} catch (error) {
		// Say what the page showed: a disabled Run means the flight did not start.
		const shown = (
			await page
				.locator('body')
				.innerText()
				.catch(() => '')
		).slice(0, 1500);
		throw new Error(`Run stayed disabled. Page text:\n${shown}\n${String(error)}`);
	}
	await run.click();
}

export const scriptStatus = (page: Page) => page.getByTestId('script-status');
export const scriptLog = (page: Page) => page.getByLabel('Script output');

/** Seconds of mission elapsed time shown in the HUD (`T+01:02`, `T+1:02:03`). */
export async function metSeconds(page: Page): Promise<number> {
	const text = (await page.getByTestId('hud-met').innerText()).replace('T+', '').trim();
	return text.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}
