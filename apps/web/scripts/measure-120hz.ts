/**
 * The 120 Hz baseline of the owner's MacBook Pro M5 (plan 392, ADR 0330): p95 frame interval, the
 * share of frames over 16.7 and 8.4 ms, the GPU's time per pass and the main thread's Long Animation
 * Frames at the pad, 3 km, 12 km and in orbit, on WebGPU and WebGL, at `high` and `medium`, with the
 * governor off and on. A heavy job: run it under `/tmp/orbital-heavy.lock` on a quiet, plugged-in
 * machine with Energy Saver off. Against a `NODE_ENV=development` build (the `__orbital` hook):
 *
 *   NODE_ENV=development bun run build && bun scripts/serve.ts 5211 &
 *   SHOT_URL=http://localhost:5211 bun scripts/measure-120hz.ts out.json
 *
 * Options (environment): VW, VH, DSF (default 1512 x 945 at 2), BACKENDS (webgpu,webgl), PRESETS
 * (high,medium), GOVERNORS (off,on), VIEWS (pad,3km,12km,orbit), SECONDS (20), WARM (6),
 * MEASURE_ANGLE (metal), MEASURE_NOTES (the machine's state and the commit).
 * Prints a markdown table; the JSON goes to the file named as the first argument.
 */
import { writeFileSync } from 'node:fs';
import { markdownOf, runMatrix, VIEWS, type View } from './lib/frame-matrix';

const list = (name: string, fallback: string): string[] =>
	(process.env[name] ?? fallback).split(',');
const report = await runMatrix(
	{
		base: process.env.SHOT_URL ?? 'http://localhost:5211',
		viewport: { width: Number(process.env.VW ?? 1512), height: Number(process.env.VH ?? 945) },
		dsf: Number(process.env.DSF ?? 2),
		backends: list('BACKENDS', 'webgpu,webgl'),
		presets: list('PRESETS', 'high,medium'),
		governors: list('GOVERNORS', 'off,on') as ('on' | 'off')[],
		views: list('VIEWS', VIEWS.join(',')) as View[],
		seconds: Number(process.env.SECONDS ?? 20),
		warm: Number(process.env.WARM ?? 6),
		angle: process.env.MEASURE_ANGLE ?? 'metal',
		headless: process.env.MEASURE_HEADLESS === '1',
		notes: process.env.MEASURE_NOTES,
		log: (line) => console.log(line)
	},
	{ notes: process.env.MEASURE_NOTES ?? '', platform: process.platform, arch: process.arch }
);
console.log('\n' + markdownOf(report));
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2));
