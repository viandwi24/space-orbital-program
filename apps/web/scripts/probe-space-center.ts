/**
 * Opens a new Sandbox world's Space Center in Playwright's Chromium and prints every console
 * error and warning with its stack, and the loading screen's step while it waits (plan 388).
 *
 *   PROBE_URL=http://localhost:5173 PROBE_GPU=metal|swiftshader PROBE_RENDERER=webgpu|webgl|webgpu-fallback \
 *     bun scripts/probe-space-center.ts [shot.jpg]
 */
import { chromium } from '@playwright/test';

const base = process.env.PROBE_URL ?? 'http://localhost:5173';
const gpu = process.env.PROBE_GPU ?? 'metal';
const renderer = process.env.PROBE_RENDERER;
const wait = Number(process.env.PROBE_WAIT ?? 60_000);
const shot = process.argv[2];

const browser = await chromium.launch({
	args:
		gpu === 'swiftshader'
			? ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
			: [`--use-angle=${gpu}`, '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, baseURL: base });
const page = await context.newPage();
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
page.on('console', (m) => {
	if (m.type() === 'error' || m.type() === 'warning')
		console.log(`[${at()}] ${m.type()}: ${m.text().split('\n').slice(0, 12).join('\n    ')}`);
});
page.on('pageerror', (e) => console.log(`[${at()}] pageerror: ${e.stack ?? e.message}`));

await page.goto('/worlds');
// PROBE_CHOICE: the renderer picked in Settings (webgpu|webgl)
if (process.env.PROBE_CHOICE)
	await page.evaluate(
		(c) => localStorage.setItem('orbital.graphics.renderer', c),
		process.env.PROBE_CHOICE
	);
await page.getByTestId('worlds-create').click();
const form = page.getByTestId('create-world');
await form.getByTestId('world-name').fill('Probe');
await form.getByRole('radio', { name: 'Sandbox', exact: true }).click();
await form.getByTestId('world-create').click();
await page.getByTestId('world-enter').click();
await page.waitForURL('**/space-center');
if (renderer) await page.goto(`/space-center?renderer=${renderer}`);
const end = Date.now() + wait;
let last = '';
while (Date.now() < end) {
	const state = await page.evaluate(() => {
		const c = document.querySelector('canvas[data-engine]') as HTMLCanvasElement | null;
		const loading = document.querySelector('[data-testid="loading-screen"]');
		const all = [...document.querySelectorAll('canvas')]
			.map((x) => `${x.dataset.testid ?? '?'}:${x.width}x${x.height}`)
			.join(',');
		const rep = (
			window as unknown as {
				__orbitalLoadReport?: () => { data: { backend: string; steps: unknown } } | null;
			}
		).__orbitalLoadReport?.();
		const step = document.querySelector('[data-testid="loading-screen"] p.step')?.textContent ?? '';
		return `${c?.dataset.engine ?? '-'} [${all}] ${rep ? rep.data.backend + ' ' + JSON.stringify(rep.data.steps) : 'no report'} ${step} | ${loading ? (loading as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 160) : 'no loading screen'}`;
	});
	if (state !== last) console.log(`[${at()}] ${state}`);
	// PROBE_LOWER: click "Continue with lower quality" as soon as it shows
	if (process.env.PROBE_LOWER && (await page.getByTestId('loading-lower').count()) > 0) {
		console.log(`[${at()}] clicking "Continue with lower quality"`);
		await page.getByTestId('loading-lower').click();
	}
	last = state;
	if (state.includes('no loading screen') && !state.startsWith('-')) break;
	await page.waitForTimeout(1000);
}
if (process.env.PROBE_DIAG)
	console.log(
		await page.evaluate(async () => {
			const race = <T>(p: Promise<T>, ms: number) =>
				Promise.race([p, new Promise((r) => setTimeout(() => r(`timeout ${ms} ms`), ms))]);
			const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
			const adapter = gpu
				? await race(
						gpu.requestAdapter().then((a) => (a ? 'adapter' : 'null')),
						5000
					)
				: 'no gpu';
			const idb = await race(
				new Promise((res) => {
					const q = indexedDB.open('orbital-bakes', 1);
					q.onsuccess = () => res('open');
					q.onerror = () => res('error');
					q.onblocked = () => res('blocked');
				}),
				5000
			);
			return `diag: requestAdapter ${adapter}; orbital-bakes ${idb}`;
		})
	);
await page.waitForTimeout(5000);
if (shot) await page.screenshot({ path: shot, type: 'jpeg', quality: 82 });
await browser.close();
