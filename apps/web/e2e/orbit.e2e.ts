/**
 * The sample ascent to orbit in real time (about four minutes of sim time, plus load). Not in the
 * default run: set E2E_ORBIT=1 (ADR 0040).
 */
import { expect, test } from '@playwright/test';
import { launchTwoStage, runScript, scriptLog, scriptStatus, watchErrors } from './support';

test.skip(!process.env.E2E_ORBIT, 'set E2E_ORBIT=1 to run the real-time ascent');

test('the sample ascent reaches orbit @orbit', async ({ page }) => {
	test.setTimeout(20 * 60_000);
	const errors = watchErrors(page);
	await launchTwoStage(page);
	await runScript(page, 'sample');
	await expect(scriptStatus(page)).toHaveText('running', { timeout: 60_000 });
	await expect(scriptStatus(page)).toHaveText('finished', { timeout: 15 * 60_000 });
	const log = await scriptLog(page).innerText();
	const match = /done: periapsis (\d+) m/.exec(log);
	expect(match, log).not.toBeNull();
	expect(Number(match![1])).toBeGreaterThan(70_000);
	expect(errors).toEqual([]);
});
