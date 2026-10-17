/**
 * The wrecks of impacts, kept on the ground (plan 040, ADR 0077). Each wreck is one static mesh
 * of the pieces at rest in a tangent frame fixed to the body, placed from the body's orientation
 * every frame; so a wreck turns with the ground, costs one draw call, and nothing is rebuilt
 * while it lies there. The pieces are built when the last one has landed; until then the
 * explosion draws them in flight.
 */
import type { Quat, Vec3 } from '@orbital/core';
import {
	BufferAttribute,
	BufferGeometry,
	DoubleSide,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	Quaternion
} from 'three';
import { toRenderSpace } from '../origin.ts';
import { add, normalize, rotate } from '../vec.ts';
import { PIECE_VERTICES, writePiece, type ShardSource } from './shards.ts';
import {
	MAX_WRECKS,
	SETTLE_TIME,
	WRECK_LIFETIME,
	WRECK_SCORCH,
	evictOldest,
	rotateBy,
	wreckPresence,
	wreckSink,
	type WreckPlan
} from './wreckage.ts';

export interface WreckSpec {
	soi: string;
	/** Explosion centre, body-fixed, m. */
	local: Vec3;
	/** Tangent frame (+Y up) to body-fixed axes. */
	basis: Quaternion;
	plan: WreckPlan;
	sources: readonly ShardSource[];
	/** Seconds since the impact when the spec is added. */
	age: number;
}

export interface Wreck {
	soi: string;
	local: Vec3;
	basis: Quaternion;
	plan: WreckPlan;
	sources: readonly ShardSource[];
	age: number;
	mesh: Mesh | null;
	/** Smoke owed, particles. */
	smoke: number;
}

export interface WreckBody {
	world: Vec3;
	rotation: Quat;
}

export class WreckField {
	readonly root = new Object3D();
	wrecks: Wreck[] = [];
	private readonly material = new MeshStandardMaterial({
		vertexColors: true,
		metalness: 0.3,
		roughness: 0.75,
		flatShading: true,
		side: DoubleSide
	});
	private readonly q = new Quaternion();

	constructor() {
		this.root.name = 'wrecks';
	}

	add(spec: WreckSpec): Wreck {
		const wreck: Wreck = { ...spec, mesh: null, smoke: 0 };
		const kept = evictOldest([...this.wrecks, wreck], MAX_WRECKS);
		for (const w of this.wrecks) if (!kept.includes(w)) this.drop(w);
		this.wrecks = kept;
		return wreck;
	}

	/** Seconds after which the pieces of `w` are all down and at rest. */
	static settledAt(w: Pick<Wreck, 'plan'>): number {
		return w.plan.settled + SETTLE_TIME;
	}

	isSettled(w: Wreck): boolean {
		return w.age >= WreckField.settledAt(w);
	}

	step(dt: number): void {
		if (!(dt > 0)) return;
		for (const w of this.wrecks) w.age += dt;
		const live = this.wrecks.filter((w) => w.age < WRECK_LIFETIME);
		for (const w of this.wrecks) if (!live.includes(w)) this.drop(w);
		this.wrecks = live;
	}

	/** Builds the meshes of settled wrecks once and places them for this frame. */
	place(bodies: ReadonlyMap<string, WreckBody>, origin: Vec3): void {
		for (const w of this.wrecks) {
			const body = bodies.get(w.soi);
			if (!body || !this.isSettled(w)) {
				if (w.mesh) w.mesh.visible = false;
				continue;
			}
			w.mesh ??= this.build(w);
			const mesh = w.mesh;
			if (!mesh) continue;
			const sink = wreckSink(w.age);
			const up = normalize(rotate(body.rotation, w.local));
			const centre = add(body.world, rotate(body.rotation, w.local));
			const p = toRenderSpace(centre, origin);
			mesh.position.set(p.x - up.x * sink, p.y - up.y * sink, p.z - up.z * sink);
			this.q.set(body.rotation.x, body.rotation.y, body.rotation.z, body.rotation.w);
			mesh.quaternion.copy(this.q).multiply(w.basis);
			mesh.visible = wreckPresence(w.age) > 0;
		}
	}

	private build(w: Wreck): Mesh | null {
		const pieces = w.plan.pieces;
		if (pieces.length === 0) return null;
		const positions = new Float32Array(pieces.length * PIECE_VERTICES * 3);
		const colours = new Float32Array(pieces.length * PIECE_VERTICES * 3);
		const tmp = new Float32Array(PIECE_VERTICES * 3);
		pieces.forEach((piece, n) => {
			const source = w.sources[piece.source]!;
			writePiece(source, piece.triangle, piece.edge, piece.thickness, tmp, 0);
			const o = n * PIECE_VERTICES * 3;
			for (let i = 0; i < PIECE_VERTICES; i++) {
				const v = rotateBy(piece.rest, { x: tmp[i * 3]!, y: tmp[i * 3 + 1]!, z: tmp[i * 3 + 2]! });
				positions[o + i * 3] = v.x + piece.x;
				positions[o + i * 3 + 1] = v.y + piece.y;
				positions[o + i * 3 + 2] = v.z + piece.z;
				colours[o + i * 3] = source.colours[piece.triangle * 3]! * WRECK_SCORCH;
				colours[o + i * 3 + 1] = source.colours[piece.triangle * 3 + 1]! * WRECK_SCORCH;
				colours[o + i * 3 + 2] = source.colours[piece.triangle * 3 + 2]! * WRECK_SCORCH;
			}
		});
		const geometry = new BufferGeometry();
		geometry.setAttribute('position', new BufferAttribute(positions, 3));
		geometry.setAttribute('color', new BufferAttribute(colours, 3));
		geometry.computeBoundingSphere();
		const mesh = new Mesh(geometry, this.material);
		mesh.frustumCulled = false;
		mesh.castShadow = false;
		mesh.receiveShadow = true;
		mesh.name = 'wreck';
		this.root.add(mesh);
		return mesh;
	}

	private drop(w: Wreck): void {
		if (!w.mesh) return;
		this.root.remove(w.mesh);
		w.mesh.geometry.dispose();
		w.mesh = null;
	}

	/** Pieces at rest in built or buildable wrecks (for tests and the debug read-out). */
	get pieceCount(): number {
		let n = 0;
		for (const w of this.wrecks) n += w.plan.pieces.length;
		return n;
	}

	clear(): void {
		for (const w of this.wrecks) this.drop(w);
		this.wrecks = [];
	}

	dispose(): void {
		this.clear();
		this.material.dispose();
	}
}
