/**
 * Winch ropes between vessels (plan 313, ADR 0272): a dark tube from a winch's anchor to the
 * socket it is tied to, sagging toward the body by its slack (a parabola as deep as a rope of
 * that length hangs), straight while taut. Rebuilt each sync from the parts' models.
 */
import {
	CatmullRomCurve3,
	Group,
	Mesh,
	MeshStandardMaterial,
	TubeGeometry,
	Vector3,
	type Object3D
} from 'three';
import type { VesselSnapshot } from '@orbital/core';

/** Points along the rope, and its radius, m. */
const POINTS = 16;
const RADIUS = 0.025;

export class TetherLayer {
	readonly group = new Group();
	private readonly material = new MeshStandardMaterial({
		color: 0x2a2621,
		roughness: 0.85,
		metalness: 0.1
	});
	private readonly meshes = new Map<string, Mesh>();

	constructor() {
		this.group.name = 'tethers';
	}

	/**
	 * Draws every rope of `vessels`. `root(vessel, part)` is a part model's root (its world matrix
	 * current); `down(vessel)` the unit direction toward the vessel's body in render space.
	 */
	update(
		vessels: readonly VesselSnapshot[],
		root: (vessel: number, part: number) => Object3D | undefined,
		down: (vessel: VesselSnapshot) => Vector3
	): void {
		const seen = new Set<string>();
		for (const v of vessels) {
			for (const part of v.parts) {
				const t = part.tether;
				if (!t) continue;
				const from = root(v.id, part.id);
				const to = root(t.peerVessel, t.peer);
				if (!from || !to) continue;
				const key = String(part.id);
				seen.add(key);
				from.updateWorldMatrix(true, false);
				to.updateWorldMatrix(true, false);
				const a = from.localToWorld(new Vector3(t.anchor.x, t.anchor.y, t.anchor.z));
				const b = to.localToWorld(new Vector3(t.peerAnchor.x, t.peerAnchor.y, t.peerAnchor.z));
				const span = a.distanceTo(b);
				// the sag of a rope of length L over a span s: about sqrt(3/8 L (L - s))
				const slack = Math.max(0, t.length - span);
				const sag = slack > 0.01 && t.tension === 0 ? Math.sqrt(0.375 * t.length * slack) : 0;
				const g = down(v);
				const points: Vector3[] = [];
				for (let i = 0; i <= POINTS; i++) {
					const u = i / POINTS;
					const p = a.clone().lerp(b, u);
					p.addScaledVector(g, sag * 4 * u * (1 - u));
					points.push(this.group.worldToLocal(p));
				}
				let mesh = this.meshes.get(key);
				const geometry = new TubeGeometry(new CatmullRomCurve3(points), POINTS * 2, RADIUS, 6);
				if (!mesh) {
					mesh = new Mesh(geometry, this.material);
					mesh.name = `tether-${key}`;
					mesh.frustumCulled = false;
					this.group.add(mesh);
					this.meshes.set(key, mesh);
				} else {
					mesh.geometry.dispose();
					mesh.geometry = geometry;
				}
			}
		}
		for (const [key, mesh] of this.meshes) {
			if (seen.has(key)) continue;
			this.group.remove(mesh);
			mesh.geometry.dispose();
			this.meshes.delete(key);
		}
	}

	dispose(): void {
		for (const mesh of this.meshes.values()) mesh.geometry.dispose();
		this.meshes.clear();
		this.material.dispose();
	}
}
