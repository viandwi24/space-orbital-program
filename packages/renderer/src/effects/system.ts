/**
 * Scene-level effects driven by snapshots (plan 020, ADR 0028): liftoff smoke and dust, exhaust
 * trail, separation gas, explosions with debris, and the re-entry plasma. Engine plumes live in
 * the part models. Particles are stored in the body-fixed frame of the first body so they stay
 * on the ground while it turns; each frame they are written to render space (float64 to float32
 * after the floating-origin shift, so precision is fine near the vessel).
 */
import {
	GRAVITATIONAL_CONSTANT,
	ambientAt,
	type BodyDefinition,
	type Quat,
	type Vec3
} from '@orbital/core';
import {
	BufferAttribute,
	BufferGeometry,
	Color,
	DoubleSide,
	DynamicDrawUsage,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	PointLight,
	Quaternion,
	Vector3
} from 'three';
import { lookLevel, type PresetSettings } from '../presets.ts';
import { toRenderSpace } from '../origin.ts';
import {
	add,
	cross,
	dot,
	length,
	normalize,
	rotate,
	rotateInverse,
	scale,
	sub,
	vec
} from '../vec.ts';
import {
	EXPLOSION_DURATION,
	durationOf,
	fireball,
	makeShards,
	shardPosition,
	type ExplosionKind
} from './explosion.ts';
import { BillboardField } from './field.ts';
import { GroundGlow, type GroundGlowItem } from './ground-glow.ts';
import { dustColour, ionisationColour, plumeGroundLight, windAt } from './look.ts';
import {
	ParticleKind,
	ParticlePool,
	exhaustTrailRate,
	groundBlastRate,
	vacuumDustRate,
	type WindField
} from './particles.ts';
import { PlasmaEffect } from './plasma-mesh.ts';
import { silhouetteProfile, shellRings, type SilhouettePart } from './plasma-shape.ts';
import { TrailRibbon } from './trail-ribbon.ts';
import { trailDensity } from './trail.ts';
import { WreckField } from './wreck-field.ts';
import {
	SETTLE_TIME,
	WRECK_SCORCH,
	WRECK_SMOULDER,
	planWreck,
	settleBlend,
	type WreckPlan
} from './wreckage.ts';
import { DEFAULT_EXIT_PRESSURE, ambientPressureAt, plumeShape } from './plume.ts';
import type { PlumeSpec } from './plume-mesh.ts';
import {
	PLASMA_NOSE_RADIUS,
	airDensity,
	airVelocity,
	plasmaIntensity,
	stagnationFlux
} from './reentry.ts';
import { clusterLights, type ClusterEngine } from './plume-cluster.ts';
import { resolveTemplate } from './plume-template.ts';
import { condensationOpacity, heatingOf, paletteFor, plasmaColour } from './plasma-palette.ts';
import { FIRE_FRAG, SMOKE_FRAG } from './shaders.ts';
import {
	PIECE_VERTICES,
	fallbackSource,
	pickTriangles,
	writePiece,
	type ShardSource
} from './shards.ts';
import type { FxEvent } from './transitions.ts';

/** Point lights the cluster lights draw from (plan 400). */
const CLUSTER_LIGHTS = 2;

export type EffectBody = Pick<BodyDefinition, 'id' | 'radius' | 'atmosphere'> &
	Partial<Pick<BodyDefinition, 'mass' | 'plasma'>>;

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
	/** Direction to the sun in render space (smoke is lit by it); straight up when absent. */
	sunDirection?: Vec3;
}

/** What the scene lends the effects (ADR 0047). */
export interface EffectsOptions {
	/**
	 * Height of the ground of body `body` above its reference sphere along a unit body-fixed
	 * direction, m. A body without ground (`undefined`) gets no ground effects.
	 */
	groundHeight?: (body: string, direction: Vec3) => number | undefined;
	/** Mesh triangles of a part definition, for debris pieces. */
	shardSource?: (definition: string) => ShardSource | undefined;
	/** Cylinder of a part definition for the plasma silhouette: radius and half length, m (plan 040). */
	partSilhouette?: (definition: string) => { radius: number; halfLength: number } | undefined;
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
	/** The mesh triangle each shard is cut from, with the source it indexes. */
	pieces: ReadonlyArray<{ source: ShardSource; triangle: number }>;
	/** Tangent frame (+Y up) to body-fixed axes, fixed at the impact so the pieces stay on the ground. */
	basis: Quaternion;
	/** Gravity, m/s^2, and the floor under the centre relative to it, m. */
	gravity: number;
	floor: number;
	/** Where each piece comes to rest; null when the impact was not near ground (plan 040). */
	plan: WreckPlan | null;
}

const MAX_EXPLOSIONS = 6;
/** The tail of one firing engine for the vessel's trail: where, how wide, how dense. */
interface TrailTip {
	x: number;
	y: number;
	z: number;
	radius: number;
	density: number;
}
const SHARD_COLOURS = [
	new Color(0.8, 0.8, 0.78),
	new Color(0.06, 0.055, 0.05),
	new Color(0.75, 0.3, 0.1),
	new Color(0.15, 0.15, 0.16)
];
const FALLBACK_SOURCES = SHARD_COLOURS.map((c) => fallbackSource([c.r, c.g, c.b]));
const GRAVITY = 9.81;
/** A part the host gave no shape for is a short stock-size cylinder in the plasma silhouette. */
const DEFAULT_SILHOUETTE = { radius: 0.625, halfLength: 0.5 };
/** Share of the old particle trail that stays beside the ribbon (the ribbon carries the persistence). */
const TRAIL_PARTICLE_SHARE = 0.35;
/** Dust a plume throws up on an airless body: grey regolith, lit like the ground (plan 049). */
const REGOLITH_DUST: readonly [number, number, number] = [0.5, 0.48, 0.44];
/** Particles of the dust pool of an airless body, as a share of the smoke pool. */
const VACUUM_POOL_SHARE = 0.5;
const KIND_TINT: Record<number, readonly [number, number, number]> = {
	[ParticleKind.Smoke]: [0.86, 0.86, 0.88],
	[ParticleKind.Dust]: [1, 1, 1], // the ground's colour comes with the particle (`tint`)
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
	/** Wrecks that stay after an impact (plan 040, ADR 0077). */
	readonly wrecks = new WreckField();
	/** Exhaust trails in the air column (plan 040, ADR 0080). */
	readonly trails = new TrailRibbon();
	private pool: ParticlePool;
	/** Dust of the airless bodies (no air to carry smoke), one pool per body, made when a plume first meets its ground (plan 049). */
	private vacuumPools = new Map<string, ParticlePool>();
	private smoke: BillboardField;
	private fire: BillboardField;
	private shardMesh: Mesh;
	private shardPositions: Float32Array;
	private shardColours: Float32Array;
	private readonly shardMaterial = new MeshStandardMaterial({
		vertexColors: true,
		metalness: 0.3,
		roughness: 0.65,
		flatShading: true,
		side: DoubleSide
	});
	private readonly glow = new GroundGlow(4);
	private readonly glowItems: GroundGlowItem[] = [];
	/** The lit engines of this frame, for the cluster lights (plan 400). */
	private readonly litEngines: ClusterEngine[] = [];
	/** One light per cluster of engines, a fixed few so the light count never changes in flight; none at Low. */
	private readonly clusterPool: PointLight[] = [];
	private readonly glowColours = new WeakMap<object, readonly [number, number, number]>();
	private explosions: Explosion[] = [];
	private flashes: Array<{ soi: string; local: Vec3; size: number; age: number; life: number }> =
		[];
	private readonly accumulators = new Map<string, { blast: number; trail: number }>();
	private seed = 1;
	private settings: PresetSettings;
	/** Reduced motion (plan 246): no bright flashes; the fireball keeps its shape but not its glare. */
	private reducedMotion = false;

	constructor(
		private readonly bodies: ReadonlyMap<string, EffectBody>,
		private readonly primary: string | undefined,
		private readonly plumeOf: (definition: string) => PlumeSpec | undefined,
		settings: PresetSettings,
		private readonly options: EffectsOptions = {}
	) {
		this.root.name = 'effects';
		this.settings = settings;
		this.pool = new ParticlePool(settings.smokeParticles, 11);
		this.smoke = new BillboardField(Math.max(1, settings.smokeParticles), SMOKE_FRAG, false, true);
		this.fire = new BillboardField(96, FIRE_FRAG, true);
		const shards = this.makeShards(settings);
		this.shardMesh = shards.mesh;
		this.shardPositions = shards.positions;
		this.shardColours = shards.colours;
		this.smoke.mesh.renderOrder = 8;
		this.fire.mesh.renderOrder = 9;
		this.root.add(
			this.smoke.mesh,
			this.fire.mesh,
			this.shardMesh,
			this.plasma.root,
			this.glow.root,
			this.wrecks.root,
			this.trails.mesh
		);
	}

	/** One dynamic mesh for every piece of every explosion; positions are rewritten each frame. */
	private makeShards(settings: PresetSettings): {
		mesh: Mesh;
		positions: Float32Array;
		colours: Float32Array;
	} {
		const pieces = Math.max(1, settings.debrisShards * MAX_EXPLOSIONS);
		const positions = new Float32Array(pieces * PIECE_VERTICES * 3);
		const colours = new Float32Array(pieces * PIECE_VERTICES * 3);
		const geometry = new BufferGeometry();
		const position = new BufferAttribute(positions, 3);
		position.setUsage(DynamicDrawUsage);
		const colour = new BufferAttribute(colours, 3);
		colour.setUsage(DynamicDrawUsage);
		geometry.setAttribute('position', position);
		geometry.setAttribute('color', colour);
		geometry.setDrawRange(0, 0);
		const mesh = new Mesh(geometry, this.shardMaterial);
		mesh.frustumCulled = false;
		mesh.castShadow = false;
		mesh.visible = false;
		return { mesh, positions, colours };
	}

	setReducedMotion(on: boolean): void {
		this.reducedMotion = on;
	}

	setPreset(settings: PresetSettings): void {
		this.settings = settings;
		this.root.remove(this.smoke.mesh, this.shardMesh);
		this.smoke.dispose();
		this.shardMesh.geometry.dispose();
		this.pool = new ParticlePool(settings.smokeParticles, 11);
		this.smoke = new BillboardField(Math.max(1, settings.smokeParticles), SMOKE_FRAG, false, true);
		this.smoke.mesh.renderOrder = 8;
		const shards = this.makeShards(settings);
		this.shardMesh = shards.mesh;
		this.shardPositions = shards.positions;
		this.shardColours = shards.colours;
		this.root.add(this.smoke.mesh, this.shardMesh);
		this.vacuumPools.clear();
		this.explosions = [];
	}

	get particleCapacity(): number {
		return this.pool.capacity;
	}
	get particleCount(): number {
		return this.pool.count;
	}
	/** Dust particles of the airless bodies (plan 049). */
	get vacuumParticleCount(): number {
		let n = 0;
		for (const pool of this.vacuumPools.values()) n += pool.count;
		return n;
	}
	/** Forgets the wrecks and trails (a new flight or a loaded game; plan 040). */
	clearPersistent(): void {
		this.wrecks.clear();
		this.trails.clear();
		this.explosions = [];
	}
	get explosionCount(): number {
		return this.explosions.length;
	}

	update(frame: EffectsFrame): void {
		const dt = Math.max(0, frame.dt);
		this.consumeEvents(frame);
		this.glowItems.length = 0;
		this.litEngines.length = 0;
		if (dt > 0) {
			this.emitFromEngines(frame, dt);
			this.pool.step(dt, this.windField(frame));
			for (const [id, pool] of this.vacuumPools) {
				const mass = this.bodies.get(id)?.mass;
				if (mass !== undefined) pool.step(dt, undefined, { mu: GRAVITATIONAL_CONSTANT * mass });
			}
			for (const e of this.explosions) e.age += dt;
			this.explosions = this.explosions.filter(
				(e) =>
					e.age <
					Math.max(durationOf(e.kind) + 0.6, e.plan ? e.plan.settled + SETTLE_TIME + 0.05 : 0)
			);
			this.wrecks.step(dt);
			this.smoulder(dt);
			this.trails.step(dt, this.windField(frame));
			for (const f of this.flashes) f.age += dt;
			this.flashes = this.flashes.filter((f) => f.age < f.life);
		}
		this.writeSmoke(frame);
		this.glow.update(this.glowItems);
		this.writeClusterLights();
		this.writeFire(frame);
		this.writeShards(frame);
		this.updatePlasma(frame);
		this.wrecks.place(frame.bodies, frame.origin);
		this.trails.write(
			this.primary ? frame.bodies.get(this.primary) : undefined,
			frame.origin,
			frame.light
		);
	}

	/** A fresh wreck smoulders: a few dark puffs a second for `WRECK_SMOULDER` s, fewer as it cools. */
	private smoulder(dt: number): void {
		for (const w of this.wrecks.wrecks) {
			if (w.soi !== this.primary || w.age >= WRECK_SMOULDER) continue;
			w.smoke += 2.5 * (1 - w.age / WRECK_SMOULDER) * dt * (this.pool.capacity / 320);
			while (w.smoke >= 1) {
				w.smoke -= 1;
				const o = new Vector3(
					(this.pool.random() - 0.5) * 6,
					0.3,
					(this.pool.random() - 0.5) * 6
				).applyQuaternion(w.basis);
				const at = add(w.local, vec(o.x, o.y, o.z));
				const up = normalize(w.local);
				this.pool.emit({
					position: at,
					velocity: scale(up, 1 + 1.5 * this.pool.random()),
					life: 4 + 3 * this.pool.random(),
					size0: 0.5,
					size1: 3 + 2 * this.pool.random(),
					kind: ParticleKind.Soot,
					opacity: 0.35,
					heat: 0.1
				});
			}
		}
	}

	/** Air velocity at a body-fixed position: horizontal wind by altitude (ADR 0047). */
	private windField(frame: EffectsFrame): WindField | undefined {
		const info = this.primary ? this.bodies.get(this.primary) : undefined;
		if (!info) return undefined;
		const time = frame.time;
		return (x, y, z, out) => {
			const r = Math.hypot(x, y, z);
			if (r < 1) {
				out[0] = out[1] = out[2] = 0;
				return;
			}
			const up = vec(x / r, y / r, z / r);
			const [e1, e2] = tangents(up);
			const { speed, heading } = windAt(r - info.radius, time);
			const c = Math.cos(heading) * speed;
			const sn = Math.sin(heading) * speed;
			out[0] = e1.x * c + e2.x * sn;
			out[1] = e1.y * c + e2.y * sn;
			out[2] = e1.z * c + e2.z * sn;
		};
	}

	// --- emission -----------------------------------------------------------------------------

	private emitFromEngines(frame: EffectsFrame, dt: number): void {
		const seen = new Set<string>();
		for (const v of frame.vessels) {
			if (v.mode !== 'flight') continue;
			const body = frame.bodies.get(v.soi);
			const info = this.bodies.get(v.soi);
			if (!body || !info) continue;
			// The first body has its air; any other body with a ground and no air gets dust that flies ballistic.
			const vacuum = v.soi !== this.primary;
			if (vacuum && (info.atmosphere || info.mass === undefined)) continue;
			const pool = vacuum ? this.vacuumPool(v.soi) : this.pool;
			const tips: TrailTip[] = [];
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
				const up = scale(nozzle, 1 / r);
				const groundAt = this.options.groundHeight?.(v.soi, rotateInverse(body.rotation, up));
				if (vacuum && groundAt === undefined) continue;
				const ground = groundAt ?? 0;
				const altitude = r - info.radius;
				const height = altitude - ground;
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
					nozzleAltitude: height,
					plumeLength: shape.length,
					ambientPressure: pa,
					surfacePressure: info.atmosphere?.surfacePressure ?? 0,
					capacity: pool.capacity
				};
				const key = `${v.id}:${part.id}`;
				seen.add(key);
				const acc = this.accumulators.get(key) ?? { blast: 0, trail: 0 };
				this.accumulators.set(key, acc);
				acc.blast += (vacuum ? vacuumDustRate(input) : groundBlastRate(input)) * dt;
				acc.trail += exhaustTrailRate(input) * dt * TRAIL_PARTICLE_SHARE;
				const exhaust = rotate(part.orientation, vec(0, -1, 0));
				if (lookLevel(this.settings, 'plume') !== 'low') {
					let colour = this.glowColours.get(spec);
					if (!colour) {
						colour = resolveTemplate(spec.template, spec.color).colours.outer;
						this.glowColours.set(spec, colour);
					}
					const bells = spec.nozzles?.length ?? 1;
					this.litEngines.push({
						vessel: v.id,
						position: toRenderSpace(add(body.world, nozzle), frame.origin),
						radius: spec.exitRadius,
						thrust: throttle * spec.exitRadius * spec.exitRadius * bells,
						colour
					});
				}
				const light = plumeGroundLight(height, throttle, shape.length, spec.exitRadius);
				if (
					light.intensity > 0 &&
					(vacuum || pa > 0) &&
					this.glowItems.length < this.glow.capacity
				) {
					const centre = scale(up, info.radius + ground + 0.05);
					this.glowItems.push({
						position: toRenderSpace(add(body.world, centre), frame.origin),
						up,
						radius: light.radius,
						// in vacuum nothing dims the light of the exhaust
						intensity: vacuum
							? light.intensity
							: light.intensity * Math.sqrt(pa / (info.atmosphere?.surfacePressure || 1))
					});
				}
				const tint = vacuum ? REGOLITH_DUST : dustColour(ground);
				const [e1, e2] = tangents(up);
				const toBody = (p: Vec3): Vec3 => rotateInverse(body.rotation, p);
				if (vacuum) {
					const mu = GRAVITATIONAL_CONSTANT * info.mass!;
					const g = mu / (r * r);
					while (acc.blast >= 1) {
						acc.blast -= 1;
						// a low sheet racing outwards along the ground: fast, flat, ballistic, back down in 2 v / g
						const th = pool.random() * Math.PI * 2;
						const rho = (spec.exitRadius * 1.2 + shape.maxRadius * 0.8) * pool.random();
						const dir = add(scale(e1, Math.cos(th)), scale(e2, Math.sin(th)));
						const speed = (8 + 34 * pool.random()) * (0.5 + 0.5 * Math.sqrt(throttle));
						const rise = 0.25 + 1.1 * pool.random();
						const spot = add(scale(up, info.radius + ground + 0.3), scale(dir, rho));
						pool.emit({
							position: toBody(spot),
							velocity: toBody(add(scale(dir, speed), scale(up, rise))),
							life: Math.min(8, (2 * rise) / g),
							size0: 0.7,
							size1: 1.4 + 1.6 * pool.random(),
							kind: ParticleKind.Dust,
							opacity: 0.55,
							heat: 0,
							tint: [tint[0], tint[1], tint[2]]
						});
					}
					continue;
				}
				while (acc.blast >= 1) {
					acc.blast -= 1;
					const th = pool.random() * Math.PI * 2;
					const rho = (spec.exitRadius * 1.2 + shape.maxRadius * 0.8) * pool.random();
					const dir = add(scale(e1, Math.cos(th)), scale(e2, Math.sin(th)));
					const speed = (4 + 16 * pool.random()) * (0.5 + 0.5 * Math.sqrt(throttle));
					const spot = add(scale(up, info.radius + ground + 0.3), scale(dir, rho));
					const dust = pool.random() < 0.55;
					pool.emit({
						position: toBody(spot),
						velocity: toBody(add(scale(dir, speed), scale(up, 1 + 3 * pool.random()))),
						life: (dust ? 3.5 : 4) + 4 * pool.random(),
						size0: dust ? 2 : 2.5,
						size1: dust ? 10 + 9 * pool.random() : 11 + 9 * pool.random(),
						kind: dust ? ParticleKind.Dust : ParticleKind.Smoke,
						opacity: dust ? 0.6 : 0.55,
						heat: dust ? 0 : 0.55,
						tint: dust ? [tint[0], tint[1], tint[2]] : [1, 1, 1]
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
				// The persistent ribbon: a point behind the flame, only in air thick enough to hold a trail.
				const density = trailDensity(
					info.atmosphere ? pa / (info.atmosphere.surfacePressure || 1) : 0
				);
				if (density > 0.02 && height > shape.length * 2) {
					const tip = toBody(add(nozzle, scale(exhaust, shape.length * 0.7)));
					tips.push({
						x: tip.x,
						y: tip.y,
						z: tip.z,
						radius: spec.exitRadius * Math.sqrt(spec.nozzles?.length ?? 1),
						density: density * Math.sqrt(throttle)
					});
				}
			}
			if (!vacuum && tips.length > 0) this.feedTrail(String(v.id), tips, dt);
		}
		for (const k of this.accumulators.keys()) if (!seen.has(k)) this.accumulators.delete(k);
	}

	/** The cluster lights of this frame (plan 400): a pooled light per cluster, the rest at intensity 0. */
	private writeClusterLights(): void {
		const on = lookLevel(this.settings, 'plume') !== 'low';
		// the pool stays in the scene whatever the level, at intensity 0 when off: the lights are part of
		// every lit material's cache key, so adding or removing them (a warm-up frame at `low` and back)
		// rebuilt every lit material's shader each time, 0.5 s a step (plan 342, as `LampPool`'s note)
		if (this.clusterPool.length === 0) {
			for (let i = 0; i < CLUSTER_LIGHTS; i++) {
				const light = new PointLight(0xffa860, 0, 0, 2);
				light.name = 'plume-cluster';
				this.clusterPool.push(light);
				this.root.add(light);
			}
		}
		if (!on) {
			for (const light of this.clusterPool) light.intensity = 0;
			return;
		}
		const lights = clusterLights(this.litEngines);
		for (const [i, light] of this.clusterPool.entries()) {
			const c = lights[i];
			if (!c) {
				light.intensity = 0;
				continue;
			}
			light.position.set(c.position.x, c.position.y, c.position.z);
			light.color.setRGB(c.colour[0], c.colour[1], c.colour[2]);
			light.intensity = c.intensity;
			// reaches about a bell diameter per engine's worth of thrust, so a lone engine lights its pad and a cluster its stage
			light.distance = 18 + 14 * Math.sqrt(c.engines);
		}
	}

	/** One trail per vessel: the engines' flames merged into a point and a width (ADR 0080). */
	private feedTrail(key: string, tips: readonly TrailTip[], dt: number): void {
		let x = 0;
		let y = 0;
		let z = 0;
		let density = 0;
		let radius = 0;
		for (const t of tips) {
			x += t.x;
			y += t.y;
			z += t.z;
			density = Math.max(density, t.density);
			radius = Math.max(radius, t.radius);
		}
		x /= tips.length;
		y /= tips.length;
		z /= tips.length;
		let spread = 0;
		for (const t of tips) spread = Math.max(spread, Math.hypot(t.x - x, t.y - y, t.z - z));
		this.trails.offer(key, x, y, z, Math.max(0.5, 2 * radius + 2 * spread), density, dt);
	}

	private vacuumPool(body: string): ParticlePool {
		let pool = this.vacuumPools.get(body);
		if (!pool) {
			pool = new ParticlePool(Math.floor(this.settings.smokeParticles * VACUUM_POOL_SHARE), 17);
			this.vacuumPools.set(body, pool);
		}
		return pool;
	}

	/** One mesh triangle per shard, area-weighted over the lost parts' real geometry (ADR 0047). */
	private cutPieces(
		definitions: readonly string[],
		seed: number
	): Array<{ source: ShardSource; triangle: number }> {
		const sources = definitions
			.map((d) => this.options.shardSource?.(d))
			.filter((x): x is ShardSource => x !== undefined && x.cumulativeArea.length > 0);
		const count = this.settings.debrisShards;
		const out: Array<{ source: ShardSource; triangle: number }> = [];
		if (sources.length === 0) {
			for (let i = 0; i < count; i++) {
				const source = FALLBACK_SOURCES[(seed + i) % FALLBACK_SOURCES.length]!;
				out.push({ source, triangle: i % 2 });
			}
			return out;
		}
		// Each lost part contributes in proportion to its surface area.
		const areas = sources.map((s) => s.cumulativeArea[s.cumulativeArea.length - 1]!);
		const total = areas.reduce((a, b) => a + b, 0);
		sources.forEach((source, i) => {
			const share = Math.max(1, Math.round((count * areas[i]!) / total));
			for (const triangle of pickTriangles(source, share, seed + i * 7919)) {
				if (out.length < count) out.push({ source, triangle });
			}
		});
		return out;
	}

	/**
	 * The tangent frame fixed to the body at a point (+Y up), the gravity there and the floor of the
	 * ground under it relative to the point, m (negative: the ground is below).
	 */
	private groundFrame(
		frame: EffectsFrame,
		soi: string,
		position: Vec3,
		local: Vec3
	): Pick<Explosion, 'basis' | 'gravity' | 'floor'> {
		const body = frame.bodies.get(soi)!;
		const info = this.bodies.get(soi);
		const up = normalize(position);
		const inertial = new Quaternion().setFromUnitVectors(
			new Vector3(0, 1, 0),
			new Vector3(up.x, up.y, up.z)
		);
		const bodyQ = new Quaternion(
			body.rotation.x,
			body.rotation.y,
			body.rotation.z,
			body.rotation.w
		);
		const basis = bodyQ.clone().invert().multiply(inertial);
		const r = Math.max(1, length(local));
		const gravity =
			info?.mass !== undefined ? (GRAVITATIONAL_CONSTANT * info.mass) / (r * r) : GRAVITY;
		const ground = info ? (this.options.groundHeight?.(soi, normalize(local)) ?? 0) : 0;
		return { basis, gravity, floor: info ? ground - (r - info.radius) : -Infinity };
	}

	/** Lays out where the pieces of an impact near the ground come to rest and keeps them (ADR 0077). */
	private keepWreck(e: Explosion): void {
		const info = this.bodies.get(e.soi);
		if (!info || e.floor < -300) return;
		const sources: ShardSource[] = [];
		const indexed = e.pieces.map((p) => {
			let i = sources.indexOf(p.source);
			if (i < 0) i = sources.push(p.source) - 1;
			return { source: i, triangle: p.triangle };
		});
		const up = normalize(e.local);
		const groundOf = this.options.groundHeight;
		const groundAt = groundOf
			? (x: number, z: number): number => {
					const o = new Vector3(x, 0, z).applyQuaternion(e.basis);
					const dir = normalize(add(e.local, vec(o.x, o.y, o.z)));
					const g = groundOf(e.soi, dir) ?? 0;
					return dot(sub(scale(dir, info.radius + g), e.local), up);
				}
			: undefined;
		const plan = planWreck({
			seed: e.seed,
			shards: e.shards,
			pieces: indexed,
			sources,
			floor: e.floor,
			...(groundAt ? { groundAt } : {}),
			gravity: e.gravity
		});
		if (plan.pieces.length === 0) return;
		e.plan = plan;
		this.wrecks.add({
			soi: e.soi,
			local: e.local,
			basis: e.basis,
			plan,
			sources,
			age: e.age
		});
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
			if (ev.kind === 'touchdown') {
				if (ev.soi !== this.primary) continue;
				const up = normalize(local);
				const n = Math.min(14, Math.max(3, Math.floor(this.pool.capacity / 20)));
				const reach = Math.min(8, 1.5 + ev.size * 2 + ev.speed * 0.3);
				for (let i = 0; i < n; i++) {
					const a = (i / n) * 2 * Math.PI + this.pool.random() * 0.5;
					const out = toBody(vec(Math.cos(a), 0, Math.sin(a)));
					this.pool.emit({
						position: local,
						velocity: add(scale(out, reach * (0.6 + 0.4 * this.pool.random())), scale(up, 0.6)),
						life: 1.6 + 1.2 * this.pool.random(),
						size0: 0.6,
						size1: 2 + ev.size,
						kind: ParticleKind.Dust,
						opacity: 0.5,
						heat: 0
					});
				}
				continue;
			}
			this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
			const size = Math.max(1.2, ev.size * (ev.cause === 'burn' ? 2 : 3.6));
			const impact = ev.cause === 'impact';
			const shards = impact ? makeShards(this.seed, this.settings.debrisShards, size, 14) : [];
			const pieces = impact ? this.cutPieces(ev.definitions, this.seed) : [];
			const explosion: Explosion = {
				soi: ev.soi,
				local,
				size,
				kind: ev.cause,
				age: 0,
				seed: this.seed,
				shards,
				pieces,
				...this.groundFrame(frame, ev.soi, ev.position, local),
				plan: null
			};
			if (impact && shards.length > 0) this.keepWreck(explosion);
			this.explosions.push(explosion);
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
		const [lr, lg, lb] = frame.light;
		const sun = frame.sunDirection ?? vec(0, 1, 0);
		this.smoke.setSun(sun.x, sun.y, sun.z);
		let n = 0;
		const pools: Array<[string | undefined, ParticlePool]> = [[this.primary, this.pool]];
		for (const [id, pool] of this.vacuumPools) pools.push([id, pool]);
		for (const [id, pool] of pools) {
			const body = id ? frame.bodies.get(id) : undefined;
			if (!body) continue;
			const q = body.rotation;
			for (let i = 0; i < pool.count && n < this.smoke.capacity; i++) {
				const local = vec(pool.px[i]!, pool.py[i]!, pool.pz[i]!);
				const p = toRenderSpace(add(body.world, rotate(q, local)), frame.origin);
				const t = pool.age[i]! / pool.life[i]!;
				const ease = 1 - (1 - t) * (1 - t);
				const size = pool.size0[i]! + (pool.size1[i]! - pool.size0[i]!) * ease;
				const fadeIn = Math.min(1, pool.age[i]! / 0.25);
				const alpha = pool.opacity[i]! * fadeIn * Math.pow(1 - t, 1.3);
				const base = KIND_TINT[pool.kind[i]!] ?? KIND_TINT[0]!;
				const tint = [
					base[0] * pool.tint[i * 3]!,
					base[1] * pool.tint[i * 3 + 1]!,
					base[2] * pool.tint[i * 3 + 2]!
				] as const;
				const heat = pool.heat[i]! * Math.pow(1 - t, 3);
				this.smoke.set(
					n++,
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
		}
		this.smoke.commit(n);
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
			if (!body || this.reducedMotion) continue;
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
			if (s.flash > 0.01 && !this.reducedMotion)
				put(c, e.size * 5 * s.flash + e.size, 10 * s.flash, 9 * s.flash, 7 * s.flash, 1, 0.5);
		}
		field.commit(n);
	}

	/**
	 * Pieces of the destroyed parts: each is a thin prism over a triangle of the part's own mesh
	 * (ADR 0047), thrown on the shard's ballistic path and tumbling. Written to one dynamic mesh.
	 * A piece that lands settles from its tumble into the pose it will keep (ADR 0077); once the
	 * last one has, the wreck mesh takes over and the explosion stops drawing them.
	 */
	private writeShards(frame: EffectsFrame): void {
		const mesh = this.shardMesh;
		const capacity = this.shardPositions.length / (PIECE_VERTICES * 3);
		let n = 0;
		const q = new Quaternion();
		const rest = new Quaternion();
		const basis = new Quaternion();
		const bodyQ = new Quaternion();
		const axis = new Vector3();
		const tmp = new Float32Array(PIECE_VERTICES * 3);
		const v = new Vector3();
		const at = new Vector3();
		for (const e of this.explosions) {
			const body = frame.bodies.get(e.soi);
			if (!body || e.shards.length === 0) continue;
			if (e.plan && e.age >= e.plan.settled + SETTLE_TIME) continue; // the wreck mesh draws it now
			const centreWorld = add(body.world, rotate(body.rotation, e.local));
			bodyQ.set(body.rotation.x, body.rotation.y, body.rotation.z, body.rotation.w);
			basis.copy(bodyQ).multiply(e.basis);
			const base = toRenderSpace(centreWorld, frame.origin);
			const planned = new Map(e.plan?.pieces.map((p) => [p.shard, p]));
			for (let k = 0; k < e.shards.length; k++) {
				if (n >= capacity) break;
				const s = e.shards[k]!;
				const piece = e.pieces[k];
				if (!piece) continue;
				const land = planned.get(k);
				// In the air: the ballistic path; once down: the rest pose of the plan.
				const t = land ? Math.min(e.age, land.landTime) : e.age;
				const p = shardPosition(s, t, e.gravity);
				const floor = land ? -Infinity : e.floor;
				let y = Math.max(p.y, floor + s.size * 0.2);
				let m = 0;
				axis.set(0.6 + (k % 3) * 0.2, 0.3, 0.7 - (k % 4) * 0.15).normalize();
				q.setFromAxisAngle(axis, s.spin * t);
				if (land) {
					m = settleBlend(e.age, land.landTime);
					if (m > 0) {
						rest.set(land.rest.x, land.rest.y, land.rest.z, land.rest.w);
						q.slerp(rest, m);
						y = y + (land.y - y) * m;
					}
				} else if (p.y <= floor) {
					q.setFromAxisAngle(axis, s.spin * 0.2);
				}
				q.premultiply(basis);
				at.set(p.x, y, p.z)
					.applyQuaternion(basis)
					.add(v.set(base.x, base.y, base.z));
				writePiece(piece.source, piece.triangle, s.size * 3, s.size * 0.5, tmp, 0);
				const o = n * PIECE_VERTICES * 3;
				const rgb = piece.source.colours;
				const char = 1 + (WRECK_SCORCH - 1) * m; // the paint chars as the piece settles
				for (let i = 0; i < PIECE_VERTICES; i++) {
					v.set(tmp[i * 3]!, tmp[i * 3 + 1]!, tmp[i * 3 + 2]!)
						.applyQuaternion(q)
						.add(at);
					this.shardPositions[o + i * 3] = v.x;
					this.shardPositions[o + i * 3 + 1] = v.y;
					this.shardPositions[o + i * 3 + 2] = v.z;
					this.shardColours[o + i * 3] = rgb[piece.triangle * 3]! * char;
					this.shardColours[o + i * 3 + 1] = rgb[piece.triangle * 3 + 1]! * char;
					this.shardColours[o + i * 3 + 2] = rgb[piece.triangle * 3 + 2]! * char;
				}
				n++;
			}
		}
		mesh.geometry.setDrawRange(0, n * PIECE_VERTICES);
		mesh.visible = n > 0;
		mesh.geometry.getAttribute('position').needsUpdate = true;
		mesh.geometry.getAttribute('color').needsUpdate = true;
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
		const parts: SilhouettePart[] = v.parts.map((p) => ({
			position: p.position,
			orientation: p.orientation,
			...(this.options.partSilhouette?.(p.definition) ?? DEFAULT_SILHOUETTE)
		}));
		const profile = silhouetteProfile(parts, fwd);
		const rings = shellRings(profile, speed);
		let side = 0;
		for (const r of profile.radii) side = Math.max(side, r);
		const root = toRenderSpace(add(body.world, v.position), frame.origin);
		const at = (s: number): Vec3 => vec(root.x + fwd.x * s, root.y + fwd.y * s, root.z + fwd.z * s);
		const tip = at(profile.front + 0.6);
		// the colours of the three layers from the heating, the speed and the body's palette (plan 399)
		const quality = lookLevel(this.settings, 'plasma');
		const palette = paletteFor(info.id, info.atmosphere, info.plasma);
		const heating = heatingOf(
			stagnationFlux(airDensity(info.atmosphere, altitude), PLASMA_NOSE_RADIUS, speed),
			palette.multipliers.strength
		);
		const layer = (l: 'skin' | 'shock' | 'trail') =>
			plasmaColour(l, heating, speed, palette, quality);
		// condensation and the vapour cone: Medium and up, by Mach and the local air
		let condensation = 0;
		if (quality !== 'low' && info.atmosphere && speed > 1) {
			const air = ambientAt({ atmosphere: info.atmosphere } as BodyDefinition, altitude);
			if (air.speedOfSound)
				condensation = condensationOpacity(speed / air.speedOfSound, air.density);
		}
		this.plasma.update({
			intensity,
			forward: fwd,
			front: tip,
			extent: profile.front - profile.back + 1.2,
			radius: side + 0.7,
			shell: {
				rings,
				front: profile.front,
				origin: add(at(profile.front), profile.axisPoint)
			},
			time: frame.time,
			tint: ionisationColour(speed),
			skin: layer('skin'),
			shock: layer('shock'),
			trail: layer('trail'),
			condensation,
			detail: quality === 'high' ? 2 : quality === 'medium' ? 1 : 0
		});
	}

	dispose(): void {
		this.smoke.dispose();
		this.fire.dispose();
		this.shardMesh.geometry.dispose();
		this.shardMaterial.dispose();
		this.glow.dispose();
		this.plasma.dispose();
		this.wrecks.dispose();
		this.trails.dispose();
	}
}

export { EXPLOSION_DURATION };
