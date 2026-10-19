import { defaultDock } from '../dock/dock-model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	SETTINGS_KEY,
	defaultSettings,
	loadSettings,
	parseSettings,
	saveSettings,
	serialiseSettings
} from './settings';

afterEach(() => vi.unstubAllGlobals());

const stubStorage = (initial: Record<string, string> = {}) => {
	const data = new Map(Object.entries(initial));
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => void data.set(k, v),
		removeItem: (k: string) => void data.delete(k)
	});
	return data;
};

describe('settings parsing', () => {
	it('round trips', () => {
		const s = {
			v: 4 as const,
			units: 'imperial' as const,
			tutorial: { status: 'active' as const, step: 3 },
			bindings: { stage: ['KeyF'], help: ['F1'] },
			audio: { master: 0.4, effects: 0.5, ui: 0.1, music: 0.6, muted: true },
			touch: 'on' as const,
			interface: { scale: 1.25, highContrast: true, centreVessel: true },
			dock: { panels: ['host.orbit', 'sample.beacon'], open: 'sample.beacon' },
			debug: true,
			time: { places: { Hangar: false }, keepRunningHidden: true, askLeaveFlight: false },
			keyProfile: 'classic' as const,
			keyNotice: true
		};
		expect(parseSettings(serialiseSettings(s))).toEqual(s);
	});
	it('gives the defaults for nothing, text that is not JSON, other JSON and a wrong version', () => {
		const d = defaultSettings();
		expect(parseSettings(null)).toEqual(d);
		expect(parseSettings('{not json')).toEqual(d);
		expect(parseSettings('[1,2]')).toEqual(d);
		expect(parseSettings('"metric"')).toEqual(d);
		expect(parseSettings(JSON.stringify({ v: 5, units: 'imperial' }))).toEqual(d);
		expect(parseSettings(JSON.stringify({ units: 'imperial' }))).toEqual(d);
	});
	it('migrates format 1: units and tutorial kept, the new fields at their defaults', () => {
		const v1 = JSON.stringify({ v: 1, units: 'imperial', tutorial: { status: 'done', step: 5 } });
		expect(parseSettings(v1)).toEqual({
			...defaultSettings(),
			units: 'imperial',
			tutorial: { status: 'done', step: 5 }
		});
		// an invalid field in an old value is repaired like in the new one
		expect(parseSettings(JSON.stringify({ v: 1, units: 'x', tutorial: 3 })).tutorial).toEqual({
			status: 'pending',
			step: 0
		});
	});
	it('migrates format 2: every field kept, the interface at its defaults', () => {
		const v2 = {
			v: 2,
			units: 'imperial',
			tutorial: { status: 'done', step: 5 },
			bindings: { map: ['KeyB'] },
			audio: { master: 0.4, effects: 0.5, ui: 0.1, muted: true },
			touch: 'off'
		};
		expect(parseSettings(JSON.stringify(v2))).toEqual({
			...v2,
			// no music volume in format 2: the quiet default (plan 227)
			audio: { ...v2.audio, music: 0.25 },
			v: 4,
			interface: { scale: 1, highContrast: false, centreVessel: false },
			dock: defaultDock(),
			debug: false,
			time: { places: {}, keepRunningHidden: false, askLeaveFlight: true },
			// it has overrides: the classic profile, and the notice offers KSP (plan 216)
			keyProfile: 'classic',
			keyNotice: true
		});
	});
	it('format 3 migrates to 4 (plan 216): overrides keep classic, nothing changed gets ksp', () => {
		const { keyProfile: _p, keyNotice: _n, ...rest } = defaultSettings();
		const v3 = { ...rest, v: 3 };
		const changed = parseSettings(JSON.stringify({ ...v3, bindings: { stage: ['KeyF'] } }));
		expect(changed.v).toBe(4);
		expect(changed.keyProfile).toBe('classic');
		expect(changed.bindings).toEqual({ stage: ['KeyF'] });
		expect(changed.keyNotice).toBe(true);
		const plain = parseSettings(JSON.stringify(v3));
		expect(plain.keyProfile).toBe('ksp');
		expect(plain.keyNotice).toBe(true);
		// a new player has nothing to be told
		expect(defaultSettings().keyNotice).toBe(false);
		expect(plain.bindings).toEqual({});
	});
	it('a format 3 value without a dock, or with a damaged one, takes the default dock (plan 112)', () => {
		const { dock: _dock, ...old } = defaultSettings();
		expect(parseSettings(JSON.stringify({ ...old, units: 'imperial' }))).toEqual({
			...defaultSettings(),
			units: 'imperial'
		});
		expect(
			parseSettings(JSON.stringify({ ...defaultSettings(), dock: { panels: 'x' } })).dock
		).toEqual(defaultDock());
	});
	it('repairs the interface: scale outside 80 to 150 % is the default, a value between steps snaps', () => {
		const at = (iface: unknown) =>
			parseSettings(JSON.stringify({ ...defaultSettings(), interface: iface })).interface;
		expect(at({ scale: 3, highContrast: true })).toEqual({
			scale: 1,
			highContrast: true,
			centreVessel: false
		});
		expect(at({ scale: 0.5, highContrast: 'yes' })).toEqual({
			scale: 1,
			highContrast: false,
			centreVessel: false
		});
		expect(at({ scale: 1.2, highContrast: false }).scale).toBe(1.25);
		expect(at(null)).toEqual({ scale: 1, highContrast: false, centreVessel: false });
		expect(at({ scale: 1, centreVessel: true }).centreVessel).toBe(true);
	});
	it('repairs bad audio, touch and bindings without losing the good fields', () => {
		const s = parseSettings(
			JSON.stringify({
				v: 2,
				units: 'imperial',
				audio: { master: 7, effects: 'loud', ui: 0.25, muted: 'yes' },
				touch: 'sometimes',
				bindings: { stage: ['KeyZ'], map: ['KeyB'], nope: ['KeyQ'], warpUp: ['Escape'] }
			})
		);
		expect(s.units).toBe('imperial');
		expect(s.audio).toEqual({ master: 0.7, effects: 0.8, ui: 0.25, music: 0.25, muted: false });
		expect(s.touch).toBe('auto');
		// stage clashes with Z (full throttle) and is dropped; map is fine; the rest is unknown or reserved
		expect(s.bindings).toEqual({ map: ['KeyB'] });
		expect(parseSettings(JSON.stringify({ v: 2, bindings: [1, 2], audio: null })).audio).toEqual(
			defaultSettings().audio
		);
	});
	it('keeps the valid fields and repairs the invalid ones; unknown keys are dropped', () => {
		const text = JSON.stringify({
			v: 2,
			units: 'furlongs',
			tutorial: { status: 'done', step: -4 },
			extra: 'x'
		});
		const s = parseSettings(text);
		expect(s).toEqual({
			...defaultSettings(),
			tutorial: { status: 'done', step: 0 },
			// an old value: the key profile notice shows once (plan 216)
			keyNotice: true
		});
		expect('extra' in s).toBe(false);
	});
});

describe('settings storage', () => {
	it('loads what was saved', () => {
		const data = stubStorage();
		saveSettings({
			...defaultSettings(),
			units: 'imperial',
			tutorial: { status: 'skipped', step: 2 }
		});
		expect(data.has(SETTINGS_KEY)).toBe(true);
		expect(loadSettings().units).toBe('imperial');
		expect(loadSettings().tutorial.status).toBe('skipped');
	});
	it('does not throw when storage fails', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('quota');
			}
		});
		expect(loadSettings()).toEqual(defaultSettings());
		expect(() => saveSettings(defaultSettings())).not.toThrow();
	});
});
