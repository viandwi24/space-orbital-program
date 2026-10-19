/**
 * EVA v2 on the page (plan 225, ADR 0209): the suit's status for the HUD, its keys turned into
 * commands relative to the view (a heading for walking, a translation for the jetpack), and the
 * vessel B boards. Pure; the flight loop feeds it the snapshot and the camera direction.
 */
import type { PartDefinition, Quat, Snapshot, Vec3, VesselSnapshot } from '@orbital/core';

export const COLD_GAS = 'stock.cold-gas';
export const JETPACK_MODULE = 'stock.jetpack';
/** Walking and running speeds asked of `crew-walk`, m/s (the stock suit's `walk`). */
export const WALK_SPEED = 1.5;
export const RUN_SPEED = 3;
/** The farthest vessel B looks for, m (the Sandbox assist's range; the sim says why when too far). */
export const BOARD_LOOK = 60;

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
	x: a.y * b.z - a.z * b.y,
	y: a.z * b.x - a.x * b.z,
	z: a.x * b.y - a.y * b.x
});
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const unit = (a: Vec3): Vec3 => {
	const l = len(a);
	return l > 1e-12 ? scale(a, 1 / l) : { x: 0, y: 0, z: 0 };
};
/** `v` turned by `q`. */
export function rotate(q: Quat, v: Vec3): Vec3 {
	const ix = q.w * v.x + q.y * v.z - q.z * v.y;
	const iy = q.w * v.y + q.z * v.x - q.x * v.z;
	const iz = q.w * v.z + q.x * v.y - q.y * v.x;
	const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
	return {
		x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
		y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
		z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x
	};
}
const conj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

/** A vessel is a suit when a part of it declares `walk` (as the sim finds it). */
export function isSuit(v: VesselSnapshot, parts: ReadonlyMap<string, PartDefinition>): boolean {
	return v.parts.some((p) => parts.get(String(p.definition))?.walk !== undefined);
}

export interface SuitStatus {
	gas: { amount: number; capacity: number } | null;
	oxygen: { amount: number; capacity: number } | null;
	charge: { amount: number; capacity: number } | null;
	jetpack: boolean;
	/** The jetpack's part, for its on/off action. */
	jetpackPart: number | null;
	/** 0..1 of the jetpack's thrust last step (plan 227: its hiss). */
	jetpackFiring: number;
}

export function suitStatus(v: VesselSnapshot): SuitStatus {
	const res = (id: string) => {
		const r = v.resources?.find((x) => x.resource === id);
		return r ? { amount: r.amount, capacity: r.capacity } : null;
	};
	const part = v.parts.find((p) => p.modules[JETPACK_MODULE] !== undefined);
	const state = part?.modules[JETPACK_MODULE] as { on?: boolean; firing?: number } | undefined;
	return {
		gas: res(COLD_GAS),
		oxygen: res('stock.oxygen'),
		charge: res('stock.electric-charge'),
		jetpack: state?.on === true,
		jetpackPart: part ? Number(part.id) : null,
		jetpackFiring: typeof state?.firing === 'number' ? state.firing : 0
	};
}

/** Local up, north and east at a suit (as the sim's `horizon`): up from the body, north to its pole. */
export function horizonAt(
	position: Vec3,
	bodyRotation: Quat
): { up: Vec3; north: Vec3; east: Vec3 } {
	const up = unit(position);
	const pole = rotate(bodyRotation, { x: 0, y: 1, z: 0 });
	let east = cross(pole, up);
	east = len(east) > 1e-9 ? unit(east) : { x: 1, y: 0, z: 0 };
	return { up, north: cross(up, east), east };
}

/** The view's forward and right, flattened onto the local horizontal. */
function viewAxes(view: Vec3, up: Vec3): { forward: Vec3; right: Vec3 } {
	let forward = add(view, scale(up, -dot(view, up)));
	// looking straight down or up: fall back to the view's own direction turned flat
	if (len(forward) < 1e-6) forward = cross(up, { x: 1, y: 0, z: 0 });
	forward = unit(forward);
	return { forward, right: cross(forward, up) };
}

/**
 * The walking heading (rad from north, toward east) for W/S (`forward` +1/−1) and D/A (`side`
 * +1/−1) relative to the view, or null when no key is held.
 */
export function walkHeading(
	view: Vec3,
	position: Vec3,
	bodyRotation: Quat,
	forward: number,
	side: number
): number | null {
	if (forward === 0 && side === 0) return null;
	const { up, north, east } = horizonAt(position, bodyRotation);
	const axes = viewAxes(view, up);
	const d = add(scale(axes.forward, forward), scale(axes.right, side));
	const h = Math.atan2(dot(d, east), dot(d, north));
	return h < 0 ? h + 2 * Math.PI : h;
}

/**
 * The jetpack's translation in the suit's frame (`attitude.translate`: x right, y along the
 * nose, z up of the part) for the keys relative to the view, at most 1 long.
 */
export function jetpackTranslate(
	view: Vec3,
	position: Vec3,
	orientation: Quat,
	forward: number,
	side: number,
	vertical: number
): Vec3 {
	const up = unit(position);
	const axes = viewAxes(view, up);
	const world = add(
		add(scale(axes.forward, forward), scale(axes.right, side)),
		scale(up, vertical)
	);
	const l = len(world);
	if (l < 1e-9) return { x: 0, y: 0, z: 0 };
	return rotate(conj(orientation), scale(world, 1 / Math.max(1, l)));
}

/** The vessel B boards: the nearest other non-suit vessel in the same SOI within `BOARD_LOOK`. */
export function boardTarget(
	snapshot: Snapshot,
	suit: number,
	parts: ReadonlyMap<string, PartDefinition>,
	prefer: number | null = null
): number | null {
	const me = snapshot.vessels.find((v) => Number(v.id) === suit);
	if (!me) return null;
	if (prefer !== null) {
		const p = snapshot.vessels.find((v) => Number(v.id) === prefer);
		if (p && p.soi === me.soi) return prefer;
	}
	let best: { id: number; d: number } | null = null;
	for (const v of snapshot.vessels) {
		if (Number(v.id) === suit || v.soi !== me.soi || isSuit(v, parts)) continue;
		const d = len(add(v.position, scale(me.position, -1)));
		if (d <= BOARD_LOOK && (!best || d < best.d)) best = { id: Number(v.id), d };
	}
	return best?.id ?? null;
}
