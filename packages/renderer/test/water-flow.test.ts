import { describe, expect, test } from 'bun:test';
import {
	FLOW_CYCLE,
	FLOW_SPEED,
	flowDirection,
	flowPhases,
	flowProgress,
	flowSample,
	flowShift,
	flowVector,
	flowWeight
} from '../src/water-flow.ts';
import { WAVE_PERIOD } from '../src/water-model.ts';

describe('river flow (plan 038)', () => {
	test('the two phases weigh 1 together, are 0 at their own reset and 1 half way', () => {
		for (let i = 0; i < 2000; i++) {
			const t = i * 0.0731;
			const p = flowPhases(t);
			expect(p.weightA + p.weightB).toBeCloseTo(1, 12);
			expect(p.weightA).toBeGreaterThanOrEqual(0);
			expect(p.weightB).toBeGreaterThanOrEqual(0);
		}
		expect(flowWeight(0)).toBe(0);
		expect(flowWeight(1)).toBe(0);
		expect(flowWeight(0.5)).toBe(1);
		// at the reset of A, B is half way
		const atReset = flowPhases(FLOW_CYCLE * 3);
		expect(atReset.weightA).toBeCloseTo(0, 12);
		expect(atReset.weightB).toBeCloseTo(1, 12);
	});

	test('the cycle is FLOW_CYCLE, and a whole number of cycles fits in the wave period the shader wraps at', () => {
		expect(flowProgress(0.7, 0)).toBeCloseTo(flowProgress(0.7 + FLOW_CYCLE, 0), 12);
		expect(WAVE_PERIOD / FLOW_CYCLE).toBeCloseTo(Math.round(WAVE_PERIOD / FLOW_CYCLE), 9);
		expect(flowPhases(5).progressA).toBeCloseTo(flowPhases(5 + WAVE_PERIOD).progressA, 9);
	});

	test('the blended pattern is continuous at the reset of a phase (that phase has no weight there)', () => {
		const field = (x: number): number => Math.sin(x * 0.9) + 0.4 * Math.sin(x * 2.3 + 1);
		const at = (t: number, x: number): number => {
			const p = flowPhases(t);
			const a = field(flowSample([x, 0], [1, 0], p.progressA)[0]);
			const b = field(flowSample([x, 0], [1, 0], p.progressB)[0]);
			return p.weightA * a + p.weightB * b;
		};
		const reset = FLOW_CYCLE * 4;
		for (let x = 0; x < 10; x += 0.7) {
			expect(Math.abs(at(reset - 1e-6, x) - at(reset + 1e-6, x))).toBeLessThan(1e-4);
		}
	});

	test('the sample point moves back along the flow, so the pattern moves along it', () => {
		const p = flowSample([10, 5], [0, 1], 0.5);
		expect(p[0]).toBe(10);
		expect(p[1]).toBeCloseTo(5 - flowShift(0.5), 12);
		expect(flowShift(1)).toBeCloseTo(FLOW_SPEED * FLOW_CYCLE, 12);
	});

	test('the flow is tangent to the river, unit at most, and points downhill', () => {
		let checked = 0;
		for (let i = 0; i < 360; i++) {
			const a = (i / 360) * 2 * Math.PI;
			const riverGradient: [number, number] = [Math.cos(a) * 0.02, Math.sin(a) * 0.02];
			for (const b of [0.3, 1.2, 2.5, 4, 5.6]) {
				const elev: [number, number] = [Math.cos(b) * 1e-4, Math.sin(b) * 1e-4];
				const f = flowVector(riverGradient, elev);
				const len = Math.hypot(f[0], f[1]);
				expect(len).toBeLessThanOrEqual(1 + 1e-12);
				// perpendicular to the gradient of the river field
				expect(Math.abs(f[0] * riverGradient[0] + f[1] * riverGradient[1])).toBeLessThan(1e-12);
				// a non-negative component toward lower ground
				expect(-(f[0] * elev[0] + f[1] * elev[1])).toBeGreaterThanOrEqual(-1e-18);
				if (len > 0.5) {
					const d = flowDirection(f);
					expect(Math.hypot(d[0], d[1])).toBeCloseTo(1, 9);
				}
				checked++;
			}
		}
		expect(checked).toBe(1800);
	});

	test('where the course runs along a contour the flow fades instead of flipping; no river field, no flow', () => {
		const river: [number, number] = [1, 0]; // the course runs along y
		const slopeAlong = flowVector(river, [0, -1e-3]); // ground falls toward +y... gradient points up
		expect(slopeAlong[1]).toBeGreaterThan(0.9);
		const slopeAcross = flowVector(river, [1e-3, 0]); // contour: no fall along the course
		expect(Math.hypot(slopeAcross[0], slopeAcross[1])).toBeLessThan(1e-6);
		// continuity through the contour: the sign changes smoothly
		let last = flowVector(river, [1e-3, -1e-3 * -3])[1];
		for (let k = -3; k <= 3; k += 0.05) {
			const v = flowVector(river, [1e-3, -1e-3 * k])[1];
			expect(Math.abs(v - last)).toBeLessThan(0.2);
			last = v;
		}
		expect(flowVector([0, 0], [1, 1])).toEqual([0, 0]);
		expect(flowDirection([0, 0])).toEqual([0, 0]);
	});
});
