import { describe, expect, it } from 'bun:test';
import { FEATURE_NAMES, FEATURE_SWITCHES, FeatureSwitches } from '../src/feature-switches.ts';
import {
	GRAPHICS_PRESETS,
	PRESETS,
	type GraphicsPreset,
	type PresetSettings
} from '../src/presets.ts';

const clone = (): Record<GraphicsPreset, PresetSettings> =>
	Object.fromEntries(GRAPHICS_PRESETS.map((p) => [p, { ...PRESETS[p] }])) as Record<
		GraphicsPreset,
		PresetSettings
	>;

describe('feature switches (plan 251)', () => {
	it('every switch lowers high to what it names, and only changes fields of the settings', () => {
		for (const name of FEATURE_NAMES) {
			for (const key of Object.keys(FEATURE_SWITCHES[name])) expect(key in PRESETS.high).toBe(true);
		}
	});

	it('on sets the fields, off puts the exact values back', () => {
		const table = clone();
		let applied = 0;
		const sw = new FeatureSwitches(table as never, () => applied++);
		for (const name of FEATURE_NAMES) {
			sw.set('high', name, true);
			expect(sw.active('high')).toContain(name);
			for (const [k, v] of Object.entries(FEATURE_SWITCHES[name]))
				expect((table.high as never)[k]).toBe(v as never);
			sw.set('high', name, false);
			expect(table.high).toEqual(PRESETS.high);
		}
		expect(applied).toBe(FEATURE_NAMES.length * 2);
		expect(table.medium).toEqual(PRESETS.medium);
	});

	it('any order of on and off ends at the original; reset undoes all of them', () => {
		const table = clone();
		const sw = new FeatureSwitches(table as never, () => {});
		for (const name of FEATURE_NAMES) sw.set('high', name, true);
		sw.set('high', 'msaa', false);
		sw.set('high', 'tufts', false);
		expect(table.high.msaa).toBe(PRESETS.high.msaa);
		expect(table.high.tufts).toBe(PRESETS.high.tufts);
		expect(table.high.shaftSteps).toBe(FEATURE_SWITCHES.shafts.shaftSteps);
		sw.reset();
		expect(table.high).toEqual(PRESETS.high);
		expect(sw.active('high')).toEqual([]);
	});

	it('a switch on one preset leaves the others alone, and a repeated call is a no-op', () => {
		const table = clone();
		let applied = 0;
		const sw = new FeatureSwitches(table as never, () => applied++);
		sw.set('high', 'shadowMap', true);
		sw.set('high', 'shadowMap', true);
		expect(applied).toBe(1);
		expect(table.high.shadowMapSize).toBe(2048);
		expect(table.medium).toEqual(PRESETS.medium);
		expect(table.low).toEqual(PRESETS.low);
	});
});
