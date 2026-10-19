/**
 * Orbit camera of the VAB hangar (plan 022). Pure: the host feeds pixel deltas and wheel factors,
 * nothing here reads DOM events. +Y is up; yaw turns about +Y, pitch is elevation; the camera sits
 * on a sphere around `target` and never goes below the floor.
 */
export type V3 = readonly [number, number, number];

export interface VabCameraState {
	yaw: number;
	pitch: number;
	distance: number;
	target: V3;
}

export interface VabCameraLimits {
	minDistance: number;
	maxDistance: number;
	maxPitch: number;
	/** The camera stays this high above the floor, m. */
	floorClearance: number;
	/** The camera stays inside the hangar: |x| and |z| of its position stay below this, m. */
	roomHalf: number;
	/** Pan is clamped to this box around the platform: half-extent on x and z, top on y. */
	panExtent: number;
	panTop: number;
}

export const VAB_CAMERA_LIMITS: VabCameraLimits = {
	minDistance: 2.5,
	maxDistance: 60,
	maxPitch: 1.35,
	floorClearance: 0.5,
	roomHalf: 26,
	panExtent: 14,
	panTop: 34
};

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const initialCamera = (distance = 16, target: V3 = [0, 4, 0]): VabCameraState => ({
	yaw: 0.62,
	pitch: 0.16,
	distance,
	target
});

/** Lowest allowed pitch so the camera stays above the floor. */
export function minPitch(state: VabCameraState, limits = VAB_CAMERA_LIMITS): number {
	const s = (limits.floorClearance - state.target[1]) / state.distance;
	return Math.asin(clamp(s, -1, 1));
}

/** Largest distance at which the camera stays inside the room for this yaw and pitch. */
export function maxDistanceInRoom(state: VabCameraState, limits = VAB_CAMERA_LIMITS): number {
	const horizontal = Math.max(Math.cos(state.pitch), 1e-6);
	const dx = Math.abs(Math.sin(state.yaw)) * horizontal;
	const dz = Math.abs(Math.cos(state.yaw)) * horizontal;
	const room = (target: number, rate: number): number =>
		rate < 1e-9 ? Infinity : (limits.roomHalf - Math.abs(target)) / rate;
	return Math.max(
		limits.minDistance,
		Math.min(room(state.target[0], dx), room(state.target[2], dz))
	);
}

function normalised(state: VabCameraState, limits: VabCameraLimits): VabCameraState {
	let distance = clamp(state.distance, limits.minDistance, limits.maxDistance);
	const lo = minPitch({ ...state, distance }, limits);
	const pitch = clamp(state.pitch, Math.min(lo, limits.maxPitch), limits.maxPitch);
	distance = Math.min(distance, maxDistanceInRoom({ ...state, pitch }, limits));
	return { ...state, distance, pitch };
}

/** Radians per pixel of drag. */
export const ORBIT_SPEED = 0.0055;

export function orbit(
	state: VabCameraState,
	dxPx: number,
	dyPx: number,
	limits = VAB_CAMERA_LIMITS
): VabCameraState {
	return normalised(
		{ ...state, yaw: state.yaw - dxPx * ORBIT_SPEED, pitch: state.pitch + dyPx * ORBIT_SPEED },
		limits
	);
}

/** `factor > 1` moves away; the distance scales, so zoom is log-linear. */
export function zoom(
	state: VabCameraState,
	factor: number,
	limits = VAB_CAMERA_LIMITS
): VabCameraState {
	return normalised({ ...state, distance: state.distance * factor }, limits);
}

/**
 * The turntable's height (plan 217, ADR 0207 point 4): the target moves `dy` metres up or down the
 * vessel axis, inside the pan box; distance, yaw and pitch stay.
 */
export function raise(
	state: VabCameraState,
	dy: number,
	limits = VAB_CAMERA_LIMITS
): VabCameraState {
	return normalised(
		{
			...state,
			target: [state.target[0], clamp(state.target[1] + dy, 0, limits.panTop), state.target[2]]
		},
		limits
	);
}

/** The target on `point` (a middle click on a part), inside the pan box. */
export function focus(
	state: VabCameraState,
	point: V3,
	limits = VAB_CAMERA_LIMITS
): VabCameraState {
	return normalised(
		{
			...state,
			target: [
				clamp(point[0], -limits.panExtent, limits.panExtent),
				clamp(point[1], 0, limits.panTop),
				clamp(point[2], -limits.panExtent, limits.panExtent)
			]
		},
		limits
	);
}

/** Camera position. */
export function cameraPosition(s: VabCameraState): V3 {
	return [
		s.target[0] + s.distance * Math.cos(s.pitch) * Math.sin(s.yaw),
		s.target[1] + s.distance * Math.sin(s.pitch),
		s.target[2] + s.distance * Math.cos(s.pitch) * Math.cos(s.yaw)
	];
}

/** Camera right and up axes in world space. */
export function cameraAxes(s: VabCameraState): { right: V3; up: V3 } {
	const right: V3 = [Math.cos(s.yaw), 0, -Math.sin(s.yaw)];
	// forward = -offset/|offset|; up = right x forward ... derived from the pitch directly:
	const up: V3 = [
		-Math.sin(s.pitch) * Math.sin(s.yaw),
		Math.cos(s.pitch),
		-Math.sin(s.pitch) * Math.cos(s.yaw)
	];
	return { right, up };
}

/** Moves the target in the screen plane, `dxPx`/`dyPx` of drag in a viewport `heightPx` tall. */
export function pan(
	state: VabCameraState,
	dxPx: number,
	dyPx: number,
	heightPx: number,
	fovDeg: number,
	limits = VAB_CAMERA_LIMITS
): VabCameraState {
	const perPx = (2 * state.distance * Math.tan((fovDeg * Math.PI) / 360)) / Math.max(1, heightPx);
	const { right, up } = cameraAxes(state);
	const t: V3 = [
		state.target[0] - right[0] * dxPx * perPx + up[0] * dyPx * perPx,
		state.target[1] - right[1] * dxPx * perPx + up[1] * dyPx * perPx,
		state.target[2] - right[2] * dxPx * perPx + up[2] * dyPx * perPx
	];
	return normalised(
		{
			...state,
			target: [
				clamp(t[0], -limits.panExtent, limits.panExtent),
				clamp(t[1], 0, limits.panTop),
				clamp(t[2], -limits.panExtent, limits.panExtent)
			]
		},
		limits
	);
}

/**
 * Distance at which a vertical extent `height` and a horizontal extent `width` both fit with
 * `margin` (1.2 = 20 % air) in a view of `aspect` (width / height) and vertical field of view.
 */
export function frameDistance(
	width: number,
	height: number,
	fovDeg: number,
	aspect: number,
	margin = 1.25
): number {
	const tanV = Math.tan((fovDeg * Math.PI) / 360);
	const tanH = tanV * aspect;
	return Math.max(((height / 2) * margin) / tanV, ((width / 2) * margin) / tanH);
}

/** Frame rate independent exponential approach; `rate` is 1 / time constant, per second. */
export function approach(current: number, goal: number, dt: number, rate: number): number {
	return goal + (current - goal) * Math.exp(-rate * Math.max(0, dt));
}

export function approachCamera(
	cur: VabCameraState,
	goal: VabCameraState,
	dt: number,
	rate = 7
): VabCameraState {
	// Yaw takes the short way round.
	let dyaw = goal.yaw - cur.yaw;
	dyaw = ((((dyaw + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
	return {
		yaw: approach(cur.yaw, cur.yaw + dyaw, dt, rate),
		pitch: approach(cur.pitch, goal.pitch, dt, rate),
		distance: approach(cur.distance, goal.distance, dt, rate),
		target: [
			approach(cur.target[0], goal.target[0], dt, rate),
			approach(cur.target[1], goal.target[1], dt, rate),
			approach(cur.target[2], goal.target[2], dt, rate)
		]
	};
}
