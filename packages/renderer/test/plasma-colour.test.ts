/** Plan 399: the colour of the skin glow, the shock layer and the trail by heating, speed and body. */
import { describe, expect, test } from 'bun:test';
import {
	AIR_PALETTE,
	CO2_PALETTE,
	heatingOf,
	plasmaColour,
	type PlasmaLayer
} from '../src/effects/plasma-palette.ts';
import type { Rgb } from '../src/effects/look.ts';

/** Hue 0..360 of a colour. */
function hue([r, g, b]: Rgb): number {
	const max = Math.max(r, g, b);
	const d = max - Math.min(r, g, b);
	if (d === 0) return 0;
	let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
	h *= 60;
	return h < 0 ? h + 360 : h;
}
const saturation = ([r, g, b]: Rgb): number => {
	const max = Math.max(r, g, b);
	return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
};
const dist = (a: Rgb, b: Rgb): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The skin glow's colour at the gradient's own heating, so each stop can be checked. */
const at = (h: number, layer: PlasmaLayer = 'skin') => plasmaColour(layer, h, 7_800, AIR_PALETTE);

describe('plasma colour (plan 399)', () => {
	test('on Home rising heating passes red, orange, pink-magenta and blue-white in order', () => {
		// the skin lags the gradient by 0.14, so these read the stops at 0, 0.3, 0.6 and 1
		const red = at(0.14);
		const orange = at(0.44);
		const pink = at(0.74);
		const blue = at(1.14);
		expect(hue(red)).toBeLessThan(10);
		expect(red[0]).toBeGreaterThan(red[2] * 5);
		expect(hue(orange)).toBeGreaterThan(15);
		expect(hue(orange)).toBeLessThan(35);
		expect(hue(pink)).toBeGreaterThan(300);
		expect(hue(pink)).toBeLessThan(335);
		expect(hue(blue)).toBeGreaterThan(200);
		expect(hue(blue)).toBeLessThan(225);
		expect(blue[2]).toBeGreaterThan(blue[0]);
		// the blue-white end is the least saturated of the four
		expect(saturation(blue)).toBeLessThan(saturation(red));
	});

	test('at one heating the skin, the shock and the trail are apart', () => {
		for (const h of [0.35, 0.6, 0.85]) {
			const skin = plasmaColour('skin', h, 7_800, AIR_PALETTE);
			const shock = plasmaColour('shock', h, 7_800, AIR_PALETTE);
			const trail = plasmaColour('trail', h, 7_800, AIR_PALETTE);
			expect(dist(skin, shock)).toBeGreaterThan(0.12);
			expect(dist(skin, trail)).toBeGreaterThan(0.12);
			expect(dist(shock, trail)).toBeGreaterThan(0.2);
		}
	});

	test('the trail cools along its length and turns hotter with speed', () => {
		const near = plasmaColour('trail', 0.7, 7_800, AIR_PALETTE, 'high', 0);
		const far = plasmaColour('trail', 0.7, 7_800, AIR_PALETTE, 'high', 1);
		expect(dist(near, far)).toBeGreaterThan(0.1);
		const slow = plasmaColour('trail', 0.5, 6_000, AIR_PALETTE);
		const fast = plasmaColour('trail', 0.5, 11_000, AIR_PALETTE);
		expect(dist(slow, fast)).toBeGreaterThan(0.05);
	});

	test('two bodies with different palettes differ at the same heating and speed', () => {
		for (const h of [0.2, 0.5, 0.8]) {
			const air = plasmaColour('skin', h, 7_800, AIR_PALETTE);
			const co2 = plasmaColour('skin', h, 7_800, CO2_PALETTE);
			expect(dist(air, co2)).toBeGreaterThan(0.1);
		}
	});

	test('Low reads a two-stop gradient: a straight line between two colours', () => {
		const a = plasmaColour('skin', 0.2, 7_800, AIR_PALETTE, 'low');
		const m = plasmaColour('skin', 0.5, 7_800, AIR_PALETTE, 'low');
		const b = plasmaColour('skin', 0.9, 7_800, AIR_PALETTE, 'low');
		// m lies on the segment a-b
		const along = (m[1] - a[1]) / (b[1] - a[1]);
		for (const i of [0, 2]) {
			const expected = a[i]! + (b[i]! - a[i]!) * along;
			expect(m[i]).toBeCloseTo(expected, 1);
		}
		// and it is not the full gradient
		expect(dist(m, plasmaColour('skin', 0.5, 7_800, AIR_PALETTE, 'high'))).toBeGreaterThan(0.02);
	});

	test('an ordinary orbital return stays red-orange to pink', () => {
		const h = heatingOf(3e5);
		const skin = plasmaColour('skin', h, 7_800, AIR_PALETTE);
		expect(skin[0]).toBeGreaterThan(skin[2]);
	});
});
