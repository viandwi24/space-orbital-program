/** Plan 040 / ADR 0077: wreckage that lands, lies flat and stays. */
import { describe, expect, test } from 'bun:test';
import { BoxGeometry } from 'three';
import { makeShards, shardPosition } from '../src/effects/explosion.ts';
import { shardSourceFromGeometry } from '../src/effects/shards.ts';
import {
	MAX_WRECKS,
	SETTLE_TIME,
	WRECK_FADE,
	WRECK_LIFETIME,
	axisAngle,
	evictOldest,
	landing,
	landingTime,
	layFlat,
	planWreck,
	quatMul,
	rotateBy,
	rotationBetween,
	settleBlend,
	triangleNormal,
	wreckPresence,
	wreckSink
} from '../src/effects/wreckage.ts';

const G = 9.81;
const source = shardSourceFromGeometry(new BoxGeometry(2, 1, 1), () => [0.8, 0.8, 0.8]);

describe('landing', () => {
	test('the landing time solves y(t) = floor to 1e-9', () => {
		const shards = makeShards(7, 48, 5, 14);
		for (const floor of [-3, -0.5, 0]) {
			for (const s of shards) {
				const t = landingTime(s.y0, s.vy, floor, G);
				expect(t).toBeGreaterThanOrEqual(0);
				// A piece that starts under the floor and never reaches it lands at its apex instead.
				if (s.y0 + (s.vy * s.vy) / (2 * G) >= floor) {
					expect(shardPosition(s, t, G).y).toBeCloseTo(floor, 9);
				}
			}
		}
	});

	test('a piece thrown from below the floor lands at once or at the apex, never NaN', () => {
		expect(landingTime(-5, 0, 0, G)).toBe(0);
		const t = landingTime(-5, 3, 0, G);
		expect(Number.isFinite(t)).toBe(true);
	});

	test('the rest point is where the flat path is at the landing time', () => {
		const s = makeShards(3, 4, 4, 14)[1]!;
		const l = landing(s, -1, G);
		const p = shardPosition(s, l.time, G);
		expect(l.x).toBeCloseTo(p.x, 9);
		expect(l.z).toBeCloseTo(p.z, 9);
		expect(p.y).toBeCloseTo(-1, 9);
	});
});

describe('lying flat', () => {
	test('the thickness axis ends up vertical for any normal and yaw', () => {
		for (let i = 0; i < 40; i++) {
			const a = i * 0.7;
			const n = { x: Math.sin(a) * 0.6, y: Math.cos(a * 1.3) * 0.7, z: Math.cos(a) * 0.4 };
			const l = Math.hypot(n.x, n.y, n.z);
			const unit = { x: n.x / l, y: n.y / l, z: n.z / l };
			const q = layFlat(unit, i * 0.31);
			const up = rotateBy(q, unit);
			expect(Math.abs(up.y)).toBeCloseTo(1, 6);
			expect(Math.hypot(up.x, up.z)).toBeLessThan(1e-6);
		}
	});

	test('the nearer face goes down: a normal pointing up stays, one pointing down is not turned over twice', () => {
		const q = layFlat({ x: 0, y: 1, z: 0 }, 0);
		const v = rotateBy(q, { x: 1, y: 0, z: 0 });
		expect(v.y).toBeCloseTo(0, 9);
		const down = layFlat({ x: 0, y: -1, z: 0 }, 0);
		const w = rotateBy(down, { x: 0, y: -1, z: 0 });
		expect(Math.abs(w.y)).toBeCloseTo(1, 9);
	});

	test('rotationBetween handles equal and opposite vectors', () => {
		const same = rotationBetween({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 });
		expect(same.w).toBeCloseTo(1, 9);
		const flip = rotationBetween({ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 });
		const v = rotateBy(flip, { x: 0, y: 1, z: 0 });
		expect(v.y).toBeCloseTo(-1, 9);
	});

	test('quaternion product composes rotations', () => {
		const a = axisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
		const q = quatMul(a, a);
		const v = rotateBy(q, { x: 1, y: 0, z: 0 });
		expect(v.x).toBeCloseTo(-1, 9);
	});

	test('triangle normals of a box are axis aligned', () => {
		const n = triangleNormal(source, 0);
		expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 9);
		expect(Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z))).toBeCloseTo(1, 9);
	});
});

describe('planWreck', () => {
	const shards = makeShards(11, 48, 5, 14);
	const pieces = shards.map((_, k) => ({ source: 0, triangle: k % 12 }));
	const input = { seed: 11, shards, pieces, sources: [source], floor: -1.5, gravity: G };

	test('is deterministic for a seed and differs for another', () => {
		const a = planWreck(input);
		const b = planWreck(input);
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
		const c = planWreck({ ...input, seed: 12 });
		expect(JSON.stringify(c.pieces.map((p) => p.rest))).not.toBe(
			JSON.stringify(a.pieces.map((p) => p.rest))
		);
	});

	test('every piece lies on the floor, flat, and settles when the last has landed', () => {
		const plan = planWreck(input);
		expect(plan.pieces.length).toBe(48);
		for (const p of plan.pieces) {
			// resting just above the floor by half its clearance, thickness-scaled
			expect(p.y).toBeGreaterThan(input.floor);
			expect(p.y - input.floor).toBeLessThan(p.thickness + 1e-9);
			const n = triangleNormal(source, p.triangle);
			expect(Math.abs(rotateBy(p.rest, n).y)).toBeCloseTo(1, 6);
		}
		expect(plan.settled).toBe(Math.max(...plan.pieces.map((p) => p.landTime)));
	});

	test('the ground under a piece sets its height', () => {
		const plan = planWreck({ ...input, groundAt: (x) => input.floor + 0.2 * x });
		for (const p of plan.pieces) {
			expect(p.y).toBeCloseTo(input.floor + 0.2 * p.x + p.thickness / 2, 9);
		}
	});

	test('a piece that would fly for more than 12 s is not kept', () => {
		const high = planWreck({ ...input, floor: -2_000 });
		expect(high.pieces.length).toBeLessThan(48);
	});
});

describe('lifetime', () => {
	test('whole for 870 s, gone at 900, fading in between', () => {
		expect(wreckPresence(0)).toBe(1);
		expect(wreckPresence(WRECK_LIFETIME - WRECK_FADE)).toBe(1);
		expect(wreckPresence(WRECK_LIFETIME)).toBe(0);
		const mid = wreckPresence(WRECK_LIFETIME - WRECK_FADE / 2);
		expect(mid).toBeGreaterThan(0.4);
		expect(mid).toBeLessThan(0.6);
		expect(wreckSink(0)).toBe(0);
		expect(wreckSink(WRECK_LIFETIME)).toBeGreaterThan(1);
	});

	test('the settle blend is 0 in the air and 1 after the settle time', () => {
		expect(settleBlend(1, 2)).toBe(0);
		expect(settleBlend(2, 2)).toBe(0);
		expect(settleBlend(2 + SETTLE_TIME, 2)).toBe(1);
		expect(settleBlend(2 + SETTLE_TIME / 2, 2)).toBeCloseTo(0.5, 6);
	});

	test('the ninth wreck evicts the first', () => {
		const list = Array.from({ length: MAX_WRECKS + 1 }, (_, i) => i);
		const kept = evictOldest(list, MAX_WRECKS);
		expect(kept.length).toBe(MAX_WRECKS);
		expect(kept[0]).toBe(1);
		expect(kept.at(-1)).toBe(MAX_WRECKS);
	});
});
