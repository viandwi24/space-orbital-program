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
			v: 1 as const,
			units: 'imperial' as const,
			tutorial: { status: 'active' as const, step: 3 }
		};
		expect(parseSettings(serialiseSettings(s))).toEqual(s);
	});
	it('gives the defaults for nothing, text that is not JSON, other JSON and a wrong version', () => {
		const d = defaultSettings();
		expect(parseSettings(null)).toEqual(d);
		expect(parseSettings('{not json')).toEqual(d);
		expect(parseSettings('[1,2]')).toEqual(d);
		expect(parseSettings('"metric"')).toEqual(d);
		expect(parseSettings(JSON.stringify({ v: 2, units: 'imperial' }))).toEqual(d);
	});
	it('keeps the valid fields and repairs the invalid ones; unknown keys are dropped', () => {
		const text = JSON.stringify({
			v: 1,
			units: 'furlongs',
			tutorial: { status: 'done', step: -4 },
			extra: 'x'
		});
		const s = parseSettings(text);
		expect(s).toEqual({ v: 1, units: 'metric', tutorial: { status: 'done', step: 0 } });
		expect('extra' in s).toBe(false);
	});
});

describe('settings storage', () => {
	it('loads what was saved', () => {
		const data = stubStorage();
		saveSettings({ v: 1, units: 'imperial', tutorial: { status: 'skipped', step: 2 } });
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
