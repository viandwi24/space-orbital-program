/**
 * The Three scene graph: body spheres, vessel groups with placeholder part meshes, the camera
 * rig and the map-view overlay. Contains no `WebGLRenderer`, so it runs (and is tested) in Bun.
 * It only reads snapshots; it never mutates them.
 */
import type { BodyDefinition, EntityId, Quat, Snapshot, Vec3, VesselSnapshot } from '@orbital/core';
import {
	AmbientLight,
	BoxGeometry,
	BufferGeometry,
	CylinderGeometry,
	DirectionalLight,
	Group,
	Mesh,
	MeshLambertMaterial,
	PerspectiveCamera,
	Scene,
	SphereGeometry
} from 'three';
import {
	FLIGHT_RIG_LIMITS,
	applyRigInput,
	initialRig,
	rigOffset,
	type RigLimits,
	type RigState
} from './camera-rig.ts';
import { OrbitLine, VesselMarker } from './map.ts';
import { DEFAULT_ORIGIN_THRESHOLD, ZERO, toRenderSpace, updateOrigin } from './origin.ts';

/** Placeholder part geometry, supplied by the host from part definitions (ADR 0012). */
export type PartShape =
	{ kind: 'box'; size: Vec3 } | { kind: 'cylinder'; radius: number; height: number };

/** Used for part ids the host gave no shape for. */
export const DEFAULT_PART_SHAPE: PartShape = { kind: 'box', size: { x: 1, y: 1, z: 1 } };

export type BodyRenderInfo = Pick<BodyDefinition, 'id' | 'radius'>;

export interface SceneConfig {
	bodies: readonly BodyRenderInfo[];
	/** Keyed by part definition id (`PartSnapshot.definition`). */
	partShapes: ReadonlyMap<string, PartShape>;
	/** Origin re-centre distance, m. Default 10 km. */
	originThreshold?: number;
}

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

	private readonly bodies = new Map<string, { mesh: Mesh; radius: number }>();
	private readonly vessels = new Map<number, VesselEntry>();
	private readonly shapes: ReadonlyMap<string, PartShape>;
	private readonly geometryCache = new Map<string, BufferGeometry>();
	private readonly partMaterial = new MeshLambertMaterial({ color: 0xcfd8dc });
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
			const mesh = new Mesh(
				this.sphere,
				new MeshLambertMaterial({ color: BODY_COLORS[i % BODY_COLORS.length] ?? 0x888888 })
			);
			mesh.scale.setScalar(b.radius);
			this.scene.add(mesh);
			this.bodies.set(b.id, { mesh, radius: b.radius });
		});
		const sun = new DirectionalLight(0xffffff, 2.5);
		sun.position.set(1, 0.3, 0.5);
		this.scene.add(sun, new AmbientLight(0xffffff, 0.35));
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
	/** Rotate/zoom whichever camera is current (flight rig or map rig). */
	orbitCamera(input: { dYaw?: number; dPitch?: number; zoomFactor?: number }): void {
		if (this.map) this.mapRig = applyRigInput(this.mapRig, this.mapLimits, input);
		else this.flightRig = applyRigInput(this.flightRig, FLIGHT_RIG_LIMITS, input);
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
			entry.mesh.position.set(p.x, p.y, p.z);
			setQuat(entry.mesh, b.rotation);
		}

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

		this.placeCamera(activeVessel, anchorBody, bodyWorld);
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
		for (const b of this.bodies.values()) (b.mesh.material as MeshLambertMaterial).dispose();
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
		this.camera.position.set(target.x + o.x, target.y + o.y, target.z + o.z);
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
		for (const part of v.parts) {
			const pid = part.id;
			seen.add(pid);
			let p = entry.parts.get(pid);
			if (!p) {
				p = { mesh: new Mesh(this.geometryFor(part.definition), this.partMaterial) };
				entry.group.add(p.mesh);
				entry.parts.set(pid, p);
			}
			// Part transforms are expressed in the frame's orientation, relative to the vessel root
			// (protocol.ts PartSnapshot), so they are applied as given.
			p.mesh.position.set(part.position.x, part.position.y, part.position.z);
			setQuat(p.mesh, part.orientation);
		}
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
