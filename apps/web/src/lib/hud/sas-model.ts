/**
 * Stability assist HUD logic (plan 042, ADR 0049): which buttons exist, how they look given the
 * snapshot's `sas`, what key does what, and which command a press sends. Pure and DOM-free; the
 * flight loop owns the key listener and `SasButtons.svelte` only draws what this returns.
 */
import type { Command, EntityId, SasMode, SasReference, SasSnapshot } from '@orbital/core';
import type { SpeedMode } from '../speed';

export type SasGlyph = 'hold' | MarkerGlyph;
export type MarkerGlyph =
	'prograde' | 'retrograde' | 'normal' | 'anti-normal' | 'radial-out' | 'radial-in' | 'maneuver';

export interface SasButtonSpec {
	mode: Exclude<SasMode, 'off'>;
	label: string;
	glyph: SasGlyph;
	/** `KeyboardEvent.code` of the shortcut. */
	code: string;
	/** Shown in the tooltip. */
	key: string;
}

/** Left to right in the strip: hold, then the navball markers in the order the ball draws them. */
export const SAS_BUTTONS: readonly SasButtonSpec[] = [
	{ mode: 'hold', label: 'Hold', glyph: 'hold', code: 'Digit1', key: '1' },
	{ mode: 'prograde', label: 'Prograde', glyph: 'prograde', code: 'Digit2', key: '2' },
	{ mode: 'retrograde', label: 'Retrograde', glyph: 'retrograde', code: 'Digit3', key: '3' },
	{ mode: 'normal', label: 'Normal', glyph: 'normal', code: 'Digit4', key: '4' },
	{ mode: 'antinormal', label: 'Antinormal', glyph: 'anti-normal', code: 'Digit5', key: '5' },
	{ mode: 'radial-out', label: 'Radial out', glyph: 'radial-out', code: 'Digit6', key: '6' },
	{ mode: 'radial-in', label: 'Radial in', glyph: 'radial-in', code: 'Digit7', key: '7' },
	{ mode: 'maneuver', label: 'Maneuver node', glyph: 'maneuver', code: 'Digit8', key: '8' }
];

/** The key that switches SAS on (to `hold`) and off. */
export const SAS_TOGGLE_CODE = 'KeyT';

export interface SasButtonState extends SasButtonSpec {
	active: boolean;
	disabled: boolean;
	title: string;
}

/** Mode after the toggle key: off -> hold, anything else -> off. */
export const toggledMode = (current: SasMode): SasMode => (current === 'off' ? 'hold' : 'off');

/** Mode a key asks for given the current one, or null when the key is not a SAS key. */
export function modeForKey(code: string, current: SasMode): SasMode | null {
	if (code === SAS_TOGGLE_CODE) return toggledMode(current);
	return SAS_BUTTONS.find((b) => b.code === code)?.mode ?? null;
}

/**
 * Button states for a vessel. `controllable` is false for a vessel without a control source (the
 * sim would refuse); `sas` is undefined before the first snapshot; the maneuver button needs a
 * node (`hasNode`) unless it is the active mode.
 */
export function buttonStates(
	sas: SasSnapshot | undefined,
	controllable: boolean,
	hasNode = false
): SasButtonState[] {
	return SAS_BUTTONS.map((b) => {
		const noNode = b.mode === 'maneuver' && !hasNode && sas?.mode !== 'maneuver';
		return {
			...b,
			active: sas?.mode === b.mode,
			disabled: !controllable || noNode,
			title: !controllable
				? `${b.label}: no command part`
				: noNode
					? `${b.label}: no maneuver node planned`
					: `${b.label} (${b.key})`
		};
	});
}

/** Label of the master switch. */
export const masterLabel = (sas: SasSnapshot | undefined): string =>
	sas && sas.mode !== 'off' ? 'SAS on' : 'SAS off';

/** What prograde and retrograde follow, from the speed readout's mode (the navball marker's). */
export const referenceFor = (speed: SpeedMode): SasReference => speed;

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
	if (!current || current.mode === 'off' || current.mode === 'hold' || current.mode === 'maneuver')
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
