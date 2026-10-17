import { describe, expect, it } from 'vitest';
import {
	ACTIONS,
	BINDING_GROUPS,
	DEFAULT_KEYMAP,
	RESERVED_KEYS,
	bindingClashes,
	createKeymap,
	findClash,
	helpKeys,
	keyIdOf,
	keyLabel,
	rebind,
	actionSpec,
	customGroupSlot,
	isActionId,
	repairBindings,
	resetBinding,
	resolveBindings,
	swapBindings,
	type ActionId
} from './keybindings';

const ev = (key: string, code: string) => ({ key, code });

describe('the default table', () => {
	it('has no clash in any scope (the map view counts as flight, mute counts everywhere)', () => {
		expect(bindingClashes(resolveBindings())).toEqual([]);
	});
	it('every action has a unique id, a label and at least one bindable key', () => {
		expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(ACTIONS.length);
		for (const a of ACTIONS) {
			expect(a.label.length).toBeGreaterThanOrEqual(3);
			expect(a.defaults.length).toBeGreaterThan(0);
			for (const k of a.defaults) expect(RESERVED_KEYS).not.toContain(k);
		}
	});
	it('covers the documented flight keys', () => {
		const all = ACTIONS.flatMap((a) => a.defaults);
		for (const key of [
			'Space',
			'KeyZ',
			'KeyX',
			'KeyT',
			'KeyM',
			'KeyV',
			',',
			'.',
			'F5',
			'F9',
			'?',
			'Tab'
		])
			expect(all).toContain(key);
	});
	it('detects a clash (the check catches what it guards)', () => {
		const table = { ...resolveBindings(), stage: ['KeyZ'] };
		expect(bindingClashes(table)).toHaveLength(1);
		expect(findClash(table, 'stage', 'KeyZ')).toBe('throttleFull');
	});
	it('every help row names real actions and the groups cover all of them', () => {
		const shown = new Set(BINDING_GROUPS.flatMap((g) => g.rows.flatMap((r) => r.actions)));
		for (const a of ACTIONS) expect(shown.has(a.id)).toBe(true);
	});
});

describe('key ids', () => {
	it('uses code for letters and digits, the character for punctuation, folds right modifiers', () => {
		expect(keyIdOf(ev('w', 'KeyW'))).toBe('KeyW');
		expect(keyIdOf(ev('W', 'KeyW'))).toBe('KeyW');
		expect(keyIdOf(ev('!', 'Digit1'))).toBe('!');
		expect(keyIdOf(ev('1', 'Digit1'))).toBe('Digit1');
		expect(keyIdOf(ev(',', 'Comma'))).toBe(',');
		expect(keyIdOf(ev('?', 'Slash'))).toBe('?');
		expect(keyIdOf(ev(' ', 'Space'))).toBe('Space');
		expect(keyIdOf(ev('Shift', 'ShiftRight'))).toBe('ShiftLeft');
		expect(keyIdOf(ev('Control', 'ControlRight'))).toBe('ControlLeft');
		expect(keyIdOf(ev('F5', 'F5'))).toBe('F5');
		expect(keyIdOf(ev('Dead', 'KeyE'))).toBe('KeyE');
	});
	it('labels key caps', () => {
		expect(keyLabel('KeyW')).toBe('W');
		expect(keyLabel('Digit7')).toBe('7');
		expect(keyLabel('ShiftLeft')).toBe('Shift');
		expect(keyLabel('Escape')).toBe('Esc');
		expect(keyLabel(',')).toBe(',');
		expect(keyLabel('F5')).toBe('F5');
	});
});

describe('rebinding', () => {
	it('rebinds to a free key and the resolver follows', () => {
		const r = rebind({}, 'stage', 'KeyG');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const map = createKeymap(r.bindings);
		expect(map.actionFor('flight', 'KeyG')).toBe('stage');
		expect(map.actionFor('flight', 'Space')).toBeNull();
		expect(map.label('stage')).toBe('G');
		// the default map is untouched
		expect(DEFAULT_KEYMAP.actionFor('flight', 'Space')).toBe('stage');
	});
	it('reports the action that has the key, changes nothing, and swap exchanges the keys', () => {
		const r = rebind({}, 'stage', 'KeyZ');
		expect(r).toEqual({ ok: false, reason: 'clash', with: 'throttleFull' });
		const swapped = createKeymap(swapBindings({}, 'stage', 'KeyZ'));
		expect(swapped.actionFor('flight', 'KeyZ')).toBe('stage');
		expect(swapped.actionFor('flight', 'Space')).toBe('throttleFull');
		expect(bindingClashes(resolveBindings(swapBindings({}, 'stage', 'KeyZ')))).toEqual([]);
	});
	it('scopes are separate: a VAB action may use a flight key, but not the mute key', () => {
		expect(rebind({}, 'detach', 'KeyZ').ok).toBe(true);
		expect(rebind({}, 'detach', 'KeyN')).toEqual({ ok: false, reason: 'clash', with: 'mute' });
		expect(rebind({}, 'mute', 'KeyF')).toEqual({ ok: false, reason: 'clash', with: 'frame' });
	});
	it('refuses reserved keys', () => {
		for (const k of ['Escape', 'Backspace', 'ArrowUp', '+', '-', 'MetaLeft', ''])
			expect(rebind({}, 'stage', k)).toEqual({ ok: false, reason: 'reserved' });
	});
	it('stores only real changes: rebinding to the default key clears the override', () => {
		const r = rebind({}, 'stage', 'Space');
		expect(r).toEqual({ ok: true, bindings: {} });
		// help has two default keys, one key is a change
		expect(rebind({}, 'help', 'F1')).toMatchObject({ ok: true, bindings: { help: ['F1'] } });
	});
	it('resets one action and all', () => {
		let b = swapBindings({}, 'stage', 'KeyZ');
		expect(rebind(b, 'map', 'KeyK').ok).toBe(false);
		const moved = rebind(b, 'map', 'KeyB');
		if (!moved.ok) throw new Error('KeyB is free');
		b = moved.bindings;
		expect(Object.keys(b).sort()).toEqual(['map', 'stage', 'throttleFull']);
		const one = resetBinding(b, 'map');
		expect(Object.keys(one).sort()).toEqual(['stage', 'throttleFull']);
		expect(createKeymap(resetBinding(one, 'stage')).actionFor('flight', 'KeyM')).toBe('map');
		expect(resolveBindings({})).toEqual(resolveBindings());
	});
});

describe('stored values are repaired (never leave the game without a key)', () => {
	it('keeps a good override', () => {
		expect(repairBindings({ stage: ['KeyG'] })).toEqual({ stage: ['KeyG'] });
	});
	it('drops unknown actions, empty lists, non-arrays, reserved and non-string keys', () => {
		expect(
			repairBindings({
				nope: ['KeyG'],
				stage: [],
				map: 'KeyG',
				warpUp: ['Escape'],
				warpDown: [3, null],
				frame: ['KeyB']
			})
		).toEqual({ frame: ['KeyB'] });
	});
	it('drops overrides that clash with another action, leaving defaults', () => {
		const fixed = repairBindings({ stage: ['KeyZ'], map: ['KeyZ'] });
		expect(bindingClashes(resolveBindings(fixed))).toEqual([]);
		for (const id of ['stage', 'map'] as ActionId[])
			expect(resolveBindings(fixed)[id].length).toBeGreaterThan(0);
	});
	it('drops an override that clashes with the default of an action nobody changed', () => {
		expect(repairBindings({ stage: ['KeyT'] })).toEqual({});
	});
});

describe('help rows', () => {
	it('show the keys in force, and a SAS range only while the digits are consecutive', () => {
		const sas = BINDING_GROUPS.find((g) => g.id === 'sas')!.rows[1]!;
		expect(helpKeys(sas, DEFAULT_KEYMAP)).toEqual({ caps: ['1', '7'], joiner: '–' });
		const moved = createKeymap({ sasPrograde: ['KeyG'] });
		const shown = helpKeys(sas, moved);
		expect(shown.joiner).toBe('/');
		expect(shown.caps).toContain('G');
		const fly = BINDING_GROUPS[0]!.rows[0]!;
		expect(helpKeys(fly, DEFAULT_KEYMAP).caps).toEqual(['Shift', 'Ctrl']);
	});
});

describe('the handlers resolve through the table', () => {
	it('flight, map and VAB actions follow a rebound table', () => {
		const map = createKeymap({
			stage: ['KeyG'],
			throttleFull: ['KeyH'],
			sasPrograde: ['KeyP'],
			warpUp: ['KeyB'],
			nodePrograde: ['KeyY'],
			detach: ['KeyR'],
			mute: ['F10']
		});
		expect(map.actionFor('flight', keyIdOf(ev('g', 'KeyG')))).toBe('stage');
		expect(map.actionFor('flight', 'KeyH')).toBe('throttleFull');
		expect(map.actionFor('flight', 'KeyP')).toBe('sasPrograde');
		expect(map.actionFor('flight', 'KeyB')).toBe('warpUp');
		expect(map.actionFor('flight', 'KeyY')).toBe('nodePrograde');
		expect(map.actionFor('vab', 'KeyR')).toBe('detach');
		expect(map.actionFor('vab', 'KeyD')).toBeNull();
		expect(map.actionFor('flight', 'F10')).toBe('mute');
		expect(map.actionFor('vab', 'F10')).toBe('mute');
	});
});

describe('custom action group keys (plan 110)', () => {
	it('ten custom group actions exist on the number pad, and bind without clashes', () => {
		const ids = Array.from({ length: 10 }, (_, i) => `customGroup${i + 1}`);
		for (const id of ids) {
			expect(isActionId(id)).toBe(true);
			const n = Number(id.slice('customGroup'.length));
			expect(actionSpec(id as ActionId).defaults).toEqual([`Numpad${n % 10}`]);
			expect(customGroupSlot(id)).toBe(Number(id.slice('customGroup'.length)));
		}
		expect(bindingClashes(resolveBindings())).toEqual([]);
		const r = rebind({}, 'customGroup2' as ActionId, 'KeyB');
		expect(r.ok).toBe(true);
		expect(customGroupSlot('stage')).toBeUndefined();
	});
});
