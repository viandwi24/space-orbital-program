/**
 * The bars of connector parts (struts and fuel lines, ADR 0071): one thin cylinder per part from the
 * part's own position to the far end of its link. Shared by the flight scene (links from the
 * snapshot) and the VAB view (links from the design). Geometry and materials are shared; a bar is a
 * mesh scaled to its length.
 */
import {
	CylinderGeometry,
	Group,
	Mesh,
	Quaternion,
	Vector3,
	type Material,
	type Object3D
} from 'three';
import type { PartVisual } from '@orbital/core';
import type { PartModelFactory } from './factory.ts';

/** Radius of a bar by the visual kind of its part, metres; `undefined` for a part that draws none. */
export function connectorRadius(visual: PartVisual | undefined): number | undefined {
	if (visual?.kind === 'strut') return 0.035;
	if (visual?.kind === 'fuel-line') return 0.05;
	return undefined;
}

export interface ConnectorBar {
	/** Stable key (a part id or a design index). */
	key: string;
	/** Part definition id: its visual gives the radius and colour. */
	definition: string;
	from: readonly [number, number, number];
	to: readonly [number, number, number];
}

const UP = new Vector3(0, 1, 0);
const delta = new Vector3();
const turn = new Quaternion();

/** Places a unit cylinder (height 1 along Y, radius 1) as the bar from `from` to `to` with radius `r`. */
export function placeBar(
	mesh: Mesh,
	from: readonly [number, number, number],
	to: readonly [number, number, number],
	r: number
): void {
	delta.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
	const length = delta.length();
	mesh.visible = length > 1e-6;
	if (!mesh.visible) return;
	mesh.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
	mesh.quaternion.copy(turn.setFromUnitVectors(UP, delta.divideScalar(length)));
	mesh.scale.set(r, length, r);
}

export class ConnectorBars {
	readonly root = new Group();
	private readonly geometry = new CylinderGeometry(1, 1, 1, 10, 1);
	private readonly meshes = new Map<string, { mesh: Mesh; definition: string }>();

	/**
	 * `parent` is where the bars hang: the root is added to it while there is a bar and taken away
	 * when there is none, so a vessel without connectors has no extra node (and no extra cost).
	 */
	constructor(
		private readonly factory: PartModelFactory,
		private readonly visuals: ReadonlyMap<string, PartVisual>,
		private readonly parent?: Object3D
	) {
		this.root.name = 'connectors';
	}

	/** The material for a bar of `definition`: the part's primary paint. */
	private material(definition: string): Material {
		return this.factory.materials.get('paint-primary', this.visuals.get(definition)?.palette);
	}

	/** Draw exactly `bars`: create, move and drop meshes. */
	sync(bars: readonly ConnectorBar[]): void {
		const seen = new Set<string>();
		for (const bar of bars) {
			const r = connectorRadius(this.visuals.get(bar.definition));
			if (r === undefined) continue;
			seen.add(bar.key);
			let entry = this.meshes.get(bar.key);
			if (!entry || entry.definition !== bar.definition) {
				if (entry) this.root.remove(entry.mesh);
				const mesh = new Mesh(this.geometry, this.material(bar.definition));
				mesh.castShadow = true;
				mesh.receiveShadow = true;
				mesh.name = `bar:${bar.key}`;
				// A host that picks by `userData.key` (the VAB) finds the connector part through its bar.
				mesh.userData.key = bar.key;
				this.root.add(mesh);
				entry = { mesh, definition: bar.definition };
				this.meshes.set(bar.key, entry);
			}
			placeBar(entry.mesh, bar.from, bar.to, r);
		}
		for (const [key, entry] of this.meshes) {
			if (seen.has(key)) continue;
			this.root.remove(entry.mesh);
			this.meshes.delete(key);
		}
		if (this.parent) {
			if (this.meshes.size > 0 && this.root.parent !== this.parent) this.parent.add(this.root);
			else if (this.meshes.size === 0 && this.root.parent === this.parent) {
				this.parent.remove(this.root);
			}
		}
	}

	get count(): number {
		return this.meshes.size;
	}

	dispose(): void {
		this.root.removeFromParent();
		this.geometry.dispose();
		this.meshes.clear();
	}
}
