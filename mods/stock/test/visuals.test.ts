import { describe, expect, test } from 'bun:test';
import { loadPlugins } from '@orbital/sdk';
import { Stock, landingLegConfigSchema } from '../src/index.ts';

const KINDS = [
	'capsule',
	'tank',
	'engine',
	'engine-cluster',
	'decoupler',
	'reaction-wheel',
	'landing-legs',
	'heat-shield',
	'radial-decoupler',
	'booster',
	'nose-cone',
	'tail-cone',
	'adapter',
	'rcs-block',
	'docking-port',
	// plan 210
	'launch-clamp',
	// plan 219
	'fairing',
	'fairing-panel',
	'fin',
	'control-surface',
	'wing',
	'gear',
	'strut',
	'fuel-line',
	'plain',
	// EVA (plan 109, ADR 0120 point 7)
	'suit',
	'flag',
	'parachute',
	// plan 225
	'ladder',
	// plan 242
	'light',
	// plan 278
	'probe',
	// plans 276, 280, 281, 295–300
	'solar-flat',
	'solar-fold',
	'solar-array',
	'solar-wings',
	'battery',
	'rtg',
	'fuel-cell',
	'antenna-whip',
	'antenna-dish',
	'antenna-relay',
	'instrument',
	'container',
	'service-bay',
	'petals',
	'coupler',
	'truss',
	'hub',
	'lattice',
	'headlight',
	'sphere-capsule',
	'cone-capsule',
	'crew-can',
	'cupola',
	'radiator',
	'satellite-bus',
	'telescope',
	'boom',
	'descent-stage',
	'ascent-cabin',
	'single-leg',
	'orbiter-nose',
	'orbiter-aft',
	'delta-wing',
	'external-tank',
	'escape-tower',
	'hinge-joint',
	'rotary-joint',
	'piston-joint',
	'rover-wheel',
	'rover-chassis'
];

const parts = () => loadPlugins([Stock]).registries.parts.list();

describe('stock part visuals (ADR 0028)', () => {
	test('every stock part has a visual with a known generator kind that fits its shape', () => {
		for (const p of parts()) {
			expect(p.visual, p.id).toBeDefined();
			expect(KINDS).toContain(p.visual!.kind);
			expect(['cylinder', 'box'], p.id).toContain(p.shape?.kind ?? '');
		}
	});

	test('the landing-leg visual stance equals the module defaults', () => {
		const defaults = landingLegConfigSchema.parse({});
		const legs = parts().find((p) => p.id === 'stock.landing-legs')!;
		expect(legs.visual!.params).toEqual({
			spread: defaults.spread,
			drop: defaults.drop,
			footSize: defaults.footSize
		});
		expect(legs.visual!.deploy).toMatchObject({ module: 'stock.landing-leg', flag: 'deployed' });
	});

	test('the engine plume names the engine module and points out of the bottom face', () => {
		const engine = parts().find((p) => p.id === 'stock.engine-lv')!;
		const plume = engine.visual!.plume!;
		expect(plume.module).toBe('stock.engine');
		expect(plume.nozzle[1]).toBeCloseTo(-(engine.shape as { height: number }).height / 2, 9);
	});
});
