/** Plan 343, ADR 0292 point 6: mod keybindings, mod notices and the panel input's world query. */
import { describe, expect, it } from 'vitest';
import { entityId, type KeybindingDefinition, type Snapshot } from '@orbital/core';
import { createKeymap } from './keybindings';
import { modKeyCommand, modKeyFor, modKeyRows, rebindModKey } from './mod-keys';
import { toastForSimEvent, type ToastContext } from './toasts';
import { panelInputOf } from './dock/panel-input';
import { parseSettings, serialiseSettings, defaultSettings } from './settings/settings';

const ping: KeybindingDefinition = { id: 'ex.ping', label: 'Ping', defaults: ['KeyO'] };
const gear: KeybindingDefinition = {
	id: 'ex.gear',
	label: 'Gear',
	defaults: ['KeyG'], // the game's own gear key in both profiles
	command: (input) =>
		input.vessel ? { type: 'action-group', vessel: input.vessel.id, group: 'stock.gear' } : null
};
const keymap = createKeymap({}, 'ksp');

describe('mod keybindings', () => {
	it('resolve with overrides; a key the game uses is a clash and does nothing', () => {
		const rows = modKeyRows([ping, gear], {}, keymap);
		expect(rows.map((r) => [r.def.id, r.keys, r.clashes])).toEqual([
			['ex.ping', ['KeyO'], []],
			['ex.gear', ['KeyG'], ['KeyG']]
		]);
		expect(modKeyFor(rows, 'flight', 'KeyO')?.id).toBe('ex.ping');
		expect(modKeyFor(rows, 'flight', 'KeyG')).toBeNull();
		expect(modKeyFor(rows, 'map', 'KeyO')).toBeNull();
		const moved = rebindModKey({}, gear, ['Alt+KeyJ']);
		const after = modKeyRows([ping, gear], moved, keymap);
		expect(modKeyFor(after, 'flight', 'Alt+KeyJ')?.id).toBe('ex.gear');
		// back to the defaults drops the override
		expect(rebindModKey(moved, gear, ['KeyG'])).toEqual({});
	});

	it('two mods on one key clash with each other', () => {
		const other = { ...ping, id: 'other.ping' };
		const rows = modKeyRows([ping, other], {}, keymap);
		expect(rows.every((r) => r.clashes.includes('KeyO'))).toBe(true);
	});

	it('a press sends the mod command, or mod-key for systems', () => {
		expect(modKeyCommand(ping, null, entityId(3))).toEqual({ type: 'mod-key', key: 'ex.ping', vessel: 3 });
		const snapshot = {
			t: 0,
			vessels: [{ id: entityId(3), mode: 'flight', soi: 'stock.home', position: { x: 1, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 }, parts: [] }],
			bodies: []
		} as unknown as Snapshot;
		const input = panelInputOf(snapshot, entityId(3), []);
		expect(modKeyCommand(gear, input, entityId(3))).toEqual({
			type: 'action-group',
			vessel: 3,
			group: 'stock.gear'
		});
		const broken = { ...ping, command: () => { throw new Error('boom'); } };
		expect(modKeyCommand(broken, input, null)).toBeNull();
		// the panel input carries the world query, but not as a cloned field
		expect(input.world?.vessels().map((v) => v.id)).toEqual([3]);
		expect(Object.keys(input)).not.toContain('world');
	});

	it('the overrides are saved with the settings', () => {
		const s = { ...defaultSettings(), modKeys: { 'ex.ping': ['KeyL'] } };
		expect(parseSettings(serialiseSettings(s)).modKeys).toEqual({ 'ex.ping': ['KeyL'] });
		const old = JSON.parse(serialiseSettings(defaultSettings()));
		delete old.modKeys;
		expect(parseSettings(JSON.stringify(old)).modKeys).toEqual({});
	});
});

describe('mod notices', () => {
	const ctx: ToastContext = {
		isActivePart: () => false,
		isActiveVessel: (v) => v === 1,
		partTitle: (d) => d,
		definitionOf: () => undefined
	};
	it('become toasts: world-wide, or only for the flown vessel', () => {
		expect(
			toastForSimEvent({ type: 'mod-notice', plugin: 'ex', text: 'Hello', tone: 'success', vessel: null }, ctx)
		).toEqual({ kind: 'success', title: 'Hello', key: 'mod:ex' });
		expect(
			toastForSimEvent({ type: 'mod-notice', plugin: 'ex', text: 'Hi', tone: 'info', detail: 'more', vessel: 2 }, ctx)
		).toBeNull();
		expect(toastForSimEvent({ type: 'mod-focus', plugin: 'ex', vessel: 1 }, ctx)).toBeNull();
	});
});
