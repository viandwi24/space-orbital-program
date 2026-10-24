import { describe, expect, it } from 'vitest';
import {
	DEFAULT_PROFILE,
	effectiveLooks,
	effectiveScale,
	governorLimits,
	kindOf,
	parseProfile,
	presetOfProfile,
	serializeProfile,
	withLook,
	withPreset,
	withScale
} from './graphics-profile';

describe('the graphics profile (plan 404)', () => {
	it('round-trips', () => {
		let p = withPreset('medium');
		p = withLook(p, 'ocean', 'low');
		p = withLook(p, 'plume', 'high');
		p = withScale(p, 0.7);
		expect(parseProfile(serializeProfile(p))).toEqual(p);
	});

	it('an old profile with only a preset key becomes the same preset with every look on auto', () => {
		for (const preset of ['low', 'medium', 'high'] as const) {
			expect(parseProfile(null, preset)).toEqual({ ...DEFAULT_PROFILE, preset });
		}
		expect(parseProfile(null, null)).toEqual(DEFAULT_PROFILE);
		expect(parseProfile('not json', 'high')).toEqual({ ...DEFAULT_PROFILE, preset: 'high' });
	});

	it('invalid values fall back to the default for that field', () => {
		const p = parseProfile(
			JSON.stringify({
				version: 1,
				preset: 'ludicrous',
				looks: { ocean: 'extreme', plume: 'medium', nonsense: 'low' },
				resolutionScale: 7
			})
		);
		expect(p.preset).toBe('auto');
		expect(p.looks).toEqual({ plasma: 'auto', plume: 'medium', ocean: 'auto', clouds: 'auto' });
		expect(p.resolutionScale).toBeNull();
		// a version this build does not know is read as the legacy preset
		expect(parseProfile(JSON.stringify({ version: 9, preset: 'high' }), 'low').preset).toBe('low');
	});

	it('Ultra is High with every look at its highest and the full scale; Custom follows a hand change', () => {
		const u = withPreset('ultra');
		expect(presetOfProfile(u)).toBe('high');
		expect(effectiveLooks(u)).toEqual({ plasma: 'high', plume: 'high', ocean: 'high', clouds: 'high' });
		expect(effectiveScale(u)).toBe(1);
		expect(kindOf(u)).toBe('ultra');
		expect(effectiveLooks(withLook(u, 'ocean', 'low')).ocean).toBe('low');
		const c = withLook(withPreset('high'), 'plume', 'low');
		expect(kindOf(c)).toBe('custom');
		expect(kindOf(withScale(withPreset('low'), 0.6))).toBe('custom');
		expect(kindOf(withPreset('medium'))).toBe('medium');
		// picking a named preset clears the hand-set looks
		expect(withPreset('low').looks).toEqual(DEFAULT_PROFILE.looks);
	});

	it('the scale is held to 0.5 to 1', () => {
		expect(withScale(DEFAULT_PROFILE, 0.2).resolutionScale).toBe(0.5);
		expect(withScale(DEFAULT_PROFILE, 3).resolutionScale).toBe(1);
		expect(withScale(withScale(DEFAULT_PROFILE, 0.8), null).resolutionScale).toBeNull();
	});

	it('the governor lowers only automatic looks and an unpinned scale', () => {
		const free = governorLimits(DEFAULT_PROFILE);
		expect(free.scale).toBe(true);
		expect(free.looks).toEqual(['plasma', 'plume', 'ocean', 'clouds']);
		const pinned = governorLimits(withScale(withLook(withPreset('high'), 'ocean', 'high'), 0.75));
		expect(pinned.scale).toBe(false);
		expect(pinned.heldScale).toBe(0.75);
		expect(pinned.looks).toEqual(['plasma', 'plume', 'clouds']);
		// Ultra pins every look and the scale: the governor has nothing to lower
		const ultra = governorLimits(withPreset('ultra'));
		expect(ultra.scale).toBe(false);
		expect(ultra.looks).toEqual([]);
	});
});
