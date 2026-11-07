/**
 * Cost of the terrain height function per sample (plan 417): `terrainHeight` and the field's
 * `heightAt`, on four fixed sets of directions, as the median (and the minimum, the less noisy one on a shared machine) of nine timed rounds.
 *
 *   bun packages/core/bench/terrain-cost.ts [path to another checkout's packages/core, for the old function]
 *
 * Sets: `land` (the home planet's directions that are land and outside the flat zone: the worst
 * case, every term runs), `massif` (the ring 12 to 44 km from the pad, where the mountains are),
 * `sim` (a 300 m grid around a vessel on the massif, what the sim's ground reads) and `globe` (uniform
 * on the sphere: most of it ocean, which returns early). The plan's limit is 1.5 times the old cost
 * per sample.
 */
import { join } from 'node:path';

const root = process.argv[2] ?? join(import.meta.dir, '..');
const core = (await import(join(root, 'src/index.ts'))) as typeof import('../src/index.ts');
const R = 600_000;
const ctx: import('../src/index.ts').TerrainContext = {
	radius: R,
	map: core.cachedPlanetMap(1024),
	zones: [core.LEGACY_ZONE],
	shift: 0
};

let s = 12345;
const rnd = (): number => {
	s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
	return s / 4294967296;
};
const sphere = (): import('../src/index.ts').Vec3 => {
	const z = rnd() * 2 - 1;
	const a = rnd() * 2 * Math.PI;
	const r = Math.sqrt(1 - z * z);
	return { x: r * Math.cos(a), y: z, z: r * Math.sin(a) };
};
const N = 20_000;
const globe = Array.from({ length: N }, sphere);
const land = globe
	.filter((n) => {
		const [lat, lon] = core.warpedLatLon(n, R);
		return core.sampleMap(ctx.map, lat, lon)[0] > core.TERRAIN_SHAPE.landFull;
	})
	.slice(0, 5000);
const massif = Array.from({ length: 5000 }, () => {
	const d = 12_000 + rnd() * 32_000;
	const az = rnd() * 2 * Math.PI;
	return core.latLonDirection((d * Math.sin(az)) / R, (d * Math.cos(az)) / R);
});
const simGrid: import('../src/index.ts').Vec3[] = [];
for (let i = 0; i < 70; i++)
	for (let j = 0; j < 70; j++)
		simGrid.push(core.latLonDirection(-0.0373 + (j * 300) / R, 0.0353 + (i * 300) / R));

const sets = { land, massif, sim: simGrid, globe: globe.slice(0, 5000) };
const out: Record<string, { median: number; min: number }> = {};
for (const [name, set] of Object.entries(sets)) {
	let sink = 0;
	for (const n of set) sink += core.terrainHeight(n, ctx); // warm up the JIT
	const times: number[] = [];
	for (let round = 0; round < 9; round++) {
		const t0 = performance.now();
		for (const n of set) sink += core.terrainHeight(n, ctx);
		times.push(((performance.now() - t0) * 1000) / set.length);
	}
	times.sort((a, b) => a - b);
	out[name] = { median: times[4]!, min: times[0]! };
	console.log(
		`${name.padEnd(7)} ${set.length} samples  median ${times[4]!.toFixed(3)} us/sample  (min ${times[0]!.toFixed(3)}, max ${times[8]!.toFixed(3)})  [${sink > 0 ? 'ok' : 'zero'}]`
	);
}
console.log(JSON.stringify(out));
