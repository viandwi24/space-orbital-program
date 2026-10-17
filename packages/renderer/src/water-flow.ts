/**
 * River flow (plan 038, ADR 0072): the ripples of a river move along its course with a flow map
 * (Catlike Coding's "texture distortion": the pattern is sampled at `p - flow * progress`, where
 * `progress = frac(time / cycle + offset)` sawtooths from 0 to 1; two phases half a cycle apart are
 * blended with `1 - |1 - 2 progress|`, so each is invisible at its own reset). Pure maths, tested in
 * Bun; the planet pass takes the constants from here.
 */

/** Seconds for one phase to run from 0 to 1 (the pattern travels `FLOW_SPEED * FLOW_CYCLE` metres meanwhile). */
export const FLOW_CYCLE = 2.4;
/** Surface speed of the ripples on a river, m/s, at full flow. */
export const FLOW_SPEED = 1.3;

/** Position in the cycle of the phase with this offset (0 or 0.5), in [0, 1). */
export function flowProgress(t: number, offset: number, cycle = FLOW_CYCLE): number {
	const x = t / cycle + offset;
	return x - Math.floor(x);
}

/** Weight of a phase at this progress: 0 at its reset, 1 half way; the two phases' weights sum to 1. */
export const flowWeight = (progress: number): number => 1 - Math.abs(1 - 2 * progress);

export interface FlowPhases {
	progressA: number;
	progressB: number;
	weightA: number;
	weightB: number;
}

/** Both phases at time `t`. */
export function flowPhases(t: number, cycle = FLOW_CYCLE): FlowPhases {
	const progressA = flowProgress(t, 0, cycle);
	const progressB = flowProgress(t, 0.5, cycle);
	return {
		progressA,
		progressB,
		weightA: flowWeight(progressA),
		weightB: flowWeight(progressB)
	};
}

/** Metres the sample position is moved back at a progress, so the pattern moves forward along the flow. */
export const flowShift = (progress: number, speed = FLOW_SPEED, cycle = FLOW_CYCLE): number =>
	progress * speed * cycle;

export type Vec2 = readonly [number, number];

/**
 * Flow of a river at a point as a vector of length at most 1 in the tangent plane: along the river's
 * level set (perpendicular to `riverGradient`, the gradient of the river field) and signed toward lower
 * ground (`elevationGradient` is the gradient of the ground's elevation: the flow has a non-negative
 * component against it). Where the course runs along a contour the sign is ambiguous and the flow
 * shrinks smoothly to 0 instead of flipping. `(0, 0)` where the river field is flat.
 */
export function flowVector(riverGradient: Vec2, elevationGradient: Vec2): [number, number] {
	const gl = Math.hypot(riverGradient[0], riverGradient[1]);
	if (gl < 1e-12) return [0, 0];
	const tx = -riverGradient[1] / gl;
	const ty = riverGradient[0] / gl;
	const downhill = -(tx * elevationGradient[0] + ty * elevationGradient[1]);
	const el = Math.hypot(elevationGradient[0], elevationGradient[1]);
	// the share of the elevation gradient along the course, softly signed
	const along = downhill / Math.sqrt(downhill * downhill + (0.35 * el) ** 2 + 1e-30);
	return [tx * along, ty * along];
}

/** Unit direction of a flow vector, or `[0, 0]` for no flow. */
export function flowDirection(flow: Vec2): [number, number] {
	const l = Math.hypot(flow[0], flow[1]);
	return l < 1e-9 ? [0, 0] : [flow[0] / l, flow[1] / l];
}

/** Position the ripple pattern is sampled at for one phase: `p` moved back along the flow. */
export function flowSample(
	p: Vec2,
	flow: Vec2,
	progress: number,
	speed = FLOW_SPEED
): [number, number] {
	const shift = flowShift(progress, speed);
	return [p[0] - flow[0] * shift, p[1] - flow[1] * shift];
}
