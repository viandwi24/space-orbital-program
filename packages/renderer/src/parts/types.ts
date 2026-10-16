/**
 * The part model contract (ADR 0028): what a provider returns for a part definition and what the
 * scene calls on it. Plan 022 (3D VAB, catalogue icons) uses the same interface without a snapshot.
 */
import type { PartVisual, Vec3 } from '@orbital/core';
import type { Box3, Mesh, Object3D } from 'three';

/** Placeholder geometry, supplied by the host from part definitions (ADR 0012, ADR 0014). */
export type PartShape =
	{ kind: 'box'; size: Vec3 } | { kind: 'cylinder'; radius: number; height: number };

/** Used for part ids the host gave no shape for. */
export const DEFAULT_PART_SHAPE: PartShape = { kind: 'box', size: { x: 1, y: 1, z: 1 } };

export type Vec3Tuple = readonly [number, number, number];

export interface PartNode {
	pos: Vec3Tuple;
	dir: Vec3Tuple;
}

/** What a provider is asked to build. */
export interface PartModelRequest {
	/** Part definition id. */
	definition: string;
	/** Physics/thermal shape (ADR 0014); absent for parts that have none. */
	shape?: PartShape;
	visual?: PartVisual;
	/** Attach nodes of the definition; the model reports them back as `nodes`. */
	attach?: Readonly<Record<string, PartNode>>;
	/** Level of detail from the graphics preset. */
	detail: PartDetail;
}

/** Detail knobs from the preset table (`PresetSettings`). */
export interface PartDetail {
	/** Radial segments around a full circle. */
	segments: number;
	/** 0 = silhouette, 1 = plus bands/ribs/rivet rows, 2 = plus plumbing and small hardware. */
	extras: 0 | 1 | 2;
	/** Procedural texture side in texels. */
	textureSize: 128 | 256 | 512;
}

/** What the scene tells a model about its part each snapshot. */
export interface PartRuntimeState {
	/** Skin temperature, K. */
	temperature?: number;
	/** `PartSnapshot.modules`. */
	modules: Readonly<Record<string, unknown>>;
	/** Ambient pressure at the part, Pa. */
	ambientPressure?: number;
}

export interface PartModel {
	/** Add this to the vessel group; position and orientation are set by the scene. */
	readonly root: Object3D;
	/** Bounding box of the retracted, static geometry in the part frame (effects excluded). */
	readonly bounds: Box3;
	/** Attach nodes in the part frame (what the geometry was built against). */
	readonly nodes: Readonly<Record<string, PartNode>>;
	/** Triangles drawn with every animated piece out. */
	readonly triangles: number;
	/**
	 * The static, shared-geometry mesh of the model (a child of `root` at the origin of the part
	 * frame). A host that draws many identical parts (the VAB) may hide it and draw the same
	 * geometry and materials as an `InstancedMesh`; pieces that animate stay on `root`.
	 */
	readonly staticMesh?: Mesh;
	/** Apply a snapshot (targets for animation, glow, plume). */
	setState(state: PartRuntimeState): void;
	/** Advance animations by `dt` seconds of wall-clock time. */
	tick(dt: number): void;
	/** Release resources owned by this instance (cloned materials, effect meshes). */
	dispose(): void;
}

/**
 * Detail for parts that appear many times in one view (symmetric copies): half the segments and
 * no plumbing/hardware extras, so four boosters cost what two did, and the copies are small
 * on screen anyway.
 */
export function repeatedDetail(detail: PartDetail): PartDetail {
	return {
		...detail,
		segments: Math.max(8, Math.round(detail.segments / 2)),
		extras: Math.min(detail.extras, 1) as PartDetail['extras']
	};
}

export interface PartModelProvider {
	readonly id: string;
	/** A model for the request, or `null` when this provider does not handle it. */
	create(request: PartModelRequest, context: ProviderContext): PartModel | null;
	/** Optional: load whatever the given definitions need before the first `create`. */
	preload?(definitions: readonly string[]): Promise<void>;
}

/** Shared services a provider may use. */
export interface ProviderContext {
	readonly materials: import('./materials.ts').MaterialLibrary;
}

export const vec3 = (v: Vec3Tuple): Vec3 => ({ x: v[0], y: v[1], z: v[2] });
