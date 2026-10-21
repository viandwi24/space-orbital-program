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

/** /vab -> load the two-stage example -> Launch -> the Launch screen -> /flight with the vessel flying. */
export async function launchTwoStage(page: Page): Promise<void> {
	await page.goto('/vab');
	await page.getByRole('button', { name: 'Load the two-stage example' }).click();
	const launch = page.getByRole('button', { name: /^Launch/ });
	await expect(launch).toBeEnabled();
	await launch.click();
	const anyway = page.getByRole('button', { name: 'Launch anyway' });
	if (await anyway.isVisible().catch(() => false)) await anyway.click();
	// the Launch screen (plan 094): the default facility and the design from the Hangar
	await page.waitForURL('**/launch');
	await page.getByTestId('launch-go').click();
	await page.waitForURL('**/flight');
	await expect(page.getByTestId('hud-met')).toBeVisible({ timeout: 60_000 });
	// T+ shows in the time bar before the HUD has its first model; staging comes with the model, which
	// with the WebGPU default (plan 261) can take about 20 s under software rendering
	await expect(page.getByTestId('staging')).toBeVisible({ timeout: 60_000 });
}

/**
 * Open a dock panel (plan 272, ADR 0253: the vessel panel's tabs and the crew are dock entries
 * `host.vessel`, `host.parts`, `host.resources`, `host.comms`, `host.crew`); a no-op when it is open.
 */
export async function openDock(page: Page, id: string): Promise<void> {
	const tab = page.getByTestId(`dock-tab-${id}`);
	if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
	if (id === 'host.parts') {
		// the part rows fold (plan 256): unfold them all so their controls can be pressed
		const panel = page.getByTestId('vessel-panel');
		await panel.waitFor();
		// the categories are <details> too: wait for the part rows themselves
		await expect(panel.locator('[data-testid="vessel-part"]').first()).toBeAttached({
			timeout: 30_000
		});
		await panel
			.locator('details')
			.evaluateAll((all) => all.forEach((d) => ((d as HTMLDetailsElement).open = true)));
	}
}

/** Open the script panel, put `source` in the editor (or load the sample) and press Run. */
export async function runScript(page: Page, source: string | 'sample'): Promise<void> {
	// the script editor is a dock panel (the flight toolbar's Script button went with plan 233)
	const panel = page.getByTestId('dock-tab-host.script');
	if ((await panel.getAttribute('aria-selected')) !== 'true') await panel.click();
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

// ---- the debug API (plan 203, ADR 0200 point 9) ------------------------------------------------
// Later plans set up the state they test with these instead of flying there. They need a world
// where the debug tools are allowed (Sandbox, or Debug mode on) and a flight on screen; each one
// resolves once a snapshot shows the change and throws with the sim's reason on a refusal.

type DebugResult = { ok: true } | { ok: false; reason: string };

async function debugCall(page: Page, method: string, ...args: unknown[]): Promise<void> {
	await page.waitForFunction(() => '__orbitalDebug' in window, null, { timeout: 60_000 });
	const result = await page.evaluate(
		([name, params]) => {
			const api = (
				window as unknown as { __orbitalDebug: Record<string, (...a: unknown[]) => unknown> }
			).__orbitalDebug;
			return api[name as string]!(...(params as unknown[])) as Promise<DebugResult>;
		},
		[method, args] as const
	);
	if (!result.ok) throw new Error(`${method} refused: ${result.reason}`);
}

/** The focused vessel on rails in an orbit: `{ apoapsis, periapsis }` altitudes (m) or elements. */
export const debugSetOrbit = (
	page: Page,
	orbit:
		| { body?: string; apoapsis: number; periapsis: number; i?: number }
		| Record<string, number | string>
) => debugCall(page, 'setOrbit', orbit);

/** The focused vessel landed at a site or coordinates, or in the air (`{ kind: 'air', latitude, longitude, altitude, speed }`). */
export const debugSetLocation = (page: Page, location: Record<string, unknown>) =>
	debugCall(page, 'setLocation', location);

/** Fill (`fraction: 1`), empty (`fraction: 0`) or set (`amount`) a resource on the focused vessel. */
export const debugSetResource = (
	page: Page,
	spec: { part?: number; resource?: string; fraction?: number; amount?: number }
) => debugCall(page, 'setResource', spec);

/** Switch a cheat (`'infinite-fuel'`, `'no-crash-damage'`, ...). */
export const debugCheat = (page: Page, cheat: string, on = true) =>
	debugCall(page, 'setCheat', cheat, on);

/** Units of `resource` aboard the focused vessel, from the last snapshot. */
export async function debugAmount(page: Page, resource: string): Promise<number> {
	await page.waitForFunction(() => '__orbitalDebug' in window, null, { timeout: 60_000 });
	return page.evaluate((id) => {
		const api = (
			window as unknown as {
				__orbitalDebug: { vessel(): { parts: Array<{ modules: Record<string, unknown> }> } | null };
			}
		).__orbitalDebug;
		let total = 0;
		for (const p of api.vessel()?.parts ?? []) {
			const c = p.modules['stock.resource-container'] as
				{ amounts?: Record<string, number> } | undefined;
			total += c?.amounts?.[id] ?? 0;
		}
		return total;
	}, resource);
}
