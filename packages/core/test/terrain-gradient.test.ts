/** Plan 068 / ADR 0116: the analytic gradient of the terrain against central differences. */
import { describe, expect, test } from 'bun:test';
import {
	cachedPlanetMap,
	createRng,
	latLonDirection,
	LEGACY_ZONE,
	terrainHeight,
	terrainHeightAndGradient,
	terrainShift,
	terrainSlopes,
	type TerrainContext,
	type Vec3
} from '../src/index.ts';

const R = 600_000;
const norm = (v: Vec3): Vec3 => {
	const l = Math.hypot(v.x, v.y, v.z);
	return { x: v.x / l, y: v.y / l, z: v.z / l };
};
const cross = (a: Vec3, b: Vec3): Vec3 => ({
	x: a.y * b.z - a.z * b.y,
	y: a.z * b.x - a.x * b.z,
	z: a.x * b.y - a.y * b.x
});
/** The bakes' tangent basis (`terrainTangent1` in GLSL). */
const basis = (n: Vec3): [Vec3, Vec3] => {
	const t1 = norm(cross(n, Math.abs(n.y) > 0.99 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }));
	return [t1, cross(n, t1)];
};
const step = (n: Vec3, t: Vec3, d: number): Vec3 =>
	norm({ x: n.x + t.x * d, y: n.y + t.y * d, z: n.z + t.z * d });

/** 10 000 directions: half anywhere, half within 120 km of the site (where the relief is). */
function directions(seed: number): Vec3[] {
	const rng = createRng(seed);
	const out: Vec3[] = [];
	for (let i = 0; i < 10_000; i++) {
		if (i % 2 === 0) {
			const z = 2 * rng.next() - 1;
			const a = 2 * Math.PI * rng.next();
			const s = Math.sqrt(1 - z * z);
			out.push({ x: s * Math.cos(a), y: z, z: s * Math.sin(a) });
		} else {
			const d = (rng.next() * 120_000) / R;
			const b = 2 * Math.PI * rng.next();
			out.push(latLonDirection(d * Math.sin(b), d * Math.cos(b)));
		}
	}
	return out;
}

function compare(ctx: TerrainContext, dirs: Vec3[]) {
	const d = 0.05 / R; // 5 cm of arc
	let worst = 0;
	let relief = 0;
	let worstAt = -1;
	dirs.forEach((n, i) => {
		const [t1, t2] = basis(n);
		const a = terrainSlopes(n, t1, t2, ctx);
		const f1 =
			(terrainHeight(step(n, t1, d), ctx) - terrainHeight(step(n, t1, -d), ctx)) / (2 * d * R);
		const f2 =
			(terrainHeight(step(n, t2, d), ctx) - terrainHeight(step(n, t2, -d), ctx)) / (2 * d * R);
		const err = Math.max(Math.abs(a.g1 - f1), Math.abs(a.g2 - f2));
		if (a.height > 0) relief++;
		if (err > worst) {
			worst = err;
			worstAt = i;
		}
	});
	return { worst, relief, worstAt };
}

describe('terrainHeightAndGradient', () => {
	const legacy: TerrainContext = { radius: R, map: cachedPlanetMap(1024) };

	test('the height is terrainHeight bit for bit', () => {
		for (const n of directions(3).slice(0, 2_000)) {
			expect(terrainHeightAndGradient(n, legacy).height).toBe(terrainHeight(n, legacy));
		}
	});

	test('the gradient is within 1e-3 of central differences at 10 000 points (Legacy)', () => {
		const r = compare(legacy, directions(68));
		console.log(
			`gradient vs central difference (Legacy): worst ${r.worst.toExponential(2)}, ${r.relief} points with relief`
		);
		expect(r.relief).toBeGreaterThan(2_000); // the points cover real relief
		expect(r.worst).toBeLessThan(1e-3);
	});

	test('the same with another seed and two zones', () => {
		const zones = [
			LEGACY_ZONE,
			{ latitude: 0.02, longitude: 0.05, flatRadius: 3_000, blendWidth: 6_000 }
		];
		const ctx: TerrainContext = {
			radius: R,
			map: cachedPlanetMap(1024, { seed: 7, zones }),
			zones,
			shift: terrainShift(7)
		};
		const r = compare(ctx, directions(69));
		console.log(
			`gradient vs central difference (seed 7, two zones): worst ${r.worst.toExponential(2)}, ${r.relief} points with relief`
		);
		expect(r.worst).toBeLessThan(1e-3);
	});

	test('in the flat zones the gradient is exactly zero', () => {
		for (let i = 0; i < 200; i++) {
			const d = ((i % 50) * 90) / R;
			const n = latLonDirection(d * Math.sin(i), d * Math.cos(i));
			const g = terrainHeightAndGradient(n, legacy).gradient;
			expect([g.x, g.y, g.z]).toEqual([0, 0, 0]);
		}
	});
});
