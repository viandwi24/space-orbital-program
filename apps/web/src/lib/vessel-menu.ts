/**
 * The Flight view's vessel menu (plan 310, ADR 0270): what a click or hover on another vessel
 * offers. Pure: the snapshot, the flown vessel and the picked one in, the rows out. The page draws
 * them and sends the commands; switching uses the flight loop's `switchVessel`.
 */
import type { EntityId, Snapshot, Vec3, VesselSnapshot } from '@orbital/core';
import { formatDistance, formatSpeed } from './format';

/** Within this many CSS px of a vessel's projected position, a click picks it (it may be a dot). */
export const MARKER_PICK_PX = 14;

export interface VesselMenuPort {
	part: EntityId;
	label: string;
	/** This port is the flown vessel's target now. */
	targeted: boolean;
}

export interface VesselMenu {
	vessel: EntityId;
	name: string;
	/** m (the target's own read-out when it is the target); null without the flown vessel. */
	distance: number | null;
	/** m/s; null without the flown vessel or across spheres of influence. */
	relativeSpeed: number | null;
	/** Why "Control this vessel" is off, or null when it can be flown. */
	controlBlocked: string | null;
	/** The vessel is the flown vessel's target (the whole vessel or one of its ports). */
	targeted: boolean;
	/** Its free docking ports, in part order. */
	ports: VesselMenuPort[];
	/** The part the camera looks at with "Focus camera". */
	focusPart: EntityId | null;
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);

/** A vessel's root in the shared frame of the snapshot's bodies, or null. */
function worldPosition(snapshot: Snapshot, v: VesselSnapshot): Vec3 | null {
	const body = snapshot.bodies.find((b) => b.id === v.soi);
	if (!body) return null;
	return {
		x: body.position.x + v.position.x,
		y: body.position.y + v.position.y,
		z: body.position.z + v.position.z
	};
}

/** Where to project a vessel to find it on screen: its root in the shared frame. */
export function vesselWorldPosition(snapshot: Snapshot, v: VesselSnapshot): Vec3 | null {
	return worldPosition(snapshot, v);
}

/** The menu for `picked`, seen from the flown vessel `active`; null when it is gone or is the flown one. */
export function vesselMenu(
	snapshot: Snapshot,
	active: EntityId | null,
	picked: EntityId,
	pickedPart: EntityId | null = null
): VesselMenu | null {
	if (picked === active) return null;
	const other = snapshot.vessels.find((v) => v.id === picked);
	if (!other) return null;
	const own = active === null ? undefined : snapshot.vessels.find((v) => v.id === active);
	const a = own ? worldPosition(snapshot, own) : null;
	const b = worldPosition(snapshot, other);
	const target = own?.target?.kind === 'vessel' && own.target.id === picked ? own.target : null;
	// bodies carry no velocity: a speed only between vessels of one sphere (or the target's own)
	const speed = target
		? target.relativeSpeed
		: own && own.soi === other.soi
			? len(sub(other.velocity, own.velocity))
			: null;
	const free = (other.ports ?? []).filter((p) => p.free);
	return {
		vessel: picked,
		name: other.name ?? `Vessel ${picked}`,
		distance: target ? target.distance : a && b ? len(sub(b, a)) : null,
		relativeSpeed: speed,
		controlBlocked:
			other.owner !== undefined
				? 'belongs to another agency'
				: other.uncontrolled === 'no-source'
					? 'has no control source'
					: null,
		targeted: target !== null,
		ports: free.map((p, i) => ({
			part: p.part,
			label: `Docking port ${i + 1} · ${p.size} m`,
			targeted: target?.part === p.part
		})),
		focusPart: pickedPart ?? other.parts[0]?.id ?? null
	};
}

/** The hover line: name, distance and relative speed. */
export function vesselTooltip(menu: VesselMenu): string {
	const bits = [menu.name];
	if (menu.distance !== null) bits.push(formatDistance(menu.distance));
	if (menu.relativeSpeed !== null) bits.push(`${formatSpeed(menu.relativeSpeed)} rel.`);
	return bits.join(' · ');
}

/**
 * The vessel whose projected point is nearest `(x, y)` within `MARKER_PICK_PX`, for vessels too
 * small on screen to hit; `project` is the renderer's (null behind the camera).
 */
export function vesselNearPoint(
	snapshot: Snapshot,
	active: EntityId | null,
	x: number,
	y: number,
	project: (world: Vec3) => { x: number; y: number; hidden?: boolean } | null
): EntityId | null {
	let best: { id: EntityId; d: number } | null = null;
	for (const v of snapshot.vessels) {
		if (v.id === active) continue;
		const w = vesselWorldPosition(snapshot, v);
		const p = w && project(w);
		if (!p || p.hidden) continue;
		const d = Math.hypot(p.x - x, p.y - y);
		if (d <= MARKER_PICK_PX && (!best || d < best.d)) best = { id: v.id, d };
	}
	return best?.id ?? null;
}
