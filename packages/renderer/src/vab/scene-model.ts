/**
 * What the page tells the VAB view (plan 022, ADR 0029): parts at positions inside groups. A group
 * is one assembly (the design, a loose assembly); the view stands each group on the floor at its
 * own x/z. The page never touches Three.js objects.
 */
import type { V3 } from './orbit-camera.ts';

export interface VabPart {
	/** Stable key (the design index as text); a changed definition rebuilds the model. */
	key: string;
	definition: string;
	/** Origin of the part relative to its group's root origin, metres. */
	position: V3;
	/** Turn about the vertical axis, rad (radial parts face their parent; default 0). */
	yaw?: number;
	group: string;
	/** `ghost` is the translucent preview of an attach; it cannot be picked. */
	role: 'solid' | 'ghost';
}

export interface VabGroup {
	id: string;
	/** Floor position of the group's lowest point, metres. */
	x: number;
	z: number;
}

export type VabNodeState = 'free' | 'target' | 'active';

export interface VabNode {
	key: string;
	group: string;
	/** Attach point relative to the group's root origin. */
	position: V3;
	/** Unit vector pointing away from the part that owns the node. */
	dir: V3;
	/** Radius of the part's end face; the marker ring is drawn around it. */
	radius: number;
	state: VabNodeState;
}

export interface VabScene {
	parts: VabPart[];
	groups: VabGroup[];
	nodes: VabNode[];
}

export const EMPTY_SCENE: VabScene = { parts: [], groups: [], nodes: [] };

export interface PartSlot {
	definition: string;
	role: VabPart['role'];
}

/** What to create, remove and merely move when the scene changes from `prev` to `next`. */
export function diffParts(
	prev: ReadonlyMap<string, PartSlot>,
	next: readonly VabPart[]
): { add: VabPart[]; remove: string[]; keep: VabPart[] } {
	const add: VabPart[] = [];
	const keep: VabPart[] = [];
	const remove: string[] = [];
	const seen = new Set<string>();
	for (const p of next) {
		seen.add(p.key);
		const old = prev.get(p.key);
		if (old && old.definition === p.definition && old.role === p.role) keep.push(p);
		else {
			add.push(p);
			if (old) remove.push(p.key);
		}
	}
	for (const key of prev.keys()) if (!seen.has(key)) remove.push(key);
	return { add, remove, keep };
}

/**
 * Vertical shift that stands a group on the floor: the group's lowest point (part origin plus the
 * model's lowest vertex) moves to y = 0. `lows` are those per-part values.
 */
export function floorShift(lows: readonly number[]): number {
	return lows.length === 0 ? 0 : -Math.min(...lows);
}

export interface Extent {
	min: V3;
	max: V3;
}

/** Union of boxes; null when empty. */
export function unionExtent(boxes: readonly Extent[]): Extent | null {
	if (boxes.length === 0) return null;
	const min: [number, number, number] = [Infinity, Infinity, Infinity];
	const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
	for (const b of boxes) {
		for (let i = 0; i < 3; i++) {
			min[i] = Math.min(min[i]!, b.min[i]!);
			max[i] = Math.max(max[i]!, b.max[i]!);
		}
	}
	return { min, max };
}
