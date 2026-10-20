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
	/** Full rotation `[x, y, z, w]` of a tilted part (ADR 0071); it replaces `yaw` when present. */
	rotation?: readonly [number, number, number, number];
	group: string;
	/** `ghost` is the translucent preview of an attach; it cannot be picked. */
	/** `free` is the ghost that follows the cursor where no site is near (plan 244): drawn like a ghost, never picked. */
	role: 'solid' | 'ghost' | 'free';
	/** Per-instance generator parameters (plan 219: a fairing's sections); a change rebuilds the model. */
	params?: Readonly<Record<string, number | string | boolean>>;
}

/** A bar from a connector part (strut, fuel line) to the far end of its link, relative to the group's root origin (ADR 0071). */
export interface VabLink {
	/** The key of the connector part. */
	key: string;
	group: string;
	definition: string;
	from: V3;
	to: V3;
}

export interface VabGroup {
	id: string;
	/** Floor position of the group's lowest point, metres. */
	x: number;
	z: number;
}

/** `near` is a target within reach of the pointer (plan 244): it glows before the pointer snaps to it. */
/** `mismatch` marks a joint whose two node sizes differ (plan 244, 8b.3); it is not a place to attach. */
export type VabNodeState = 'free' | 'target' | 'near' | 'active' | 'mismatch';

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

/**
 * A stability read-out glyph (ADR 0042): the centre of mass (`com`), the centre of pressure
 * (`cop`) or the centre of mass of the empty vessel (`com-empty`). Drawn on top of everything at a
 * constant size on screen; never picked.
 */
export interface VabMarker {
	key: string;
	kind: 'com' | 'cop' | 'com-empty' | 'cot';
	group: string;
	/** Position relative to the group's root origin, like parts and nodes (the floor shift is applied by the view). */
	position: V3;
}

export interface VabScene {
	parts: VabPart[];
	groups: VabGroup[];
	nodes: VabNode[];
	/** Bars of struts and fuel lines; absent means none. */
	links?: VabLink[];
	/** Stability glyphs; absent means none. */
	markers?: VabMarker[];
}

/** Applies the part's turn: its full rotation when tilted, else its yaw about the vertical. */
export function applyPartTurn(
	target: {
		rotation: { y: number };
		quaternion: { set(x: number, y: number, z: number, w: number): unknown };
	},
	part: Pick<VabPart, 'yaw' | 'rotation'>
): void {
	if (part.rotation) target.quaternion.set(...part.rotation);
	else target.rotation.y = part.yaw ?? 0;
}

export const EMPTY_SCENE: VabScene = { parts: [], groups: [], nodes: [] };

export interface PartSlot {
	definition: string;
	role: VabPart['role'];
	params?: VabPart['params'];
}

const sameParams = (a: PartSlot['params'], b: PartSlot['params']): boolean =>
	JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

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
		if (
			old &&
			old.definition === p.definition &&
			old.role === p.role &&
			sameParams(old.params, p.params)
		)
			keep.push(p);
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

/** Copies of one definition from which the view switches them to reduced detail (see `repeatedDetail`). */
export const REPEAT_LOD_COUNT = 3;

/**
 * `role|definition` of every part that appears at least `REPEAT_LOD_COUNT` times in the role:
 * symmetric copies and rows of identical tanks. Roles are counted apart so hovering a ghost
 * does not change the look of the solid parts.
 */
export function repeatedDefinitions(parts: readonly VabPart[]): Set<string> {
	const counts = new Map<string, number>();
	for (const p of parts) {
		const k = `${p.role}|${p.definition}`;
		counts.set(k, (counts.get(k) ?? 0) + 1);
	}
	const out = new Set<string>();
	for (const [k, n] of counts) if (n >= REPEAT_LOD_COUNT) out.add(k);
	return out;
}

/** Whether two marker lists draw the same glyphs (the page rebuilds the scene on every pointer move). */
export function sameMarkers(
	a: readonly VabMarker[] | undefined,
	b: readonly VabMarker[] | undefined
): boolean {
	const x = a ?? [];
	const y = b ?? [];
	if (x.length !== y.length) return false;
	return x.every((m, i) => {
		const n = y[i]!;
		return (
			m.key === n.key &&
			m.kind === n.kind &&
			m.group === n.group &&
			m.position[0] === n.position[0] &&
			m.position[1] === n.position[1] &&
			m.position[2] === n.position[2]
		);
	});
}
