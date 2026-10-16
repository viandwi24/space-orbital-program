import { describe, expect, it } from 'vitest';
import {
	formatAngle,
	formatBearing,
	formatSignedAngle,
	formatDeltaV,
	formatDistance,
	formatDuration,
	formatForce,
	formatMass,
	formatMet,
	formatPercent,
	formatSpeed,
	formatWarp,
	NO_VALUE,
	resourceLabel
} from './format';

describe('format', () => {
	it('picks a distance unit by magnitude', () => {
		expect(formatDistance(42)).toBe('42.0 m');
		expect(formatDistance(420)).toBe('420 m');
		expect(formatDistance(1_234)).toBe('1.23 km');
		expect(formatDistance(12_345)).toBe('12.3 km');
		expect(formatDistance(7_000_000)).toBe('7.00 Mm');
		expect(formatDistance(2e9)).toBe('2.00 Gm');
		expect(formatDistance(-1_500)).toBe('-1.50 km');
		expect(formatDistance(0)).toBe('0.0 m');
	});
	it('formats speed, switching to km/s above 10 km/s', () => {
		expect(formatSpeed(2301.26)).toBe('2301.3 m/s');
		expect(formatSpeed(0)).toBe('0.0 m/s');
		expect(formatSpeed(11_186)).toBe('11.19 km/s');
	});
	it('formats mass, force, angle, percent', () => {
		expect(formatMass(840)).toBe('840 kg');
		expect(formatMass(12_890)).toBe('12.89 t');
		expect(formatForce(215_000)).toBe('215.0 kN');
		expect(formatAngle(Math.PI / 2)).toBe('90.0°');
		expect(formatPercent(0.456)).toBe('46%');
		expect(formatPercent(1.7)).toBe('100%');
		expect(formatPercent(-1)).toBe('0%');
	});
	it('bearings wrap and round to 000-359, signed angles never show -0', () => {
		expect(formatBearing(0)).toBe('000\u00b0');
		expect(formatBearing(Math.PI / 2)).toBe('090\u00b0');
		expect(formatBearing(2 * Math.PI)).toBe('000\u00b0');
		expect(formatBearing((359.7 * Math.PI) / 180)).toBe('000\u00b0');
		expect(formatBearing(-Math.PI / 2)).toBe('270\u00b0');
		expect(formatSignedAngle(-0.001)).toBe('0\u00b0');
		expect(formatSignedAngle(Math.PI / 4)).toBe('+45\u00b0');
		expect(formatSignedAngle(-Math.PI / 4)).toBe('-45\u00b0');
	});
	it('formats durations and mission time', () => {
		expect(formatDuration(0)).toBe('00:00');
		expect(formatDuration(75.9)).toBe('01:15');
		expect(formatDuration(3_725)).toBe('1:02:05');
		expect(formatDuration(90_061)).toBe('1d 01:01:01');
		expect(formatDuration(-5)).toBe('-00:05');
		expect(formatMet(12)).toBe('T+00:12');
		expect(formatMet(-3)).toBe('T+00:00');
	});
	it('shows a dash for values that do not exist', () => {
		for (const f of [
			formatDistance,
			formatSpeed,
			formatMass,
			formatDuration,
			formatPercent,
			formatForce
		]) {
			expect(f(Number.NaN)).toBe(NO_VALUE);
			expect(f(Infinity)).toBe(NO_VALUE);
		}
		expect(formatMet(Number.NaN)).toBe(`T+${NO_VALUE}`);
	});
	it('warp factors stay narrow; resources get readable names', () => {
		expect([1, 50, 1_000, 100_000, 1_000_000].map(formatWarp)).toEqual([
			'1x',
			'50x',
			'1kx',
			'100kx',
			'1Mx'
		]);
		expect(resourceLabel('stock.liquid-fuel')).toBe('Liquid fuel');
	});
});

describe('imperial units (plan 023)', () => {
	it('converts distance: feet below 10 000 ft, then miles', () => {
		expect(formatDistance(1000, 'imperial')).toBe('3,281 ft');
		expect(formatDistance(10, 'imperial')).toBe('32.8 ft');
		expect(formatDistance(1000, 'imperial')).not.toContain('km');
		expect(formatDistance(10_000, 'imperial')).toBe('6.21 mi'); // 1 km = 0.621 mi
		expect(formatDistance(80_000, 'imperial')).toBe('49.71 mi');
		expect(formatDistance(1_000_000, 'imperial')).toBe('621.4 mi');
		expect(formatDistance(2e9, 'imperial')).toBe('1.24 Mmi');
	});
	it('converts speed and delta-v: 100 m/s = 328.1 ft/s', () => {
		expect(formatSpeed(100, 'imperial')).toBe('328.1 ft/s');
		expect(formatSpeed(11_186, 'imperial')).toBe('6.95 mi/s');
		expect(formatDeltaV(3808, 'imperial')).toBe('12,493');
		expect(formatDeltaV(3808, 'metric')).toBe('3,808');
		expect(formatDeltaV(Number.NaN, 'metric')).toBe(NO_VALUE);
	});
	it('converts mass and force: 1 t = 2 204.6 lb', () => {
		expect(formatMass(1000, 'imperial')).toBe('1.10 tn');
		expect(formatMass(100, 'imperial')).toBe('220 lb');
		expect(formatMass(1000, 'metric')).toBe('1.00 t');
		expect(formatForce(215_000, 'imperial')).toBe('48.3 klbf');
	});
	it('the metric results do not change', () => {
		expect(formatDistance(12_345, 'metric')).toBe('12.3 km');
		expect(formatSpeed(2301.26, 'metric')).toBe('2301.3 m/s');
	});
});
