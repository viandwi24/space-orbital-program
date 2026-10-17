import { describe, expect, test } from 'bun:test';
import {
	AURORA,
	auroraAlongRay,
	auroraEmission,
	auroraStrength,
	auroraTime,
	curtainFootprint,
	emissionProfile,
	magneticAxis,
	magneticCoordinates,
	magneticFrame,
	nightWeight,
	ovalColatitude,
	ovalWeight,
	shellIntervals
} from '../src/aurora-model.ts';
import { DEG, add, scale, vec, dot } from '../src/vec.ts';

const RADIUS = 600_000;
const sun = vec(1, 0, 0);
const frame = magneticFrame(sun);

/** A unit body-fixed direction at magnetic colatitude `colat` and local angle `psi`. */
const at = (colat: number, psi: number) =>
	add(
		scale(frame.axis, Math.cos(colat)),
		scale(
			add(scale(frame.midnight, Math.cos(psi)), scale(frame.side, Math.sin(psi))),
			Math.sin(colat)
		)
	);

describe('magnetic geometry (plan 061)', () => {
	test('the axis is a unit vector tilted by the stated angle from the rotation axis', () => {
		const a = magneticAxis();
		expect(Math.hypot(a.x, a.y, a.z)).toBeCloseTo(1, 12);
		expect(Math.acos(a.y) / DEG).toBeCloseTo(AURORA.tiltDeg, 9);
	});

	test('midnight is away from the sun, perpendicular to the axis; coordinates round-trip', () => {
		expect(dot(frame.midnight, sun)).toBeLessThanOrEqual(1e-12);
		expect(dot(frame.midnight, frame.axis)).toBeCloseTo(0, 12);
		for (const [colat, psi] of [
			[23 * DEG, 0],
			[12 * DEG, 2.5],
			[40 * DEG, -1.2]
		] as const) {
			const c = magneticCoordinates(frame, at(colat, psi));
			expect(c.colat).toBeCloseTo(colat, 9);
			expect(c.psi).toBeCloseTo(psi, 9);
		}
	});

	test('the oval is at 23 degrees at magnetic midnight and 12 at noon, in between on the flanks', () => {
		expect(ovalColatitude(0)).toBeCloseTo(23 * DEG, 12);
		expect(Math.abs(ovalColatitude(Math.PI))).toBeCloseTo(12 * DEG, 12);
		expect(ovalColatitude(Math.PI / 2)).toBeCloseTo(17.5 * DEG, 12);
	});

	test('the oval weight is 1 on its centre line and falls off both sides to nothing within 3 widths', () => {
		for (const psi of [0, 1, 2.5, Math.PI]) {
			const c = ovalColatitude(psi);
			expect(ovalWeight(c, psi)).toBeCloseTo(1, 12);
			expect(ovalWeight(c + 12 * DEG, psi)).toBeLessThan(0.01);
			expect(ovalWeight(c - 10 * DEG, psi)).toBeLessThan(0.01);
		}
		expect(ovalWeight(ovalColatitude(0) + 2 * DEG, 0)).toBeGreaterThan(
			ovalWeight(ovalColatitude(0) + 6 * DEG, 0)
		);
	});

	test('the ground is dark enough only under a sun well below the horizon', () => {
		expect(nightWeight(0.3)).toBe(0);
		expect(nightWeight(-0.05)).toBe(0);
		expect(nightWeight(-0.2)).toBe(1);
		expect(nightWeight(-1)).toBe(1);
		expect(nightWeight(-0.12)).toBeGreaterThan(0.3);
		expect(nightWeight(-0.12)).toBeLessThan(0.7);
	});
});

describe('filtered sheets (plan 061)', () => {
	test('widening by the sample spacing keeps the energy across the oval and lowers the peak', () => {
		const c = ovalColatitude(0);
		for (const filter of [0.01, 0.05, 0.2]) {
			let sum = 0;
			let sum0 = 0;
			for (let x = c - 1; x < c + 1; x += 0.0005) {
				sum += ovalWeight(x, 0, filter) * 0.0005;
				sum0 += ovalWeight(x, 0) * 0.0005;
			}
			expect(sum).toBeCloseTo(sum0, 3);
			expect(ovalWeight(c, 0, filter)).toBeLessThan(1);
		}
		expect(ovalWeight(c + 0.3, 0, 0.2)).toBeGreaterThan(ovalWeight(c + 0.3, 0));
	});

	test('streaks fade out when the spacing is wider than their period', () => {
		const c = ovalColatitude(0);
		const swing = (filter: number): number => {
			let lo = 1;
			let hi = 0;
			for (let psi = -0.3; psi < 0.3; psi += 0.005) {
				const f = curtainFootprint(c, psi, 0, filter) / Math.max(ovalWeight(c, psi, filter), 1e-9);
				lo = Math.min(lo, f);
				hi = Math.max(hi, f);
			}
			return hi - lo;
		};
		expect(swing(0.3)).toBeLessThan(swing(0));
	});
});

describe('emission profile (plan 061)', () => {
	test('green dominates around 110 km, violet at the lower fringe, red high up, nothing far below or above', () => {
		const g = emissionProfile(112_000);
		expect(g[1]).toBeGreaterThan(g[0] * 2);
		expect(g[1]).toBeGreaterThan(g[2]);
		const low = emissionProfile(96_000);
		expect(low[2]).toBeGreaterThan(low[1] * 0.3);
		expect(low[0]).toBeGreaterThan(emissionProfile(150_000)[0] * 0.3);
		const high = emissionProfile(230_000);
		expect(high[0]).toBeGreaterThan(high[1]);
		expect(emissionProfile(50_000)[1]).toBeLessThan(g[1] * 1e-3);
		expect(emissionProfile(600_000)[1]).toBeLessThan(g[1] * 1e-3);
	});

	test('the lower edge is sharper than the upper tail (curtains end abruptly at the bottom)', () => {
		const peak = emissionProfile(112_000)[1];
		expect(emissionProfile(112_000 - 20_000)[1]).toBeLessThan(emissionProfile(112_000 + 20_000)[1]);
		expect(emissionProfile(112_000 - 20_000)[1]).toBeLessThan(peak * 0.2);
	});

	test('the green channel integrates to the green lobe plus the others spill (normalised lobes)', () => {
		let sumG = 0;
		for (let h = 0; h < 600_000; h += 250) sumG += emissionProfile(h)[1] * 250;
		const expected = AURORA.lobes.reduce((s, l) => s + l.share * l.colour[1], 0);
		expect(sumG).toBeCloseTo(expected, 2);
	});
});

describe('curtain animation (plan 061)', () => {
	test('is deterministic and repeats exactly after one period', () => {
		const c = 23 * DEG;
		for (const psi of [0, 0.4, 2, -2.9]) {
			const f = curtainFootprint(c, psi, 123.4);
			expect(curtainFootprint(c, psi, 123.4)).toBe(f);
			expect(curtainFootprint(c, psi, 123.4 + AURORA.period)).toBeCloseTo(f, 9);
			expect(curtainFootprint(c, psi, 123.4 + 5 * AURORA.period)).toBeCloseTo(f, 9);
		}
		expect(auroraTime(-1)).toBeCloseTo(AURORA.period - 1, 9);
	});

	test('moves: the footprint at some place changes within seconds, slowly (less than 25 percent in a second)', () => {
		let moved = 0;
		for (let psi = -3; psi < 3; psi += 0.1) {
			const a = curtainFootprint(ovalColatitude(psi), psi, 40);
			const b = curtainFootprint(ovalColatitude(psi), psi, 41);
			const c = curtainFootprint(ovalColatitude(psi), psi, 70);
			expect(Math.abs(a - b)).toBeLessThan(0.25);
			if (Math.abs(a - c) > 0.05) moved++;
		}
		expect(moved).toBeGreaterThan(5);
	});

	test('is continuous across the seam of the local angle and bounded in [0, 1]', () => {
		const c = 22 * DEG;
		expect(curtainFootprint(c, Math.PI, 10)).toBeCloseTo(curtainFootprint(c, -Math.PI, 10), 9);
		for (let t = 0; t < 600; t += 37)
			for (let psi = -3; psi <= 3; psi += 0.37) {
				const f = curtainFootprint(c, psi, t);
				expect(f).toBeGreaterThanOrEqual(0);
				expect(f).toBeLessThanOrEqual(1);
			}
	});

	test('the curtains stay in the oval: nothing far from it, whatever the time', () => {
		for (let t = 0; t < 600; t += 50) expect(curtainFootprint(60 * DEG, 0.3, t)).toBeLessThan(1e-6);
	});
});

describe('the march oracle (plan 061)', () => {
	const site = (colat: number, psi: number, alt: number) => {
		const n = at(colat, psi);
		return scale(n, RADIUS + alt);
	};
	/** The brightest of several view directions at 30 degrees up toward the pole side, over several times. */
	const best = (colat: number, sunDir = sun): number => {
		const f = magneticFrame(sunDir);
		let top = 0;
		for (let t = 0; t < 600; t += 60)
			for (const az of [0, 1.5, 3, 4.5]) {
				const n = add(scale(f.axis, Math.cos(colat)), scale(f.midnight, Math.sin(colat)));
				const origin = scale(n, RADIUS + 10);
				const east = f.side;
				const north = vec(
					f.axis.x - n.x * dot(f.axis, n),
					f.axis.y - n.y * dot(f.axis, n),
					f.axis.z - n.z * dot(f.axis, n)
				);
				const nl = Math.hypot(north.x, north.y, north.z) || 1;
				const el = 0.35;
				const dir = add(
					scale(n, Math.sin(el)),
					scale(add(scale(north, Math.cos(az) / nl), scale(east, Math.sin(az))), Math.cos(el))
				);
				const l = Math.hypot(dir.x, dir.y, dir.z);
				const r = auroraAlongRay({
					origin,
					direction: scale(dir, 1 / l),
					sun: sunDir,
					radius: RADIUS,
					seconds: t
				});
				top = Math.max(top, r[1]);
			}
		return top;
	};

	test('a camera in the oval at night sees green; at a low latitude it sees nothing', () => {
		expect(best(23 * DEG)).toBeGreaterThan(0.001);
		expect(best(80 * DEG)).toBeLessThan(1e-9);
	});

	test('the oval seen by day (the sun overhead there) is dark of emission', () => {
		const f = magneticFrame(sun);
		const noon = at(12 * DEG, Math.PI);
		const r = auroraAlongRay({
			origin: scale(noon, RADIUS + 10),
			direction: noon,
			sun,
			radius: RADIUS,
			seconds: 0
		});
		expect(r).toEqual([0, 0, 0]);
		expect(f.axis).toBeDefined();
	});

	test('a ray that hits the ground from below the shell gets nothing', () => {
		const r = auroraAlongRay({
			origin: site(23 * DEG, 0, 10),
			direction: scale(at(23 * DEG, 0), -1),
			sun,
			radius: RADIUS,
			seconds: 0,
			hitsGround: true
		});
		expect(r).toEqual([0, 0, 0]);
	});

	test('emission is greener at its peak than red, and the lower edge of a curtain is violet-tinged', () => {
		const e = auroraEmission(112_000, ovalColatitude(0), 0, 0, -1);
		const lowEdge = auroraEmission(97_000, ovalColatitude(0), 0, 0, -1);
		expect(e[1]).toBeGreaterThan(e[0]);
		expect(lowEdge[2] / lowEdge[1]).toBeGreaterThan(e[2] / e[1]);
	});

	test('shell intervals: looking up from the ground one interval; from orbit down at the ground one, skimming through the hollow two', () => {
		const up = shellIntervals(RADIUS + 10, 1, RADIUS, false);
		expect(up).toHaveLength(1);
		expect(up[0]![0]).toBeCloseTo(AURORA.shellBase - 10, 3);
		expect(up[0]![1]).toBeCloseTo(AURORA.shellTop - 10, 3);
		const down = shellIntervals(RADIUS + 400_000, -1, RADIUS, true);
		expect(down).toHaveLength(1);
		expect(down[0]![1] - down[0]![0]).toBeCloseTo(AURORA.shellTop - AURORA.shellBase, 3);
		// a ray from far away across the limb crosses the shell, the hollow, the shell
		const r0 = RADIUS + 1_000_000;
		const mu = -Math.sqrt(1 - ((RADIUS + 50_000) / r0) ** 2);
		expect(shellIntervals(r0, mu, RADIUS, false)).toHaveLength(2);
		expect(shellIntervals(RADIUS + 10, -0.5, RADIUS, true)).toHaveLength(0);
	});
});

describe('the gate (plan 061)', () => {
	const input = (colat: number, psi: number, altitude: number, darkSky = 1, enabled = true) => ({
		up: at(colat, psi),
		sunBodyFixed: sun,
		altitude,
		atmosphereHeight: 70_000,
		radius: RADIUS,
		darkSky,
		enabled
	});

	test('on in the oval at night, off by day, off on a body without an aurora', () => {
		expect(auroraStrength(input(23 * DEG, 0, 10))).toBe(1);
		expect(auroraStrength(input(23 * DEG, 0, 10, 0))).toBe(0);
		expect(auroraStrength(input(23 * DEG, 0, 10, 1, false))).toBe(0);
	});

	test('off at low latitudes from the ground (the launch site is at magnetic colatitude near 90)', () => {
		for (const colat of [65, 75, 90, 120, 170])
			expect(auroraStrength(input(colat * DEG, 0, 10))).toBe(0);
		expect(auroraStrength(input(30 * DEG, 0, 10))).toBeGreaterThan(0);
		expect(auroraStrength(input(50 * DEG, 0, 10))).toBeGreaterThan(0);
	});

	test('from orbit the reach is longer, and fades out smoothly rather than switching', () => {
		const ground = auroraStrength(input(62 * DEG, 0, 10));
		const orbit = auroraStrength(input(62 * DEG, 0, 150_000));
		expect(orbit).toBeGreaterThan(ground);
		let last = 1;
		for (let colat = 25; colat < 120; colat += 2) {
			const s = auroraStrength(input(colat * DEG, 0, 150_000));
			expect(s).toBeLessThanOrEqual(last + 1e-12);
			last = s;
		}
		expect(last).toBe(0);
	});

	test('above the air the strength is scaled down by the orbit share', () => {
		expect(auroraStrength(input(23 * DEG, 0, 150_000))).toBeCloseTo(AURORA.orbitShare, 12);
		expect(auroraStrength(input(23 * DEG, 0, 20_000))).toBeGreaterThan(0.9);
	});

	test('the strength is dark-sky scaled', () => {
		expect(auroraStrength(input(23 * DEG, 0, 10, 0.4))).toBeCloseTo(0.4, 12);
	});
});
