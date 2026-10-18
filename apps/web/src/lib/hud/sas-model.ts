/**
 * Stability assist HUD logic (plan 042, ADR 0049): which buttons exist, how they look given the
 * snapshot's `sas`, what key does what, and which command a press sends. Pure and DOM-free; the
 * flight loop owns the key listener and `SasButtons.svelte` only draws what this returns.
 */
import type { Command, EntityId, SasMode, SasReference, SasSnapshot } from '@orbital/core';
import type { SpeedMode } from '../speed';
import { DEFAULT_KEYMAP, type ActionId, type Keymap } from '../keybindings';

export type SasGlyph = 'hold' | MarkerGlyph;
export type MarkerGlyph =
	| 'prograde'
	| 'retrograde'
	| 'normal'
	| 'anti-normal'
	| 'radial-out'
	| 'radial-in'
	| 'maneuver'
	| 'target'
	| 'anti-target';

export interface SasButtonSpec {
	mode: Exclude<SasMode, 'off'>;
	label: string;
	glyph: SasGlyph;
	/** The key action that asks for this mode (`keybindings.ts`, ADR 0061). */
	action: ActionId;
}

/** Left to right in the strip: hold, then the navball markers in the order the ball draws them. */
export const SAS_BUTTONS: readonly SasButtonSpec[] = [
	{ mode: 'hold', label: 'Hold', glyph: 'hold', action: 'sasHold' },
	{ mode: 'prograde', label: 'Prograde', glyph: 'prograde', action: 'sasPrograde' },
	{ mode: 'retrograde', label: 'Retrograde', glyph: 'retrograde', action: 'sasRetrograde' },
	{ mode: 'normal', label: 'Normal', glyph: 'normal', action: 'sasNormal' },
	{ mode: 'antinormal', label: 'Antinormal', glyph: 'anti-normal', action: 'sasAntinormal' },
	{ mode: 'radial-out', label: 'Radial out', glyph: 'radial-out', action: 'sasRadialOut' },
	{ mode: 'radial-in', label: 'Radial in', glyph: 'radial-in', action: 'sasRadialIn' },
	{ mode: 'maneuver', label: 'Maneuver node', glyph: 'maneuver', action: 'sasManeuver' },
	{ mode: 'target', label: 'Target', glyph: 'target', action: 'sasTarget' },
	{ mode: 'anti-target', label: 'Anti-target', glyph: 'anti-target', action: 'sasAntiTarget' },
	// wings level, nose on the horizon (plan 063, ADR 0161 point 5)
	{ mode: 'level', label: 'Level wings', glyph: 'hold', action: 'sasLevel' }
];

export interface SasButtonState extends SasButtonSpec {
	active: boolean;
	disabled: boolean;
	title: string;
}

/** Mode after the toggle key: off -> hold, anything else -> off. */
export const toggledMode = (current: SasMode): SasMode => (current === 'off' ? 'hold' : 'off');

/** Mode a key action asks for given the current one, or null when the action is not a SAS one. */
export function modeForAction(action: ActionId | null, current: SasMode): SasMode | null {
	if (action === 'sasToggle') return toggledMode(current);
	return SAS_BUTTONS.find((b) => b.action === action)?.mode ?? null;
}

/**
 * Button states for a vessel. `controllable` is false for a vessel without a control source (the
 * sim would refuse); `sas` is undefined before the first snapshot; the maneuver button needs a
 * node (`hasNode`) and the two target buttons a target (`hasTarget`), unless it is the active mode.
 */
export function buttonStates(
	sas: SasSnapshot | undefined,
	controllable: boolean,
	hasNode = false,
	keymap: Keymap = DEFAULT_KEYMAP,
	hasTarget = false
): SasButtonState[] {
	return SAS_BUTTONS.map((b) => {
		const noNode = b.mode === 'maneuver' && !hasNode && sas?.mode !== 'maneuver';
		const aimsAtTarget = b.mode === 'target' || b.mode === 'anti-target';
		const noTarget = aimsAtTarget && !hasTarget && sas?.mode !== b.mode;
		return {
			...b,
			active: sas?.mode === b.mode,
			disabled: !controllable || noNode || noTarget,
			title: !controllable
				? `${b.label}: no command part`
				: noNode
					? `${b.label}: no maneuver node planned`
					: noTarget
						? `${b.label}: no target selected`
						: `${b.label} (${keymap.label(b.action)})`
		};
	});
}

/** Label of the master switch. */
export const masterLabel = (sas: SasSnapshot | undefined): string =>
	sas && sas.mode !== 'off' ? 'SAS on' : 'SAS off';

/** What prograde and retrograde follow, from the speed readout's mode (the navball marker's). */
/** The `target` speed reference has no SAS counterpart: prograde and retrograde stay on the orbit. */
export const referenceFor = (speed: SpeedMode): SasReference =>
	speed === 'target' ? 'orbit' : speed;

/** The command a button or key press sends. Pressing the active mode returns to `hold`. */
export function commandForMode(
	vessel: EntityId,
	mode: SasMode,
	current: SasSnapshot | undefined,
	speed: SpeedMode
): Command {
	const next = mode === current?.mode && mode !== 'hold' && mode !== 'off' ? 'hold' : mode;
	return { type: 'sas', vessel, mode: next, reference: referenceFor(speed) };
}

/**
 * When the HUD's speed reference changes while a pointing mode is on, the same mode must follow
 * it so the button keeps pointing at the marker it names. Null when nothing needs sending.
 */
export function referenceFollowUp(
	vessel: EntityId,
	current: SasSnapshot | undefined,
	speed: SpeedMode
): Command | null {
	// The modes that aim at a node or a target do not depend on the speed reference.
	if (
		!current ||
		current.mode === 'off' ||
		current.mode === 'hold' ||
		current.mode === 'maneuver' ||
		current.mode === 'target' ||
		current.mode === 'anti-target'
	)
		return null;
	const reference = referenceFor(speed);
	return current.reference === reference ? null : { type: 'sas', vessel, reference };
}

/** Pointing error text for the strip, "0.4°"; empty when SAS is off or holding. */
export function errorText(sas: SasSnapshot | undefined): string {
	if (!sas || sas.mode === 'off') return '';
	const deg = (sas.error * 180) / Math.PI;
	return deg < 0.05 ? '0.0°' : `${deg.toFixed(deg < 10 ? 1 : 0)}°`;
}
