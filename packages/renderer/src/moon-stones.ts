/**
 * Stones as instanced geometry near the camera (plan 052, ADR 0068). The stones are those of
 * `@orbital/core`'s `stones.ts` (a world-fixed lattice, pure hashing; the sim collides with the same list), so each stands where it stood last time.
 * Two meshes share one material and one instance layout: a detailed rock (320 triangles) for stones
 * within `STONES.nearRadius` and a plainer one (80) beyond it. An instance is its place in the fine
 * patch's coordinates (u, v), its radius and yaw; the vertex shader reads the height from the same
 * baked patch the ground is drawn from, so a stone stands on the ground it is drawn with. The list is
 * rebuilt when the camera has moved `STONES.refreshDistance` or the patch was re-centred; rebuilding
 * is a few thousand hashes and a pass over the list, no GPU read-back.
 */
import {
	chartOf,
	hash3,
	stonesAround,
	STONES,
	type ChartPoint,
	type Stone,
	type Vec3
} from '@orbital/core';
import {
	BufferGeometry,
	IcosahedronGeometry,
	InstancedBufferAttribute,
	InstancedBufferGeometry,
	Mesh,
	type Material
} from 'three';
import type { PatchFrame } from './terrain-patch.ts';
import { dot } from './vec.ts';

/** How many instances the near mesh may hold (the nearest stones). */
export const NEAR_CAPACITY = 256;

/** A unit rock: an icosphere whose shared vertices are moved together by a hash of their place, flat-shaded. */
export function rockGeometry(detail: number, salt: number): BufferGeometry {
	const base = new IcosahedronGeometry(1, detail);
	const position = base.getAttribute('position');
	for (let i = 0; i < position.count; i++) {
		const x = position.getX(i);
		const y = position.getY(i);
		const z = position.getZ(i);
		const k =
			0.76 + 0.46 * hash3(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100), salt);
		position.setXYZ(i, x * k, y * k, z * k);
	}
	base.computeVertexNormals();
	return base;
}

function instanced(rock: BufferGeometry, capacity: number): InstancedBufferGeometry {
	const g = new InstancedBufferGeometry();
	g.setAttribute('position', rock.getAttribute('position'));
	g.setAttribute('normal', rock.getAttribute('normal'));
	g.setAttribute('aStone', new InstancedBufferAttribute(new Float32Array(capacity * 4), 4));
	g.setAttribute('aStoneShade', new InstancedBufferAttribute(new Float32Array(capacity), 1));
	g.instanceCount = 0;
	return g;
}

export class MoonStones {
	readonly near: Mesh;
	readonly far: Mesh;
	private readonly nearGeometry: InstancedBufferGeometry;
	private readonly farGeometry: InstancedBufferGeometry;
	private built: { chart: ChartPoint; frame: PatchFrame } | null = null;
	/** Stones in the instance lists now (for tests and the HUD of a benchmark). */
	count = 0;

	constructor(
		private readonly radius: number,
		material: Material,
		depthMaterial: Material,
		private readonly seed = 0
	) {
		this.nearGeometry = instanced(rockGeometry(2, 11), NEAR_CAPACITY);
		this.farGeometry = instanced(rockGeometry(1, 12), STONES.maxInstances);
		this.near = new Mesh(this.nearGeometry, material);
		this.far = new Mesh(this.farGeometry, material);
		for (const m of [this.near, this.far]) {
			m.frustumCulled = false;
			m.receiveShadow = true;
			// a stone throws its shadow on the ground in the sun's shadow map, like the vessel does
			m.castShadow = true;
			m.customDepthMaterial = depthMaterial;
			m.visible = false;
			m.name = 'moon-stones';
		}
	}

	/**
	 * `direction`: the camera's unit body-fixed direction; `altitude`: its height above the ground, m;
	 * `frame`: the baked fine patch the instances are placed in (null before the first bake).
	 */
	update(direction: Vec3, altitude: number, frame: PatchFrame | null): void {
		const on = frame !== null && altitude < STONES.maxAltitude;
		this.near.visible = on;
		this.far.visible = on;
		if (!on || !frame) return;
		const chart = chartOf(direction, this.radius);
		const b = this.built;
		if (
			b &&
			b.frame === frame &&
			b.chart.face === chart.face &&
			Math.hypot(b.chart.x - chart.x, b.chart.y - chart.y) < STONES.refreshDistance
		) {
			return;
		}
		this.build(direction, frame);
		this.built = { chart, frame };
	}

	private build(direction: Vec3, frame: PatchFrame): void {
		const stones = stonesAround(
			direction,
			this.radius,
			STONES.instanceRadius,
			STONES.maxInstances,
			this.seed
		);
		const place = (g: InstancedBufferGeometry, list: { stone: Stone; u: number; v: number }[]) => {
			const a = g.getAttribute('aStone') as InstancedBufferAttribute;
			const s = g.getAttribute('aStoneShade') as InstancedBufferAttribute;
			list.forEach(({ stone, u, v }, i) => {
				a.setXYZW(i, u, v, stone.radius, stone.yaw);
				s.setX(i, stone.shade);
			});
			a.needsUpdate = true;
			s.needsUpdate = true;
			g.instanceCount = list.length;
		};
		const near: { stone: Stone; u: number; v: number }[] = [];
		const far: { stone: Stone; u: number; v: number }[] = [];
		const nearChart = chartOf(direction, this.radius);
		for (const stone of stones) {
			const k = dot(stone.direction, frame.centre);
			if (k <= 1e-6) continue;
			const u = dot(stone.direction, frame.east) / (k * frame.halfTan);
			const v = dot(stone.direction, frame.north) / (k * frame.halfTan);
			if (Math.max(Math.abs(u), Math.abs(v)) > 0.97) continue;
			const d = Math.hypot(stone.x - nearChart.x, stone.y - nearChart.y);
			if (d < STONES.nearRadius && near.length < NEAR_CAPACITY) near.push({ stone, u, v });
			else far.push({ stone, u, v });
		}
		place(this.nearGeometry, near);
		place(this.farGeometry, far);
		this.count = near.length + far.length;
	}

	/** Both meshes sit at the fine patch's centre point (the patch's local space is the stones' object space). */
	setOrigin(x: number, y: number, z: number): void {
		this.near.position.set(x, y, z);
		this.far.position.set(x, y, z);
	}

	dispose(): void {
		this.nearGeometry.dispose();
		this.farGeometry.dispose();
	}
}
