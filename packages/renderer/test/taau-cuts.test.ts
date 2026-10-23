/** TAAU's camera cuts (plan 393): when the history starts again. */
import { describe, expect, test } from 'bun:test';
import { CUT_FOV, CUT_TURN, CutDetector, turnBetween, type CutInput } from '../src/taau-cuts.ts';

const still: CutInput = {
	view: 'flight:1',
	fov: 50,
	rotation: [0, 0, 0, 1],
	size: [1814, 1134],
	pipeline: 'high:0.6'
};
const turned = (rad: number): CutInput['rotation'] => [0, Math.sin(rad / 2), 0, Math.cos(rad / 2)];

describe('the angle between orientations', () => {
	test('is zero for the same one, the turn for a turn, and does not care about the quaternion sign', () => {
		expect(turnBetween([0, 0, 0, 1], [0, 0, 0, 1])).toBeCloseTo(0, 9);
		expect(turnBetween([0, 0, 0, 1], turned(0.5))).toBeCloseTo(0.5, 9);
		expect(turnBetween([0, 0, 0, 1], [0, 0, 0, -1])).toBeCloseTo(0, 9);
		expect(turnBetween([0, 0, 0, 1], turned(Math.PI))).toBeCloseTo(Math.PI, 9);
	});
});

describe('camera cuts', () => {
	test('the first frame is a cut and a still camera is not', () => {
		const c = new CutDetector();
		expect(c.observe(still)).toBe(true);
		expect(c.observe(still)).toBe(false);
		expect(c.observe({ ...still, rotation: turned(0.05) })).toBe(false);
	});
	test('opening the map, another vessel, a launch or a new pipeline cut the history', () => {
		const c = new CutDetector();
		c.observe(still);
		expect(c.observe({ ...still, view: 'map:1' })).toBe(true);
		expect(c.observe({ ...still, view: 'map:1' })).toBe(false);
		expect(c.observe({ ...still, view: 'flight:2' })).toBe(true);
		expect(c.observe({ ...still, view: 'flight:2', pipeline: 'high:0.5' })).toBe(true);
		expect(c.observe({ ...still, view: 'flight:2', pipeline: 'high:0.5', size: [1000, 800] })).toBe(
			true
		);
	});
	test('a quick turn is not a cut, a placed camera is', () => {
		const c = new CutDetector();
		c.observe(still);
		expect(c.observe({ ...still, rotation: turned(CUT_TURN * 0.8) })).toBe(false);
		expect(c.observe({ ...still, rotation: turned(CUT_TURN * 0.8 + CUT_TURN * 1.2) })).toBe(true);
	});
	test('a zoom is not a cut, a jump of the field of view is', () => {
		const c = new CutDetector();
		c.observe(still);
		expect(c.observe({ ...still, fov: 50 * (1 + CUT_FOV * 0.5) })).toBe(false);
		expect(c.observe({ ...still, fov: 50 * (1 + CUT_FOV * 0.5) * 2 })).toBe(true);
	});
	test('reset makes the next frame a cut', () => {
		const c = new CutDetector();
		c.observe(still);
		c.reset();
		expect(c.observe(still)).toBe(true);
	});
});

describe('the presets that use TAAU (plan 393)', () => {
	test('only `medium` renders at half the side, never without the post chain, and never above the canvas', async () => {
		const { PRESETS } = await import('../src/presets.ts');
		expect(PRESETS.low.taau).toBe(0);
		expect(PRESETS.medium.taau).toBe(0.5);
		expect(PRESETS.high.taau).toBe(0);
		for (const p of Object.values(PRESETS)) {
			expect(p.taau).toBeGreaterThanOrEqual(0);
			expect(p.taau).toBeLessThanOrEqual(1);
			// TAAU resolves the post chain's input: a preset without the chain has none
			if (!p.post) expect(p.taau).toBe(0);
		}
	});
});
