import { describe, expect, test } from 'bun:test';
import {
	BURN_DURATION,
	EXPLOSION_DURATION,
	fireball,
	makeShards,
	shardPosition
} from '../src/effects/explosion.ts';

describe('explosion', () => {
	test('the fireball radius never shrinks over its life and the intensity is zero afterwards', () => {
		for (const kind of ['impact', 'burn'] as const) {
			const end = kind === 'impact' ? EXPLOSION_DURATION : BURN_DURATION;
			let radius = 0;
			for (let t = 0; t < end; t += 0.02) {
				const s = fireball(t, 5, kind);
				expect(s.radius).toBeGreaterThanOrEqual(radius);
				expect(s.intensity).toBeGreaterThan(0);
				radius = s.radius;
			}
			expect(fireball(end, 5, kind).intensity).toBe(0);
			expect(fireball(end + 3, 5, kind).intensity).toBe(0);
			expect(fireball(end + 3, 5, kind).flash).toBe(0);
		}
		expect(fireball(0, 5).flash).toBe(1);
		expect(fireball(-1, 5).intensity).toBe(0);
	});

	test('shards follow a ballistic parabola', () => {
		const shards = makeShards(7, 12, 2, 14);
		expect(shards.length).toBe(12);
		const g = 9.81;
		for (const s of shards) {
			for (const t of [0, 0.4, 1.3, 2.9]) {
				const p = shardPosition(s, t, g);
				expect(Math.abs(p.y - (s.y0 + s.vy * t - (g * t * t) / 2))).toBeLessThan(1e-9);
				expect(Math.abs(p.x - (s.x0 + s.vx * t))).toBeLessThan(1e-9);
			}
		}
	});

	test('shards are deterministic per seed, differ between seeds, and none for a zero count', () => {
		expect(makeShards(1, 5, 1, 10)).toEqual(makeShards(1, 5, 1, 10));
		expect(makeShards(1, 5, 1, 10)).not.toEqual(makeShards(2, 5, 1, 10));
		expect(makeShards(1, 0, 1, 10)).toEqual([]);
	});
});
