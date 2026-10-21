/**
 * The pick list of vessels stacked on one spot of the map (plan 270): a click where several vessel
 * icons overlap lists them all, like a loot list, and an entry opens that vessel's card. Pure: the
 * flight page and the Mission Center pass screen points they already project each frame.
 */
import type { BodyDefinition, Snapshot, VesselType } from '@orbital/core';
import { formatDistance } from '../format';
import { VESSEL_TYPE_LABEL } from '../mission-center/model';

/** A click may land this far from a vessel icon, px (the map's pick radius, `target-view.ts`). */
export const STACK_RADIUS = 12;

export interface StackPoint {
	/** `vessel:12`; other keys (bodies, clusters) are ignored. */
	key: string;
	x: number;
	y: number;
}

/** The vessel keys whose icon is within `radius` px of (x, y), nearest first, each once. */
export function stackAt(
	points: readonly StackPoint[],
	x: number,
	y: number,
	radius = STACK_RADIUS
): string[] {
	const near = new Map<string, number>();
	for (const p of points) {
		if (!p.key.startsWith('vessel:')) continue;
		const d = Math.hypot(p.x - x, p.y - y);
		if (d > radius) continue;
		near.set(p.key, Math.min(d, near.get(p.key) ?? Infinity));
	}
	return [...near].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([k]) => k);
}

export interface MapStackEntry {
	key: string;
	vessel: number;
	name: string;
	/** For the icon (`iconPath`). */
	type: VesselType | undefined;
	/** "Active", "Target", else the type's label ("Debris", "Probe"). */
	role: string;
	/** "120 km" above its body, or "Landed". */
	hint: string;
}

/** What the pick list shows, at the click. */
export interface MapStack {
	x: number;
	y: number;
	entries: MapStackEntry[];
}

/** The list's entries for `keys` (from `stackAt`), in the same order; vessels gone are left out. */
export function stackEntries(
	keys: readonly string[],
	snapshot: Snapshot,
	context: {
		bodies: readonly Pick<BodyDefinition, 'id' | 'radius'>[];
		/** The vessel flown (or the Mission Center's focus). */
		active?: number | null;
		/** The flown vessel's target key, `vessel:12`. */
		target?: string | null;
	}
): MapStackEntry[] {
	const out: MapStackEntry[] = [];
	for (const key of keys) {
		const id = Number(key.slice('vessel:'.length));
		const v = snapshot.vessels.find((x) => Number(x.id) === id);
		if (!v) continue;
		const radius = context.bodies.find((b) => String(b.id) === String(v.soi))?.radius ?? 0;
		const p = v.position;
		out.push({
			key,
			vessel: id,
			name: v.name ?? `Vessel ${id}`,
			type: v.type,
			role:
				id === context.active
					? 'Active'
					: key === context.target
						? 'Target'
						: v.type
							? VESSEL_TYPE_LABEL[v.type]
							: 'Vessel',
			hint: v.surface ? 'Landed' : formatDistance(Math.hypot(p.x, p.y, p.z) - radius)
		});
	}
	return out;
}
