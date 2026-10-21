/**
 * What a key of the Hangar's Move and Rotate tools does (plan 279, ADR 0258 point 3). Pure, so the
 * keys are unit-tested without a DOM; the controller applies the result to the selected part.
 */
import type { ActionId } from '../keybindings';

export type ToolAxis = 'x' | 'y' | 'z';

/** Steps of the Move tool, m: the grid and the fine grid (Shift). */
export const MOVE_STEP = 0.1;
export const MOVE_FINE = 0.01;
/** Steps of the Rotate tool, rad: 15 degrees, 5 with Shift. */
export const ROTATE_STEP = (15 * Math.PI) / 180;
export const ROTATE_FINE = (5 * Math.PI) / 180;

export type ToolKeyEffect =
	| { kind: 'nudge'; delta: [number, number, number] }
	| { kind: 'turn'; axis: ToolAxis; angle: number }
	| { kind: 'frame' }
	| { kind: 'reset' };

/** Move: W/S along Y, A/D along X, Q/E along Z (the default keys). */
const MOVES: Partial<Record<ActionId, [ToolAxis, 1 | -1]>> = {
	toolUp: ['y', 1],
	toolDown: ['y', -1],
	toolLeft: ['x', -1],
	toolRight: ['x', 1],
	toolFore: ['z', 1],
	toolAft: ['z', -1]
};
/** Rotate: about the axis across the move, as a carried part turns: W/S pitch (X), A/D roll (Z), Q/E yaw (Y). */
const TURNS: Partial<Record<ActionId, [ToolAxis, 1 | -1]>> = {
	toolUp: ['x', 1],
	toolDown: ['x', -1],
	toolLeft: ['z', 1],
	toolRight: ['z', -1],
	toolFore: ['y', 1],
	toolAft: ['y', -1]
};

/** The effect of tool key `action` in `tool`, with Shift (`fine`) held; null for a key the tool does not use. */
export function toolKeyEffect(
	action: ActionId,
	tool: 'move' | 'rotate',
	fine: boolean
): ToolKeyEffect | null {
	if (action === 'toolFrame') return { kind: 'frame' };
	if (action === 'toolReset') return { kind: 'reset' };
	if (tool === 'move') {
		const m = MOVES[action];
		if (!m) return null;
		const step = (fine ? MOVE_FINE : MOVE_STEP) * m[1];
		return {
			kind: 'nudge',
			delta: [m[0] === 'x' ? step : 0, m[0] === 'y' ? step : 0, m[0] === 'z' ? step : 0]
		};
	}
	const t = TURNS[action];
	if (!t) return null;
	return { kind: 'turn', axis: t[0], angle: (fine ? ROTATE_FINE : ROTATE_STEP) * t[1] };
}

/** A drag value snapped to `step` (Alt: no snap). */
export const snapTo = (v: number, step: number, free: boolean): number =>
	free ? v : Math.round(v / step) * step;
