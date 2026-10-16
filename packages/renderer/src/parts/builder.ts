/** Collects geometry per material slot and merges it into one indexless geometry with groups. */
import {
	BoxGeometry,
	BufferGeometry,
	CylinderGeometry,
	ExtrudeGeometry,
	Matrix4,
	Quaternion,
	Vector3,
	type Shape
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ProfilePoint, RevolveOptions } from './revolve.ts';
import { revolve } from './revolve.ts';

/** Material slots a generator may use (`MaterialLibrary` defines them). */
export type SlotName =
	| 'paint-primary'
	| 'paint-secondary'
	| 'paint-accent'
	| 'metal'
	| 'dark-metal'
	| 'foil'
	| 'glass'
	| 'ablator'
	| 'nozzle'
	| 'nozzle-inner'
	| 'rubber'
	| 'lamp';

export interface BuiltGeometry {
	geometry: BufferGeometry;
	/** Material slot of each geometry group, in group order. */
	slots: SlotName[];
	triangles: number;
}

const toPlain = (g: BufferGeometry): BufferGeometry => {
	const out = g.index ? g.toNonIndexed() : g;
	if (out !== g) g.dispose();
	for (const name of Object.keys(out.attributes)) {
		if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name);
	}
	return out;
};

export class GeometryBuilder {
	private readonly bySlot = new Map<SlotName, BufferGeometry[]>();

	constructor(private readonly options: RevolveOptions) {}

	get isEmpty(): boolean {
		return this.bySlot.size === 0;
	}

	get segments(): number {
		return this.options.segments;
	}

	add(slot: SlotName, geometry: BufferGeometry, matrix?: Matrix4): this {
		const g = toPlain(geometry);
		if (matrix) g.applyMatrix4(matrix);
		const list = this.bySlot.get(slot) ?? [];
		list.push(g);
		this.bySlot.set(slot, list);
		return this;
	}

	revolve(
		slot: SlotName,
		profile: readonly ProfilePoint[],
		options?: Partial<RevolveOptions>
	): this {
		return this.add(slot, revolve(profile, { ...this.options, ...options }));
	}

	/** A revolve around an axis parallel to Y through `position`. */
	revolveAt(
		slot: SlotName,
		profile: readonly ProfilePoint[],
		position: readonly [number, number, number],
		options?: Partial<RevolveOptions>
	): this {
		const m = new Matrix4().makeTranslation(position[0], position[1], position[2]);
		return this.add(slot, revolve(profile, { ...this.options, ...options }), m);
	}

	box(
		slot: SlotName,
		size: readonly [number, number, number],
		position: readonly [number, number, number],
		rotationY = 0,
		rotationZ = 0
	): this {
		const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rotationY);
		q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), rotationZ));
		const m = new Matrix4().compose(new Vector3(...position), q, new Vector3(1, 1, 1));
		return this.add(slot, new BoxGeometry(size[0], size[1], size[2]), m);
	}

	/** Cylinder along Y centred at `position`, optionally tilted about Z then turned about Y. */
	cylinder(
		slot: SlotName,
		radius: number,
		height: number,
		position: readonly [number, number, number],
		options: { tiltZ?: number; turnY?: number; segments?: number; radiusTop?: number } = {}
	): this {
		const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), options.turnY ?? 0);
		q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), options.tiltZ ?? 0));
		const m = new Matrix4().compose(new Vector3(...position), q, new Vector3(1, 1, 1));
		const seg = Math.max(6, Math.round((options.segments ?? this.options.segments) / 2));
		return this.add(
			slot,
			new CylinderGeometry(options.radiusTop ?? radius, radius, height, seg, 1),
			m
		);
	}

	/** Flat shape extruded along +Z by `depth` (no bevel), then placed by `matrix`. */
	extrude(slot: SlotName, shape: Shape, depth: number, matrix: Matrix4): this {
		return this.add(
			slot,
			new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 }),
			matrix
		);
	}

	build(): BuiltGeometry {
		const slots: SlotName[] = [];
		const merged: BufferGeometry[] = [];
		for (const [slot, list] of this.bySlot) {
			const one = mergeGeometries(list, false);
			for (const g of list) g.dispose();
			if (!one) throw new Error(`Part geometry for slot "${slot}" has incompatible attributes`);
			slots.push(slot);
			merged.push(one);
		}
		const geometry = mergeGeometries(merged, true);
		for (const g of merged) g.dispose();
		if (!geometry) throw new Error('Part geometry could not be merged');
		const triangles = geometry.getAttribute('position').count / 3;
		return { geometry, slots, triangles };
	}
}
