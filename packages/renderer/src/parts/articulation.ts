/**
 * Moving parts of a model driven by a module snapshot (ADR 0045): the engine bell follows the
 * thrust vector, a control surface turns about its span. Pure maths so it can be tested without a GPU.
 */

export type ArticulationMode = 'gimbal' | 'hinge' | 'extend' | 'visible' | 'spin' | 'slide';

export interface ArticulationSpec {
	module: string;
	field: string;
	mode: ArticulationMode;
}

export interface EulerXYZ {
	x: number;
	y: number;
	z: number;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Rotation (Euler XYZ, rad) of the moving group for a snapshot value. `gimbal`: `[towardX,
 * towardZ]` thrust tilt, so the group turns about Z by `-towardX` and about X by `towardZ` (the
 * +Y axis ends up along `(sin ax, cos, sin az)` for small angles). `hinge`: one angle about X. A
 * missing or malformed value is the rest pose.
 */
export function articulationRotation(mode: ArticulationMode, value: unknown): EulerXYZ {
	if (mode === 'extend' || mode === 'visible' || mode === 'slide') return { x: 0, y: 0, z: 0 };
	if (mode === 'hinge') return { x: finite(value) ? value : 0, y: 0, z: 0 };
	if (mode === 'spin') return { x: 0, y: finite(value) ? value : 0, z: 0 };
	if (Array.isArray(value) && finite(value[0]) && finite(value[1])) {
		return { x: value[1], y: 0, z: 0 - value[0] };
	}
	return { x: 0, y: 0, z: 0 };
}

/**
 * Y scale of the moving group: `extend` stretches a piece built 1 m long to the snapshot's length
 * in m (plan 210, a launch clamp's tower; at least 1 cm), every other mode keeps it at 1.
 */
export function articulationScale(mode: ArticulationMode, value: unknown): number {
	if (mode !== 'extend') return 1;
	return finite(value) ? Math.max(0.01, value) : 0.01;
}

/** How far the moving group slides up Y, m: `slide` by the snapshot's length (plan 306), else 0. */
export function articulationLift(mode: ArticulationMode, value: unknown): number {
	return mode === 'slide' && finite(value) ? value : 0;
}

/** Reads the field the spec names from a part's module snapshots. */
export function articulationValue(
	spec: ArticulationSpec,
	modules: Readonly<Record<string, unknown>>
): unknown {
	return (modules[spec.module] as Record<string, unknown> | undefined)?.[spec.field];
}
