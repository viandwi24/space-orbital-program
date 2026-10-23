/**
 * Shader compile at world load (plan 370): loads /flight in a headed Chrome with a persistent
 * profile (so Chrome's GPU shader cache works as for a player) and reports the world's loading
 * steps, the shader modules (count, bytes, the largest) and the render pipelines (sync or async, the
 * async ones' time), for a first and then a second (cached) load.
 *
 *   NODE_ENV=development bun run build && bun scripts/serve.ts 5212 &
 *   SHOT_URL=http://localhost:5212 bun scripts/measure-shader-compile.ts out.json
 *
 * Options (environment):
 *   BACKEND   webgpu (default) or webgl
 *   PRESET    low / medium / high / auto (default auto, adjust on)
 *   LOADS     loads in the same profile (default 2: first, cached)
 *   DUMP      a directory to write every WGSL / GLSL source into (the size analysis)
 *   PROFILE   the Chrome profile directory (default a fresh temporary one)
 *   SHOTS     a directory for a screenshot after each load
 *   AFTER     ms to wait after the loading screen before reading (default 8000)
 *   BOOT      low or off: `orbital.graphics.boot` (low draws the cheap preset first anywhere, plan 370)
 */
import { chromium } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.env.SHOT_URL ?? 'http://localhost:5212';
const out = process.argv[2];
const backend = process.env.BACKEND ?? 'webgpu';
const preset = process.env.PRESET ?? 'auto';
const loads = Number(process.env.LOADS ?? 2);
const dump = process.env.DUMP;
const profile = process.env.PROFILE ?? mkdtempSync(join(tmpdir(), 'orbital-compile-'));

const context = await chromium.launchPersistentContext(profile, {
	headless: false,
	viewport: { width: 1512, height: 945 },
	deviceScaleFactor: 2,
	baseURL: base,
	args: [
		'--use-angle=metal',
		'--enable-gpu',
		'--ignore-gpu-blocklist',
		'--enable-unsafe-webgpu',
		'--disable-background-timer-throttling',
		'--disable-renderer-backgrounding',
		'--disable-backgrounding-occluded-windows'
	]
});
await context.addInitScript(
	([b, p]) => {
		localStorage.setItem('orbital.vab.hideStart', '1');
		localStorage.setItem('orbital.onboarding.off', '1');
		localStorage.setItem('orbital.graphics.renderer', b!);
		if (p === 'auto') localStorage.removeItem('orbital.graphics');
		else localStorage.setItem('orbital.graphics', p!);
	},
	[backend, preset]
);

// The same log for any build (the baseline before plan 370 has no load report): the device's
// module and pipeline calls, wrapped as the page asks for the device.
await context.addInitScript(() => {
	const log = {
		modules: [] as { label: string; bytes: number; code?: string }[],
		pipelines: [] as { label: string; mode: string; at: number; ms: number | null }[]
	};
	(window as any).__compileLog = log;
	const keep = localStorage.getItem('orbital.debug.shaderSources') === '1';
	const gpu = (navigator as any).gpu;
	if (!gpu) return;
	const request = GPUAdapter.prototype.requestDevice;
	GPUAdapter.prototype.requestDevice = async function (
		this: GPUAdapter,
		desc?: GPUDeviceDescriptor
	) {
		const device = await request.call(this, desc);
		const mod = device.createShaderModule.bind(device);
		device.createShaderModule = (d: GPUShaderModuleDescriptor) => {
			const code = String(d.code);
			log.modules.push({ label: d.label ?? '', bytes: code.length, ...(keep ? { code } : {}) });
			return mod(d);
		};
		const sync = device.createRenderPipeline.bind(device);
		device.createRenderPipeline = (d: GPURenderPipelineDescriptor) => {
			log.pipelines.push({ label: d.label ?? '', mode: 'sync', at: performance.now(), ms: null });
			return sync(d);
		};
		const later = device.createRenderPipelineAsync.bind(device);
		device.createRenderPipelineAsync = (d: GPURenderPipelineDescriptor) => {
			const e = {
				label: d.label ?? '',
				mode: 'async',
				at: performance.now(),
				ms: null as number | null
			};
			log.pipelines.push(e);
			const p = later(d);
			p.then(() => (e.ms = performance.now() - e.at)).catch(() => {});
			return p;
		};
		return device;
	};
});
if (process.env.BOOT)
	await context.addInitScript(
		(b) => localStorage.setItem('orbital.graphics.boot', b),
		process.env.BOOT
	);
if (dump)
	await context.addInitScript(() => localStorage.setItem('orbital.debug.shaderSources', '1'));

{
	const setup = await context.newPage();
	await setup.addInitScript(() => localStorage.removeItem('orbital.vab.hideStart'));
	await setup.goto('/vab');
	await setup.getByTestId('vab-start-kronos-selene').click({ timeout: 120_000 });
	await setup.waitForTimeout(2500);
	await setup.close();
}

const runs: unknown[] = [];
for (let load = 1; load <= loads; load++) {
	const page = await context.newPage();
	page.on('pageerror', (e) => console.log('  pageerror', e.message));
	const t0 = Date.now();
	await page.goto('/flight');
	await page.waitForFunction(
		() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0,
		null,
		{
			timeout: 600_000
		}
	);
	await page.getByTestId('world-loading').waitFor({ state: 'detached', timeout: 600_000 });
	const loadMs = Date.now() - t0;
	// the background work after the loading screen (another preset, plan 370)
	await page.waitForTimeout(Number(process.env.AFTER ?? 8000));
	if (process.env.SHOTS) {
		mkdirSync(process.env.SHOTS, { recursive: true });
		await page.screenshot({
			path: join(process.env.SHOTS, `load${load}.jpg`),
			type: 'jpeg',
			quality: 80
		});
		// ORBIT=1: also a 100 km orbit (the scaled-space planet, the sky from above)
		if (process.env.ORBIT) {
			await page.evaluate(() =>
				(window as any).__orbitalDebug.setOrbit({ apoapsis: 100_000, periapsis: 100_000 })
			);
			await page.waitForTimeout(6000);
			await page.screenshot({
				path: join(process.env.SHOTS, `load${load}-orbit.jpg`),
				type: 'jpeg',
				quality: 80
			});
		}
	}
	const report = await page.evaluate(() => (window as any).__orbitalLoadReport?.() ?? null);
	const log = await page.evaluate(() => {
		const l = (window as any).__compileLog;
		const mods = l.modules as { label: string; bytes: number; code?: string }[];
		const pipes = l.pipelines as { label: string; mode: string; at: number; ms: number | null }[];
		const timed = pipes.filter((p) => p.ms !== null).sort((a, b) => b.ms! - a.ms!);
		return {
			modules: mods.length,
			moduleBytes: mods.reduce((a, m) => a + m.bytes, 0),
			largest: [...mods]
				.sort((a, b) => b.bytes - a.bytes)
				.slice(0, 12)
				.map((m) => `${m.label} ${Math.round(m.bytes / 1024)} KB`),
			pipelines: pipes.length,
			sync: pipes.filter((p) => p.mode === 'sync').length,
			async: pipes.filter((p) => p.mode === 'async').length,
			slowest: timed.slice(0, 12).map((p) => `${p.label} ${Math.round(p.ms!)} ms`),
			sources: mods.filter((m) => m.code).map((m) => ({ label: m.label, code: m.code! }))
		};
	});
	const sources = log.sources;
	log.sources = [];
	if (dump && sources.length) {
		const dir = join(dump, `load${load}`);
		mkdirSync(dir, { recursive: true });
		sources.forEach((s, i) =>
			writeFileSync(
				join(
					dir,
					`${String(i).padStart(3, '0')}-${s.label.replace(/[^\w.-]+/g, '_').slice(0, 60)}.txt`
				),
				s.code
			)
		);
	}
	console.log(`load ${load}: ${loadMs} ms`);
	if (report?.text) console.log(report.text);
	console.log(JSON.stringify({ ...log, sources: undefined }, null, 1));
	runs.push({ load, loadMs, log: { ...log, sources: undefined }, report: report?.data ?? null });
	await page.close();
}
await context.close();
if (out)
	writeFileSync(
		out,
		JSON.stringify(
			{
				when: new Date().toISOString(),
				backend,
				preset,
				notes: process.env.MEASURE_NOTES ?? '',
				runs
			},
			null,
			1
		)
	);
