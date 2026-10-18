/** Range safety on the page (plan 127, ADR 0155 point 6): the rule, the Launch panel, the HUD line. */
import { LEGACY_SITE, legacyWorldInfo, loadPlugins, type Site } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { launchRange, rangeModeOf, rangeWarning } from './range-model';

const { registries } = loadPlugins([Stock]);
const home = registries.bodies.get('stock.home')!;

describe('range safety on the page (plan 127)', () => {
	it('the rule comes from the world, else its preset: Career pays, Sandbox is off', () => {
		const rules = registries.rules;
		const presets = registries.presets;
		expect(rangeModeOf({ rules: {}, preset: 'stock.career' }, rules, presets)).toBe('cost');
		expect(rangeModeOf({ rules: {}, preset: 'stock.sandbox' }, rules, presets)).toBe('off');
		expect(
			rangeModeOf(
				{ rules: { 'stock.range-safety': 'hard' }, preset: 'stock.sandbox' },
				rules,
				presets
			)
		).toBe('hard');
	});

	it('the Launch panel: the fan, the eastward check, a drop per spent stage and the penalty', () => {
		const info = { ...legacyWorldInfo(1), id: 'w-127', sites: [LEGACY_SITE] };
		// the Legacy space center stands inland: no safe azimuth
		const r = launchRange('cost', LEGACY_SITE, home, true, info, [900, 1_200, 1_400])!;
		expect(r.fan).toEqual([]);
		expect(r.east).toBe(false);
		expect(r.drops.map((d) => d.stage)).toEqual([0, 1]);
		expect(r.penalty.funds).toBeGreaterThanOrEqual(1_000);
		expect(launchRange('off', LEGACY_SITE, home, true, info, [900])).toBeNull();
	});

	it('another site where a stage drops is named', () => {
		const alone = { ...legacyWorldInfo(1), id: 'w-127', sites: [LEGACY_SITE] };
		const first = launchRange('hard', LEGACY_SITE, home, true, alone, [700, 1_000])!.drops[0]!;
		expect(first.downrange!).toBeGreaterThan(10_000);
		// a base exactly where the first stage falls (east along the equator)
		const there: Site = {
			...LEGACY_SITE,
			id: 'w.east',
			kind: 'base',
			longitude: first.downrange! / home.radius
		};
		const info = { ...alone, sites: [LEGACY_SITE, there] };
		const r = launchRange('hard', LEGACY_SITE, home, true, info, [700, 1_000])!;
		expect(r.drops[0]).toMatchObject({ place: 'site', site: 'w.east' });
	});

	it('the HUD line names the place and what the rule does', () => {
		const range = {
			mode: 'cost' as const,
			warnings: [{ vessel: 7, kind: 'site' as const, site: 'w.east', latitude: 0, longitude: 0 }]
		};
		expect(rangeWarning(range, 7)).toBe(
			'Staging now drops the spent stage on site "w.east": penalty'
		);
		expect(rangeWarning({ ...range, mode: 'hard' }, 7)).toBe(
			'Staging now would drop the spent stage on site "w.east": refused'
		);
		expect(rangeWarning(range, 8)).toBeNull();
		expect(rangeWarning(undefined, 7)).toBeNull();
	});
});
