/**
 * Auto shrouds (plan 207, ADR 0212): an engine or decoupler with a part on its bottom node grows a
 * skirt down to the size of that part's node, so the joint has no step. The generator says where
 * the skirt hangs (`GeneratedPart.shroud`); the host finds the part below from the node positions
 * of the vessel's models (`shroudsBelow`), so the Hangar and flight agree and a decoupled stage
 * takes its shroud away with it.
 */
import { Quaternion, Vector3, type Object3D } from 'three';
import type { ProfilePoint } from './revolve.ts';
import type { PartModel, PartNode } from './types.ts';

export interface ShroudSpec {
	/** Top of the skirt in the part frame, m. */
	top: number;
	/** Bottom of the skirt (the bottom node's face), m. */
	bottom: number;
	/** Radius of the skirt at its top, m. */
	radius: number;
	/** `always`: whenever a part is below (an engine); `wider`: only when that part is wider (a decoupler). */
	when: 'always' | 'wider';
}

/** Wall thickness of a shroud, m. */
export const SHROUD_WALL = 0.01;

/** Whether a skirt is drawn for a part of `belowSize` m below, and with which profile. */
export function shroudProfile(spec: ShroudSpec, belowSize: number | null): ProfilePoint[] | null {
	if (belowSize === null) return null;
	const rb = belowSize / 2;
	if (spec.when === 'wider' && rb <= spec.radius + 1e-3) return null;
	const t = SHROUD_WALL;
	// Inside walked down (faces the axis), the lip out, the outside walked up (faces out).
	return [
		{ r: spec.radius - t, y: spec.top },
		{ r: Math.max(0.01, rb - t), y: spec.bottom },
		{ r: rb, y: spec.bottom },
		{ r: spec.radius, y: spec.top }
	];
}

/** One part of a vessel as the host draws it: its root (placed in the vessel frame) and nodes. */
export interface ShroudCandidate<K> {
	key: K;
	root: Object3D;
	nodes: Readonly<Record<string, PartNode>>;
}

/** Nodes closer than this, m, are joined. */
const JOIN_DISTANCE = 0.02;

/**
 * For every part with a `bottom` node, the size (m) of the node of another part that sits on it,
 * facing it; parts with nothing below, or a node without a size below, are absent. The roots'
 * local transforms must be in one shared frame (the vessel group).
 */
export function shroudsBelow<K>(parts: readonly ShroudCandidate<K>[]): Map<K, number> {
	const world = parts.map((p) => {
		const q = new Quaternion().copy(p.root.quaternion);
		return Object.entries(p.nodes).map(([name, n]) => ({
			name,
			size: n.size,
			pos: new Vector3(...n.pos).applyQuaternion(q).add(p.root.position),
			dir: new Vector3(...n.dir).applyQuaternion(q)
		}));
	});
	const out = new Map<K, number>();
	parts.forEach((p, i) => {
		const bottom = world[i]!.find((n) => n.name === 'bottom');
		if (!bottom) return;
		for (let j = 0; j < parts.length; j++) {
			if (j === i) continue;
			const hit = world[j]!.find(
				(n) =>
					n.size !== undefined &&
					n.pos.distanceTo(bottom.pos) < JOIN_DISTANCE &&
					n.dir.dot(bottom.dir) < -0.99
			);
			if (hit) {
				out.set(p.key, hit.size!);
				return;
			}
		}
	});
	return out;
}

/** Gives every model with a shroud the size of the part below it, or none. */
export function applyShrouds<K>(
	parts: readonly (ShroudCandidate<K> & { setShroud?: (size: number | null) => void })[]
): void {
	if (!parts.some((p) => p.setShroud)) return;
	const below = shroudsBelow(parts);
	for (const p of parts) p.setShroud?.(below.get(p.key) ?? null);
}

/** The candidates of a host's part map (key to model). */
export function shroudCandidates<K>(
	parts: ReadonlyMap<K, { model: PartModel }>
): (ShroudCandidate<K> & { setShroud?: (size: number | null) => void })[] {
	return [...parts].map(([key, { model }]) => ({
		key,
		root: model.root,
		nodes: model.nodes,
		...(model.setShroud ? { setShroud: (size: number | null) => model.setShroud!(size) } : {})
	}));
}
