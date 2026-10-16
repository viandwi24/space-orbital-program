/**
 * Maneuver node helpers for the page (plan 045, ADR 0056): burn time from the stage model, the
 * burn indicator's state, the handle-drag to delta-v mapping and picking a time on the drawn path.
 * Pure and DOM-free; the controller (`maneuver-controller.ts`) owns the state and the commands.
 */
import type { StageDeltaV } from './delta-v';

/** Axes of the orbital frame a handle changes. */
export type NodeAxis = 'prograde' | 'normal' | 'radial';

export interface HandleSpec {
	kind: 'prograde' | 'retrograde' | 'normal' | 'anti-normal' | 'radial-out' | 'radial-in';
	axis: NodeAxis;
	/** +1 adds to the component, -1 subtracts (retrograde, antinormal, radial in). */
	sign: 1 | -1;
	label: string;
}

/** The six handles of a node, in the order the layer draws them. */
export const HANDLES: readonly HandleSpec[] = [
	{ kind: 'prograde', axis: 'prograde', sign: 1, label: 'Prograde' },
	{ kind: 'retrograde', axis: 'prograde', sign: -1, label: 'Retrograde' },
	{ kind: 'normal', axis: 'normal', sign: 1, label: 'Normal' },
	{ kind: 'anti-normal', axis: 'normal', sign: -1, label: 'Antinormal' },
	{ kind: 'radial-out', axis: 'radial', sign: 1, label: 'Radial out' },
	{ kind: 'radial-in', axis: 'radial', sign: -1, label: 'Radial in' }
];

export interface Modifiers {
	shift?: boolean;
	alt?: boolean;
}

/** Fine/coarse factor: Shift is ten times coarser, Alt ten times finer. */
export const modifierScale = (m: Modifiers): number => (m.shift ? 10 : 1) * (m.alt ? 0.1 : 1);

/** Metres per second per pixel of drag at a given orbital speed: 1.9 m/s at 7.5 km/s, never finer than 0.05. */
export function dvPerPixel(speed: number): number {
	return Math.max(0.05, Math.abs(speed) / 4000);
}

/**
 * Change of a node's component from a drag of the pointer by `(dx, dy)` pixels, for a handle
 * whose direction on the screen (from the node outwards) is the unit vector `screen`. Dragging
 * outward along a prograde handle adds prograde; dragging outward along the retrograde handle adds
 * retrograde, i.e. subtracts from the component.
 */
export function dvFromDrag(
	handle: HandleSpec,
	screen: { x: number; y: number },
	dx: number,
	dy: number,
	speed: number,
	modifiers: Modifiers = {}
): number {
	const along = dx * screen.x + dy * screen.y;
	return handle.sign * along * dvPerPixel(speed) * modifierScale(modifiers);
}

/** Step of the keyboard controls, m/s per press (Shift x10, Alt x0.1). */
export const KEY_STEP = 1;

/** Keys of the selected node: [axis, sign]. */
export const NODE_KEYS: Readonly<Record<string, readonly [NodeAxis, 1 | -1]>> = {
	KeyI: ['prograde', 1],
	KeyK: ['prograde', -1],
	KeyL: ['normal', 1],
	KeyJ: ['normal', -1],
	KeyO: ['radial', 1],
	KeyU: ['radial', -1]
};

export interface TimedPoint {
	x: number;
	y: number;
	/** Sim time at the point. */
	t: number;
}

/**
 * The point of the polyline `samples` (screen pixels, in order) nearest to the pointer: its sim time
 * and distance in pixels, or null when it is farther than `radius`. Interpolates along the nearest
 * segment so the time is finer than the sample spacing.
 */
export function pickTime(
	samples: readonly TimedPoint[],
	px: number,
	py: number,
	radius = 12
): { t: number; distance: number } | null {
	let best: { t: number; distance: number } | null = null;
	for (let i = 0; i + 1 < samples.length; i++) {
		const a = samples[i]!;
		const b = samples[i + 1]!;
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len2 = dx * dx + dy * dy;
		const u = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - a.x) * dx + (py - a.y) * dy) / len2));
		const distance = Math.hypot(a.x + u * dx - px, a.y + u * dy - py);
		// An orbit that loops lies over itself: within a pixel the earlier pass wins.
		if (distance <= radius && (best === null || distance < best.distance - 1)) {
			best = { t: a.t + u * (b.t - a.t), distance };
		}
	}
	return best;
}

type BurnStage = Pick<StageDeltaV, 'dvVacuum' | 'burnTime' | 'massStart' | 'massEnd'>;

/**
 * Full-throttle burn time for `dv` through the stages in order (Tsiolkovsky, constant mass flow):
 * a whole stage takes its `burnTime`, the stage the burn ends in takes
 * `m0 (1 - exp(-dv / ve)) / mdot` with `ve = dv_stage / ln(m0 / mf)`. `enough` is false when the
 * stages cannot deliver `dv`; `time` is then the time to burn them all.
 */
export function burnTime(
	dv: number,
	stages: readonly BurnStage[]
): { time: number; enough: boolean } {
	let left = Math.max(0, dv);
	let time = 0;
	for (const s of stages) {
		if (left <= 0) break;
		if (!(s.dvVacuum > 0) || !(s.burnTime > 0) || !(s.massStart > s.massEnd)) continue;
		if (left >= s.dvVacuum) {
			time += s.burnTime;
			left -= s.dvVacuum;
			continue;
		}
		const ve = s.dvVacuum / Math.log(s.massStart / s.massEnd);
		const flow = (s.massStart - s.massEnd) / s.burnTime;
		time += (s.massStart * (1 - Math.exp(-left / ve))) / flow;
		left = 0;
	}
	return { time, enough: left <= 1e-9 };
}

export type BurnState = 'ahead' | 'burn' | 'overdue';

export interface BurnIndicator {
	state: BurnState;
	/** Seconds until the node (negative once it has passed). */
	toNode: number;
	/** Seconds until the burn should start: half the burn time before the node (negative once it has). */
	toBurn: number;
	/** Sim times the centred burn starts and ends. */
	startsAt: number;
	endsAt: number;
}

/** Slack after the planned end during which the burn still counts as under way, s. */
const BURN_GRACE = 5;

/**
 * Where the player is relative to the burn: `ahead` (count down to the start), `burn` (inside the
 * centred window, or the node has not been burned off within a few seconds of its end) and
 * `overdue` (the window is over and delta-v remains).
 */
export function burnIndicator(
	now: number,
	nodeTime: number,
	burn: number,
	remaining: number
): BurnIndicator {
	const startsAt = nodeTime - burn / 2;
	const endsAt = nodeTime + burn / 2;
	let state: BurnState = 'ahead';
	if (now >= endsAt + BURN_GRACE && remaining > 0.5) state = 'overdue';
	else if (now >= startsAt) state = 'burn';
	return { state, toNode: nodeTime - now, toBurn: startsAt - now, startsAt, endsAt };
}

/** Lead before the burn the "warp to node" button stops at, s. */
export const WARP_LEAD = 30;
