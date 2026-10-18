/** The constellation planner (plan 118, ADR 0163 point 5), checked by flying the plan. */
import { describe, expect, test } from 'bun:test';
import { resonantDeployment } from '../src/constellation.ts';
import { propagateUniversal } from '../src/propagate.ts';
import { length, normalize, scale, type Vec3 } from '../src/vec3.ts';

const MU = 3.5316e12;
const R = 600_000;

/** Fly the carrier, drop and circularise each satellite, and return them all at time `end`. */
function fly(plan: ReturnType<typeof resonantDeployment>, radius: number, end: number): Vec3[] {
	const vDeploy = Math.sqrt(MU * (2 / radius - 1 / plan.deploy.a));
	const r0 = { x: radius, y: 0, z: 0 };
	const v0 = { x: 0, y: 0, z: -vDeploy };
	return plan.drops.map((t) => {
		const carrier = propagateUniversal(r0, v0, MU, t);
		const v = scale(normalize(carrier.v), Math.sqrt(MU / radius));
		return propagateUniversal(carrier.r, v, MU, end - t).r;
	});
}

const angle = (a: Vec3, b: Vec3): number =>
	Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);

describe('resonantDeployment', () => {
	test('3 satellites: period ratio 4/3 and drops 120 degrees apart', () => {
		const radius = R + 1_000_000;
		const plan = resonantDeployment({ mu: MU, bodyRadius: R, radius, count: 3 });
		expect(plan.ratio).toEqual({ numerator: 4, denominator: 3 });
		expect(plan.deploy.period / plan.targetPeriod).toBeCloseTo(4 / 3, 12);
		expect(plan.deploy.periapsis).toBeCloseTo(radius, 3);
		expect(plan.dropAt).toBe('periapsis');
		const sats = fly(plan, radius, plan.drops[2]! + 1234);
		for (const s of sats) expect(length(s) / radius).toBeCloseTo(1, 6);
		for (let k = 0; k < 3; k++) {
			const d = (angle(sats[k]!, sats[(k + 1) % 3]!) + 2 * Math.PI) % (2 * Math.PI);
			expect(Math.min(d, 2 * Math.PI - d)).toBeCloseTo((2 * Math.PI) / 3, 6);
		}
	});

	test('below: the faster deploy orbit drops at its apoapsis, (N-1)/N, evenly spaced', () => {
		const radius = R + 2_000_000;
		const plan = resonantDeployment({ mu: MU, bodyRadius: R, radius, count: 4, side: 'below' });
		expect(plan.ratio).toEqual({ numerator: 3, denominator: 4 });
		expect(plan.dropAt).toBe('apoapsis');
		expect(plan.deploy.apoapsis).toBeCloseTo(radius, 3);
		const sats = fly(plan, radius, plan.drops[3]! + 500);
		const angles = sats
			.map((s) => (Math.atan2(-s.z, s.x) + 2 * Math.PI) % (2 * Math.PI))
			.sort((a, b) => a - b);
		for (let k = 0; k < 4; k++) {
			const next = k === 3 ? angles[0]! + 2 * Math.PI : angles[k + 1]!;
			expect(next - angles[k]!).toBeCloseTo(Math.PI / 2, 6);
		}
	});

	test('the burns: the vis-viva difference at the drop apsis', () => {
		const radius = R + 1_000_000;
		const plan = resonantDeployment({ mu: MU, bodyRadius: R, radius, count: 3 });
		const expected = Math.sqrt(MU * (2 / radius - 1 / plan.deploy.a)) - Math.sqrt(MU / radius);
		expect(plan.insertionDv).toBeCloseTo(expected, 9);
		expect(plan.circularizeDv).toBe(plan.insertionDv);
	});

	test('refuses a deploy orbit under the surface, and bad counts', () => {
		expect(() =>
			resonantDeployment({ mu: MU, bodyRadius: R, radius: R + 80_000, count: 2, side: 'below' })
		).toThrow(RangeError);
		expect(() => resonantDeployment({ mu: MU, bodyRadius: R, radius: R + 1e6, count: 1 })).toThrow(
			RangeError
		);
		expect(() => resonantDeployment({ mu: MU, bodyRadius: R, radius: R / 2, count: 3 })).toThrow(
			RangeError
		);
	});
});
