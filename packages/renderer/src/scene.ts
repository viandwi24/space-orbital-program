/**
 * The Three scene graph: body spheres, vessel groups with placeholder part meshes, the camera
 * rig and the map-view overlay. Contains no `WebGLRenderer`, so it runs (and is tested) in Bun.
 * It only reads snapshots; it never mutates them.
 */
import type {
	BodyDefinition,
	EntityId,
	PartVisual,
	Quat,
	Snapshot,
	Vec3,
	VesselSnapshot
} from '@orbital/core';
import {
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshLambertMaterial,
	MeshStandardMaterial,
	Object3D,
	PerspectiveCamera,
	Quaternion,
	Scene,
	SphereGeometry,
	Vector3,
	type WebGLRenderer
} from 'three';
import {
	FLIGHT_RIG_LIMITS,
	applyRigInput,
	initialRig,
	rigOffset,
	type RigLimits,
	type RigState
} from './camera-rig.ts';
import { Environment } from './environment.ts';
import { Effects, type BodyFrame, type EffectsFrame } from './effects/system.ts';
import { ambientPressureAt } from './effects/plume.ts';
import {
	angularVelocity,
	detectTransitions,
	type FxEvent,
	type FxVessel
} from './effects/transitions.ts';
import { PartModelFactory } from './parts/factory.ts';
import { mergeShardSources, shardSourceFromGeometry, type ShardSource } from './effects/shards.ts';
import {
	DEFAULT_PART_SHAPE,
	type PartModel,
	type PartModelProvider,
	type PartNode,
	type PartShape,
	repeatedDetail
} from './parts/types.ts';
import { OrbitLine, VesselMarker } from './map.ts';
import { MoonPass } from './moon.ts';
import { DEFAULT_ORIGIN_THRESHOLD, ZERO, toRenderSpace, updateOrigin } from './origin.ts';
import { PRESETS, detailOf, type GraphicsPreset } from './presets.ts';
import { projectWorldPoint, type ScreenPoint } from './project.ts';
import { rotate, rotateInverse } from './vec.ts';

export { DEFAULT_PART_SHAPE };
export type { PartShape };

/** What the renderer needs of a body; `parent` and `orbit` let the map view draw a moon's orbit and sphere. */
export type BodyRenderInfo = Pick<BodyDefinition, 'id' | 'radius' | 'atmosphere'> &
	Partial<Pick<BodyDefinition, 'parent' | 'orbit' | 'mass'>>;

/** One stretch of a predicted path (plan 044): points relative to `body`, which sits at `offset` in the system frame. */
export interface MapPathSegment {
	body: string;
	/** Position of the body's centre when the stretch starts, system frame, m. */
	offset: Vec3;
	points: readonly Vec3[];
	/** The stretch lies after a maneuver node (plan 045): drawn in its own colour. */
	planned?: boolean;
}

export interface SceneConfig {
	bodies: readonly BodyRenderInfo[];
	/** Keyed by part definition id (`PartSnapshot.definition`). */
	partShapes: ReadonlyMap<string, PartShape>;
	/** Visual descriptors by part definition id (`PartDefinition.visual`, ADR 0028). */
	partVisuals?: ReadonlyMap<string, PartVisual>;
	/** Attach nodes by part definition id; defaults to the top/bottom faces of the shape. */
	partAttach?: ReadonlyMap<string, Readonly<Record<string, PartNode>>>;
	/** Consulted before the procedural generators (asset-backed providers, ADR 0028). */
	partProviders?: readonly PartModelProvider[];
	/** Origin re-centre distance, m. Default 10 km. */
	originThreshold?: number;
	/** Graphics preset (ADR 0027). Default `high`. */
	preset?: GraphicsPreset;
	/**
	 * Launch site on the first body: the surface point `load-vessel` uses (the sim defaults to
	 * latitude 0, longitude 0).
	 */
	launchSite?: { latitude: number; longitude: number };
}

/** Lowest altitude of the orbit camera above the surface sphere, m. */
export const MIN_CAMERA_ALTITUDE = 1.2;
/** Seconds the camera holds the place of a destroyed active vessel. */
export const GHOST_HOLD = 5;
const GHOST_ID = -1;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 1e13;
const BODY_COLORS = [0x3d7a4a, 0x8a8f98, 0xb5764a, 0x4a6fa5];

interface PartEntry {
	model: PartModel;
}
interface VesselEntry {
	group: Group;
	parts: Map<number, PartEntry>;
	line: OrbitLine;
	marker: VesselMarker;
}

export class SceneModel {
	readonly scene = new Scene();
	readonly camera = new PerspectiveCamera(50, 1, CAMERA_NEAR, CAMERA_FAR);

	private readonly bodies = new Map<string, { holder: Object3D; radius: number }>();
	/** Airless bodies other than the first, drawn by the moon pass (ADR 0054). */
	private readonly moons = new Map<string, MoonPass>();
	/** Map view furniture of a body with a parent: its orbit around the parent and its sphere of influence. */
	private readonly bodyMarks = new Map<
		string,
		{ parent: string; orbit: OrbitLine; sphere: Mesh | undefined; soi: number }
	>();
	/** The predicted path across spheres of influence, set by the host (plan 044). */
	private readonly pathLines: OrbitLine[] = [];
	private pathSegments: readonly MapPathSegment[] = [];
	/** Where the path changes sphere: a dot at the end of every stretch but the last, and the sphere it enters. */
	private readonly pathDots: VesselMarker[] = [];
	private readonly pathGhosts: Mesh[] = [];
	private mapFocus: string | null = null;
	/** Flight environment of the first body: planet pass, sun, sky, launch site (ADR 0027). */
	readonly environment: Environment;
	private readonly primaryBody: string | undefined;
	private pixelRatio = 1;
	private vesselRadius = 10;
	private readonly bodyRot = new Map<string, Quat>();
	private cameraDirty = false;
	private lastView: {
		active: VesselSnapshot | undefined;
		anchorBody: string | undefined;
		bodyWorld: ReadonlyMap<string, Vec3>;
	} | null = null;
	private frameState: { bodyRender: Vec3; bodyRotation: Quat; vesselRender: Vec3 | null } | null =
		null;
	private readonly vessels = new Map<number, VesselEntry>();
	private factory: PartModelFactory;
	private shardSources = new Map<string, ShardSource | undefined>();
	private readonly config: SceneConfig;
	/** Part effects: smoke, dust, separation gas, explosions, plasma (plan 020). */
	readonly effects: Effects;
	private readonly bodyInfo = new Map<string, BodyRenderInfo>();
	private readonly bodyFx = new Map<string, BodyFrame>();
	private fxVessels: FxVessel[] | null = null;
	private fxEvents: FxEvent[] = [];
	private fxVesselsNow: EffectsFrame['vessels'] = [];
	private sinceSync = Number.POSITIVE_INFINITY;
	private simTime = Number.NEGATIVE_INFINITY;
	private simAdvancing = false;
	private effectsTime = 0;
	private debugTemperature: number | null = null;
	private focus: { definition: string; occurrence: number } | null = null;
	/** Where the active vessel was (body-fixed), so the camera stays at a wreck while it burns. */
	private lastActive: { soi: string; local: Vec3; t: number } | null = null;
	private readonly threshold: number;
	private readonly sphere = new SphereGeometry(1, 64, 32);
	private readonly viewport = { width: 1, height: 1 };

	private origin: Vec3 = ZERO;
	private active: EntityId | null = null;
	private map = false;
	private flightRig: RigState = initialRig(25);
	private mapRig: RigState = initialRig(0);
	private mapLimits: RigLimits = { minDistance: 1, maxDistance: 1e12 };

	constructor(config: SceneConfig) {
		this.config = config;
		const settings = PRESETS[config.preset ?? 'high'];
		this.factory = this.makeFactory(config.preset ?? 'high');
		this.threshold = config.originThreshold ?? DEFAULT_ORIGIN_THRESHOLD;
		config.bodies.forEach((b, i) => {
			const holder = new Object3D();
			holder.name = `body:${b.id}`;
			if (i > 0 && !b.atmosphere) {
				// An airless body other than the first: the moon pass (ADR 0054).
				const moon = new MoonPass(b.id, b.radius);
				holder.add(moon.root);
				this.moons.set(b.id, moon);
			} else if (i > 0) {
				// Other bodies stay plain lit spheres (ADR 0027, consequences).
				const mesh = new Mesh(
					this.sphere,
					new MeshLambertMaterial({ color: BODY_COLORS[i % BODY_COLORS.length] ?? 0x888888 })
				);
				mesh.scale.setScalar(b.radius);
				holder.add(mesh);
			}
			this.scene.add(holder);
			this.bodies.set(b.id, { holder, radius: b.radius });
		});
		for (const b of config.bodies) {
			if (b.parent === undefined || !b.orbit) continue;
			const orbit = new OrbitLine(0x6f8bb0, 1.5);
			orbit.setOrbit(b.orbit);
			this.scene.add(orbit.object);
			const parent = config.bodies.find((x) => x.id === b.parent);
			let sphere: Mesh | undefined;
			if (parent?.mass !== undefined && b.mass !== undefined) {
				// Laplace sphere of influence, the same radius the sim switches at (ADR 0051).
				const soi = b.orbit.a * Math.pow(b.mass / parent.mass, 0.4);
				sphere = new Mesh(
					new SphereGeometry(soi, 32, 16),
					new MeshBasicMaterial({
						color: 0x6f8bb0,
						wireframe: true,
						transparent: true,
						opacity: 0.1,
						depthWrite: false
					})
				);
				sphere.visible = false;
				this.scene.add(sphere);
			}
			this.bodyMarks.set(b.id, {
				parent: b.parent,
				orbit,
				sphere,
				soi: sphere ? (sphere.geometry as SphereGeometry).parameters.radius : 0
			});
		}
		const primary = config.bodies[0];
		this.primaryBody = primary?.id;
		this.environment = new Environment({
			body: primary ?? { id: 'none', radius: 1, atmosphere: undefined },
			preset: config.preset ?? 'high',
			site: config.launchSite ?? { latitude: 0, longitude: 0 }
		});
		this.scene.add(this.environment.root);
		this.scene.fog = this.environment.fog;
		for (const b of config.bodies) this.bodyInfo.set(b.id, b);
		this.effects = new Effects(
			this.bodyInfo,
			this.primaryBody,
			(definition) => config.partVisuals?.get(definition)?.plume,
			settings,
			{
				groundHeight: (direction) => this.environment.groundHeight(direction),
				shardSource: (definition) => this.shardSourceOf(definition)
			}
		);
		this.scene.add(this.effects.root);
	}

	/** The mesh triangles of a part, for debris pieces (ADR 0047); built once per preset from the real model. */
	private shardSourceOf(definition: string): ShardSource | undefined {
		if (this.shardSources.has(definition)) return this.shardSources.get(definition);
		let source: ShardSource | undefined;
		try {
			const model = this.factory.create(definition, {
				detail: repeatedDetail(this.factory.currentDetail)
			});
			const parts: ShardSource[] = [];
			model.root.traverse((o) => {
				if (!(o instanceof Mesh) || !o.geometry.getAttribute('position')) return;
				// The plume is not a surface that can break.
				for (let p: Object3D | null = o; p; p = p.parent) if (p.name === 'plume') return;
				const materials = Array.isArray(o.material) ? o.material : [o.material];
				parts.push(
					shardSourceFromGeometry(o.geometry, (i) => {
						const c = (materials[i] as MeshStandardMaterial | undefined)?.color;
						return c ? [c.r, c.g, c.b] : [0.6, 0.6, 0.6];
					})
				);
			});
			if (parts.length > 0) source = mergeShardSources(parts);
			model.dispose();
		} catch {
			source = undefined;
		}
		this.shardSources.set(definition, source);
		return source;
	}

	private makeFactory(preset: GraphicsPreset): PartModelFactory {
		const config = this.config;
		return new PartModelFactory({
			shapes: config.partShapes,
			visuals: config.partVisuals,
			attach: config.partAttach,
			providers: config.partProviders,
			detail: detailOf(PRESETS[preset])
		});
	}

	/** Switch the graphics preset: environment, part detail (models are rebuilt), effect budgets. */
	setPreset(preset: GraphicsPreset): void {
		this.environment.setPreset(preset);
		for (const entry of this.vessels.values()) {
			for (const p of entry.parts.values()) {
				entry.group.remove(p.model.root);
				p.model.dispose();
			}
			entry.parts.clear();
		}
		this.factory.dispose();
		this.shardSources.clear();
		this.factory = this.makeFactory(preset);
		this.effects.setPreset(PRESETS[preset]);
	}

	/** Screenshot hook: aim the flight camera at the n-th part of a definition instead of the root part. */
	setDebugFocus(definition: string | null, occurrence = 0): void {
		this.focus = definition === null ? null : { definition, occurrence };
		this.cameraDirty = true;
	}

	/** Screenshot hook: force the skin temperature of every part (K), or `null` for the snapshot's values. */
	setDebugTemperature(kelvin: number | null): void {
		this.debugTemperature = kelvin;
	}

	/** Transform holder of a body in render space (position = centre, quaternion = rotation). */
	bodyObject(id: string): Object3D | undefined {
		return this.bodies.get(id)?.holder;
	}

	setPixelRatio(ratio: number): void {
		this.pixelRatio = ratio;
	}

	/** Current floating origin in root-inertial coordinates (for the host's debug overlay/tests). */
	get originPosition(): Vec3 {
		return this.origin;
	}
	get isMapView(): boolean {
		return this.map;
	}
	get activeVessel(): EntityId | null {
		return this.active;
	}

	setMapView(on: boolean): void {
		this.map = on;
	}
	toggleMapView(): boolean {
		this.map = !this.map;
		return this.map;
	}
	setActiveVessel(id: EntityId | null): void {
		this.active = id;
	}
	/** Set the flight orbit camera directly (screenshot presets). */
	setFlightRig(rig: RigState): void {
		this.flightRig = { ...rig };
		this.cameraDirty = true;
	}
	/** Rotate/zoom whichever camera is current (flight rig or map rig). */
	orbitCamera(input: { dYaw?: number; dPitch?: number; zoomFactor?: number }): void {
		if (this.map) {
			// Before the first map placement the distance is 0 ("not yet set"): turn only, the
			// default distance is chosen from the body radius in `placeCamera`.
			const unset = this.mapRig.distance === 0;
			const next = applyRigInput(this.mapRig, this.mapLimits, input);
			this.mapRig = unset ? { ...next, distance: 0 } : next;
		} else this.flightRig = applyRigInput(this.flightRig, FLIGHT_RIG_LIMITS, input);
		this.cameraDirty = true;
	}
	resize(width: number, height: number): void {
		this.viewport.width = width;
		this.viewport.height = height;
		this.camera.aspect = width / Math.max(1, height);
		this.camera.updateProjectionMatrix();
		for (const v of this.vessels.values()) v.line.setResolution(width, height);
		for (const m of this.bodyMarks.values()) m.orbit.setResolution(width, height);
		for (const l of this.pathLines) l.setResolution(width, height);
	}

	/**
	 * Screen position of `world` (the sim's inertial frame, as in snapshots: a body's `position` plus
	 * a vessel's SOI-relative `position`) through the camera as it is now, in CSS pixels of the
	 * canvas box; `null` behind the camera. `hidden` when a body lies between the camera and the
	 * point (plan 024, ADR 0033). A rig change since the last `sync` is applied first, so an orbit
	 * input is visible to the next call.
	 */
	project(world: Vec3): ScreenPoint | null {
		if (this.cameraDirty && this.lastView) {
			this.placeCamera(this.lastView.active, this.lastView.anchorBody, this.lastView.bodyWorld);
			this.cameraDirty = false;
		}
		this.camera.updateMatrixWorld();
		const occluders = [...this.bodies.values()].map((b) => ({
			center: { x: b.holder.position.x, y: b.holder.position.y, z: b.holder.position.z },
			radius: b.radius
		}));
		return projectWorldPoint(
			this.camera,
			toRenderSpace(world, this.origin),
			this.viewport.width,
			this.viewport.height,
			occluders
		);
	}

	/** Orbit lines and spheres of influence of bodies with a parent: at the parent, map view only. */
	private placeBodyMarks(bodyWorld: ReadonlyMap<string, Vec3>): void {
		for (const [id, mark] of this.bodyMarks) {
			const parent = bodyWorld.get(mark.parent);
			const self = bodyWorld.get(id);
			mark.orbit.object.visible = this.map && parent !== undefined;
			if (parent) {
				const p = toRenderSpace(parent, this.origin);
				mark.orbit.object.position.set(p.x, p.y, p.z);
			}
			if (mark.sphere) {
				mark.sphere.visible = this.map && self !== undefined;
				if (self) {
					const p = toRenderSpace(self, this.origin);
					mark.sphere.position.set(p.x, p.y, p.z);
				}
			}
		}
		this.placePath(bodyWorld);
	}

	/**
	 * The predicted path of the active vessel across spheres of influence (plan 044): one line per
	 * stretch, each at the position its body had when the stretch starts, so the part inside a moon's
	 * sphere hangs where the moon will be. Cleared with `null`.
	 */
	setMapPath(segments: readonly MapPathSegment[] | null): void {
		this.pathSegments = segments ?? [];
		for (let i = 0; i < this.pathLines.length; i++) this.pathLines[i]!.object.visible = false;
		while (this.pathLines.length < this.pathSegments.length) {
			const line = new OrbitLine(this.pathLines.length === 0 ? 0x4fc3f7 : 0xffa24f, 2.5);
			line.setResolution(this.viewport.width, this.viewport.height);
			this.scene.add(line.object);
			this.pathLines.push(line);
		}
		this.pathSegments.forEach((s, i) => {
			const line = this.pathLines[i]!;
			line.setPoints(s.points);
			line.setColor(s.planned ? 0xc77dff : i === 0 ? 0x4fc3f7 : 0xffa24f);
		});
		while (this.pathDots.length < this.pathSegments.length) {
			const dot = new VesselMarker(0xffa24f);
			this.scene.add(dot.object);
			this.pathDots.push(dot);
		}
		for (const d of this.pathDots) d.object.visible = false;
		for (const g of this.pathGhosts) g.visible = false;
	}

	private placePath(bodyWorld: ReadonlyMap<string, Vec3>): void {
		let ghosts = 0;
		this.pathSegments.forEach((s, i) => {
			const line = this.pathLines[i];
			if (!line) return;
			const show = this.map && s.points.length >= 2 && bodyWorld.has(s.body);
			line.object.visible = show;
			const p = toRenderSpace(s.offset, this.origin);
			line.object.position.set(p.x, p.y, p.z);
			const dot = this.pathDots[i];
			const last = s.points[s.points.length - 1];
			if (dot && last) {
				dot.object.visible = show && i < this.pathSegments.length - 1;
				const at = toRenderSpace(
					{ x: s.offset.x + last.x, y: s.offset.y + last.y, z: s.offset.z + last.z },
					this.origin
				);
				dot.place(at, this.markerRadius(at) * 0.7);
			}
			// The sphere a stretch lies in, where its body will be when the vessel gets there (a moon's
			// ghost): only for a body with a sphere of its own.
			const mark = this.bodyMarks.get(s.body);
			if (show && mark?.sphere && i > 0) {
				const ghost = (this.pathGhosts[ghosts] ??= this.makeGhost(mark.soi));
				ghosts++;
				ghost.visible = true;
				ghost.position.set(p.x, p.y, p.z);
				ghost.scale.setScalar(mark.soi / (ghost.geometry as SphereGeometry).parameters.radius);
			}
		});
	}

	private makeGhost(radius: number): Mesh {
		const ghost = new Mesh(
			new SphereGeometry(radius, 24, 12),
			new MeshBasicMaterial({
				color: 0xffa24f,
				wireframe: true,
				transparent: true,
				opacity: 0.12,
				depthWrite: false
			})
		);
		this.scene.add(ghost);
		return ghost;
	}

	/** Map view: look at this body (`null`: the body of the active vessel's sphere). */
	setMapFocus(body: string | null): void {
		this.mapFocus = body;
		this.cameraDirty = true;
	}
	get mapFocusBody(): string | null {
		return this.mapFocus;
	}
	/** Ids of the bodies of the scene, root first, for cycling the map focus. */
	get bodyIds(): string[] {
		return [...this.bodies.keys()];
	}

	/** Brings the scene in line with `snapshot`. Call once per received snapshot. */
	sync(snapshot: Snapshot): void {
		const bodyWorld = new Map<string, Vec3>();
		for (const b of snapshot.bodies) bodyWorld.set(b.id, b.position);

		const vessels = snapshot.vessels;
		let activeVessel =
			vessels.find((v) => v.id === this.active) ?? (this.active === null ? vessels[0] : undefined);
		if (activeVessel) {
			const rot = this.bodyRotOf(snapshot, activeVessel.soi);
			if (rot) {
				this.lastActive = {
					soi: activeVessel.soi,
					local: rotateInverse(rot, activeVessel.position),
					t: snapshot.t
				};
			}
		} else {
			activeVessel = this.ghostVessel(snapshot);
		}
		const soiPos = (v: VesselSnapshot): Vec3 => {
			const p = bodyWorld.get(v.soi);
			if (!p) throw new Error(`Snapshot vessel ${v.id} is in unknown SOI body "${v.soi}"`);
			return p;
		};

		// Anchor: the vessel in flight view, the SOI body in map view; no vessel -> first body.
		let anchor: Vec3 = snapshot.bodies[0]?.position ?? this.origin;
		let anchorBody: string | undefined = snapshot.bodies[0]?.id;
		if (activeVessel) {
			const base = soiPos(activeVessel);
			anchorBody = activeVessel.soi;
			anchor = this.map ? base : add(base, activeVessel.position);
		}
		// Map view: the player may look at another body than the vessel's own sphere.
		const focus = this.map && this.mapFocus && bodyWorld.has(this.mapFocus) ? this.mapFocus : null;
		if (focus) {
			anchorBody = focus;
			anchor = bodyWorld.get(focus)!;
		}
		this.origin = updateOrigin(this.origin, anchor, this.threshold).origin;

		const dtSim = snapshot.t - this.simTime;
		this.simAdvancing = dtSim > 0;
		this.sinceSync = 0;
		for (const b of snapshot.bodies) {
			const before = this.bodyRot.get(b.id);
			const spin =
				before && Number.isFinite(dtSim) && dtSim > 0 && dtSim < 60
					? angularVelocity(before, b.rotation, dtSim)
					: (this.bodyFx.get(b.id)?.omega ?? { x: 0, y: 0, z: 0 });
			this.bodyFx.set(b.id, { world: b.position, rotation: b.rotation, omega: spin });
			const entry = this.bodies.get(b.id);
			if (!entry) continue; // body the host gave no render info for: not drawn
			const p = toRenderSpace(b.position, this.origin);
			entry.holder.position.set(p.x, p.y, p.z);
			entry.holder.quaternion.set(b.rotation.x, b.rotation.y, b.rotation.z, b.rotation.w);
			this.bodyRot.set(b.id, b.rotation);
		}

		this.placeBodyMarks(bodyWorld);
		const seen = new Set<number>();
		for (const v of vessels) {
			const id = v.id;
			seen.add(id);
			const entry = this.vesselEntry(id);
			const base = soiPos(v);
			const p = toRenderSpace(add(base, v.position), this.origin);
			entry.group.position.set(p.x, p.y, p.z);
			entry.group.visible = !this.map;
			this.syncParts(entry, v);

			const bp = toRenderSpace(base, this.origin);
			entry.line.object.position.set(bp.x, bp.y, bp.z);
			entry.line.setOrbit(this.map ? v.orbit : undefined);
			entry.marker.object.visible = this.map;
			entry.marker.place(p, this.markerRadius(p));
		}
		for (const [id, entry] of this.vessels) {
			if (seen.has(id)) continue;
			this.scene.remove(entry.group, entry.line.object, entry.marker.object);
			for (const p of entry.parts.values()) p.model.dispose();
			entry.line.dispose();
			entry.marker.dispose();
			this.vessels.delete(id);
		}

		this.trackTransitions(snapshot, dtSim);
		this.lastView = { active: activeVessel, anchorBody, bodyWorld };
		this.placeCamera(activeVessel, anchorBody, bodyWorld);
		this.cameraDirty = false;

		const primaryWorld = this.primaryBody ? bodyWorld.get(this.primaryBody) : undefined;
		const primaryRot = this.primaryBody ? this.bodyRot.get(this.primaryBody) : undefined;
		const activeGroup = activeVessel ? this.vessels.get(activeVessel.id)?.group : undefined;
		this.frameState =
			primaryWorld && primaryRot
				? {
						bodyRender: toRenderSpace(primaryWorld, this.origin),
						bodyRotation: primaryRot,
						vesselRender:
							activeGroup && activeVessel?.soi === this.primaryBody
								? {
										x: activeGroup.position.x,
										y: activeGroup.position.y,
										z: activeGroup.position.z
									}
								: null
					}
				: null;
	}

	/**
	 * Per-frame environment update (planet uniforms, sun, shadow fit, exposure) from the last
	 * synced snapshot and the current camera. `dt` is wall-clock seconds since the last call.
	 */
	prepareFrame(dt: number, force = false): void {
		if (!this.frameState) return;
		if (this.cameraDirty && this.lastView) {
			this.placeCamera(this.lastView.active, this.lastView.anchorBody, this.lastView.bodyWorld);
			this.cameraDirty = false;
		}
		this.camera.updateMatrixWorld();
		const moonUp = this.updateMoons();
		const activeGroup = this.lastView?.active
			? this.vessels.get(this.lastView.active.id)?.group
			: undefined;
		this.environment.update({
			camera: this.camera,
			pixelHeight: this.viewport.height * this.pixelRatio,
			bodyRender: this.frameState.bodyRender,
			bodyRotation: this.frameState.bodyRotation,
			// On a moon the light and the shadow follow the vessel's own sphere (ADR 0054).
			vesselRender:
				moonUp && activeGroup
					? {
							x: activeGroup.position.x,
							y: activeGroup.position.y,
							z: activeGroup.position.z
						}
					: this.frameState.vesselRender,
			...(moonUp ? { up: moonUp } : {}),
			vesselRadius: this.vesselRadius,
			mapView: this.map,
			dt
		});
		this.updateEffects(dt, force);
	}

	/**
	 * Tells every moon pass where the camera is (body-fixed) so it can follow with its height patches.
	 * Returns the local vertical (inertial, unit) when the active vessel is in a moon's sphere.
	 */
	private updateMoons(): Vec3 | undefined {
		let up: Vec3 | undefined;
		for (const [id, moon] of this.moons) {
			const entry = this.bodies.get(id);
			const rot = this.bodyRot.get(id);
			if (!entry || !rot) continue;
			const rel = {
				x: this.camera.position.x - entry.holder.position.x,
				y: this.camera.position.y - entry.holder.position.y,
				z: this.camera.position.z - entry.holder.position.z
			};
			moon.update(rotateInverse(rot, rel));
			if (this.lastView?.active?.soi === id) {
				const l = Math.hypot(rel.x, rel.y, rel.z);
				if (l > 0) up = { x: rel.x / l, y: rel.y / l, z: rel.z / l };
			}
		}
		return up;
	}

	/** Dev/screenshot hook: set the regolith colour of every moon. */
	setMoonTint(r: number, g: number, b: number): void {
		for (const moon of this.moons.values()) moon.setTint(r, g, b);
	}

	/** Bakes what the moon passes asked for this frame (needs a context; the facade calls it). */
	bakeMoons(gl: WebGLRenderer): void {
		for (const moon of this.moons.values()) moon.bake(gl);
	}

	/** Baked moon patch read back as heights (m), for the parity check; null before the first bake. */
	debugMoonPatch(
		gl: WebGLRenderer,
		body: string,
		which: 'fine' | 'mid'
	): ReturnType<MoonPass['debugReadPatch']> {
		return this.moons.get(body)?.debugReadPatch(gl, which) ?? null;
	}

	private updateEffects(dt: number, force: boolean): void {
		this.sinceSync += dt;
		this.effectsTime += dt;
		for (const entry of this.vessels.values()) {
			for (const p of entry.parts.values()) p.model.tick(dt);
		}
		const events = this.fxEvents;
		this.fxEvents = [];
		const live = force || (this.simAdvancing && this.sinceSync < 0.5);
		this.effects.root.visible = !this.map;
		this.effects.update({
			dt: live ? dt : 0,
			time: this.effectsTime,
			origin: this.origin,
			bodies: this.bodyFx,
			vessels: this.fxVesselsNow,
			events,
			light: this.smokeLight(),
			activeVessel: this.lastView?.active?.id ?? null,
			...(this.frameState
				? { sunDirection: this.environment.sunDirection(this.frameState.bodyRotation) }
				: {})
		});
	}

	/** Diffuse radiance of white smoke under the current sun and sky, linear RGB. */
	private smokeLight(): [number, number, number] {
		const sun = this.environment.sunLight;
		const sky = this.environment.hemisphere;
		const k = 0.7 / Math.PI;
		const sunTerm = 0.5 * sun.intensity;
		return [
			k * (sun.color.r * sunTerm + sky.color.r * sky.intensity),
			k * (sun.color.g * sunTerm + sky.color.g * sky.intensity),
			k * (sun.color.b * sunTerm + sky.color.b * sky.intensity)
		];
	}

	private bodyRotOf(snapshot: Snapshot, soi: string): Quat | undefined {
		return snapshot.bodies.find((b) => b.id === soi)?.rotation;
	}

	/**
	 * A stand-in for the active vessel for a few seconds after it vanished (destroyed), at its last
	 * body-fixed position: the camera and the floating origin stay there instead of jumping to the
	 * planet centre, so the explosion is seen.
	 */
	private ghostVessel(snapshot: Snapshot): VesselSnapshot | undefined {
		const last = this.lastActive;
		if (!last || snapshot.t - last.t > GHOST_HOLD) return undefined;
		const rot = this.bodyRotOf(snapshot, last.soi);
		if (!rot) return undefined;
		return {
			id: GHOST_ID as EntityId,
			mode: 'flight',
			soi: last.soi as VesselSnapshot['soi'],
			position: rotate(rot, last.local),
			velocity: { x: 0, y: 0, z: 0 },
			orientation: { x: 0, y: 0, z: 0, w: 1 },
			parts: []
		};
	}

	/** Compare with the previous snapshot: vanished parts and split vessels become effect events. */
	private trackTransitions(snapshot: Snapshot, dtSim: number): void {
		const now: FxVessel[] = snapshot.vessels.map((v) => ({
			id: v.id,
			soi: v.soi,
			position: v.position,
			velocity: v.velocity,
			parts: v.parts.map((p) => ({
				id: p.id,
				definition: p.definition,
				position: p.position,
				temperature: p.temperature
			}))
		}));
		const prev = this.fxVessels;
		if (prev && dtSim > 0 && dtSim < 5) {
			this.fxEvents.push(
				...detectTransitions(prev, now, {
					omega: (soi) => this.bodyFx.get(soi)?.omega ?? { x: 0, y: 0, z: 0 },
					sizeOf: (definition) => {
						const shape = this.config.partShapes.get(definition);
						if (shape?.kind === 'cylinder') return Math.max(shape.radius, shape.height / 2);
						if (shape?.kind === 'box')
							return Math.max(shape.size.x, shape.size.y, shape.size.z) / 2;
						return 0.5;
					}
				})
			);
			if (this.fxEvents.length > 16) this.fxEvents.splice(0, this.fxEvents.length - 16);
		}
		this.fxVessels = now;
		this.simTime = snapshot.t;
		this.fxVesselsNow = snapshot.vessels.map((v) => ({
			id: v.id,
			soi: v.soi,
			mode: v.mode,
			position: v.position,
			velocity: v.velocity,
			parts: v.parts
		}));
	}

	dispose(): void {
		for (const v of this.vessels.values()) {
			for (const p of v.parts.values()) p.model.dispose();
			v.line.dispose();
			v.marker.dispose();
		}
		this.vessels.clear();
		for (const m of this.bodyMarks.values()) {
			m.orbit.dispose();
			m.sphere?.geometry.dispose();
			(m.sphere?.material as MeshBasicMaterial | undefined)?.dispose();
		}
		for (const l of this.pathLines) l.dispose();
		for (const d of this.pathDots) d.dispose();
		for (const g of this.pathGhosts) {
			g.geometry.dispose();
			(g.material as MeshBasicMaterial).dispose();
		}
		this.factory.dispose();
		this.effects.dispose();
		this.sphere.dispose();
		this.environment.dispose();
		for (const moon of this.moons.values()) moon.dispose();
		for (const b of this.bodies.values()) {
			for (const child of b.holder.children) {
				if (child instanceof Mesh) (child.material as MeshLambertMaterial).dispose();
			}
		}
	}

	private placeCamera(
		active: VesselSnapshot | undefined,
		anchorBody: string | undefined,
		bodyWorld: ReadonlyMap<string, Vec3>
	): void {
		let target: Vec3;
		let rig: RigState;
		if (this.map) {
			const radius = (anchorBody && this.bodies.get(anchorBody)?.radius) || 1;
			this.mapLimits = { minDistance: radius * 1.1, maxDistance: radius * 1e4 };
			if (this.mapRig.distance === 0) this.mapRig = { ...this.mapRig, distance: radius * 4 };
			const w = anchorBody ? bodyWorld.get(anchorBody) : undefined;
			target = w ? toRenderSpace(w, this.origin) : ZERO;
			rig = this.mapRig;
		} else {
			const group = active ? this.vessels.get(active.id)?.group : undefined;
			const base = active ? bodyWorld.get(active.soi) : undefined;
			target = group
				? { x: group.position.x, y: group.position.y, z: group.position.z }
				: active && base
					? toRenderSpace(add(base, active.position), this.origin)
					: ZERO;
			if (group && active && this.focus) {
				const hit = active.parts.filter((p) => p.definition === this.focus!.definition)[
					this.focus.occurrence
				];
				if (hit) {
					target = {
						x: target.x + hit.position.x,
						y: target.y + hit.position.y,
						z: target.z + hit.position.z
					};
				}
			}
			rig = this.flightRig;
		}
		const o = rigOffset(rig);
		// Flight view: "up" is away from the SOI body (the pad is not at the pole), so the vessel
		// stands upright on screen. Map view keeps +Y (the body's rotation axis) up.
		const up = new Vector3(0, 1, 0);
		if (!this.map && active) {
			const r = new Vector3(active.position.x, active.position.y, active.position.z);
			if (r.lengthSq() > 0) up.copy(r.normalize());
		}
		const offset = new Vector3(o.x, o.y, o.z).applyQuaternion(
			new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), up)
		);
		this.camera.up.copy(up);
		this.camera.position.set(target.x + offset.x, target.y + offset.y, target.z + offset.z);
		const bodyPos = anchorBody ? bodyWorld.get(anchorBody) : undefined;
		const bodyRadius = anchorBody ? this.bodies.get(anchorBody)?.radius : undefined;
		if (!this.map && bodyPos && bodyRadius) {
			// Keep the orbit camera above the ground: the reference sphere, or on a moon the cratered
			// ground the sim uses (ADR 0054).
			const c = toRenderSpace(bodyPos, this.origin);
			const rel = new Vector3(
				this.camera.position.x - c.x,
				this.camera.position.y - c.y,
				this.camera.position.z - c.z
			);
			const moon = anchorBody ? this.moons.get(anchorBody) : undefined;
			const rot = anchorBody ? this.bodyRot.get(anchorBody) : undefined;
			let ground = 0;
			if (moon && rot && rel.length() < bodyRadius + 12_000) {
				const dir = rotateInverse(rot, { x: rel.x, y: rel.y, z: rel.z });
				const l = Math.hypot(dir.x, dir.y, dir.z);
				ground = l > 0 ? moon.groundHeight({ x: dir.x / l, y: dir.y / l, z: dir.z / l }) : 0;
			}
			const alt = rel.length() - bodyRadius - ground;
			if (alt < MIN_CAMERA_ALTITUDE) {
				this.camera.position.addScaledVector(rel.normalize(), MIN_CAMERA_ALTITUDE - alt);
			}
		}
		this.camera.lookAt(target.x, target.y, target.z);
	}

	/** Marker radius ~1.2% of the distance to the camera so the dot is the same size on screen. */
	private markerRadius(p: Vec3): number {
		const d = Math.hypot(
			p.x - this.camera.position.x,
			p.y - this.camera.position.y,
			p.z - this.camera.position.z
		);
		return Math.max(1, d * 0.012);
	}

	private vesselEntry(id: number): VesselEntry {
		let entry = this.vessels.get(id);
		if (!entry) {
			entry = {
				group: new Group(),
				parts: new Map(),
				line: new OrbitLine(),
				marker: new VesselMarker()
			};
			entry.line.setResolution(this.viewport.width, this.viewport.height);
			this.scene.add(entry.group, entry.line.object, entry.marker.object);
			this.vessels.set(id, entry);
		}
		return entry;
	}

	private syncParts(entry: VesselEntry, v: VesselSnapshot): void {
		const seen = new Set<number>();
		let extent = 2;
		const info = this.bodyInfo.get(v.soi);
		for (const part of v.parts) {
			const pid = part.id;
			seen.add(pid);
			extent = Math.max(extent, Math.hypot(part.position.x, part.position.y, part.position.z) + 2);
			let p = entry.parts.get(pid);
			if (!p) {
				p = { model: this.factory.create(part.definition) };
				entry.group.add(p.model.root);
				entry.parts.set(pid, p);
			}
			// Part transforms are expressed in the frame's orientation, relative to the vessel root
			// (protocol.ts PartSnapshot), so they are applied as given.
			const root = p.model.root;
			root.position.set(part.position.x, part.position.y, part.position.z);
			root.quaternion.set(
				part.orientation.x,
				part.orientation.y,
				part.orientation.z,
				part.orientation.w
			);
			const altitude =
				Math.hypot(
					v.position.x + part.position.x,
					v.position.y + part.position.y,
					v.position.z + part.position.z
				) - (info?.radius ?? 0);
			p.model.setState({
				temperature: this.debugTemperature ?? part.temperature,
				modules: part.modules,
				ambientPressure: ambientPressureAt(info?.atmosphere, altitude)
			});
		}
		if (v.id === this.active || this.active === null) this.vesselRadius = extent;
		for (const [pid, p] of entry.parts) {
			if (seen.has(pid)) continue;
			entry.group.remove(p.model.root);
			p.model.dispose();
			entry.parts.delete(pid);
		}
	}
}

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

export const createSceneModel = (config: SceneConfig): SceneModel => new SceneModel(config);
