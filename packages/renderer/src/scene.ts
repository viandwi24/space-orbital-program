/**
 * The Three scene graph: body spheres, vessel groups with placeholder part meshes, the camera
 * rig and the map-view overlay. Contains no `WebGLRenderer`, so it runs (and is tested) in Bun.
 * It only reads snapshots; it never mutates them.
 */
import type { BodyDefinition, EntityId, Quat, Snapshot, Vec3, VesselSnapshot } from '@orbital/core';
import {
	BoxGeometry,
	BufferGeometry,
	CylinderGeometry,
	Group,
	Mesh,
	MeshLambertMaterial,
	MeshStandardMaterial,
	Object3D,
	PerspectiveCamera,
	Quaternion,
	Scene,
	SphereGeometry,
	Vector3
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
import { OrbitLine, VesselMarker } from './map.ts';
import { DEFAULT_ORIGIN_THRESHOLD, ZERO, toRenderSpace, updateOrigin } from './origin.ts';
import { type GraphicsPreset } from './presets.ts';
import { latLonOf } from './sun.ts';
import { rotateInverse } from './vec.ts';

/** Placeholder part geometry, supplied by the host from part definitions (ADR 0012). */
export type PartShape =
	{ kind: 'box'; size: Vec3 } | { kind: 'cylinder'; radius: number; height: number };

/** Used for part ids the host gave no shape for. */
export const DEFAULT_PART_SHAPE: PartShape = { kind: 'box', size: { x: 1, y: 1, z: 1 } };

export type BodyRenderInfo = Pick<BodyDefinition, 'id' | 'radius' | 'atmosphere'>;

export interface SceneConfig {
	bodies: readonly BodyRenderInfo[];
	/** Keyed by part definition id (`PartSnapshot.definition`). */
	partShapes: ReadonlyMap<string, PartShape>;
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
/** A vessel this close to the ground when first seen defines the launch site, m. */
export const LAUNCH_SITE_MAX_ALTITUDE = 150;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 1e13;
const BODY_COLORS = [0x3d7a4a, 0x8a8f98, 0xb5764a, 0x4a6fa5];

interface PartEntry {
	mesh: Mesh;
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
	/** Flight environment of the first body: planet pass, sun, sky, launch site (ADR 0027). */
	readonly environment: Environment;
	private readonly primaryBody: string | undefined;
	private pixelRatio = 1;
	private vesselRadius = 10;
	private readonly bodyRot = new Map<string, Quat>();
	private siteLocked: boolean;
	private cameraDirty = false;
	private lastView: {
		active: VesselSnapshot | undefined;
		anchorBody: string | undefined;
		bodyWorld: ReadonlyMap<string, Vec3>;
	} | null = null;
	private frameState: { bodyRender: Vec3; bodyRotation: Quat; vesselRender: Vec3 | null } | null =
		null;
	private readonly vessels = new Map<number, VesselEntry>();
	private readonly shapes: ReadonlyMap<string, PartShape>;
	private readonly geometryCache = new Map<string, BufferGeometry>();
	private readonly partMaterial = new MeshStandardMaterial({
		color: 0xcfd8dc,
		metalness: 0.35,
		roughness: 0.5
	});
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
		this.shapes = config.partShapes;
		this.threshold = config.originThreshold ?? DEFAULT_ORIGIN_THRESHOLD;
		config.bodies.forEach((b, i) => {
			const holder = new Object3D();
			holder.name = `body:${b.id}`;
			if (i > 0) {
				// Bodies other than the first stay plain lit spheres (ADR 0027, consequences).
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
		const primary = config.bodies[0];
		this.primaryBody = primary?.id;
		this.siteLocked = config.launchSite !== undefined;
		this.environment = new Environment({
			body: primary ?? { id: 'none', radius: 1, atmosphere: undefined },
			preset: config.preset ?? 'high',
			site: config.launchSite ?? { latitude: 0, longitude: 0 }
		});
		this.scene.add(this.environment.root);
		this.scene.fog = this.environment.fog;
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
	}

	/** Brings the scene in line with `snapshot`. Call once per received snapshot. */
	sync(snapshot: Snapshot): void {
		const bodyWorld = new Map<string, Vec3>();
		for (const b of snapshot.bodies) bodyWorld.set(b.id, b.position);

		const vessels = snapshot.vessels;
		const activeVessel =
			vessels.find((v) => v.id === this.active) ?? (this.active === null ? vessels[0] : undefined);
		const soiPos = (v: VesselSnapshot): Vec3 => {
			const p = bodyWorld.get(v.soi);
			if (!p) throw new Error(`Snapshot vessel ${v.id} is in unknown SOI body "${v.soi}"`);
			return p;
		};

		// Anchor: the vessel in flight view, the SOI body in map view; no vessel -> first body.
		let anchor: Vec3 = snapshot.bodies[0]?.position ?? this.origin;
		let anchorBody = snapshot.bodies[0]?.id;
		if (activeVessel) {
			const base = soiPos(activeVessel);
			anchorBody = activeVessel.soi;
			anchor = this.map ? base : add(base, activeVessel.position);
		}
		this.origin = updateOrigin(this.origin, anchor, this.threshold).origin;

		for (const b of snapshot.bodies) {
			const entry = this.bodies.get(b.id);
			if (!entry) continue; // body the host gave no render info for: not drawn
			const p = toRenderSpace(b.position, this.origin);
			entry.holder.position.set(p.x, p.y, p.z);
			entry.holder.quaternion.set(b.rotation.x, b.rotation.y, b.rotation.z, b.rotation.w);
			this.bodyRot.set(b.id, b.rotation);
		}

		this.lockLaunchSite(vessels, bodyWorld);
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
			entry.line.dispose();
			entry.marker.dispose();
			this.vessels.delete(id);
		}

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
	prepareFrame(dt: number): void {
		if (!this.frameState) return;
		if (this.cameraDirty && this.lastView) {
			this.placeCamera(this.lastView.active, this.lastView.anchorBody, this.lastView.bodyWorld);
			this.cameraDirty = false;
		}
		this.camera.updateMatrixWorld();
		this.environment.update({
			camera: this.camera,
			pixelHeight: this.viewport.height * this.pixelRatio,
			bodyRender: this.frameState.bodyRender,
			bodyRotation: this.frameState.bodyRotation,
			vesselRender: this.frameState.vesselRender,
			vesselRadius: this.vesselRadius,
			mapView: this.map,
			dt
		});
	}

	/**
	 * The sim places a vessel at an inertial latitude/longitude at load time, so with the body
	 * already turning it is not at body-fixed (0, 0) unless loaded at t = 0. When the host gave no
	 * launch site, the first vessel seen close to the ground of the primary body defines it.
	 */
	private lockLaunchSite(
		vessels: readonly VesselSnapshot[],
		bodyWorld: ReadonlyMap<string, Vec3>
	): void {
		if (this.siteLocked || !this.primaryBody) return;
		const rotation = this.bodyRot.get(this.primaryBody);
		const radius = this.bodies.get(this.primaryBody)?.radius;
		if (!rotation || !radius || !bodyWorld.has(this.primaryBody)) return;
		for (const v of vessels) {
			if (v.soi !== this.primaryBody) continue;
			const altitude = Math.hypot(v.position.x, v.position.y, v.position.z) - radius;
			if (altitude > LAUNCH_SITE_MAX_ALTITUDE) continue;
			const { latitude, longitude } = latLonOf(rotateInverse(rotation, v.position));
			this.environment.setSite(latitude, longitude);
			this.siteLocked = true;
			return;
		}
	}

	dispose(): void {
		for (const v of this.vessels.values()) {
			v.line.dispose();
			v.marker.dispose();
		}
		this.vessels.clear();
		for (const g of this.geometryCache.values()) g.dispose();
		this.geometryCache.clear();
		this.sphere.dispose();
		this.partMaterial.dispose();
		this.environment.dispose();
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
			target = group ? { x: group.position.x, y: group.position.y, z: group.position.z } : ZERO;
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
			// Keep the orbit camera above the ground: the surface is the reference sphere.
			const c = toRenderSpace(bodyPos, this.origin);
			const rel = new Vector3(
				this.camera.position.x - c.x,
				this.camera.position.y - c.y,
				this.camera.position.z - c.z
			);
			const alt = rel.length() - bodyRadius;
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
		for (const part of v.parts) {
			const pid = part.id;
			seen.add(pid);
			extent = Math.max(extent, Math.hypot(part.position.x, part.position.y, part.position.z) + 2);
			let p = entry.parts.get(pid);
			if (!p) {
				p = { mesh: new Mesh(this.geometryFor(part.definition), this.partMaterial) };
				p.mesh.castShadow = true;
				p.mesh.receiveShadow = true;
				entry.group.add(p.mesh);
				entry.parts.set(pid, p);
			}
			// Part transforms are expressed in the frame's orientation, relative to the vessel root
			// (protocol.ts PartSnapshot), so they are applied as given.
			p.mesh.position.set(part.position.x, part.position.y, part.position.z);
			setQuat(p.mesh, part.orientation);
		}
		if (v.id === this.active || this.active === null) this.vesselRadius = extent;
		for (const [pid, p] of entry.parts) {
			if (seen.has(pid)) continue;
			entry.group.remove(p.mesh);
			entry.parts.delete(pid);
		}
	}

	private geometryFor(definition: string): BufferGeometry {
		let g = this.geometryCache.get(definition);
		if (!g) {
			const shape = this.shapes.get(definition) ?? DEFAULT_PART_SHAPE;
			g =
				shape.kind === 'box'
					? new BoxGeometry(shape.size.x, shape.size.y, shape.size.z)
					: new CylinderGeometry(shape.radius, shape.radius, shape.height, 24);
			this.geometryCache.set(definition, g);
		}
		return g;
	}
}

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

const setQuat = (obj: Mesh, q: Quat): void => {
	obj.quaternion.set(q.x, q.y, q.z, q.w);
};

export const createSceneModel = (config: SceneConfig): SceneModel => new SceneModel(config);
