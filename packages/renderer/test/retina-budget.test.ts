/** Plan 252 (ADR 0232): the pixel budget of the planet pass, lighter MSAA and shadows at Retina, no canvas MSAA, spaced recaptures. */
import { describe, expect, test } from 'bun:test';
import type { WebGLRenderer } from 'three';
import { atmosphereFor } from '../src/atmosphere-model.ts';
import { BUDGET_FULL_ABOVE, HALF_PLANET_SCALE, budgetScale } from '../src/half-res.ts';
import { PlanetPass } from '../src/planet.ts';
import {
	GRAPHICS_PRESETS,
	PLANET_PIXEL_BUDGET,
	PRESETS,
	RETINA_RATIO,
	canvasAntialias,
	msaaSamples,
	shadowSizeAt
} from '../src/presets.ts';
import { ENV_RECAPTURE_MIN_MS, RecaptureGate } from '../src/recapture-gate.ts';

describe('the planet pixel budget', () => {
	test('1080p at pixel ratio 1 draws at full size, and so does a frame a little over it', () => {
		expect(budgetScale(1920, 1080, PLANET_PIXEL_BUDGET)).toBe(1);
		expect(budgetScale(1280, 720, PLANET_PIXEL_BUDGET)).toBe(1);
		// within 10 % of the side of the budget: not worth an upsample
		expect(budgetScale(1980, 1090, PLANET_PIXEL_BUDGET)).toBe(1);
		expect(budgetScale(2000, 1100, PLANET_PIXEL_BUDGET)).toBe(0.85);
	});

	test('1440p, a 14" Retina screen and 4K get 0.65, 0.55 and 0.5 of the side', () => {
		expect(budgetScale(2560, 1440, PLANET_PIXEL_BUDGET)).toBe(0.65);
		// 1512 x 945 CSS at pixel ratio 2
		expect(budgetScale(3024, 1890, PLANET_PIXEL_BUDGET)).toBe(0.55);
		expect(budgetScale(3840, 2160, PLANET_PIXEL_BUDGET)).toBe(0.5);
		// the floor is the half rung's scale
		expect(budgetScale(7680, 4320, PLANET_PIXEL_BUDGET)).toBe(HALF_PLANET_SCALE);
	});

	test('the pass stays inside the budget wherever it is scaled, and the scale only falls as the target grows', () => {
		let last = 1;
		for (let w = 1280; w <= 3840; w += 128) {
			const h = Math.round((w * 9) / 16);
			const s = budgetScale(w, h, PLANET_PIXEL_BUDGET);
			if (s < 1 && s > HALF_PLANET_SCALE)
				expect(w * h * s * s).toBeLessThanOrEqual(PLANET_PIXEL_BUDGET + 1);
			expect(s).toBeLessThanOrEqual(last);
			expect(s === 1 || s <= BUDGET_FULL_ABOVE).toBe(true);
			last = s;
		}
	});

	test('no budget, or no size, means full size', () => {
		expect(budgetScale(3024, 1890, 0)).toBe(1);
		expect(budgetScale(0, 0, PLANET_PIXEL_BUDGET)).toBe(1);
	});

	test('every preset carries the budget', () => {
		for (const name of GRAPHICS_PRESETS)
			expect(PRESETS[name].planetPixels).toBe(PLANET_PIXEL_BUDGET);
	});
});

describe('the planet pass at a fractional scale', () => {
	const R = 600_000;
	const SITE = { latitude: 0.009, longitude: 0.02 };
	const gl = { extensions: { has: () => true } } as unknown as WebGLRenderer;
	const noFloat = { extensions: { has: () => false } } as unknown as WebGLRenderer;
	const make = (): PlanetPass => new PlanetPass(atmosphereFor(R, 100_000), PRESETS.high, SITE);

	test('a Retina target starts on the budgeted rung, a 1080p one at full size', () => {
		const planet = make();
		planet.setPixelBudget(PLANET_PIXEL_BUDGET);
		planet.setTargetSize(3024, 1890);
		planet.beginFrame(gl);
		expect(planet.planetScale).toBe(0.55);
		expect(planet.edge.uniforms.uMarchScale!.value as number).toBe(0.55);
		planet.setTargetSize(1920, 1080);
		planet.beginFrame(gl);
		expect(planet.planetScale).toBe(1);
	});

	test("the governor's half rung goes lower than the budget, and full size is the budget's", () => {
		const planet = make();
		planet.setPixelBudget(PLANET_PIXEL_BUDGET);
		planet.setTargetSize(3024, 1890);
		planet.setPlanetScale(HALF_PLANET_SCALE);
		planet.beginFrame(gl);
		expect(planet.planetScale).toBe(HALF_PLANET_SCALE);
		planet.setPlanetScale(1);
		planet.beginFrame(gl);
		expect(planet.planetScale).toBe(0.55);
	});

	test('without a budget the scale is the governor’s alone, and without float targets always 1', () => {
		const planet = make();
		planet.setTargetSize(3024, 1890);
		planet.beginFrame(gl);
		expect(planet.planetScale).toBe(1);
		planet.setPlanetScale(HALF_PLANET_SCALE);
		planet.beginFrame(gl);
		expect(planet.planetScale).toBe(HALF_PLANET_SCALE);
		// the capability is read once per planet pass: a context without float targets gets its own
		const plain = make();
		plain.setPixelBudget(PLANET_PIXEL_BUDGET);
		plain.setPlanetScale(HALF_PLANET_SCALE);
		plain.setTargetSize(3024, 1890);
		plain.beginFrame(noFloat);
		expect(plain.planetScale).toBe(1);
	});
});

describe('MSAA, shadows and the canvas at Retina', () => {
	test('MSAA takes 2 samples from pixel ratio 2 up, and never raises a preset’s own', () => {
		expect(msaaSamples(4, 1)).toBe(4);
		expect(msaaSamples(4, 1.5)).toBe(4);
		expect(msaaSamples(4, RETINA_RATIO)).toBe(2);
		expect(msaaSamples(4, 3)).toBe(2);
		expect(msaaSamples(2, 2)).toBe(2);
		expect(msaaSamples(0, 2)).toBe(0);
	});

	test('the shadow map is at most 2048 from pixel ratio 2 up', () => {
		expect(shadowSizeAt(4096, 1)).toBe(4096);
		expect(shadowSizeAt(4096, 2)).toBe(2048);
		expect(shadowSizeAt(2048, 2)).toBe(2048);
		expect(shadowSizeAt(1024, 2)).toBe(1024);
		expect(shadowSizeAt(0, 2)).toBe(0);
	});

	test('the canvas is multisampled on a 1x screen only', () => {
		expect(canvasAntialias(1)).toBe(true);
		expect(canvasAntialias(1.5)).toBe(true);
		expect(canvasAntialias(2)).toBe(false);
		expect(canvasAntialias(3)).toBe(false);
	});

	test('high draws its ground cloud shadows from the baked map, as medium', () => {
		expect(PRESETS.high.cloudShadowMap).toBe(true);
		expect(PRESETS.high.cloudShadowOctaves).toBe(0);
	});
});

describe('spaced recaptures of the image-based light', () => {
	test('the first capture and a new preset always run; the same key never repeats', () => {
		const g = new RecaptureGate();
		expect(g.due('a', 'high', 0, false)).toBe(true);
		g.captured('a', 'high', 0);
		expect(g.due('a', 'high', 10_000, true)).toBe(false);
		expect(g.due('b', 'medium', 1, true)).toBe(true);
	});

	test('a new key inside the interval waits, and runs once the interval has passed', () => {
		const g = new RecaptureGate();
		g.captured('a', 'high', 1_000);
		expect(g.due('b', 'high', 1_000 + ENV_RECAPTURE_MIN_MS - 1, true)).toBe(false);
		expect(g.due('b', 'high', 1_000 + ENV_RECAPTURE_MIN_MS, true)).toBe(true);
	});

	test('an ascent of one key change per 100 ms takes a capture per interval, not one per change', () => {
		const g = new RecaptureGate();
		let captures = 0;
		let key = 0;
		for (let t = 0; t <= 10_000; t += 100) {
			key += 1; // the key changes at every step
			if (g.due(String(key), 'high', t, captures > 0)) {
				g.captured(String(key), 'high', t);
				captures++;
			}
		}
		expect(captures).toBeLessThanOrEqual(Math.floor(10_000 / ENV_RECAPTURE_MIN_MS) + 1);
		expect(captures).toBeGreaterThan(1);
	});

	test('reset forces the next capture', () => {
		const g = new RecaptureGate();
		g.captured('a', 'high', 5);
		g.reset();
		expect(g.due('b', 'high', 6, true)).toBe(true);
	});
});
