import { describe, expect, it } from 'vitest';
import {
	KEY_PROFILES,
	chordIdOf,
	chordKey,
	switchProfile,
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
			// an action a later plan wires may have no key in a profile (plan 216)
			if (!('pending' in a)) expect(a.defaults.length).toBeGreaterThan(0);
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
		// actions a later plan wires are not listed until then (plan 216)
		for (const a of ACTIONS) if (!('pending' in a)) expect(shown.has(a.id), a.id).toBe(true);
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
		const r = rebind({}, 'stage', 'KeyF');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const map = createKeymap(r.bindings);
		expect(map.actionFor('flight', 'KeyF')).toBe('stage');
		expect(map.actionFor('flight', 'Space')).toBeNull();
		expect(map.label('stage')).toBe('F');
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
		// Backspace is Abort since plan 216 (ADR 0206)
		for (const k of ['Escape', 'ArrowUp', '+', '-', 'MetaLeft', '', 'Alt+Escape'])
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
		expect(repairBindings({ stage: ['KeyF'] })).toEqual({ stage: ['KeyF'] });
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
			stage: ['KeyF'],
			throttleFull: ['F6'],
			sasPrograde: ['F7'],
			warpUp: ['KeyB'],
			nodePrograde: ['KeyY'],
			detach: ['KeyR'],
			mute: ['F11']
		});
		expect(map.actionFor('flight', keyIdOf(ev('f', 'KeyF')))).toBe('stage');
		expect(map.actionFor('flight', 'F6')).toBe('throttleFull');
		expect(map.actionFor('flight', 'F7')).toBe('sasPrograde');
		expect(map.actionFor('flight', 'KeyB')).toBe('warpUp');
		// map keys have their own scope since plan 216: Y is still the flight target key
		expect(map.actionFor('map', 'KeyY')).toBe('nodePrograde');
		expect(map.actionFor('vab', 'KeyR')).toBe('detach');
		expect(map.actionFor('vab', 'KeyD')).toBeNull();
		expect(map.actionFor('flight', 'F11')).toBe('mute');
		expect(map.actionFor('vab', 'F11')).toBe('mute');
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

describe('key profiles and chords (plan 216, ADR 0206)', () => {
	const ksp = createKeymap({}, 'ksp');
	const classic = createKeymap({}, 'classic');

	it('in ksp: B brakes, Digit1 group 1, Alt+Digit2 prograde, Alt+KeyW trim pitch, Backspace abort', () => {
		expect(ksp.actionFor('flight', 'KeyB')).toBe('brakes');
		expect(ksp.actionFor('flight', 'Digit1')).toBe('customGroup1');
		expect(ksp.actionFor('flight', 'Alt+Digit2')).toBe('sasPrograde');
		expect(ksp.actionFor('flight', 'Alt+KeyW')).toBe('trimDown');
		expect(ksp.actionFor('flight', 'Backspace')).toBe('abort');
		expect(ksp.actionFor('flight', 'Ctrl+KeyM')).toBe('mute');
		expect(ksp.actionFor('flight', 'KeyN')).toBe('translateBack');
	});

	it('the camera keys are wired (plan 226): V is the camera mode in ksp, F2 and F10 in both', () => {
		expect(ksp.actionFor('flight', 'KeyV')).toBe('cameraMode');
		for (const k of [ksp, classic]) {
			expect(k.actionFor('flight', 'F2')).toBe('hideUi');
			expect(k.actionFor('flight', 'F10')).toBe('screenshot');
			expect(k.actionFor('flight', '`')).toBe('cameraReset');
		}
		for (const id of ['cameraMode', 'cameraReset', 'hideUi', 'screenshot'] as const)
			expect(actionSpec(id).pending).toBeUndefined();
	});

	it('in classic: C brakes and [ trims down', () => {
		expect(classic.actionFor('flight', 'KeyC')).toBe('brakes');
		expect(classic.actionFor('flight', '[')).toBe('trimDown');
		expect(classic.actionFor('flight', 'Digit2')).toBe('sasPrograde');
	});

	it('Alt+Digit1 and Digit1 do not clash, and neither profile has a clash', () => {
		for (const profile of KEY_PROFILES)
			expect(bindingClashes(resolveBindings({}, profile)), profile).toEqual([]);
		expect(findClash(resolveBindings({}, 'ksp'), 'customGroup1', 'Alt+Digit1')).toBe('sasHold');
		expect(findClash(resolveBindings({}, 'ksp'), 'sasHold', 'Digit1')).toBe('customGroup1');
		expect(rebind({}, 'stage', 'Alt+Digit1', 'classic').ok).toBe(true);
	});

	it('chord ids put Ctrl, Alt and Cmd in front of the code, and label them', () => {
		const e = (key: string, code: string, m: { ctrlKey?: boolean; altKey?: boolean } = {}) => ({
			key,
			code,
			...m
		});
		expect(chordIdOf(e('™', 'Digit2', { altKey: true }))).toBe('Alt+Digit2');
		expect(chordIdOf(e('m', 'KeyM', { ctrlKey: true }))).toBe('Ctrl+KeyM');
		expect(chordIdOf(e('2', 'Digit2'))).toBe('Digit2');
		expect(chordIdOf(e('Alt', 'AltRight', { altKey: true }))).toBe('AltLeft');
		expect(keyLabel('Alt+Digit2')).toBe('Alt+2');
		expect(keyLabel('Ctrl+KeyM')).toBe('Ctrl+M');
		expect(chordKey('Alt+KeyW')).toBe('KeyW');
	});

	it('switching profiles keeps the overrides that do not clash and lists the ones that do', () => {
		// classic player: stage on F, map on B (brakes take B in ksp)
		const mine = { stage: ['KeyF'], map: ['KeyB'] } as const;
		const plain = switchProfile(mine, 'ksp');
		expect(plain.clashes).toEqual(['map']);
		expect(plain.bindings).toEqual({ stage: ['KeyF'] });
		const kept = switchProfile(mine, 'ksp', ['map']);
		// brakes have no other key in ksp, so they keep B and the map goes back to M
		expect(createKeymap(kept.bindings, 'ksp').actionFor('flight', 'KeyB')).toBe('brakes');
		expect(bindingClashes(resolveBindings(kept.bindings, 'ksp'))).toEqual([]);
	});

	it('in ksp, R toggles RCS and H N J L I K translate (plan 211)', () => {
		expect(ksp.actionFor('flight', 'KeyR')).toBe('rcsToggle');
		expect(ksp.actionFor('flight', 'KeyH')).toBe('translateForward');
		expect(ksp.actionFor('flight', 'KeyN')).toBe('translateBack');
		expect(ksp.actionFor('flight', 'KeyJ')).toBe('translateLeft');
		expect(ksp.actionFor('flight', 'KeyL')).toBe('translateRight');
		expect(ksp.actionFor('flight', 'KeyI')).toBe('translateDown');
		expect(ksp.actionFor('flight', 'KeyK')).toBe('translateUp');
		expect(ksp.actionFor('flight', 'CapsLock')).toBe('precision');
		// the node keys stay on I K J L in the map
		expect(ksp.actionFor('map', 'KeyI')).toBe('nodePrograde');
	});
});
