/**
 * Plan 391 (ADR 0337): two docked bodies become one that keeps their angular momentum about the
 * joint centre of mass. A 100 kg probe spinning at 1 rad/s and drifting past a 20 t station.
 */
import { expect, test } from 'bun:test';
import { jointSpin } from '../src/docking.ts';

const ID = { x: 0, y: 0, z: 0, w: 1 };

test('the joint spin is I⁻¹ L within 1 %, not the mass-weighted mean of the two spins', () => {
	const station = { mass: 20_000, inertia: { x: 2e5, y: 2e5, z: 2e5 } };
	const probe = { mass: 100, inertia: { x: 10, y: 10, z: 10 } };
	const probeAt = { x: 0, y: 4, z: 0 };
	const total = station.mass + probe.mass;
	const centre = { x: 0, y: (probe.mass * probeAt.y) / total, z: 0 };
	const probeV = { x: 1, y: 0, z: 0 };
	const linear = { x: (probe.mass * probeV.x) / total, y: 0, z: 0 };
	// the joint inertia about the joint centre: both bodies' own plus the parallel-axis terms
	const dProbe = probeAt.y - centre.y;
	const dStation = -centre.y;
	const jointI = {
		x:
			station.inertia.x + probe.inertia.x + station.mass * dStation ** 2 + probe.mass * dProbe ** 2,
		y: station.inertia.y + probe.inertia.y,
		z: station.inertia.z + probe.inertia.z + station.mass * dStation ** 2 + probe.mass * dProbe ** 2
	};
	const { angular, momentum } = jointSpin(
		[
			{
				body: { inertia: station.inertia, inertiaFrame: ID },
				motion: {
					rotation: ID,
					centre: { x: 0, y: 0, z: 0 },
					linear: { x: 0, y: 0, z: 0 },
					angular: { x: 0, y: 0, z: 0 }
				},
				mass: station.mass
			},
			{
				body: { inertia: probe.inertia, inertiaFrame: ID },
				motion: { rotation: ID, centre: probeAt, linear: probeV, angular: { x: 1, y: 0, z: 0 } },
				mass: probe.mass
			}
		],
		linear,
		centre,
		{ inertia: jointI, inertiaFrame: ID },
		ID
	);
	// by hand: the probe's own 10 about X, and m r x (v - v_cm) = 100 (4 - ...) about -Z
	const expected = {
		x: probe.inertia.x * 1,
		y: 0,
		z: -probe.mass * dProbe * (probeV.x - linear.x) - station.mass * dStation * (0 - linear.x)
	};
	expect(Math.abs(momentum.x - expected.x)).toBeLessThan(0.01 * Math.abs(expected.x));
	expect(Math.abs(momentum.z - expected.z)).toBeLessThan(0.01 * Math.abs(expected.z));
	expect(Math.abs(angular.x * jointI.x - expected.x)).toBeLessThan(0.01 * Math.abs(expected.x));
	expect(Math.abs(angular.z * jointI.z - expected.z)).toBeLessThan(0.01 * Math.abs(expected.z));
	// the old mean of the spins gave 100 / 20 100 of a rad/s about X: 100 times the momentum's
	const mean = (probe.mass * 1) / total;
	expect(Math.abs(angular.x)).toBeLessThan(mean / 10);
});
