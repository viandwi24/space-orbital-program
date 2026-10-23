/**
 * One report for the device tiers of the 120 Hz wave (plan 392, ADR 0330): run it on the M2 and on
 * Windows machines (mid-range integrated or a GTX 1650 / RTX 3050 class card) and send the JSON
 * back. It finds the tier from the GPU and the display, then runs the same views at the preset the
 * device chooses for itself, on WebGPU and WebGL with the governor on, and records the p95 frame
 * interval against the tier's lock (60 for these tiers), the GPU's time per pass, the main thread's
 * Long Animation Frames and the cold first-load time with the shader compile times per pipeline.
 *
 * From a plain checkout, on the machine to measure, plugged in and idle (Energy Saver off):
 *
 *   bun install && NODE_ENV=development bun run build && bun scripts/serve.ts 5211 &
 *   bun scripts/measure-tier.ts          # writes tier-report-<tier>.json here and prints the table
 *
 * On Windows set MEASURE_ANGLE=d3d11 (the default there); to measure a cold shader cache clear the
 * browser's GPU cache first (delete the Chromium profile's `GPUCache` folder). Options as
 * `measure-120hz.ts`; SHOT_URL if the server is elsewhere; MEASURE_NOTES for what the machine is.
 */
import { writeFileSync } from 'node:fs';
import { markdownOf, runMatrix, VIEWS, type View } from './lib/frame-matrix';

const list = (name: string, fallback: string): string[] =>
	(process.env[name] ?? fallback).split(',');
const angle =
	process.env.MEASURE_ANGLE ??
	(process.platform === 'win32' ? 'd3d11' : process.platform === 'darwin' ? 'metal' : 'gl');
const report = await runMatrix(
	{
		base: process.env.SHOT_URL ?? 'http://localhost:5211',
		viewport: { width: Number(process.env.VW ?? 1512), height: Number(process.env.VH ?? 945) },
		dsf: Number(process.env.DSF ?? 1),
		backends: list('BACKENDS', 'webgpu,webgl'),
		presets: list('PRESETS', 'auto'),
		governors: list('GOVERNORS', 'on') as ('on' | 'off')[],
		views: list('VIEWS', VIEWS.join(',')) as View[],
		seconds: Number(process.env.SECONDS ?? 30),
		warm: Number(process.env.WARM ?? 8),
		angle,
		headless: false,
		notes: process.env.MEASURE_NOTES,
		log: (line) => console.log(line)
	},
	{ notes: process.env.MEASURE_NOTES ?? '', platform: process.platform, arch: process.arch }
);
const file = `tier-report-${report.tier?.id ?? 'unknown'}.json`;
writeFileSync(file, JSON.stringify(report, null, 2));
console.log('\n' + markdownOf(report));
console.log(`\nThe full report is in ${file}: send it back with the table above.`);
