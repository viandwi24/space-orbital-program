/**
 * Rocks on the home planet's ground, drawn instanced (plan 402, ADR 0341). Where they are comes from
 * `rock-scatter.ts` (a body-fixed lattice, pure hashing); this class keeps a cache of the cells it
 * has asked about, fills it nearest first within a time budget, and writes the rocks within range
 * of the camera into two instanced meshes (a detailed rock near, a plain one beyond). The meshes
 * live in the body-fixed frame under one root placed at a body-fixed anchor, so a floating-origin
 * shift moves the root and no instance changes; the instances are rebuilt only when the camera has
 * moved a few metres or the cache grew. The same code serves both renderers: three's standard
 * material runs on WebGL2 and on WebGPU.
 */
import type { Quat, TerrainField, TerrainZone, Vec3 } from '@orbital/core';
import { Color, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { rockGeometry } from './moon-stones.ts';
import {
	SCATTER,
	cellsAround,
	rockInCell,
	type Rock,
	type ScatterContext
} from './rock-scatter.ts';
import { add, cross, normalize, rotate, scale, sub, vec } from './vec.ts';

/** Rocks are drawn below this camera altitude above the ground, m. */
export const ROCKS_MAX_ALTITUDE = 150;
/** Rocks closer than this to the camera have the detailed mesh, m. */
export const ROCKS_NEAR = 26;
/** Instances are rebuilt when the camera has moved this far, m. */
export const ROCKS_REFRESH = 6;
/** Capacity of the near and far meshes. */
export const ROCKS_CAPACITY = { near: 1_200, far: 5_000 } as const;
/** Time the cache may spend on new cells in one update, ms. */
export const ROCKS_BUDGET_MS = 4;

export interface RockQuality {
	/** 0 to 1; 0 draws none. */
	density: number;
	/** Farthest rock drawn, m. */
	range: number;
}

export class GroundRocks {
	readonly root = new Object3D();
	readonly near: InstancedMesh;
	readonly far: InstancedMesh;
	/** Rocks in the instance lists now (for tests and benchmarks). */
	count = 0;
	private readonly material = new MeshStandardMaterial({
		color: 0x6b6258,
		roughness: 0.95,
		metalness: 0
	});
	private readonly cache = new Map<string, Rock | null>();
	private ctx: ScatterContext;
	private quality: RockQuality = { density: 0, range: 0 };
	private built: { at: Vec3; quality: RockQuality } | null = null;
	private pending = false;
	private anchor: Vec3 = vec(0, 0, 0);

	constructor(
		private readonly radius: number,
		terrain: TerrainField,
		zones: readonly TerrainZone[],
		seed: number
	) {
		this.ctx = { radius, terrain, zones, seed, density: 0 };
		this.near = new InstancedMesh(rockGeometry(2, 21), this.material, ROCKS_CAPACITY.near);
		this.far = new InstancedMesh(rockGeometry(0, 22), this.material, ROCKS_CAPACITY.far);
		for (const m of [this.near, this.far]) {
			m.frustumCulled = false;
			m.receiveShadow = true;
			m.castShadow = false;
			m.count = 0;
			m.name = 'ground-rocks';
		}
		this.root.add(this.near, this.far);
		this.root.visible = false;
	}

	/** The preset's density and range; a change of density empties the cache (it is part of a cell's chance). */
	setQuality(q: RockQuality): void {
		if (q.density !== this.quality.density) {
			this.cache.clear();
			this.ctx = { ...this.ctx, density: q.density };
		}
		this.quality = q;
		this.built = null;
	}

	/**
	 * `cameraBodyFixed`: the camera's position from the body's centre, body-fixed, m; `bodyRender`
	 * and `bodyRotation`: the body in render space. Hides the rocks above `ROCKS_MAX_ALTITUDE` over the ground.
	 */
	update(cameraBodyFixed: Vec3, bodyRender: Vec3, bodyRotation: Quat): void {
		const n = normalize(cameraBodyFixed);
		const high = Math.hypot(cameraBodyFixed.x, cameraBodyFixed.y, cameraBodyFixed.z) - this.radius;
		// only near the ground: the terrain is asked only when the camera is low enough to meet it
		const on =
			this.quality.density > 0 &&
			high < this.ctx.terrain.maxHeight + ROCKS_MAX_ALTITUDE &&
			high - this.ctx.terrain.heightAt(n) < ROCKS_MAX_ALTITUDE;
		this.root.visible = on;
		if (!on) return;
		const b = this.built;
		const moved = b ? Math.hypot(...tripleOf(sub(scale(n, this.radius), b.at))) : Infinity;
		if (moved > ROCKS_REFRESH || this.pending) this.rebuild(n);
		const p = add(bodyRender, rotate(bodyRotation, this.anchor));
		this.root.position.set(p.x, p.y, p.z);
		this.root.quaternion.set(bodyRotation.x, bodyRotation.y, bodyRotation.z, bodyRotation.w);
	}

	private rebuild(n: Vec3): void {
		const start = performance.now();
		this.pending = false;
		const camera = scale(n, this.radius);
		const found: { rock: Rock; d: number }[] = [];
		SCATTER.classes.forEach((c, cls) => {
			const within = Math.min(this.quality.range, c.range);
			for (const cell of cellsAround(n, this.radius, cls, within)) {
				const key = `${cls}:${cell.face}:${cell.i}:${cell.j}`;
				let rock = this.cache.get(key);
				if (rock === undefined) {
					if (performance.now() - start > ROCKS_BUDGET_MS) {
						this.pending = true;
						continue;
					}
					rock = rockInCell(this.ctx, cls, cell.face, cell.i, cell.j);
					this.cache.set(key, rock);
				}
				if (rock && cell.d <= within) found.push({ rock, d: cell.d });
			}
		});
		if (this.cache.size > 60_000) this.cache.clear();
		found.sort((a, b) => a.d - b.d);
		this.anchor = camera;
		const m = new Matrix4();
		let nearCount = 0;
		let farCount = 0;
		for (const { rock, d } of found) {
			const isNear = d < ROCKS_NEAR && nearCount < ROCKS_CAPACITY.near;
			if (!isNear && (d < ROCKS_NEAR || farCount >= ROCKS_CAPACITY.far)) continue;
			const mesh = isNear ? this.near : this.far;
			const up = normalize(add(scale(rock.direction, 0.5), scale(rock.normal, 0.5)));
			const ref = Math.abs(up.y) > 0.99 ? vec(1, 0, 0) : vec(0, 1, 0);
			const e0 = normalize(cross(ref, up));
			const e1 = cross(up, e0);
			const east = add(scale(e0, Math.cos(rock.yaw)), scale(e1, Math.sin(rock.yaw)));
			const south = cross(east, up);
			const r = rock.radius;
			const h = r * SCATTER.flatten;
			const ground = scale(rock.direction, this.radius + rock.height);
			const centre = sub(add(ground, scale(up, h * (1 - 2 * SCATTER.sink))), camera);
			m.makeBasis(
				new Vector3(east.x * r, east.y * r, east.z * r),
				new Vector3(up.x * h, up.y * h, up.z * h),
				new Vector3(south.x * r, south.y * r, south.z * r)
			);
			m.setPosition(centre.x, centre.y, centre.z);
			const i = isNear ? nearCount++ : farCount++;
			mesh.setMatrixAt(i, m);
		}
		this.near.count = nearCount;
		this.far.count = farCount;
		for (const mesh of [this.near, this.far]) {
			mesh.instanceMatrix.needsUpdate = true;
		}
		this.count = nearCount + farCount;
		this.built = { at: camera, quality: this.quality };
	}

	dispose(): void {
		this.near.geometry.dispose();
		this.far.geometry.dispose();
		this.material.dispose();
		this.near.dispose();
		this.far.dispose();
	}
}

const tripleOf = (v: Vec3): [number, number, number] => [v.x, v.y, v.z];
