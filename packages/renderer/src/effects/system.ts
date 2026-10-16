/**
 * Scene-level effects driven by snapshots (plan 020, ADR 0028): liftoff smoke and dust, exhaust
 * trail, separation gas, explosions with debris, and the re-entry plasma. Engine plumes live in
 * the part models. Particles are stored in the body-fixed frame of the first body so they stay
 * on the ground while it turns; each frame they are written to render space (float64 to float32
 * after the floating-origin shift, so precision is fine near the vessel).
 */
import type { BodyDefinition, Quat, Vec3 } from '@orbital/core';
import {
	BoxGeometry,
	Color,
	DynamicDrawUsage,
	InstancedMesh,
	Matrix4,
	MeshStandardMaterial,
	Object3D,
	Quaternion,
	Vector3
} from 'three';
import type { PresetSettings } from '../presets.ts';
import { toRenderSpace } from '../origin.ts';
import { add, cross, dot, length, normalize, rotate, rotateInverse, scale, vec } from '../vec.ts';
import {
	EXPLOSION_DURATION,
	durationOf,
	fireball,
	makeShards,
	shardPosition,
	type ExplosionKind
} from './explosion.ts';
import { BillboardField } from './field.ts';
import { ParticleKind, ParticlePool, exhaustTrailRate, groundBlastRate } from './particles.ts';
import { PlasmaEffect } from './plasma-mesh.ts';
import { DEFAULT_EXIT_PRESSURE, ambientPressureAt, plumeShape } from './plume.ts';
import type { PlumeSpec } from './plume-mesh.ts';
import { airVelocity, plasmaIntensity } from './reentry.ts';
import { FIRE_FRAG, SMOKE_FRAG } from './shaders.ts';
import type { FxEvent } from './transitions.ts';

export type EffectBody = Pick<BodyDefinition, 'id' | 'radius' | 'atmosphere'>;

export interface EffectPart {
	id: number;
	definition: string;
	/** Relative to the vessel root, inertial axes. */
	position: Vec3;
	orientation: Quat;
	modules: Readonly<Record<string, unknown>>;
}

export interface EffectVessel {
	id: number;
	soi: string;
	mode: 'flight' | 'on-rails';
	position: Vec3;
	velocity: Vec3;
	parts: readonly EffectPart[];
}

export interface BodyFrame {
	/** Position of the body centre in the root inertial frame. */
	world: Vec3;
	rotation: Quat;
	/** Angular velocity in inertial axes, rad/s. */
	omega: Vec3;
}

export interface EffectsFrame {
	/** Seconds of simulated time to advance (0 while the sim is paused). */
	dt: number;
	/** Wall-clock seconds, accumulated (shader animation). */
	time: number;
	origin: Vec3;
	bodies: ReadonlyMap<string, BodyFrame>;
	vessels: readonly EffectVessel[];
	events: readonly FxEvent[];
	/** Diffuse radiance of white smoke in the current light, linear RGB. */
	light: readonly [number, number, number];
	activeVessel: number | null;
}

interface Explosion {
	soi: string;
	/** Body-fixed centre, m. */
	local: Vec3;
	size: number;
	kind: ExplosionKind;
	age: number;
	seed: number;
	shards: ReturnType<typeof makeShards>;
}

const MAX_EXPLOSIONS = 6;
const SHARD_COLOURS = [
	new Color(0.8, 0.8, 0.78),
	new Color(0.06, 0.055, 0.05),
	new Color(0.75, 0.3, 0.1),
	new Color(0.15, 0.15, 0.16)
];
const GRAVITY = 9.81;
const KIND_TINT: Record<number, readonly [number, number, number]> = {
	[ParticleKind.Smoke]: [0.86, 0.86, 0.88],
	[ParticleKind.Dust]: [0.78, 0.66, 0.48],
	[ParticleKind.Gas]: [1, 1, 1],
	[ParticleKind.Soot]: [0.16, 0.15, 0.15]
};

/** Two unit vectors perpendicular to `up`. */
function tangents(up: Vec3): [Vec3, Vec3] {
	const axis = Math.abs(up.y) < 0.9 ? vec(0, 1, 0) : vec(1, 0, 0);
	const e1 = normalize(cross(up, axis));
	return [e1, cross(up, e1)];
}

export class Effects {
	readonly root = new Object3D();
	readonly plasma = new PlasmaEffect();
	private pool: ParticlePool;
	private smoke: BillboardField;
	private fire: BillboardField;
	private shardMesh: InstancedMesh;
	private readonly shardMaterial = new MeshStandardMaterial({
		color: 0xffffff,
		metalness: 0.3,
		roughness: 0.65
	});
	private readonly shardGeometry = new BoxGeometry(1, 1, 1);
	private explosions: Explosion[] = [];
	private flashes: Array<{ soi: string; local: Vec3; size: number; age: number; life: number }> =
		[];
	private readonly accumulators = new Map<string, { blast: number; trail: number }>();
	private seed = 1;
	private settings: PresetSettings;

	constructor(
		private readonly bodies: ReadonlyMap<string, EffectBody>,
		private readonly primary: string | undefined,
		private readonly plumeOf: (definition: string) => PlumeSpec | undefined,
		settings: PresetSettings
	) {
		this.root.name = 'effects';
		this.settings = settings;
		this.pool = new ParticlePool(settings.smokeParticles, 11);
		this.smoke = new BillboardField(Math.max(1, settings.smokeParticles), SMOKE_FRAG, false);
		this.fire = new BillboardField(96, FIRE_FRAG, true);
		this.shardMesh = this.makeShards(settings);
		this.smoke.mesh.renderOrder = 8;
		this.fire.mesh.renderOrder = 9;
		this.root.add(this.smoke.mesh, this.fire.mesh, this.shardMesh, this.plasma.root);
	}

	private makeShards(settings: PresetSettings): InstancedMesh {
		const capacity = Math.max(1, settings.debrisShards * MAX_EXPLOSIONS);
		const mesh = new InstancedMesh(this.shardGeometry, this.shardMaterial, capacity);
		mesh.instanceMatrix.setUsage(DynamicDrawUsage);
		mesh.count = 0;
		mesh.frustumCulled = false;
		mesh.castShadow = false;
		return mesh;
	}

	setPreset(settings: PresetSettings): void {
		this.settings = settings;
		this.root.remove(this.smoke.mesh, this.shardMesh);
		this.smoke.dispose();
		this.shardMesh.dispose();
		this.pool = new ParticlePool(settings.smokeParticles, 11);
		this.smoke = new BillboardField(Math.max(1, settings.smokeParticles), SMOKE_FRAG, false);
		this.smoke.mesh.renderOrder = 8;
		this.shardMesh = this.makeShards(settings);
		this.root.add(this.smoke.mesh, this.shardMesh);
		this.explosions = [];
	}

	get particleCapacity(): number {
		return this.pool.capacity;
	}
	get particleCount(): number {
		return this.pool.count;
	}
	get explosionCount(): number {
		return this.explosions.length;
	}

	update(frame: EffectsFrame): void {
		const dt = Math.max(0, frame.dt);
		this.consumeEvents(frame);
		if (dt > 0) {
			this.emitFromEngines(frame, dt);
			this.pool.step(dt);
			for (const e of this.explosions) e.age += dt;
			this.explosions = this.explosions.filter((e) => e.age < durationOf(e.kind) + 0.6);
			for (const f of this.flashes) f.age += dt;
			this.flashes = this.flashes.filter((f) => f.age < f.life);
		}
		this.writeSmoke(frame);
		this.writeFire(frame);
		this.writeShards(frame);
		this.updatePlasma(frame);
	}

	// --- emission -----------------------------------------------------------------------------

	private emitFromEngines(frame: EffectsFrame, dt: number): void {
		const seen = new Set<string>();
		const body = this.primary ? frame.bodies.get(this.primary) : undefined;
		const info = this.primary ? this.bodies.get(this.primary) : undefined;
		if (!body || !info) return;
		const pool = this.pool;
		for (const v of frame.vessels) {
			if (v.soi !== this.primary || v.mode !== 'flight') continue;
			for (const part of v.parts) {
				const spec = this.plumeOf(part.definition);
				if (!spec) continue;
				const e = part.modules[spec.module] as Record<string, unknown> | undefined;
				const throttle = typeof e?.throttle === 'number' ? e.throttle : 0;
				if (e?.ignited !== true || e.flameout === true || throttle < 0.02) continue;
				const nozzle = add(
					add(v.position, part.position),
					rotate(part.orientation, vec(spec.nozzle[0], spec.nozzle[1], spec.nozzle[2]))
				);
				const r = length(nozzle);
				if (r < 1) continue;
				const altitude = r - info.radius;
				const pa = ambientPressureAt(info.atmosphere, altitude);
				const shape = plumeShape({
					throttle,
					ignited: true,
					flameout: false,
					ambientPressure: pa,
					exitPressure: spec.exitPressure ?? DEFAULT_EXIT_PRESSURE,
					baseLength: spec.length,
					exitRadius: spec.exitRadius
				});
				const input = {
					throttle,
					nozzleAltitude: altitude,
					plumeLength: shape.length,
					ambientPressure: pa,
					surfacePressure: info.atmosphere?.surfacePressure ?? 0,
					capacity: pool.capacity
				};
				const key = `${v.id}:${part.id}`;
				seen.add(key);
				const acc = this.accumulators.get(key) ?? { blast: 0, trail: 0 };
				this.accumulators.set(key, acc);
				acc.blast += groundBlastRate(input) * dt;
				acc.trail += exhaustTrailRate(input) * dt;
				const up = scale(nozzle, 1 / r);
				const exhaust = rotate(part.orientation, vec(0, -1, 0));
				const [e1, e2] = tangents(up);
				const toBody = (p: Vec3): Vec3 => rotateInverse(body.rotation, p);
				while (acc.blast >= 1) {
					acc.blast -= 1;
					const th = pool.random() * Math.PI * 2;
					const rho = (spec.exitRadius * 1.2 + shape.maxRadius * 0.8) * pool.random();
					const dir = add(scale(e1, Math.cos(th)), scale(e2, Math.sin(th)));
					const speed = (4 + 16 * pool.random()) * (0.5 + 0.5 * Math.sqrt(throttle));
					const ground = add(scale(up, info.radius + 0.3), scale(dir, rho));
					const dust = pool.random() < 0.55;
					pool.emit({
						position: toBody(ground),
						velocity: toBody(add(scale(dir, speed), scale(up, 1 + 3 * pool.random()))),
						life: (dust ? 3.5 : 4) + 4 * pool.random(),
						size0: dust ? 2 : 2.5,
						size1: dust ? 10 + 9 * pool.random() : 11 + 9 * pool.random(),
						kind: dust ? ParticleKind.Dust : ParticleKind.Smoke,
						opacity: dust ? 0.6 : 0.55,
						heat: dust ? 0 : 0.55
					});
				}
				while (acc.trail >= 1) {
					acc.trail -= 1;
					const along = 1 + pool.random() * shape.length * 0.5;
					const jitter = vec(
						(pool.random() - 0.5) * 2,
						(pool.random() - 0.5) * 2,
						(pool.random() - 0.5) * 2
					);
					pool.emit({
						position: toBody(add(nozzle, scale(exhaust, along))),
						velocity: toBody(add(scale(exhaust, 3 + 8 * pool.random()), jitter)),
						life: 3 + 3 * pool.random(),
						size0: 0.6,
						size1: 3.5 + 3 * pool.random(),
						kind: ParticleKind.Smoke,
						opacity: 0.3,
						heat: 0.8
					});
				}
			}
		}
		for (const k of this.accumulators.keys()) if (!seen.has(k)) this.accumulators.delete(k);
	}

	private consumeEvents(frame: EffectsFrame): void {
		for (const ev of frame.events) {
			const body = frame.bodies.get(ev.soi);
			if (!body) continue;
			const toBody = (p: Vec3): Vec3 => rotateInverse(body.rotation, p);
			const local = toBody(ev.position);
			if (ev.kind === 'separated') {
				this.flashes.push({ soi: ev.soi, local, size: 3, age: 0, life: 0.25 });
				if (ev.soi !== this.primary) continue;
				const n = Math.min(28, Math.max(4, Math.floor(this.pool.capacity / 8)));
				for (let i = 0; i < n; i++) {
					const d = normalize(
						vec(this.pool.random() - 0.5, this.pool.random() - 0.5, this.pool.random() - 0.5)
					);
					this.pool.emit({
						position: add(local, scale(toBody(d), 0.5)),
						velocity: scale(toBody(d), 4 + 7 * this.pool.random()),
						life: 0.9 + 0.8 * this.pool.random(),
						size0: 0.5,
						size1: 3 + 2 * this.pool.random(),
						kind: ParticleKind.Gas,
						opacity: 0.7,
						heat: 0.2
					});
				}
				continue;
			}
			this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
			const size = Math.max(1.2, ev.size * (ev.cause === 'burn' ? 2 : 3.6));
			this.explosions.push({
				soi: ev.soi,
				local,
				size,
				kind: ev.cause,
				age: 0,
				seed: this.seed,
				shards:
					ev.cause === 'impact' ? makeShards(this.seed, this.settings.debrisShards, size, 14) : []
			});
			if (this.explosions.length > MAX_EXPLOSIONS) this.explosions.shift();
			if (ev.soi === this.primary && ev.cause === 'impact') {
				const n = Math.min(16, Math.floor(this.pool.capacity / 12));
				for (let i = 0; i < n; i++) {
					const d = normalize(
						vec(this.pool.random() - 0.5, this.pool.random() * 0.8, this.pool.random() - 0.5)
					);
					this.pool.emit({
						position: add(local, scale(toBody(d), size * 0.3)),
						velocity: scale(toBody(d), 3 + 6 * this.pool.random()),
						life: 5 + 4 * this.pool.random(),
						size0: size * 0.5,
						size1: size * (2 + 1.5 * this.pool.random()),
						kind: ParticleKind.Soot,
						opacity: 0.6,
						heat: 0.3
					});
				}
			}
		}
	}

	// --- writing GPU data ---------------------------------------------------------------------

	private render(body: BodyFrame, local: Vec3, origin: Vec3): Vec3 {
		return toRenderSpace(add(body.world, rotate(body.rotation, local)), origin);
	}

	private writeSmoke(frame: EffectsFrame): void {
		const body = this.primary ? frame.bodies.get(this.primary) : undefined;
		const pool = this.pool;
		if (!body) {
			this.smoke.commit(0);
			return;
		}
		const [lr, lg, lb] = frame.light;
		const q = body.rotation;
		for (let i = 0; i < pool.count; i++) {
			const local = vec(pool.px[i]!, pool.py[i]!, pool.pz[i]!);
			const p = toRenderSpace(add(body.world, rotate(q, local)), frame.origin);
			const t = pool.age[i]! / pool.life[i]!;
			const ease = 1 - (1 - t) * (1 - t);
			const size = pool.size0[i]! + (pool.size1[i]! - pool.size0[i]!) * ease;
			const fadeIn = Math.min(1, pool.age[i]! / 0.25);
			const alpha = pool.opacity[i]! * fadeIn * Math.pow(1 - t, 1.3);
			const tint = KIND_TINT[pool.kind[i]!] ?? KIND_TINT[0]!;
			const heat = pool.heat[i]! * Math.pow(1 - t, 3);
			this.smoke.set(
				i,
				p.x,
				p.y,
				p.z,
				size,
				lr * tint[0] + heat * 3.2,
				lg * tint[1] + heat * 1.5,
				lb * tint[2] + heat * 0.5,
				alpha,
				pool.seed[i]!
			);
		}
		this.smoke.commit(pool.count);
	}

	private writeFire(frame: EffectsFrame): void {
		let n = 0;
		const field = this.fire;
		const put = (
			p: Vec3,
			size: number,
			r: number,
			g: number,
			b: number,
			a: number,
			seed: number
		): void => {
			if (n >= field.capacity) return;
			field.set(n++, p.x, p.y, p.z, size, r, g, b, a, seed);
		};
		for (const f of this.flashes) {
			const body = frame.bodies.get(f.soi);
			if (!body) continue;
			const k = 1 - f.age / f.life;
			put(
				this.render(body, f.local, frame.origin),
				f.size * (1 + 1.5 * (1 - k)),
				5 * k,
				4.5 * k,
				3.5 * k,
				1,
				0.3
			);
		}
		for (const e of this.explosions) {
			const body = frame.bodies.get(e.soi);
			if (!body) continue;
			const s = fireball(e.age, e.size, e.kind);
			if (s.intensity <= 0 && s.flash <= 0.001) continue;
			const c = this.render(body, e.local, frame.origin);
			const life = e.age / durationOf(e.kind);
			const hot = Math.max(0, 1 - life * 1.6);
			const r = s.intensity * (2.4 + 5 * hot);
			const g = s.intensity * (1.1 + 4 * hot * hot);
			const b = s.intensity * (0.25 + 2.4 * hot * hot * hot);
			put(c, s.radius * 2.2, r, g, b, 1, (e.seed % 97) / 97);
			// Lobes of the fireball.
			const up = normalize(add(body.world, rotate(body.rotation, e.local)));
			for (let i = 0; i < 5; i++) {
				const a = (i / 5) * Math.PI * 2 + (e.seed % 13);
				const lobe = vec(Math.cos(a), 0.5 + 0.5 * Math.sin(a * 1.7), Math.sin(a));
				const q = new Quaternion().setFromUnitVectors(
					new Vector3(0, 1, 0),
					new Vector3(up.x, up.y, up.z)
				);
				const v = new Vector3(lobe.x, lobe.y, lobe.z).applyQuaternion(q);
				put(
					vec(
						c.x + v.x * s.radius * 0.55,
						c.y + v.y * s.radius * 0.55,
						c.z + v.z * s.radius * 0.55
					),
					s.radius * 1.3,
					r * 0.8,
					g * 0.7,
					b * 0.6,
					1,
					((e.seed >> i) % 89) / 89
				);
			}
			if (s.flash > 0.01)
				put(c, e.size * 5 * s.flash + e.size, 10 * s.flash, 9 * s.flash, 7 * s.flash, 1, 0.5);
		}
		field.commit(n);
	}

	private writeShards(frame: EffectsFrame): void {
		const mesh = this.shardMesh;
		let n = 0;
		const m = new Matrix4();
		const q = new Quaternion();
		const basis = new Quaternion();
		for (const e of this.explosions) {
			const body = frame.bodies.get(e.soi);
			if (!body || e.shards.length === 0) continue;
			const centreWorld = add(body.world, rotate(body.rotation, e.local));
			const up = normalize(rotate(body.rotation, e.local));
			basis.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(up.x, up.y, up.z));
			const base = toRenderSpace(centreWorld, frame.origin);
			// Ground below the explosion: shards stop at the surface (altitude of the centre).
			const info = this.bodies.get(e.soi);
			const altitude = info ? length(e.local) - info.radius : 0;
			const nearGround = altitude < 300;
			for (const s of e.shards) {
				if (n >= mesh.instanceMatrix.count) break;
				const p = shardPosition(s, e.age, GRAVITY);
				const floor = nearGround ? -altitude : -Infinity;
				const y = Math.max(p.y, floor + s.size * 0.5);
				const v = new Vector3(p.x, y, p.z).applyQuaternion(basis);
				const spin = p.y > floor ? s.spin * e.age : s.spin * 0.2;
				q.setFromAxisAngle(new Vector3(0.6, 0.3, 0.7).normalize(), spin).premultiply(basis);
				m.compose(
					new Vector3(base.x + v.x, base.y + v.y, base.z + v.z),
					q,
					new Vector3(s.size, s.size * 0.35, s.size * 0.7)
				);
				mesh.setColorAt(n, SHARD_COLOURS[(e.seed + n) % SHARD_COLOURS.length]!);
				mesh.setMatrixAt(n++, m);
			}
		}
		mesh.count = n;
		mesh.visible = n > 0;
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}

	private updatePlasma(frame: EffectsFrame): void {
		const v =
			frame.vessels.find((x) => x.id === frame.activeVessel) ??
			(frame.activeVessel === null ? frame.vessels[0] : undefined);
		const body = v ? frame.bodies.get(v.soi) : undefined;
		const info = v ? this.bodies.get(v.soi) : undefined;
		if (!v || !body || !info || v.parts.length === 0) {
			this.plasma.update({
				intensity: 0,
				forward: vec(0, 1, 0),
				front: vec(0, 0, 0),
				extent: 1,
				radius: 1,
				time: frame.time
			});
			return;
		}
		const air = airVelocity(v.velocity, v.position, body.omega);
		const speed = length(air);
		const altitude = length(v.position) - info.radius;
		const intensity = speed > 1 ? plasmaIntensity(speed, altitude, info.atmosphere) : 0;
		const fwd = speed > 1 ? scale(air, 1 / speed) : vec(0, 1, 0);
		let hi = -Infinity;
		let lo = Infinity;
		let side = 0;
		for (const p of v.parts) {
			const d = dot(p.position, fwd);
			hi = Math.max(hi, d);
			lo = Math.min(lo, d);
			const lateral = length(add(p.position, scale(fwd, -d)));
			side = Math.max(side, lateral);
		}
		const root = toRenderSpace(add(body.world, v.position), frame.origin);
		this.plasma.update({
			intensity,
			forward: fwd,
			front: vec(
				root.x + fwd.x * (hi + 0.6),
				root.y + fwd.y * (hi + 0.6),
				root.z + fwd.z * (hi + 0.6)
			),
			extent: hi - lo + 1.2,
			radius: side + 0.7,
			time: frame.time
		});
	}

	dispose(): void {
		this.smoke.dispose();
		this.fire.dispose();
		this.shardMesh.dispose();
		this.shardGeometry.dispose();
		this.shardMaterial.dispose();
		this.plasma.dispose();
	}
}

export { EXPLOSION_DURATION };
