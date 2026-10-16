/**
 * Smoke, dust and gas puffs: a fixed-capacity pool (pure; plan 020). Particles live in the
 * body-fixed frame of their body, so they stay put on the ground while the planet turns, and are
 * converted to render space each frame. Seeded, so tests replay them exactly.
 */
import type { Vec3 } from '@orbital/core';
import { clamp } from '../vec.ts';

export const ParticleKind = {
	/** Engine smoke: grey-white, lifted by heat. */
	Smoke: 0,
	/** Ground dust blown outward by the exhaust: tan. */
	Dust: 1,
	/** Separation gas: white, fast, short. */
	Gas: 2,
	/** Burnt wreck smoke: dark. */
	Soot: 3
} as const;
export type ParticleKind = (typeof ParticleKind)[keyof typeof ParticleKind];

export interface ParticleSpec {
	position: Vec3;
	velocity: Vec3;
	/** Seconds. */
	life: number;
	size0: number;
	size1: number;
	kind: ParticleKind;
	opacity: number;
	/** Initial emissive heat 0..1 (fades with age). */
	heat: number;
	/** Multiplies the kind's tint (dust takes the colour of the ground under it, ADR 0047). */
	tint?: readonly [number, number, number];
}

/** Velocity of the air at a body-fixed position, m/s (wind carries smoke, ADR 0047). */
export type WindField = (x: number, y: number, z: number, out: [number, number, number]) => void;

/** Small seeded generator (mulberry32). */
export function createParticleRng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const DRAG: Record<number, number> = { 0: 0.6, 1: 0.9, 2: 1.4, 3: 0.4 };
/** Upward acceleration along the local vertical, m/s^2 (buoyancy of hot smoke). */
const LIFT: Record<number, number> = { 0: 2.2, 1: 0.4, 2: 0, 3: 3 };

export class ParticlePool {
	readonly capacity: number;
	count = 0;
	readonly px: Float64Array;
	readonly py: Float64Array;
	readonly pz: Float64Array;
	readonly vx: Float64Array;
	readonly vy: Float64Array;
	readonly vz: Float64Array;
	readonly age: Float64Array;
	readonly life: Float64Array;
	readonly size0: Float64Array;
	readonly size1: Float64Array;
	readonly opacity: Float64Array;
	readonly heat: Float64Array;
	readonly kind: Uint8Array;
	readonly seed: Float64Array;
	/** Tint per particle (three numbers each). */
	readonly tint: Float32Array;
	private readonly rng: () => number;

	constructor(capacity: number, seed = 1) {
		this.capacity = Math.max(0, Math.floor(capacity));
		const n = this.capacity;
		this.px = new Float64Array(n);
		this.py = new Float64Array(n);
		this.pz = new Float64Array(n);
		this.vx = new Float64Array(n);
		this.vy = new Float64Array(n);
		this.vz = new Float64Array(n);
		this.age = new Float64Array(n);
		this.life = new Float64Array(n);
		this.size0 = new Float64Array(n);
		this.size1 = new Float64Array(n);
		this.opacity = new Float64Array(n);
		this.heat = new Float64Array(n);
		this.kind = new Uint8Array(n);
		this.seed = new Float64Array(n);
		this.tint = new Float32Array(n * 3);
		this.rng = createParticleRng(seed);
	}

	random(): number {
		return this.rng();
	}

	/** Adds a particle; returns false (and drops it) when the pool is full. */
	emit(spec: ParticleSpec): boolean {
		if (this.count >= this.capacity) return false;
		const i = this.count++;
		this.px[i] = spec.position.x;
		this.py[i] = spec.position.y;
		this.pz[i] = spec.position.z;
		this.vx[i] = spec.velocity.x;
		this.vy[i] = spec.velocity.y;
		this.vz[i] = spec.velocity.z;
		this.age[i] = 0;
		this.life[i] = Math.max(0.05, spec.life);
		this.size0[i] = spec.size0;
		this.size1[i] = spec.size1;
		this.opacity[i] = clamp(spec.opacity, 0, 1);
		this.heat[i] = clamp(spec.heat, 0, 1);
		this.kind[i] = spec.kind;
		this.tint[i * 3] = spec.tint?.[0] ?? 1;
		this.tint[i * 3 + 1] = spec.tint?.[1] ?? 1;
		this.tint[i * 3 + 2] = spec.tint?.[2] ?? 1;
		this.seed[i] = this.rng();
		return true;
	}

	/** Advance by `dt` seconds; expired particles are removed (swap with the last). */
	step(dt: number, wind?: WindField): void {
		if (!(dt > 0)) return;
		const w: [number, number, number] = [0, 0, 0];
		let i = 0;
		while (i < this.count) {
			this.age[i]! += dt;
			if (this.age[i]! >= this.life[i]!) {
				this.removeAt(i);
				continue;
			}
			const k = this.kind[i]!;
			const damp = Math.exp(-(DRAG[k] ?? 0.5) * dt);
			if (wind && k !== ParticleKind.Gas) {
				// Drag pulls the velocity towards the air's, not towards rest.
				wind(this.px[i]!, this.py[i]!, this.pz[i]!, w);
				this.vx[i] = w[0] + (this.vx[i]! - w[0]) * damp;
				this.vy[i] = w[1] + (this.vy[i]! - w[1]) * damp;
				this.vz[i] = w[2] + (this.vz[i]! - w[2]) * damp;
			} else {
				this.vx[i]! *= damp;
				this.vy[i]! *= damp;
				this.vz[i]! *= damp;
			}
			const l = Math.hypot(this.px[i]!, this.py[i]!, this.pz[i]!);
			if (l > 0) {
				const lift = ((LIFT[k] ?? 0) * dt) / l;
				this.vx[i]! += this.px[i]! * lift;
				this.vy[i]! += this.py[i]! * lift;
				this.vz[i]! += this.pz[i]! * lift;
			}
			this.px[i]! += this.vx[i]! * dt;
			this.py[i]! += this.vy[i]! * dt;
			this.pz[i]! += this.vz[i]! * dt;
			i++;
		}
	}

	private removeAt(i: number): void {
		const last = --this.count;
		if (i === last) return;
		for (const a of [
			this.px,
			this.py,
			this.pz,
			this.vx,
			this.vy,
			this.vz,
			this.age,
			this.life,
			this.size0,
			this.size1,
			this.opacity,
			this.heat,
			this.seed
		]) {
			a[i] = a[last]!;
		}
		this.kind[i] = this.kind[last]!;
		for (let c = 0; c < 3; c++) this.tint[i * 3 + c] = this.tint[last * 3 + c]!;
	}

	clear(): void {
		this.count = 0;
	}

	/** State digest for determinism tests. */
	digest(): string {
		let h = 0;
		for (let i = 0; i < this.count; i++) {
			h = (h * 31 + Math.round(this.px[i]! * 1e4) + Math.round(this.vy[i]! * 1e4)) | 0;
		}
		return `${this.count}:${h}`;
	}
}

/** Smoke particles per preset capacity (`PresetSettings.smokeParticles`) scale emission. */
export const REFERENCE_CAPACITY = 320;

export interface EmissionInput {
	/** 0..1. */
	throttle: number;
	/** Height of the nozzle above the ground, m. */
	nozzleAltitude: number;
	/** Current plume length, m. */
	plumeLength: number;
	/** Ambient pressure at the nozzle and at the surface, Pa. */
	ambientPressure: number;
	surfacePressure: number;
	/** Preset capacity (`ParticlePool.capacity`). */
	capacity: number;
}

const smoothstep = (e0: number, e1: number, x: number): number => {
	const t = clamp((x - e0) / (e1 - e0), 0, 1);
	return t * t * (3 - 2 * t);
};

const pressureFactor = (i: EmissionInput): number =>
	i.surfacePressure > 0 ? clamp(i.ambientPressure / i.surfacePressure, 0, 1) : 0;

/** Closeness to the ground: 1 within one plume length, 0 beyond five. */
export function groundProximity(nozzleAltitude: number, plumeLength: number): number {
	const l = Math.max(plumeLength, 0.5);
	return 1 - smoothstep(l, 5 * l, Math.max(0, nozzleAltitude));
}

/** Dust and smoke thrown off the ground by the exhaust, particles per second. */
export function groundBlastRate(i: EmissionInput): number {
	const thr = clamp(i.throttle, 0, 1);
	const air = Math.sqrt(pressureFactor(i));
	return (
		100 *
		thr *
		air *
		groundProximity(i.nozzleAltitude, i.plumeLength) *
		(i.capacity / REFERENCE_CAPACITY)
	);
}

/** Thin exhaust smoke left behind in dense air, particles per second. */
export function exhaustTrailRate(i: EmissionInput): number {
	const thr = clamp(i.throttle, 0, 1);
	const air = pressureFactor(i);
	return (
		16 *
		thr *
		air *
		(1 - groundProximity(i.nozzleAltitude, i.plumeLength)) *
		(i.capacity / REFERENCE_CAPACITY)
	);
}
