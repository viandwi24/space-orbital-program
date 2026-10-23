import { CREW_ANIMATION_ROLES, crewPoseAt, loadPlugins } from '@orbital/sdk';
import { describe, expect, test } from 'bun:test';
import Stock, { CREW_STEP } from '../src/index.ts';

describe("stock's crew content (plan 375, ADR 0313)", () => {
	const { registries } = loadPlugins([Stock]);

	test('12 outfits, 8 expressions and every animation role, through the crew registries', () => {
		expect(registries.crewOutfits.list()).toHaveLength(12);
		expect(registries.crewExpressions.list()).toHaveLength(8);
		const roles = new Set(registries.crewAnimations.list().map((a) => a.role));
		expect([...roles].sort()).toEqual([...CREW_ANIMATION_ROLES].sort());
		const kinds = new Set(registries.crewLooks.list().map((l) => l.kind));
		expect([...kinds].sort()).toEqual(['eye-colour', 'hair-colour', 'hair-style', 'skin']);
	});

	test('the walk follows the distance walked, so feet do not slide', () => {
		const walk = registries.crewAnimations.list().find((a) => a.role === 'walk')!;
		const a = crewPoseAt(walk, 0, { walked: CREW_STEP / 2, seed: 0 });
		const b = crewPoseAt(walk, 5, { walked: CREW_STEP / 2 + 2 * CREW_STEP, seed: 0 });
		expect(b.legLPitch).toBeCloseTo(a.legLPitch, 9);
	});

	test('every outfit the game needs has a use', () => {
		const uses = new Set(registries.crewOutfits.list().flatMap((o) => o.uses ?? []));
		for (const use of ['pod', 'eva', 'hangar', 'space-center'] as const) expect(uses.has(use)).toBe(true);
	});
});
