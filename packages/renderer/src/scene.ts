/**
 * The Three scene graph: body spheres, vessel groups with placeholder part meshes, the camera
 * rig and the map-view overlay. Contains no `WebGLRenderer`, so it runs (and is tested) in Bun.
 * It only reads snapshots; it never mutates them.
 */
import { addOverlay, HighlightMaterials, removeOverlay } from './vab/highlight.ts';
import type { SiteBuildingView } from './site-list.ts';
import type { LaunchSite } from './site-meshes.ts';
import type {
	BodyDefinition,
	EntityId,
	PartVisual,
	Quat,
	RegionWorld,
	Snapshot,
	Vec3,
	VesselSnapshot
} from '@orbital/core';
import { LEGACY_TERRAIN_SEED, hillsSeedOf } from '@orbital/core';
import { atmosphereFor, type Atmosphere } from './atmosphere-model.ts';
import { cameraPose, modeFrame, reframe, resolveMode, type CameraMode } from './camera-modes.ts';
import type { WorldTerrainSpec } from './terrain-zones.ts';
import {
	DataTexture,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshLambertMaterial,
	MeshStandardMaterial,
	Object3D,
	PerspectiveCamera,
	Quaternion,
	Raycaster,
	RGBAFormat,
	Scene,
	SphereGeometry,
	Vector2,
	Vector3,
	type WebGLRenderer
} from 'three';
import { regionTexture, type RegionBody } from './region-overlay.ts';
import { WaterlineEffects, waterlineCrossings, type WaterlinePart } from './effects/waterline.ts';
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
import { silhouetteOfShape } from './effects/plasma-shape.ts';
import { ambientPressureAt } from './effects/plume.ts';
import {
	angularVelocity,
	detectTransitions,
	type FxEvent,
	type FxVessel
} from './effects/transitions.ts';
import { ConnectorBars, type ConnectorBar } from './parts/connector.ts';
import { PartModelFactory } from './parts/factory.ts';
import { applyShrouds, shroudCandidates } from './parts/shroud.ts';
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
import {
	HILLS_SHADOW_MARCH,
	SHADOW_MARCH,
	SHADOW_STEPS,
	terrainSunVisibility
} from './terrain-shadow.ts';
import { DEFAULT_ORIGIN_THRESHOLD, ZERO, toRenderSpace, updateOrigin } from './origin.ts';
import { PRESETS, detailOf, type GraphicsPreset } from './presets.ts';
import { projectWorldPoint, type ScreenPoint } from './project.ts';
import {
	MAX_REMNANTS,
	REMNANT_LIFETIME,
	stepRest,
	staysAsRemnant,
	type RestState
} from './remnants.ts';
import { normalize, rotate, rotateInverse, sub as sub3 } from './vec.ts';

export { DEFAULT_PART_SHAPE };
export type { PartShape };

/** The vessel's terrain shadow is looked at only below this height above the ground, m. */
const VESSEL_SHADOW_ALTITUDE = 3_000;
/** A vessel in a terrain shadow keeps this share of the sun (the shadow is soft, and the regolith bounces light). */
const MIN_TERRAIN_LIGHT = 0.03;

/** What the renderer needs of a body; `parent` and `orbit` let the map view draw a moon's orbit and sphere. */
export type BodyRenderInfo = Pick<BodyDefinition, 'id' | 'radius' | 'atmosphere'> &
	Partial<Pick<BodyDefinition, 'parent' | 'orbit' | 'mass' | 'terrain' | 'star'>>;

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
	/**
	 * The home body (plan 122, ADR 0119): the planet pass, the environment, the site and the terrain
	 * bake. Default the first body (before plan 122 the root was home).
	 */
	home?: string;
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
	/** The world's home terrain: seed and the flat zones of its sites (plan 084); default Legacy around `launchSite`. */
	terrain?: WorldTerrainSpec;
	/**
	 * Seeds and flat zones of later hills bodies by id (plan 071, ADR 0121 point 1), from the sim;
	 * a body without an entry takes `hillsSeedOf` of the world seed above and the Legacy zone.
	 */
	bodyTerrain?: Readonly<Record<string, WorldTerrainSpec>>;
	/** Site mode (plan 091, ADR 0117): the site's buildings come from `setSiteBuildings`. */
	siteBuildings?: boolean;
}

/** Orbit limits of the site view (ADR 0117 point 2), m. */
export const SITE_RIG_LIMITS = { minDistance: 40, maxDistance: 2_500 };
const SITE_ID = -2;

/** Lowest altitude of the orbit camera above the surface sphere, m. */
export const MIN_CAMERA_ALTITUDE = 1.2;
/** Seconds the camera holds the place of a destroyed active vessel. */
export const GHOST_HOLD = 5;
const GHOST_ID = -1;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 1e13;
/** Body-fixed point of a latitude/longitude at `radius` (the map convention of core). */
const latLonDir = (s: { latitude: number; longitude: number }, radius: number): Vec3 => ({
	x: Math.cos(s.latitude) * Math.cos(s.longitude) * radius,
	y: Math.sin(s.latitude) * radius,
	z: -Math.cos(s.latitude) * Math.sin(s.longitude) * radius
});
const BODY_COLORS = [0x3d7a4a, 0x8a8f98, 0xb5764a, 0x4a6fa5];
/** A star's disc (it is unlit: the colour is what the camera sees). */
const STAR_COLOR = 0xfff1c9;
/** Map colours: vessel orbit and marker, body orbit, and the highlight (the refs accent text, ADR 0140). */
const VESSEL_ORBIT_COLOR = 0x4fc3f7;
const VESSEL_MARKER_COLOR = 0xffd54f;
const BODY_ORBIT_COLOR = 0x6f8bb0;
export const MAP_HIGHLIGHT_COLOR = 0x8fa9f0;
const HIGHLIGHT_COLOR = MAP_HIGHLIGHT_COLOR;

/** What the map view looks at (plan 113, ADR 0118). */
export type MapScope = 'vessel' | 'system';

interface PartEntry {
	model: PartModel;
	definition: string;
}
/** A stage that came to rest and was removed by the sim, kept as it lies (plan 040, ADR 0077). */
interface Remnant {
	entry: VesselEntry;
	soi: string;
	/** Root position, body-fixed, m. */
	local: Vec3;
	/** Body orientation when it was frozen: the group turns with the body from there. */
	frozen: Quaternion;
	age: number;
}
interface VesselEntry {
	group: Group;
	parts: Map<number, PartEntry>;
	/** Bars of struts and fuel lines, from the parts' links (ADR 0071). */
	bars: ConnectorBars;
	line: OrbitLine;
	marker: VesselMarker;
}

/** How long a change of the view insets eases, s (plan 215, ADR 0205 point 7). */
export const INSET_EASE_SECONDS = 0.25;

export class SceneModel {
	readonly scene = new Scene();
	readonly camera = new PerspectiveCamera(50, 1, CAMERA_NEAR, CAMERA_FAR);

	private readonly bodies = new Map<
		string,
		{ holder: Object3D; radius: number; atmosphereTop?: number }
	>();
	/** Bodies other than the first with a craters or hills ground, drawn by the ground (moon) pass (ADR 0054, 0090). */
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
	/** The system's star, when there is one: the sun direction is from the home body to it (ADR 0119). */
	private readonly starBody: string | undefined;
	private pixelRatio = 1;
	private vesselRadius = 10;
	/** Centre of the active vessel's parts relative to its root, inertial axes, m: the flight camera looks here. */
	private vesselCentre: Vec3 = ZERO;
	private insets = { top: 0, right: 0, bottom: 0, left: 0 };
	private insetTween: {
		from: SceneModel['insets'];
		to: SceneModel['insets'];
		t: number;
	} | null = null;
	private readonly bodyRot = new Map<string, Quat>();
	/** Share of the sun's light the active vessel gets under a moon's terrain shadow (1 elsewhere). */
	private moonSunScale = 1;
	private vesselLight: { moon: MoonPass; p: Vec3; sun: Vec3; value: number } | null = null;
	private cameraDirty = false;
	private lastView: {
		active: VesselSnapshot | undefined;
		anchorBody: string | undefined;
		bodyWorld: ReadonlyMap<string, Vec3>;
	} | null = null;
	private frameState: { bodyRender: Vec3; bodyRotation: Quat; vesselRender: Vec3 | null } | null =
		null;
	private readonly vessels = new Map<number, VesselEntry>();
	/** How long each vessel has lain still on the ground, and stages kept after the sim removed them (plan 040). */
	private readonly resting = new Map<number, RestState>();
	private remnants: Remnant[] = [];
	private activeBefore: number | null = null;
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
	/** The player's part focus (plan 226): the camera looks at this part of the active vessel. */
	private focusId: EntityId | null = null;
	/** Flight camera mode (plan 226, ADR 0224), the mode it resolved to last and that frame. */
	private cameraMode: CameraMode = 'free';
	private resolvedMode: Exclude<CameraMode, 'auto'> | null = null;
	private cameraFrame: Quat | null = null;
	/** Where the active vessel was (body-fixed), so the camera stays at a wreck while it burns. */
	private lastActive: { soi: string; local: Vec3; t: number } | null = null;
	/** Site view (ADR 0117): the camera orbits the site centre, a virtual vessel without parts. */
	private siteView = false;
	private siteLocal: Vec3 = { x: 0, y: 0, z: 0 };
	private readonly threshold: number;
	private readonly sphere = new SphereGeometry(1, 64, 32);
	private readonly viewport = { width: 1, height: 1 };

	private origin: Vec3 = ZERO;
	private active: EntityId | null = null;
	private readonly picker = new Raycaster();
	private map = false;
	private flightRig: RigState = initialRig(25);
	private mapRig: RigState = initialRig(0);
	private mapLimits: RigLimits = { minDistance: 1, maxDistance: 1e12 };
	/** Map scope (plan 113, ADR 0118): the active vessel's sphere, or the whole system from the root body. */
	private mapScope: MapScope = 'vessel';
	/** The map object drawn in the highlight colour: `vessel:<id>` or `body:<id>` (the keys of the web's pick). */
	private mapHighlight: string | null = null;
	private mapOrbits = true;
	/** Largest apoapsis of a body with a parent, m: the system scope frames it. */
	private systemExtent = 0;

	constructor(config: SceneConfig) {
		this.config = config;
		const settings = PRESETS[config.preset ?? 'high'];
		this.factory = this.makeFactory(config.preset ?? 'high');
		this.threshold = config.originThreshold ?? DEFAULT_ORIGIN_THRESHOLD;
		const primary = config.bodies.find((b) => b.id === config.home) ?? config.bodies[0];
		config.bodies.forEach((b, i) => {
			const holder = new Object3D();
			holder.name = `body:${b.id}`;
			const home = b === primary;
			if (b.star) {
				// A star (ADR 0119 point 6): an emissive sphere; the sun direction comes from its position.
				const mesh = new Mesh(this.sphere, new MeshBasicMaterial({ color: STAR_COLOR }));
				mesh.scale.setScalar(b.radius);
				holder.add(mesh);
			} else if (!home && (b.terrain?.kind === 'craters' || b.terrain?.kind === 'hills')) {
				// A body other than the first whose terrain is craters or hills: the ground pass, the moon
				// pass with that kind's height function (ADR 0054, 0067, 0090).
				// a hills body's terrain spec (ADR 0121 point 1): given by the host, else the same rule as the sim's
				const hillsTerrain = (): WorldTerrainSpec =>
					config.bodyTerrain?.[b.id] ?? {
						seed: hillsSeedOf(b, config.terrain?.seed ?? LEGACY_TERRAIN_SEED, false),
						zones: []
					};
				const moon = new MoonPass(b.id, b.radius, {
					...(b.terrain.kind === 'hills'
						? { kind: 'hills' as const, terrain: hillsTerrain() }
						: {
								seed: b.terrain.seed ?? 0,
								// a craters body's base zones (plan 128, ADR 0125 point 1), from the host
								zones: config.bodyTerrain?.[b.id]?.zones ?? []
							}),
					// its own air (ADR 0121 point 2)
					...(b.atmosphere
						? {
								atmosphere: atmosphereFor(
									b.radius,
									b.atmosphere.height,
									b.atmosphere.scaleHeight,
									b.atmosphere.surfacePressure
								)
							}
						: {})
				});
				moon.setShadowSteps(SHADOW_STEPS[config.preset ?? 'high']);
				holder.add(moon.root);
				this.moons.set(b.id, moon);
			} else if (!home) {
				// A body with no terrain stays a plain lit sphere (ADR 0027, 0067).
				const mesh = new Mesh(
					this.sphere,
					new MeshLambertMaterial({ color: BODY_COLORS[i % BODY_COLORS.length] ?? 0x888888 })
				);
				mesh.scale.setScalar(b.radius);
				holder.add(mesh);
			}
			this.scene.add(holder);
			this.bodies.set(b.id, {
				holder,
				radius: b.radius,
				...(b.atmosphere ? { atmosphereTop: b.atmosphere.height } : {})
			});
		});
		for (const b of config.bodies) {
			if (b.parent === undefined || !b.orbit) continue;
			this.systemExtent = Math.max(this.systemExtent, b.orbit.a * (1 + b.orbit.e));
			const orbit = new OrbitLine(BODY_ORBIT_COLOR, 1.5);
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
		this.primaryBody = primary?.id;
		this.starBody = config.bodies.find((b) => b.star)?.id;
		this.environment = new Environment({
			body: primary ?? { id: 'none', radius: 1, atmosphere: undefined },
			preset: config.preset ?? 'high',
			site: config.launchSite ?? { latitude: 0, longitude: 0 },
			...(config.terrain ? { terrain: config.terrain } : {}),
			siteBuildings: config.siteBuildings === true
		});
		this.siteLocal = latLonDir(
			config.launchSite ?? { latitude: 0, longitude: 0 },
			primary?.radius ?? 1
		);
		this.scene.add(this.environment.root);
		this.scene.add(this.waterline.root);
		this.scene.fog = this.environment.fog;
		for (const b of config.bodies) this.bodyInfo.set(b.id, b);
		this.effects = new Effects(
			this.bodyInfo,
			this.primaryBody,
			(definition) => config.partVisuals?.get(definition)?.plume,
			settings,
			{
				groundHeight: (body, direction) =>
					body === this.primaryBody
						? this.environment.groundHeight(direction)
						: this.moons.get(body)?.groundHeight(direction),
				shardSource: (definition) => this.shardSourceOf(definition),
				partSilhouette: (definition) => silhouetteOfShape(config.partShapes.get(definition))
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

	private makeBars(group: Group): ConnectorBars {
		return new ConnectorBars(this.factory, this.config.partVisuals ?? new Map(), group);
	}

	/** Switch the graphics preset: environment, part detail (models are rebuilt), effect budgets. */
	setPreset(preset: GraphicsPreset): void {
		this.environment.setPreset(preset);
		// Their models belong to the factory being replaced.
		for (const r of this.remnants) this.dropRemnant(r);
		this.remnants = [];
		for (const entry of this.vessels.values()) {
			for (const p of entry.parts.values()) {
				entry.group.remove(p.model.root);
				p.model.dispose();
			}
			entry.parts.clear();
			// The bars borrow the factory's materials: they are rebuilt with it.
			entry.bars.dispose();
		}
		this.factory.dispose();
		this.shardSources.clear();
		this.factory = this.makeFactory(preset);
		for (const entry of this.vessels.values()) {
			entry.bars = this.makeBars(entry.group);
		}
		this.effects.setPreset(PRESETS[preset]);
		for (const moon of this.moons.values()) moon.setShadowSteps(SHADOW_STEPS[preset]);
	}

	/** Factories of the models `warmPartScene` built; kept so the programs of their materials stay alive. */
	private readonly warmFactories: PartModelFactory[] = [];

	/**
	 * A scene with one throwaway model of each part definition on the vessels, built at the part detail of
	 * `preset`, for `compileAsync` ahead of a switch to it (plan 048): the part materials differ with the
	 * detail, and a program that is compiled in the middle of the switching frame is a hitch. The models
	 * belong to their own factory, so they and their programs outlive the switch.
	 */
	warmPartScene(preset: GraphicsPreset): Scene {
		const factory = this.makeFactory(preset);
		this.warmFactories.push(factory);
		const scene = new Scene();
		const detail = detailOf(PRESETS[preset]);
		const seen = new Set<string>();
		for (const entry of this.vessels.values()) {
			for (const p of entry.parts.values()) {
				if (seen.has(p.definition)) continue;
				seen.add(p.definition);
				scene.add(factory.create(p.definition, { detail }).root);
			}
		}
		return scene;
	}

	/** The flight camera's mode (plan 226): the rig is re-measured in the new frame on the next placement. */
	setCameraMode(mode: CameraMode): void {
		this.cameraMode = mode;
		this.cameraDirty = true;
	}
	get flightCameraMode(): CameraMode {
		return this.cameraMode;
	}
	/** What `auto` resolved to at the last placement (null before one). */
	get resolvedCameraMode(): Exclude<CameraMode, 'auto'> | null {
		return this.resolvedMode;
	}
	/** Look at one part of the active vessel (plan 226), or the vessel again with `null`. */
	setFocusPart(id: EntityId | null): void {
		this.focusId = id;
		this.cameraDirty = true;
	}
	get focusedPart(): EntityId | null {
		return this.focusId;
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
		for (const mesh of this.regionMeshes.values()) mesh.visible = on;
	}
	toggleMapView(): boolean {
		this.setMapView(!this.map);
		return this.map;
	}
	setActiveVessel(id: EntityId | null): void {
		if (id !== this.active) this.focusId = null;
		this.active = id;
	}

	// --- part highlight (plan 111, ADR 0153 point 5): the VAB's select rim on one part --------------
	private readonly highlightMaterials = new HighlightMaterials();
	private highlight: { id: number | null; root: Object3D | null; meshes: Mesh[] } = {
		id: null,
		root: null,
		meshes: []
	};

	/**
	 * The active vessel's part under the canvas point (x, y) in CSS px, or null (plan 214: click to
	 * inspect, hover to light its row). One raycast against that vessel's part meshes only.
	 */
	partAt(x: number, y: number): EntityId | null {
		if (this.map || this.active === null) return null;
		const v = this.vessels.get(Number(this.active));
		if (!v) return null;
		const { width, height } = this.viewport;
		if (width <= 0 || height <= 0) return null;
		const roots = new Map<Object3D, number>();
		for (const [id, p] of v.parts) {
			roots.set(p.model.root, id);
			p.model.root.updateWorldMatrix(true, true);
		}
		this.camera.updateMatrixWorld();
		this.picker.setFromCamera(new Vector2((x / width) * 2 - 1, 1 - (y / height) * 2), this.camera);
		for (const hit of this.picker.intersectObjects([...roots.keys()], true)) {
			for (let o: Object3D | null = hit.object; o; o = o.parent) {
				const id = roots.get(o);
				if (id !== undefined) return id as EntityId;
			}
		}
		return null;
	}

	highlightPart(id: EntityId | null): void {
		const next = id === null ? null : Number(id);
		if (next === this.highlight.id) return;
		removeOverlay(this.highlight.meshes);
		this.highlight = { id: next, root: null, meshes: [] };
		this.applyHighlight();
	}

	/** Puts the overlay on the highlighted part's current model (parts are rebuilt as they change). */
	private applyHighlight(): void {
		const h = this.highlight;
		if (h.id === null) return;
		let root: Object3D | null = null;
		for (const v of this.vessels.values()) {
			const p = v.parts.get(h.id);
			if (p) {
				root = p.model.root;
				break;
			}
		}
		if (root === h.root) return;
		removeOverlay(h.meshes);
		h.root = root;
		h.meshes = root ? addOverlay(root, this.highlightMaterials.get('select')) : [];
	}

	/** Map view: `system` looks at the root body and frames the moons' orbits (plan 113, ADR 0118). */
	setMapScope(scope: MapScope): void {
		if (scope === this.mapScope) return;
		this.mapScope = scope;
		this.mapRig = { ...this.mapRig, distance: 0 };
		this.cameraDirty = true;
	}
	get mapScopeValue(): MapScope {
		return this.mapScope;
	}
	/** Map view: draw this vessel or body (`vessel:<id>`, `body:<id>`) in the highlight colour. */
	setMapHighlight(key: string | null): void {
		this.mapHighlight = key;
	}
	get mapHighlightKey(): string | null {
		return this.mapHighlight;
	}
	/** Map view layers: `orbits` false hides every orbit line (vessels and bodies). */
	setMapLayers(layers: { orbits: boolean }): void {
		this.mapOrbits = layers.orbits;
	}

	// --- ripples and splashes at the waterline (plan 193, ADR 0182) -------------------------------
	readonly waterline = new WaterlineEffects();

	/** The parts of vessels near the home body's water plane, for the waterline effects. */
	private placeWaterline(
		vessels: readonly VesselSnapshot[],
		bodyWorld: ReadonlyMap<string, Vec3>,
		dt: number
	): void {
		const id = this.primaryBody;
		const radius = id ? this.bodies.get(id)?.radius : undefined;
		const rot = id ? this.bodyRot.get(id) : undefined;
		const centre = id ? bodyWorld.get(id) : undefined;
		const parts: WaterlinePart[] = [];
		const down = new Map<string, number>();
		if (!this.map && id && radius && rot && centre) {
			for (const v of vessels) {
				if (v.soi !== id) continue;
				const r = Math.hypot(v.position.x, v.position.y, v.position.z);
				if (Math.abs(r - radius) > 300) continue;
				const radial =
					(v.velocity.x * v.position.x +
						v.velocity.y * v.position.y +
						v.velocity.z * v.position.z) /
					r;
				for (const part of v.parts) {
					const shape = this.config.partShapes.get(part.definition);
					const reach =
						shape?.kind === 'cylinder'
							? Math.hypot(shape.radius, shape.height / 2)
							: shape
								? Math.hypot(shape.size.x, shape.size.y, shape.size.z) / 2
								: 0.5;
					const width =
						shape?.kind === 'cylinder'
							? 2 * shape.radius
							: shape
								? Math.max(shape.size.x, shape.size.z)
								: 1;
					const key = `${v.id}:${part.id}`;
					parts.push({
						key,
						centre: add(v.position, part.position),
						reach,
						width
					});
					down.set(key, -radial);
				}
			}
		}
		const crossings =
			radius && rot
				? waterlineCrossings(parts, rot, radius, (d) => this.environment.waterAt(d))
				: [];
		this.waterline.update(
			crossings,
			dt,
			(p) => toRenderSpace(add(centre ?? { x: 0, y: 0, z: 0 }, p), this.origin),
			(key) => down.get(key) ?? 0
		);
	}

	// --- science regions (plan 192, ADR 0180): a tinted sphere per body in map view ------------------
	private readonly regionMeshes = new Map<string, Mesh>();

	/**
	 * Map view: tint each listed body by its science regions (`null` removes the overlay). The
	 * texture is built once per call from `regionAt`; the sphere sits 1.5 % above the body's radius
	 * in its body-fixed frame and shows in map view only.
	 */
	setRegionOverlay(
		bodies: ReadonlyArray<{ id: string; body: RegionBody; world?: RegionWorld }> | null
	): void {
		for (const mesh of this.regionMeshes.values()) {
			mesh.removeFromParent();
			const m = mesh.material as MeshBasicMaterial;
			m.map?.dispose();
			m.dispose();
		}
		this.regionMeshes.clear();
		for (const b of bodies ?? []) {
			const entry = this.bodies.get(b.id);
			if (!entry) continue;
			const t = regionTexture(b.body, b.world ?? {});
			const texture = new DataTexture(t.data, t.width, t.height, RGBAFormat);
			texture.needsUpdate = true;
			const mesh = new Mesh(
				this.sphere,
				new MeshBasicMaterial({
					map: texture,
					transparent: true,
					opacity: 0.6,
					depthWrite: false,
					// a flat tint: no exposure or tone mapping, so the region colours read as they are
					toneMapped: false
				})
			);
			// above the highest terrain (ADR 0043: a few kilometres), so mountains do not poke through
			mesh.scale.setScalar(entry.radius * 1.015);
			mesh.renderOrder = 10;
			mesh.visible = this.map;
			mesh.name = `regions:${b.id}`;
			entry.holder.add(mesh);
			this.regionMeshes.set(b.id, mesh);
		}
	}
	get regionOverlayBodies(): readonly string[] {
		return [...this.regionMeshes.keys()];
	}

	/**
	 * The body under canvas point `(x, y)` (CSS pixels) and the body-fixed unit direction of the hit,
	 * nearest body first; `null` over empty space. For the region label under the cursor.
	 */
	bodyDirectionAt(x: number, y: number): { body: string; direction: Vec3 } | null {
		if (this.cameraDirty && this.lastView) {
			this.placeCamera(this.lastView.active, this.lastView.anchorBody, this.lastView.bodyWorld);
			this.cameraDirty = false;
		}
		this.camera.updateMatrixWorld();
		const { width, height } = this.viewport;
		const ray = new Raycaster();
		ray.setFromCamera(new Vector2((x / width) * 2 - 1, 1 - (y / height) * 2), this.camera);
		let best: { body: string; direction: Vec3; distance: number } | null = null;
		const o = ray.ray.origin;
		const d = ray.ray.direction;
		for (const [id, b] of this.bodies) {
			const c = b.holder.position;
			const oc = new Vector3().subVectors(o, c);
			const half = oc.dot(d);
			const disc = half * half - (oc.lengthSq() - b.radius * b.radius);
			if (disc < 0) continue;
			const t = -half - Math.sqrt(disc);
			if (t < 0 || (best && t >= best.distance)) continue;
			const hit = new Vector3().copy(d).multiplyScalar(t).add(oc).normalize();
			hit.applyQuaternion(b.holder.quaternion.clone().invert());
			best = { body: id, direction: { x: hit.x, y: hit.y, z: hit.z }, distance: t };
		}
		return best && { body: best.body, direction: best.direction };
	}
	/** Set the flight orbit camera directly (screenshot presets). */
	setFlightRig(rig: RigState): void {
		this.flightRig = { ...rig };
		this.cameraDirty = true;
	}
	/** Rotate/zoom whichever camera is current (flight rig or map rig). */
	/** The camera's view direction (render axes are the sim's inertial axes). */
	viewDirection(): Vec3 {
		const d = this.camera.getWorldDirection(new Vector3());
		return { x: d.x, y: d.y, z: d.z };
	}

	orbitCamera(input: { dYaw?: number; dPitch?: number; zoomFactor?: number }): void {
		if (this.map) {
			// Before the first map placement the distance is 0 ("not yet set"): turn only, the
			// default distance is chosen from the body radius in `placeCamera`.
			const unset = this.mapRig.distance === 0;
			const next = applyRigInput(this.mapRig, this.mapLimits, input);
			this.mapRig = unset ? { ...next, distance: 0 } : next;
		} else
			this.flightRig = applyRigInput(
				this.flightRig,
				this.siteView ? SITE_RIG_LIMITS : FLIGHT_RIG_LIMITS,
				input
			);
		this.cameraDirty = true;
	}
	/**
	 * Draw the view centred in the area the interface leaves free (plan 023). With `animate` the
	 * centre eases there over `INSET_EASE_SECONDS` (plan 215, ADR 0205 point 7): the host passes
	 * false when the player prefers reduced motion.
	 */
	setViewInsets(
		insets: { top: number; right: number; bottom: number; left: number },
		options: { animate?: boolean } = {}
	): void {
		if (!options.animate) {
			this.insets = { ...insets };
			this.insetTween = null;
			this.applyViewOffset();
			return;
		}
		this.insetTween = { from: { ...this.insets }, to: { ...insets }, t: 0 };
	}
	/** Steps an inset change in progress (smoothstep over `INSET_EASE_SECONDS`). */
	private stepInsets(dt: number): void {
		const tw = this.insetTween;
		if (!tw) return;
		tw.t = Math.min(1, tw.t + dt / INSET_EASE_SECONDS);
		const e = tw.t * tw.t * (3 - 2 * tw.t);
		const lerp = (a: number, b: number): number => a + (b - a) * e;
		this.insets = {
			top: lerp(tw.from.top, tw.to.top),
			right: lerp(tw.from.right, tw.to.right),
			bottom: lerp(tw.from.bottom, tw.to.bottom),
			left: lerp(tw.from.left, tw.to.left)
		};
		if (tw.t >= 1) this.insetTween = null;
		this.applyViewOffset();
	}
	private applyViewOffset(): void {
		const { width, height } = this.viewport;
		const { top, right, bottom, left } = this.insets;
		// The image centre moves from (w/2, h/2) to the centre of the free rectangle.
		const dx = (left - right) / 2;
		const dy = (top - bottom) / 2;
		if (dx === 0 && dy === 0) this.camera.clearViewOffset();
		else this.camera.setViewOffset(width, height, -dx, -dy, width, height);
		this.camera.updateProjectionMatrix();
	}
	resize(width: number, height: number): void {
		this.viewport.width = width;
		this.viewport.height = height;
		this.camera.aspect = width / Math.max(1, height);
		this.applyViewOffset();
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
			mark.orbit.object.visible = this.map && this.mapOrbits && parent !== undefined;
			mark.orbit.setColor(this.mapHighlight === `body:${id}` ? HIGHLIGHT_COLOR : BODY_ORBIT_COLOR);
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
		if (this.siteView && !this.map) activeVessel = this.siteVessel(snapshot) ?? activeVessel;
		const soiPos = (v: VesselSnapshot): Vec3 => {
			const p = bodyWorld.get(v.soi);
			if (!p) throw new Error(`Snapshot vessel ${v.id} is in unknown SOI body "${v.soi}"`);
			return p;
		};

		// Anchor: the vessel in flight view, the SOI body in map view; no vessel -> the home body.
		const homeSnap = snapshot.bodies.find((b) => b.id === this.primaryBody) ?? snapshot.bodies[0];
		let anchor: Vec3 = homeSnap?.position ?? this.origin;
		let anchorBody: string | undefined = homeSnap?.id;
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
		} else if (this.map && this.mapScope === 'system' && snapshot.bodies[0]) {
			anchorBody = snapshot.bodies[0].id;
			anchor = snapshot.bodies[0].position;
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
			const lit = this.mapHighlight === `vessel:${id}`;
			entry.line.setOrbit(this.map && this.mapOrbits ? v.orbit : undefined);
			entry.line.setColor(lit ? HIGHLIGHT_COLOR : VESSEL_ORBIT_COLOR);
			entry.marker.object.visible = this.map;
			entry.marker.setColor(lit ? HIGHLIGHT_COLOR : VESSEL_MARKER_COLOR);
			entry.marker.place(p, this.markerRadius(p) * (lit ? 1.6 : 1));
			this.trackRest(v, snapshot.t);
		}
		if (dtSim < 0) this.clearPersistent();
		for (const [id, entry] of this.vessels) {
			if (seen.has(id)) continue;
			const normal = dtSim > 0 && dtSim < 5;
			const rest = this.resting.get(id);
			this.resting.delete(id);
			if (normal && staysAsRemnant(rest, snapshot.t, id === this.activeBefore) && rest) {
				this.keepRemnant(entry, rest);
			} else {
				this.scene.remove(entry.group, entry.line.object, entry.marker.object);
				for (const p of entry.parts.values()) p.model.dispose();
				entry.bars.dispose();
				entry.line.dispose();
				entry.marker.dispose();
			}
			this.vessels.delete(id);
		}
		this.activeBefore = activeVessel && activeVessel.id !== GHOST_ID ? activeVessel.id : null;
		this.placeRemnants(dtSim);

		this.trackTransitions(snapshot, dtSim);
		this.placeWaterline(
			vessels,
			bodyWorld,
			Number.isFinite(dtSim) && dtSim > 0 && dtSim < 5 ? dtSim : 0
		);
		this.lastView = { active: activeVessel, anchorBody, bodyWorld };
		this.placeCamera(activeVessel, anchorBody, bodyWorld);
		this.cameraDirty = false;

		const primaryWorld = this.primaryBody ? bodyWorld.get(this.primaryBody) : undefined;
		const primaryRot = this.primaryBody ? this.bodyRot.get(this.primaryBody) : undefined;
		const starWorld = this.starBody ? bodyWorld.get(this.starBody) : undefined;
		this.environment.setStarDirection(
			starWorld && primaryWorld ? normalize(sub3(starWorld, primaryWorld)) : null
		);
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
		this.stepInsets(dt);
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
			// a moon with air lights the scene through its own atmosphere (ADR 0121 point 2)
			...(moonUp ? { up: moonUp, ...this.moonAir() } : {}),
			vesselRadius: this.vesselRadius,
			mapView: this.map,
			dt
		});
		// The active vessel in a terrain shadow on a moon gets less of the sun's light (the ground
		// divides this out in its own shader, ADR 0068).
		if (this.moonSunScale < 1) this.environment.sunLight.intensity *= this.moonSunScale;
		this.updateEffects(dt, force);
	}

	/**
	 * Tells every moon pass where the camera is (body-fixed) so it can follow with its height patches.
	 * Returns the local vertical (inertial, unit) when the active vessel is in a moon's sphere.
	 */
	private updateMoons(): Vec3 | undefined {
		let up: Vec3 | undefined;
		this.activeMoon = null;
		this.moonSunScale = 1;
		const sunInertial = this.frameState
			? this.environment.sunDirection(this.frameState.bodyRotation)
			: undefined;
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
			const sun = sunInertial ? rotateInverse(rot, sunInertial) : { x: 1, y: 0, z: 0 };
			let lit = 1;
			const active = this.lastView?.active;
			if (active?.soi === id) {
				const l = Math.hypot(rel.x, rel.y, rel.z);
				if (l > 0) up = { x: rel.x / l, y: rel.y / l, z: rel.z / l };
				this.activeMoon = { moon, altitude: l - moon.radius };
				lit = this.vesselTerrainLight(moon, rot, active.position, sun);
				this.moonSunScale = lit;
			}
			moon.setSun(sun, lit);
		}
		return up;
	}

	/** The moon the active vessel is at, from the last `updateMoons`. */
	private activeMoon: { moon: MoonPass; altitude: number } | null = null;

	/** What the environment hears about the active vessel's moon: its air, or that it has none. */
	private moonAir(): { airless: true } | { air: { atmosphere: Atmosphere; altitude: number } } {
		const m = this.activeMoon;
		return m?.moon.atmosphere
			? { air: { atmosphere: m.moon.atmosphere, altitude: m.altitude } }
			: { airless: true };
	}

	/**
	 * Share of the sun's light the active vessel gets on a moon: the terrain's sun visibility at its
	 * place (ADR 0068), at least `MIN_TERRAIN_LIGHT` so a shadowed vessel keeps a trace of sun. Only
	 * near the ground (the march is for the ground's shadows); recomputed when the vessel or the sun moved.
	 */
	private vesselTerrainLight(moon: MoonPass, rot: Quat, position: Vec3, sun: Vec3): number {
		// the march of the body's kind: the craters' or the hills' (plan 071, ADR 0121 point 4)
		const march = moon.kind === 'hills' ? HILLS_SHADOW_MARCH : SHADOW_MARCH;
		const p = rotateInverse(rot, position);
		const r = Math.hypot(p.x, p.y, p.z);
		const prev = this.vesselLight;
		if (
			prev &&
			prev.moon === moon &&
			Math.hypot(p.x - prev.p.x, p.y - prev.p.y, p.z - prev.p.z) < 0.5 &&
			Math.hypot(sun.x - prev.sun.x, sun.y - prev.sun.y, sun.z - prev.sun.z) < 1e-5
		) {
			return prev.value;
		}
		let value = 1;
		if (r > 0) {
			const n = { x: p.x / r, y: p.y / r, z: p.z / r };
			const ground = moon.groundHeight(n);
			const height = r - moon.radius;
			if (height - ground < VESSEL_SHADOW_ALTITUDE) {
				value = Math.max(
					MIN_TERRAIN_LIGHT,
					terrainSunVisibility({
						groundAt: (d) => moon.groundHeight(d),
						radius: moon.radius,
						direction: n,
						height: Math.max(height, ground + 0.5),
						sun,
						march
					})
				);
			}
		}
		this.vesselLight = { moon, p, sun, value };
		return value;
	}

	/** Dev/screenshot hook: set the regolith colour of every moon. */
	setMoonTint(r: number, g: number, b: number): void {
		for (const moon of this.moons.values()) moon.setTint(r, g, b);
	}

	/** Dev/benchmark hook: terrain shadows and instanced stones of every moon on or off. */
	setMoonDetail(shadows: boolean, stones: boolean): void {
		for (const moon of this.moons.values()) moon.setDetail(shadows, stones);
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
	/** The site centre as a vessel without parts, for the anchor and the camera (ADR 0117 point 2). */
	private siteVessel(snapshot: Snapshot): VesselSnapshot | undefined {
		const soi = this.primaryBody;
		if (!soi) return undefined;
		const rot = this.bodyRotOf(snapshot, soi);
		if (!rot) return undefined;
		return {
			id: SITE_ID as EntityId,
			mode: 'flight',
			soi: soi as VesselSnapshot['soi'],
			position: rotate(rot, this.siteLocal),
			velocity: { x: 0, y: 0, z: 0 },
			orientation: { x: 0, y: 0, z: 0, w: 1 },
			parts: []
		};
	}

	/** Site view on or off (ADR 0117): the orbit camera looks at the site centre. */
	setSiteView(on: boolean): void {
		if (on && !this.siteView) {
			this.flightRig = { yaw: 0.7, pitch: 0.45, distance: 420 };
			this.vesselCentre = { x: 0, y: 0, z: 0 };
		}
		this.siteView = on;
		this.cameraDirty = true;
	}
	get siteViewOn(): boolean {
		return this.siteView;
	}

	/** Site mode: the buildings and road cells to draw. */
	setSiteBuildings(
		list: readonly SiteBuildingView[],
		roads: readonly { i: number; j: number }[]
	): void {
		this.environment.site.setBuildings(list, roads);
	}
	setSiteGhost(g: Parameters<LaunchSite['setGhost']>[0]): void {
		this.environment.site.setGhost(g);
	}

	/** The site point (m east and north) under a CSS pixel of the viewport, or null. */
	pickSite(x: number, y: number): { east: number; north: number } | null {
		this.camera.updateMatrixWorld();
		const ndc = new Vector3(
			(x / this.viewport.width) * 2 - 1,
			-(y / this.viewport.height) * 2 + 1,
			0.5
		);
		const dir = ndc.unproject(this.camera).sub(this.camera.position).normalize();
		return this.environment.site.pickPlane(this.camera.position.clone(), dir);
	}

	/** CSS pixel of a site point (m east, north and up), or null behind the camera or a body. */
	projectSite(p: { east: number; north: number; up?: number }): ScreenPoint | null {
		this.camera.updateMatrixWorld();
		const w = this.environment.site.siteToWorld(p);
		return projectWorldPoint(
			this.camera,
			{ x: w.x, y: w.y, z: w.z },
			this.viewport.width,
			this.viewport.height,
			[]
		);
	}

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

	private groundHeightOf(body: string, direction: Vec3): number | undefined {
		return body === this.primaryBody
			? this.environment.groundHeight(direction)
			: this.moons.get(body)?.groundHeight(direction);
	}

	/** Updates how long a vessel has lain still on the ground (the sim removes debris after 10 s). */
	private trackRest(v: VesselSnapshot, t: number): void {
		const fx = this.bodyFx.get(v.soi);
		const info = this.bodyInfo.get(v.soi);
		if (!fx || !info) {
			this.resting.delete(v.id);
			return;
		}
		const r = Math.hypot(v.position.x, v.position.y, v.position.z);
		const spin = fx.omega;
		const ground = {
			x: spin.y * v.position.z - spin.z * v.position.y,
			y: spin.z * v.position.x - spin.x * v.position.z,
			z: spin.x * v.position.y - spin.y * v.position.x
		};
		const local = rotateInverse(fx.rotation, v.position);
		const height =
			r - info.radius - (r > 0 ? (this.groundHeightOf(v.soi, scale1(local, 1 / r)) ?? 0) : 0);
		let hot = 0;
		for (const p of v.parts) hot = Math.max(hot, p.temperature ?? 0);
		const next = stepRest(this.resting.get(v.id), t, {
			groundSpeed: Math.hypot(
				v.velocity.x - ground.x,
				v.velocity.y - ground.y,
				v.velocity.z - ground.z
			),
			height,
			maxTemperature: hot,
			position: local,
			soi: v.soi,
			parts: v.parts.length
		});
		if (next) this.resting.set(v.id, next);
		else this.resting.delete(v.id);
	}

	/** Freezes a removed stage where it lies: its models stay, turning with the ground. */
	private keepRemnant(entry: VesselEntry, rest: RestState): void {
		const rot = this.bodyRot.get(rest.soi);
		if (!rot) {
			this.scene.remove(entry.group);
			for (const p of entry.parts.values()) p.model.dispose();
			entry.bars.dispose();
			return;
		}
		this.scene.remove(entry.line.object, entry.marker.object);
		entry.line.dispose();
		entry.marker.dispose();
		// Stopped for good: no flame, no gimbal, no glow.
		for (const p of entry.parts.values()) {
			p.model.setState({ modules: {}, ambientPressure: 0 });
			p.model.tick(0);
		}
		this.remnants.push({
			entry,
			soi: rest.soi,
			local: rest.position,
			frozen: new Quaternion(rot.x, rot.y, rot.z, rot.w),
			age: 0
		});
		while (this.remnants.length > MAX_REMNANTS) this.dropRemnant(this.remnants.shift()!);
	}

	private dropRemnant(r: Remnant): void {
		this.scene.remove(r.entry.group);
		for (const p of r.entry.parts.values()) p.model.dispose();
		r.entry.bars.dispose();
	}

	/** Moves the remnants with their body and ages them by simulated time. */
	private placeRemnants(dtSim: number): void {
		const keep: Remnant[] = [];
		for (const r of this.remnants) {
			if (dtSim > 0 && dtSim < 60) r.age += dtSim;
			if (r.age >= REMNANT_LIFETIME) {
				this.dropRemnant(r);
				continue;
			}
			keep.push(r);
			const fx = this.bodyFx.get(r.soi);
			if (!fx) {
				r.entry.group.visible = false;
				continue;
			}
			const p = toRenderSpace(add(fx.world, rotate(fx.rotation, r.local)), this.origin);
			r.entry.group.position.set(p.x, p.y, p.z);
			const now = new Quaternion(fx.rotation.x, fx.rotation.y, fx.rotation.z, fx.rotation.w);
			r.entry.group.quaternion.copy(now).multiply(r.frozen.clone().invert());
			r.entry.group.visible = !this.map;
		}
		this.remnants = keep;
	}

	/** Forgets what stays after a time jump backwards (a new flight or a loaded game). */
	private clearPersistent(): void {
		for (const r of this.remnants) this.dropRemnant(r);
		this.remnants = [];
		this.resting.clear();
		this.effects.clearPersistent();
	}

	/** Remnants kept (tests and the debug read-out). */
	get remnantCount(): number {
		return this.remnants.length;
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
		this.setRegionOverlay(null);
		this.waterline.dispose();
		removeOverlay(this.highlight.meshes);
		this.highlightMaterials.dispose();
		for (const r of this.remnants) this.dropRemnant(r);
		this.remnants = [];
		for (const v of this.vessels.values()) {
			for (const p of v.parts.values()) p.model.dispose();
			v.bars.dispose();
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
		for (const f of this.warmFactories) f.dispose();
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
			const system = this.mapScope === 'system' && this.systemExtent > 0 && !this.mapFocus;
			this.mapLimits = {
				minDistance: radius * 1.1,
				maxDistance: system ? Math.max(radius * 1e4, this.systemExtent * 50) : radius * 1e4
			};
			if (this.mapRig.distance === 0) {
				this.mapRig = {
					...this.mapRig,
					distance: system ? this.systemExtent * 3 : radius * 4
				};
			}
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
			const focused =
				group && active && this.focusId !== null
					? active.parts.find((p) => p.id === this.focusId)
					: undefined;
			if (focused) {
				target = {
					x: target.x + focused.position.x,
					y: target.y + focused.position.y,
					z: target.z + focused.position.z
				};
			} else if (group && active && this.focus) {
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
			// Look at the middle of the vessel, not at its root part (the capsule at the top).
			if (!this.focus && !focused) {
				target = {
					x: target.x + this.vesselCentre.x,
					y: target.y + this.vesselCentre.y,
					z: target.z + this.vesselCentre.z
				};
			}
			rig = this.flightRig;
		}
		// Flight view (plan 226, ADR 0224): the mode's frame. Free has "up" away from the SOI body
		// (the pad is not at the pole), so the vessel stands upright on screen; Orbital the orbit
		// normal; Locked the vessel. A change of the resolved mode re-measures the rig, so the view
		// direction stays. Map view keeps +Y (the body's rotation axis) up.
		let frame: Quat = { x: 0, y: 0, z: 0, w: 1 };
		if (!this.map && active) {
			const body = this.bodies.get(active.soi);
			const control =
				active.controlPart === undefined
					? undefined
					: active.parts.find((p) => p.id === active.controlPart)?.orientation;
			const subject = {
				position: active.position,
				velocity: active.velocity,
				orientation: control ?? active.orientation,
				altitude:
					Math.hypot(active.position.x, active.position.y, active.position.z) - (body?.radius ?? 0),
				...(body?.atmosphereTop !== undefined ? { atmosphereTop: body.atmosphereTop } : {})
			};
			const resolved = resolveMode(this.cameraMode, subject);
			frame = modeFrame(resolved, subject);
			if (this.resolvedMode !== null && this.resolvedMode !== resolved && this.cameraFrame) {
				this.flightRig = reframe(this.flightRig, this.cameraFrame, frame);
				rig = this.flightRig;
			}
			this.resolvedMode = resolved;
			this.cameraFrame = frame;
		}
		const pose = cameraPose(rig, frame);
		const offset = new Vector3(pose.offset.x, pose.offset.y, pose.offset.z);
		const up = new Vector3(pose.up.x, pose.up.y, pose.up.z);
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
			const group = new Group();
			entry = {
				group,
				parts: new Map(),
				bars: this.makeBars(group),
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
		const bars: ConnectorBar[] = [];
		let extent = 2;
		const info = this.bodyInfo.get(v.soi);
		let changed = false;
		for (const part of v.parts) {
			const pid = part.id;
			seen.add(pid);
			if (part.link) {
				bars.push({
					key: String(pid),
					definition: part.definition,
					from: [part.position.x, part.position.y, part.position.z],
					to: [part.link.point.x, part.link.point.y, part.link.point.z]
				});
			}
			extent = Math.max(extent, Math.hypot(part.position.x, part.position.y, part.position.z) + 2);
			let p = entry.parts.get(pid);
			if (!p) {
				// a fairing draws its own sections (plan 219, `PartVisual.paramsFrom`)
				const params = this.factory.paramsOf(part.definition, part.modules);
				p = {
					model: this.factory.create(part.definition, params ? { params } : {}),
					definition: part.definition
				};
				entry.group.add(p.model.root);
				entry.parts.set(pid, p);
				changed = true;
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
		entry.bars.sync(bars);
		if (v.id === this.active || this.active === null) {
			this.vesselRadius = extent;
			this.vesselCentre = partCentre(v.parts);
		}
		for (const [pid, p] of entry.parts) {
			if (seen.has(pid)) continue;
			entry.group.remove(p.model.root);
			p.model.dispose();
			entry.parts.delete(pid);
			changed = true;
		}
		// The parts of a vessel are rigid, so shrouds change only when a part joins or leaves.
		if (changed) applyShrouds(shroudCandidates(entry.parts));
		if (this.highlight.id !== null) this.applyHighlight();
	}
}

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale1 = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });

export const createSceneModel = (config: SceneConfig): SceneModel => new SceneModel(config);

/** Middle of the bounding box of the parts' positions (relative to the vessel root, inertial axes). */
export function partCentre(parts: readonly { position: Vec3 }[]): Vec3 {
	if (parts.length === 0) return ZERO;
	let lo = { x: Infinity, y: Infinity, z: Infinity };
	let hi = { x: -Infinity, y: -Infinity, z: -Infinity };
	for (const { position: p } of parts) {
		lo = { x: Math.min(lo.x, p.x), y: Math.min(lo.y, p.y), z: Math.min(lo.z, p.z) };
		hi = { x: Math.max(hi.x, p.x), y: Math.max(hi.y, p.y), z: Math.max(hi.z, p.z) };
	}
	return { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2, z: (lo.z + hi.z) / 2 };
}
