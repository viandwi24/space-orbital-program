/**
 * Moving parts of a model driven by a module snapshot (ADR 0045): the engine bell follows the
 * thrust vector, a control surface turns about its span. Pure maths so it can be tested without a GPU.
 */

export type ArticulationMode = 'gimbal' | 'hinge';

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
	if (mode === 'hinge') return { x: finite(value) ? value : 0, y: 0, z: 0 };
	if (Array.isArray(value) && finite(value[0]) && finite(value[1])) {
		return { x: value[1], y: 0, z: 0 - value[0] };
	}
	return { x: 0, y: 0, z: 0 };
}

/** Reads the field the spec names from a part's module snapshots. */
export function articulationValue(
	spec: ArticulationSpec,
	modules: Readonly<Record<string, unknown>>
): unknown {
	return (modules[spec.module] as Record<string, unknown> | undefined)?.[spec.field];
}
