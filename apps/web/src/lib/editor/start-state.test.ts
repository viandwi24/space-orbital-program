/** Plan 316 (owner 2026-10-21): how a part starts is set in the Hangar and drawn there. */
import { loadPlugins, partId, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import type { ContentLookups } from '../delta-v';
import { buildRow } from './build-settings';
import { startModules } from './inside';

const { registries } = loadPlugins([Stock]);
const content: ContentLookups = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};
const one = (part: string, settings?: VesselDesign['parts'][number]['settings']) => ({
	index: 0,
	part: partId(part),
	parent: null,
	...(settings ? { settings } : {})
});

describe('start state in the Hangar (plan 316)', () => {
	it('panels, legs, bays, doors and fuel cells have a start control', () => {
		const controls = (part: string) =>
			buildRow({ parts: [one(part)] }, content, 0)!.controls.map((c) => c.label);
		expect(controls('stock.solar-fold')).toContain('Solar panel');
		expect(controls('stock.landing-legs')).toContain('Landing legs');
		expect(controls('stock.cargo-bay')).toContain('Bay doors');
		// single-use petals (plan 345) have no start state: they are thrown off when opened
		expect(controls('stock.payload-petals')).not.toContain('Bay doors');
		expect(controls('stock.telescope').length).toBeGreaterThan(0);
		expect(controls('stock.fuel-cell')).toContain('Fuel cell');
	});

	it('the Hangar draws the start state: a panel set to start open is drawn open', () => {
		const def = content.parts.get('stock.solar-fold');
		expect(startModules(one('stock.solar-fold'), def, content)['stock.solar-panel']).toMatchObject({
			deployed: false
		});
		const open = one('stock.solar-fold', { 'stock.solar-panel': { deployed: true } });
		expect(startModules(open, def, content)['stock.solar-panel']).toMatchObject({ deployed: true });
		const lamp = one('stock.light-spot', { 'stock.light': { on: true } });
		expect(
			startModules(lamp, content.parts.get('stock.light-spot'), content)['stock.light']
		).toMatchObject({ on: true });
	});
});
