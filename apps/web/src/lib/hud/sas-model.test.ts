import { createKeymap } from '../keybindings';
import { describe, expect, it } from 'vitest';
import { entityId, type SasSnapshot } from '@orbital/core';
import {
	SAS_BUTTONS,
	buttonStates,
	commandForMode,
	errorText,
	masterLabel,
	modeForAction,
	referenceFollowUp,
	toggledMode
} from './sas-model';

const id = entityId(3);
const sas = (
	mode: SasSnapshot['mode'],
	error = 0,
	reference: SasSnapshot['reference'] = 'surface'
): SasSnapshot => ({
	mode,
	reference,
	error
});

describe('buttons', () => {
	it('has one button per pointing mode plus hold, in the navball order, each with its own key', () => {
		expect(SAS_BUTTONS.map((b) => b.mode)).toEqual([
			'hold',
			'prograde',
			'retrograde',
			'normal',
			'antinormal',
			'radial-out',
			'radial-in',
			'maneuver'
		]);
		expect(new Set(SAS_BUTTONS.map((b) => b.action)).size).toBe(SAS_BUTTONS.length);
	});

	it('marks the active mode and enables everything for a controllable vessel', () => {
		const states = buttonStates(sas('retrograde'), true, true);
		expect(states.filter((b) => b.active).map((b) => b.mode)).toEqual(['retrograde']);
		expect(states.every((b) => !b.disabled)).toBe(true);
		expect(states[1]!.title).toBe('Prograde (2)');
	});

	it('disables every button without a command part and says why', () => {
		const states = buttonStates(sas('off'), false);
		expect(states.every((b) => b.disabled && b.title.endsWith('no command part'))).toBe(true);
		expect(states.some((b) => b.active)).toBe(false);
	});

	it('the maneuver button waits for a node, unless it is already the mode', () => {
		const without = buttonStates(sas('hold'), true, false).find((b) => b.mode === 'maneuver')!;
		expect(without.disabled).toBe(true);
		expect(without.title).toBe('Maneuver node: no maneuver node planned');
		expect(buttonStates(sas('hold'), true, true).find((b) => b.mode === 'maneuver')!.disabled).toBe(
			false
		);
		expect(
			buttonStates(sas('maneuver'), true, false).find((b) => b.mode === 'maneuver')!.disabled
		).toBe(false);
		expect(modeForAction('sasManeuver', 'off')).toBe('maneuver');
	});

	it('shows nothing active before the first snapshot', () => {
		expect(buttonStates(undefined, true).some((b) => b.active)).toBe(false);
		expect(masterLabel(undefined)).toBe('SAS off');
		expect(masterLabel(sas('hold'))).toBe('SAS on');
	});
});

describe('tooltips follow the key map', () => {
	it('names the key now bound to the mode', () => {
		const states = buttonStates(sas('hold'), true, true, createKeymap({ sasPrograde: ['KeyG'] }));
		expect(states[1]!.title).toBe('Prograde (G)');
		expect(states[2]!.title).toBe('Retrograde (3)');
	});
});

describe('keys', () => {
	it('T switches on to hold and off again', () => {
		expect(toggledMode('off')).toBe('hold');
		expect(toggledMode('prograde')).toBe('off');
		expect(modeForAction('sasToggle', 'off')).toBe('hold');
		expect(modeForAction('sasToggle', 'hold')).toBe('off');
	});

	it('the number keys pick a mode; other keys are not SAS keys', () => {
		expect(modeForAction('sasPrograde', 'off')).toBe('prograde');
		expect(modeForAction('sasRadialIn', 'hold')).toBe('radial-in');
		expect(modeForAction('pitchPlus', 'off')).toBeNull();
		expect(modeForAction(null, 'off')).toBeNull();
	});
});

describe('commands', () => {
	it('send the mode with the reference of the speed readout', () => {
		expect(commandForMode(id, 'prograde', sas('hold'), 'surface')).toEqual({
			type: 'sas',
			vessel: id,
			mode: 'prograde',
			reference: 'surface'
		});
		expect(commandForMode(id, 'prograde', undefined, 'orbit')).toMatchObject({
			reference: 'orbit'
		});
	});

	it('pressing the active pointing mode again falls back to hold, hold and off stay', () => {
		expect(commandForMode(id, 'prograde', sas('prograde'), 'orbit')).toMatchObject({
			mode: 'hold'
		});
		expect(commandForMode(id, 'hold', sas('hold'), 'orbit')).toMatchObject({ mode: 'hold' });
		expect(commandForMode(id, 'off', sas('off'), 'orbit')).toMatchObject({ mode: 'off' });
	});

	it('the reference follows the speed readout only while a pointing mode is on', () => {
		expect(referenceFollowUp(id, sas('prograde', 0, 'surface'), 'orbit')).toEqual({
			type: 'sas',
			vessel: id,
			reference: 'orbit'
		});
		expect(referenceFollowUp(id, sas('prograde', 0, 'orbit'), 'orbit')).toBeNull();
		expect(referenceFollowUp(id, sas('hold', 0, 'surface'), 'orbit')).toBeNull();
		expect(referenceFollowUp(id, sas('off'), 'orbit')).toBeNull();
		expect(referenceFollowUp(id, undefined, 'orbit')).toBeNull();
	});
});

describe('error text', () => {
	it('is empty when off, one decimal below ten degrees, whole degrees above', () => {
		expect(errorText(sas('off', 1))).toBe('');
		expect(errorText(undefined)).toBe('');
		expect(errorText(sas('hold', 0))).toBe('0.0°');
		expect(errorText(sas('hold', (4.26 * Math.PI) / 180))).toBe('4.3°');
		expect(errorText(sas('prograde', (37.6 * Math.PI) / 180))).toBe('38°');
	});
});
