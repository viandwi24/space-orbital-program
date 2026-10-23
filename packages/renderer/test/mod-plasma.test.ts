/** Plan 405 (ADR 0345): a mod's plasma palette replaces the stock one for its body. */
import { describe, expect, test } from 'bun:test';
import { plasmaPaletteSchema, type PlasmaPaletteData } from '@orbital/core';
import { AIR_PALETTE, paletteFor, paletteFromData } from '../src/effects/plasma-palette.ts';

const data: PlasmaPaletteData = plasmaPaletteSchema.parse({
	glow: { rgb: [0.1, 0.9, 0.2], intensity: 0.5 },
	glowHot: { rgb: [0.8, 1, 0.9], intensity: 1 },
	trail: [{ rgb: [0.1, 1, 0.3] }, { rgb: [0.1, 0.6, 0.5] }, { rgb: [0.1, 0.2, 0.7] }],
	streak: { rgb: [0.7, 1, 0.8] },
	wrap: { rgb: [0.2, 0.8, 0.4] },
	shock: { rgb: [0.4, 0.9, 1] },
	gradient: [
		{ at: 0, rgb: [0, 0.4, 0.1] },
		{ at: 0.35, rgb: [0.1, 0.9, 0.2] },
		{ at: 0.7, rgb: [0.3, 1, 0.7] },
		{ at: 1, rgb: [0.8, 1, 1] }
	],
	multipliers: { strength: 1.5 }
});

describe('a mod plasma palette (plan 405)', () => {
	test('the body that has one is drawn with it, the others with the stock palette', () => {
		const mine = paletteFor('stock.home', { gasConstant: 287 }, data);
		expect(mine.id).toBe('stock.home');
		expect(mine.glow.rgb).toEqual([0.1, 0.9, 0.2]);
		expect(paletteFor('stock.home', { gasConstant: 287 })).toBe(AIR_PALETTE);
	});

	test('the scales it does not name are the stock look; the ones it names replace', () => {
		const p = paletteFromData('m.body', data);
		expect(p.multipliers.strength).toBe(1.5);
		expect(p.multipliers.glow).toBe(1);
		expect(p.gradient).toHaveLength(4);
		expect(p.trail[2].intensity).toBe(0);
	});

	test('out-of-range data is refused with the field named', () => {
		const bad = plasmaPaletteSchema.safeParse({
			...data,
			glow: { rgb: [2, 0, 0], intensity: 0 },
			gradient: data.gradient.slice(0, 3)
		});
		expect(bad.success).toBe(false);
		const paths = bad.success ? [] : bad.error.issues.map((i) => i.path.join('.'));
		expect(paths).toContain('glow.rgb.0');
		expect(paths).toContain('gradient');
		const unordered = plasmaPaletteSchema.safeParse({
			...data,
			gradient: [...data.gradient].reverse()
		});
		expect(unordered.success).toBe(false);
	});
});
