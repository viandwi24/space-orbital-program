/**
 * Orbit-camera state around a target (the active vessel in flight, the SOI body in map view).
 * Pure: the host feeds numeric deltas (mouse drag, wheel, keys); no DOM events are read here.
 * +Y is up (units-and-frames.md); yaw turns about +Y, pitch is elevation above the XZ plane.
 */
import type { Vec3 } from '@orbital/core';

export interface RigState {
	/** rad, about +Y */
	yaw: number;
	/** rad, clamped to ±(π/2 − PITCH_MARGIN) */
	pitch: number;
	/** distance from the target, m, clamped to [minDistance, maxDistance] */
	distance: number;
}

export interface RigLimits {
	minDistance: number;
	maxDistance: number;
}

export const PITCH_MARGIN = 0.01;

export const FLIGHT_RIG_LIMITS: RigLimits = { minDistance: 2, maxDistance: 5_000 };

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const initialRig = (distance: number): RigState => ({ yaw: 0.6, pitch: 0.35, distance });

/** Returns a new state; `zoomFactor > 1` moves away (distance is scaled, so zoom is log-linear). */
export function applyRigInput(
	state: RigState,
	limits: RigLimits,
	input: { dYaw?: number; dPitch?: number; zoomFactor?: number }
): RigState {
	const maxPitch = Math.PI / 2 - PITCH_MARGIN;
	return {
		yaw: state.yaw + (input.dYaw ?? 0),
		pitch: clamp(state.pitch + (input.dPitch ?? 0), -maxPitch, maxPitch),
		distance: clamp(
			state.distance * (input.zoomFactor ?? 1),
			limits.minDistance,
			limits.maxDistance
		)
	};
}

/** Camera position relative to its target. */
export const rigOffset = (s: RigState): Vec3 => ({
	x: s.distance * Math.cos(s.pitch) * Math.sin(s.yaw),
	y: s.distance * Math.sin(s.pitch),
	z: s.distance * Math.cos(s.pitch) * Math.cos(s.yaw)
});
