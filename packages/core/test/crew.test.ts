/** Crew core (plan 106, ADR 0176): abilities never gate a tool; profession, level and traits. */
import { describe, expect, test } from 'bun:test';
import {
	ABILITY_KEYS,
	FLIGHT_TOOLS,
	abilitiesOf,
	createRng,
	drawTraits,
	generateCrewName,
	levelOf,
	placeXp,
	salaryOf,
	type CrewTraitDefinition
} from '../src/index.ts';

const traits = new Map<string, CrewTraitDefinition>([
	[
		't.brave',
		{ id: 't.brave', label: 'Brave', abilities: { gTolerance: 1.2, panicResistance: 1.5 } }
	],
	['t.careless', { id: 't.careless', label: 'Careless', abilities: { controlSmoothing: 0.9 } }]
]);

describe('crew abilities (ADR 0098, 0176)', () => {
	test('no ability key names a flight tool, and every key is a quality factor', () => {
		expect([...FLIGHT_TOOLS]).toEqual([
			'sas',
			'maneuver-nodes',
			'map',
			'target',
			'scripts',
			'staging',
			'time-warp',
			'trajectory',
			'delta-v'
		]);
		expect([...ABILITY_KEYS]).toEqual([
			'controlSmoothing',
			'scriptBudget',
			'repairRate',
			'dataQuality',
			'gTolerance',
			'panicResistance',
			'radio'
		]);
		const norm = (k: string) => k.toLowerCase().replace(/[^a-z]/g, '');
		for (const key of ABILITY_KEYS) {
			for (const tool of FLIGHT_TOOLS) expect(norm(key)).not.toBe(norm(tool));
			expect(key).not.toMatch(/^(unlock|enable|allow|can)/i);
		}
		// A tourist with no traits: every factor is exactly 1 (nothing on, nothing off).
		expect(
			Object.values(abilitiesOf({ profession: 'tourist', level: 0, traits: [] }, traits))
		).toEqual(ABILITY_KEYS.map(() => 1));
	});

	test('profession and level set a base; traits multiply it', () => {
		const pilot = abilitiesOf(
			{ profession: 'pilot', level: 2, traits: ['t.careless', 't.brave'] },
			traits
		);
		expect(pilot.controlSmoothing).toBeCloseTo((1.1 + 0.1) * 0.9, 12);
		expect(pilot.scriptBudget).toBeCloseTo(1.2, 12);
		expect(pilot.gTolerance).toBeCloseTo(1.2, 12);
		expect(pilot.dataQuality).toBe(1);
		expect(
			abilitiesOf({ profession: 'scientist', level: 0, traits: [] }, traits).dataQuality
		).toBeCloseTo(1.1, 12);
	});

	test('XP per place, levels, salaries', () => {
		expect(placeXp('flyby:stock.cinder', 'stock.home')).toBe(2);
		expect(placeXp('landed:stock.cinder', 'stock.home')).toBeCloseTo(4.6, 12);
		expect(placeXp('orbit:stock.home', 'stock.home')).toBe(1.5);
		expect(placeXp('nonsense', 'stock.home')).toBe(0);
		expect([0, 2, 7.9, 8, 64, 100].map(levelOf)).toEqual([0, 1, 1, 2, 5, 5]);
		expect(salaryOf({ profession: 'scientist', level: 2 })).toBe(675);
	});

	test('names and traits are deterministic from the stream', () => {
		const names = { id: 'n.x', first: ['ka', 'lo', 'mi'], last: ['ber', 'ton', 'sa'] };
		const a = createRng(42);
		const b = createRng(42);
		expect(generateCrewName(names, a)).toBe(generateCrewName(names, b));
		const list = [...traits.values()];
		expect(drawTraits(list, createRng(7))).toEqual(drawTraits(list, createRng(7)));
		expect(drawTraits([], createRng(7))).toEqual([]);
	});
});
