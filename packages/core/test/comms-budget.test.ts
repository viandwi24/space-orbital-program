/** The link budget (plan 116, ADR 0185) against the hand calculation in docs/research/comms.md. */
import { describe, expect, test } from 'bun:test';
import {
	antennaGain,
	dishGain,
	freeSpaceLoss,
	linkBudget,
	rateForMargin,
	RATE_LADDER,
	type BandDefinition
} from '../src/index.ts';

const S: BandDefinition = { id: 'test.s', label: 'S', frequency: 2.25e9, noiseTemperature: 100 };

describe('link budget', () => {
	test('10 W, 10 dBi to 40 dBi over 10 000 km at S band matches the hand calculation within 0.1 dB', () => {
		const b = linkBudget({ power: 10, txGain: 10, rxGain: 40, distance: 1e7, band: S });
		// hand values (docs/research/comms.md, "Worked case")
		expect(Math.abs(b.txPower - 10)).toBeLessThan(0.1);
		expect(Math.abs(b.pathLoss - 179.491)).toBeLessThan(0.1);
		expect(Math.abs(b.received - -119.491)).toBeLessThan(0.1);
		expect(Math.abs(b.noiseDensity - -208.599)).toBeLessThan(0.1);
		expect(Math.abs(b.cn0 - 89.108)).toBeLessThan(0.1);
		expect(Math.abs(b.margin - 56.108)).toBeLessThan(0.1);
		expect(b.rate).toBe(1e8);
		expect(b.effectiveDistance).toBe(1e7);
	});

	test('the scale divides the distance', () => {
		const one = linkBudget({ power: 10, txGain: 0, rxGain: 0, distance: 2e7, band: S });
		const two = linkBudget({ power: 10, txGain: 0, rxGain: 0, distance: 2e7, scale: 2, band: S });
		expect(two.effectiveDistance).toBe(1e7);
		expect(two.margin - one.margin).toBeCloseTo(6.0206, 4);
	});

	test('free-space loss grows 6.02 dB per doubling; dish gain matches the aperture formula', () => {
		expect(freeSpaceLoss(2e6, 8.45e9) - freeSpaceLoss(1e6, 8.45e9)).toBeCloseTo(6.0206, 4);
		expect(dishGain(10, 2.25e9)).toBeCloseTo(44.854, 2);
		expect(dishGain(34, 8.45e9)).toBeCloseTo(66.977, 2);
		expect(antennaGain({ gain: 7 }, S)).toBe(7);
		expect(antennaGain({ aperture: 10 }, S)).toBeCloseTo(44.854, 2);
		expect(antennaGain({}, S)).toBe(2);
	});

	test('the rate ladder steps every 10 dB of margin, from 0 to 1 Gbit/s', () => {
		expect(rateForMargin(-0.01)).toBe(0);
		expect(rateForMargin(Number.NaN)).toBe(0);
		RATE_LADDER.forEach((rate, i) => {
			expect(rateForMargin(10 * i)).toBe(rate);
			expect(rateForMargin(10 * i + 9.99)).toBe(rate);
		});
		expect(rateForMargin(500)).toBe(1e9);
	});
});
