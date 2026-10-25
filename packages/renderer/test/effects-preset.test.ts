/** The effects' pools across preset changes: a step that keeps the sizes keeps the smoke's material. */
import { describe, expect, test } from 'bun:test';
import type { Mesh } from 'three';
import { Effects } from '../src/effects/system.ts';
import { PRESETS } from '../src/presets.ts';

const smokeOf = (e: Effects): Mesh => e.root.children[0] as Mesh;

describe('Effects.setPreset', () => {
	test('the same pool sizes keep the smoke; new sizes rebuild it', () => {
		const e = new Effects(new Map(), undefined, () => undefined, PRESETS.high);
		const smoke = smokeOf(e);
		// a governor step to medium that keeps the high pools (ADR 0310), and a looks change
		e.setPreset(PRESETS.medium, PRESETS.high);
		e.setPreset(PRESETS.high);
		expect(smokeOf(e)).toBe(smoke);
		expect(e.particleCapacity).toBe(PRESETS.high.smokeParticles);
		e.setPreset(PRESETS.low);
		expect(smokeOf(e)).not.toBe(smoke);
		expect(e.particleCapacity).toBe(PRESETS.low.smokeParticles);
	});
});
