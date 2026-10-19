/**
 * RCS puffs (plan 211, ADR 0217): a short white jet at each nozzle while it fires, its length by
 * the nozzle's firing fraction. One cone geometry and one material for every thruster.
 */
import {
	AdditiveBlending,
	ConeGeometry,
	Mesh,
	MeshBasicMaterial,
	Object3D,
	Quaternion,
	Vector3,
	type BufferGeometry,
	type Material
} from 'three';

export interface PuffSpec {
	nozzles: ReadonlyArray<{
		pos: readonly [number, number, number];
		dir: readonly [number, number, number];
	}>;
	length?: number;
}

/** A cone 1 m long along +Y, its tip at the origin: scaled per jet. */
export function createPuffGeometry(): BufferGeometry {
	const g = new ConeGeometry(0.18, 1, 10, 1, true);
	g.translate(0, -0.5, 0);
	g.rotateX(Math.PI);
	return g;
}

export function createPuffMaterial(): Material {
	return new MeshBasicMaterial({
		color: 0xe8f0ff,
		transparent: true,
		opacity: 0.55,
		depthWrite: false,
		blending: AdditiveBlending
	});
}

const UP = new Vector3(0, 1, 0);

export class RcsPuffs {
	readonly root = new Object3D();
	private readonly jets: Mesh[] = [];
	private readonly length: number;

	constructor(spec: PuffSpec, geometry: BufferGeometry, material: Material) {
		this.root.name = 'rcs-puffs';
		this.length = spec.length ?? 0.5;
		for (const n of spec.nozzles) {
			const jet = new Mesh(geometry, material);
			jet.name = 'plume-rcs';
			jet.position.set(n.pos[0], n.pos[1], n.pos[2]);
			// the jet leaves against the push
			const out = new Vector3(-n.dir[0], -n.dir[1], -n.dir[2]).normalize();
			jet.quaternion.copy(new Quaternion().setFromUnitVectors(UP, out));
			jet.visible = false;
			jet.renderOrder = 10;
			this.jets.push(jet);
			this.root.add(jet);
		}
	}

	/** Show each jet by its firing fraction (0..1); a missing value hides it. */
	update(firing: readonly unknown[] | undefined): void {
		this.jets.forEach((jet, i) => {
			const f = typeof firing?.[i] === 'number' ? (firing[i] as number) : 0;
			jet.visible = f > 0.02;
			if (jet.visible) {
				const l = this.length * (0.35 + 0.65 * Math.min(1, f));
				jet.scale.set(0.5 + 0.5 * f, l, 0.5 + 0.5 * f);
			}
		});
	}
}
