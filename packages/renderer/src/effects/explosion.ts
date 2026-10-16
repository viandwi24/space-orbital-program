/** Fireball, flash and debris shards of a destroyed part (pure; plan 020). */
import { createParticleRng } from './particles.ts';

/** Seconds a fireball lives. */
export const EXPLOSION_DURATION = 2.4;
/** Seconds a burn-up streak lives. */
export const BURN_DURATION = 1.4;

export type ExplosionKind = 'impact' | 'burn';

export interface FireballState {
	/** Radius of the glowing ball, m. */
	radius: number;
	/** Emission gain, 0 after the duration. */
	intensity: number;
	/** Initial flash, 0..1. */
	flash: number;
}

export const durationOf = (kind: ExplosionKind): number =>
	kind === 'burn' ? BURN_DURATION : EXPLOSION_DURATION;

/** Fireball at `age` seconds for a final radius `size` (m). */
export function fireball(age: number, size: number, kind: ExplosionKind = 'impact'): FireballState {
	const duration = durationOf(kind);
	if (!(age >= 0) || age >= duration)
		return { radius: age >= duration ? size : 0, intensity: 0, flash: 0 };
	const grow = 1 - Math.exp(-age * (kind === 'burn' ? 5 : 7));
	const life = 1 - age / duration;
	return {
		radius: size * grow,
		intensity: life * life * (kind === 'burn' ? 1.6 : 2.6),
		flash: Math.exp(-age * 16)
	};
}

export interface Shard {
	/** Initial offset from the centre in the local frame (y = up), m. */
	x0: number;
	y0: number;
	z0: number;
	/** Initial velocity, m/s. */
	vx: number;
	vy: number;
	vz: number;
	/** Edge length, m. */
	size: number;
	/** Tumble rate, rad/s. */
	spin: number;
}

/** Deterministic shards thrown from a destroyed part of radius `size`. */
export function makeShards(seed: number, count: number, size: number, speed: number): Shard[] {
	const rnd = createParticleRng(seed);
	const out: Shard[] = [];
	for (let i = 0; i < count; i++) {
		const a = rnd() * Math.PI * 2;
		const up = 0.25 + rnd() * 0.75;
		const horiz = Math.sqrt(1 - up * up);
		const s = speed * (0.4 + rnd() * 0.8);
		out.push({
			x0: (rnd() - 0.5) * size,
			y0: (rnd() - 0.5) * size * 0.5,
			z0: (rnd() - 0.5) * size,
			vx: Math.cos(a) * horiz * s,
			vy: up * s,
			vz: Math.sin(a) * horiz * s,
			size: size * (0.05 + rnd() * 0.11),
			spin: (rnd() - 0.5) * 12
		});
	}
	return out;
}

/** Ballistic position of a shard at time `t` under gravity `g` along -y. */
export function shardPosition(
	shard: Shard,
	t: number,
	g: number
): { x: number; y: number; z: number } {
	return {
		x: shard.x0 + shard.vx * t,
		y: shard.y0 + shard.vy * t - 0.5 * g * t * t,
		z: shard.z0 + shard.vz * t
	};
}
