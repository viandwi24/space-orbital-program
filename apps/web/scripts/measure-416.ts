/**
 * Interleaved A/B of the orbit view for plan 416: the same cell (WebGPU, governor off, orbit) on a
 * baseline server and on this branch's, alternating, at each preset. Headed, on the Mac's GPU. Take
 * `/tmp/orbital-measuring` first (the worker brief) and record the load average with the result.
 *
 *   BASE_URL=http://localhost:5231 NEW_URL=http://localhost:5230 PRESETS=low,high REPS=3 bun scripts/measure-416.ts
 */
import { runMatrix } from './lib/frame-matrix';

const baseUrl = process.env.BASE_URL ?? 'http://localhost:5231';
const newUrl = process.env.NEW_URL ?? 'http://localhost:5230';
const presets = (process.env.PRESETS ?? 'low,high').split(',');
const reps = Number(process.env.REPS ?? 3);
const backends = (process.env.BACKENDS ?? 'webgpu').split(',');
const views = (process.env.VIEWS ?? 'orbit').split(',') as ('pad' | '3km' | '12km' | 'orbit')[];

const rows: {
	side: string;
	preset: string;
	view: string;
	backend: string;
	mean: number;
	p95: number;
	worst: number;
}[] = [];
for (let r = 0; r < reps; r++)
	for (const preset of presets)
		for (const [side, base] of [
			['base', baseUrl],
			['new', newUrl]
		] as const) {
			const report = await runMatrix(
				{
					base,
					viewport: { width: 1512, height: 945 },
					dsf: 1,
					backends,
					presets: [preset],
					governors: ['off'],
					views,
					seconds: Number(process.env.SECONDS ?? 15),
					warm: 8,
					angle: 'metal',
					headless: false
				},
				{ platform: process.platform }
			);
			for (const c of report.cells) {
				rows.push({
					side,
					preset,
					view: c.view,
					backend: c.backend,
					mean: c.intervals.meanMs,
					p95: c.intervals.p95Ms,
					worst: c.intervals.worstMs
				});
				console.log(
					`${r} ${side} ${c.backend} ${preset} ${c.view}: mean ${c.intervals.meanMs.toFixed(2)} ms, p95 ${c.intervals.p95Ms.toFixed(2)}, worst ${c.intervals.worstMs.toFixed(1)}, gpu ${c.gpuMs ?? 'n/a'}`
				);
			}
		}
const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
console.log(
	'\n| side | backend | preset | view | runs | mean ms | p95 ms | worst ms |\n|---|---|---|---|---|---|---|---|'
);
for (const backend of backends)
	for (const preset of presets)
		for (const view of views)
			for (const side of ['base', 'new']) {
				const set = rows.filter(
					(x) => x.side === side && x.preset === preset && x.view === view && x.backend === backend
				);
				console.log(
					`| ${side} | ${backend} | ${preset} | ${view} | ${set.length} | ${avg(set.map((x) => x.mean)).toFixed(2)} | ${avg(set.map((x) => x.p95)).toFixed(2)} | ${Math.max(...set.map((x) => x.worst)).toFixed(1)} |`
				);
			}
