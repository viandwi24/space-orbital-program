/**
 * Flight camera modes (plan 226, ADR 0226). The orbit rig keeps one state (yaw, pitch, distance);
 * a mode only picks the frame that yaw and pitch are measured in:
 *
 * - `free`: up is away from the body's centre (today's horizon-up rig);
 * - `orbital`: up is the orbit normal (r × v), so the orbit lies flat on screen;
 * - `locked`: the frame turns with the vessel (or its control part): a roll rolls the view;
 * - `auto`: `free` below the switch altitude (the atmosphere top, or a fixed height on an airless
 *   body), `orbital` above it.
 *
 * Switching re-measures yaw and pitch in the new frame, so the view direction does not jump. Pure:
 * no Three.js, so Bun tests it.
 */
import type { Quat, Vec3 } from '@orbital/core';
import { rigOffset, PITCH_MARGIN, type RigState } from './camera-rig.ts';

export type CameraMode = 'auto' | 'free' | 'orbital' | 'locked';
/** The order V cycles through (rancangan §11.1). */
export const CAMERA_MODES: readonly CameraMode[] = ['auto', 'free', 'orbital', 'locked'];
export const CAMERA_MODE_LABEL: Record<CameraMode, string> = {
	auto: 'Auto',
	free: 'Free',
	orbital: 'Orbital',
	locked: 'Locked'
};
/** Where Auto switches on a body without air, m above the surface. */
export const AIRLESS_SWITCH_ALTITUDE = 25_000;

export const nextCameraMode = (mode: CameraMode): CameraMode =>
	CAMERA_MODES[(CAMERA_MODES.indexOf(mode) + 1) % CAMERA_MODES.length]!;

const Y: Vec3 = { x: 0, y: 1, z: 0 };
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
	x: a.y * b.z - a.z * b.y,
	y: a.z * b.x - a.x * b.z,
	z: a.x * b.y - a.y * b.x
});
const len = (a: Vec3): number => Math.sqrt(dot(a, a));
const unit = (a: Vec3): Vec3 => {
	const l = len(a);
	return l > 0 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { ...Y };
};

/** The shortest rotation taking unit `a` to unit `b` (as Three's `setFromUnitVectors`). */
export function fromUnitVectors(a: Vec3, b: Vec3): Quat {
	let r = dot(a, b) + 1;
	let q: Quat;
	if (r < 1e-12) {
		r = 0;
		q =
			Math.abs(a.x) > Math.abs(a.z)
				? { x: -a.y, y: a.x, z: 0, w: r }
				: { x: 0, y: -a.z, z: a.y, w: r };
	} else {
		const c = cross(a, b);
		q = { x: c.x, y: c.y, z: c.z, w: r };
	}
	const l = Math.hypot(q.x, q.y, q.z, q.w);
	return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}

/** `q` applied to `v`. */
export function rotate(q: Quat, v: Vec3): Vec3 {
	const t = cross({ x: q.x, y: q.y, z: q.z }, v);
	const t2 = { x: 2 * t.x, y: 2 * t.y, z: 2 * t.z };
	const u = cross({ x: q.x, y: q.y, z: q.z }, t2);
	return { x: v.x + q.w * t2.x + u.x, y: v.y + q.w * t2.y + u.y, z: v.z + q.w * t2.z + u.z };
}

const conj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

/** What a mode needs of the vessel, SOI-relative. */
export interface CameraSubject {
	position: Vec3;
	velocity: Vec3;
	/** The vessel's (or its control part's) orientation. */
	orientation: Quat;
	/** Altitude above the body's surface, m. */
	altitude: number;
	/** Top of the body's atmosphere, m; absent without air. */
	atmosphereTop?: number;
}

/** The mode `auto` means here and now. */
export function resolveMode(mode: CameraMode, s: CameraSubject): Exclude<CameraMode, 'auto'> {
	if (mode !== 'auto') return mode;
	return s.altitude < (s.atmosphereTop ?? AIRLESS_SWITCH_ALTITUDE) ? 'free' : 'orbital';
}

/** The rotation from rig space (+Y up) to the world for a resolved mode. */
export function modeFrame(mode: Exclude<CameraMode, 'auto'>, s: CameraSubject): Quat {
	if (mode === 'locked') return s.orientation;
	if (mode === 'orbital') {
		const n = cross(s.position, s.velocity);
		if (len(n) > 0) return fromUnitVectors(Y, unit(n));
	}
	return len(s.position) > 0 ? fromUnitVectors(Y, unit(s.position)) : { x: 0, y: 0, z: 0, w: 1 };
}

/** Camera offset from its target and up vector, world axes. */
export function cameraPose(rig: RigState, frame: Quat): { offset: Vec3; up: Vec3 } {
	return { offset: rotate(frame, rigOffset(rig)), up: rotate(frame, Y) };
}

/**
 * The rig re-measured in frame `to` so the camera sits where it was in frame `from`. Pitch stays
 * inside the rig's clamp; at a pole the yaw keeps its old value.
 */
export function reframe(rig: RigState, from: Quat, to: Quat): RigState {
	const world = rotate(from, rigOffset(rig));
	const local = rotate(conj(to), world);
	const d = len(local) || rig.distance;
	const max = Math.PI / 2 - PITCH_MARGIN;
	const pitch = Math.max(-max, Math.min(max, Math.asin(Math.max(-1, Math.min(1, local.y / d)))));
	const flat = Math.hypot(local.x, local.z);
	const yaw = flat > 1e-9 ? Math.atan2(local.x, local.z) : rig.yaw;
	return { yaw, pitch, distance: rig.distance };
}
