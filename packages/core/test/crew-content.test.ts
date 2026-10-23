import { describe, expect, test } from 'bun:test';
import {
	crewPoseAt,
	hashCrewId,
	loadPlugins,
	pickLook,
	type CrewOutfitDefinition,
	type Plugin
} from '../src/index.ts';

const outfit = (id: string, over: Partial<CrewOutfitDefinition> = {}): CrewOutfitDefinition => ({
	id,
	title: 'Suit',
	body: 'suit',
	suit: 0xff8800,
	trim: 0,
	accent: 0,
	legs: 0xff8800,
	boots: 0,
	gloves: 'skin',
	headwear: 'none',
	headwearColour: 0,
	eyewear: 'none',
	prop: 'none',
	pack: 'none',
	harness: false,
	uses: ['hangar'],
	...over
});

const plugin = (id: string, setup: Plugin['setup'], depends: string[] = []): Plugin => ({
	meta: { id, version: '1.0.0', api: '*' },
	depends,
	optional: [],
	setup
});

describe('the crew content registries (plan 375, ADR 0313)', () => {
	test('validate their definitions', () => {
		expect(() =>
			loadPlugins([
				plugin('a', (ctx) => {
					ctx.crewOutfits.register({ ...outfit('a.bad'), body: 'robe' as never });
				})
			])
		).toThrow(/Invalid crew-outfit "a.bad"/);
		expect(() =>
			loadPlugins([
				plugin('a', (ctx) => {
					ctx.crewAnimations.register({ id: 'a.none', title: 'None', role: 'walk' });
				})
			])
		).toThrow(/either keys or a pose function/);
		expect(() =>
			loadPlugins([
				plugin('a', (ctx) => {
					ctx.crewPortraits.register({ id: 'a.p', title: 'P', image: 'faces/a.gif', outfit: 'a.x' });
				})
			])
		).toThrow(/Invalid crew-portrait/);
	});

	test('a crew-outfit patch recolours another plugin\'s outfit, with provenance', () => {
		const { registries, report } = loadPlugins([
			plugin('base', (ctx) => void ctx.crewOutfits.register(outfit('base.suit'))),
			plugin(
				'paint',
				(ctx) =>
					void ctx.patches.register({
						id: 'paint.blue',
						target: 'crew-outfit',
						select: { id: 'base.suit' },
						ops: [{ op: 'set', path: 'suit', value: 0x2255ff }]
					}),
				['base']
			)
		]);
		expect(registries.crewOutfits.get('base.suit')!.suit).toBe(0x2255ff);
		expect(report.provenance['crew-outfit']['base.suit']!['suit']).toEqual(['base', 'paint']);
		expect(report.registered['crew-outfit']).toEqual([{ id: 'base.suit', by: 'base' }]);
	});

	test('keyframes ease between keys and loop', () => {
		const anim = {
			keys: [
				{ t: 0, pose: { armRRaise: 0 } },
				{ t: 1, pose: { armRRaise: 2 } }
			],
			duration: 2
		};
		expect(crewPoseAt(anim, 0).armRRaise).toBe(0);
		expect(crewPoseAt(anim, 0.5).armRRaise).toBeCloseTo(1, 9);
		expect(crewPoseAt(anim, 1).armRRaise).toBe(2);
		expect(crewPoseAt(anim, 1.5).armRRaise).toBeCloseTo(1, 9);
		expect(crewPoseAt(anim, 2.5).armRRaise).toBeCloseTo(crewPoseAt(anim, 0.5).armRRaise, 9);
		expect(crewPoseAt({ ...anim, loop: false }, 5).armRRaise).toBe(2);
		expect(crewPoseAt(anim, 0.5).legLPitch).toBe(0);
	});

	test('looks are drawn by weight from the id hash, each kind from its own bits', () => {
		const looks = [
			{ id: 'a.blue', title: 'Blue', kind: 'skin' as const, colour: 1, weight: 3 },
			{ id: 'a.green', title: 'Green', kind: 'skin' as const, colour: 2 }
		];
		const counts = { blue: 0, green: 0 };
		for (let i = 0; i < 4000; i++) {
			const pick = pickLook(looks, 'skin', hashCrewId(`crew-${i}`))!;
			counts[pick.id === 'a.blue' ? 'blue' : 'green']++;
		}
		expect(counts.blue / 4000).toBeGreaterThan(0.7);
		expect(counts.blue / 4000).toBeLessThan(0.8);
		expect(pickLook(looks, 'eye-colour', 123)).toBeUndefined();
	});
});
