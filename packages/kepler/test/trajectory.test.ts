/** Plan 080: the patched provider returns exactly what the functions it wraps return. */
import { describe, expect, test } from 'bun:test';
import {
	bodyStateAt,
	bodyTrack,
	closestApproach,
	closestApproachOnTrack,
	closestApproachPatched,
	conicTrack,
	createPatchedProvider,
	createTrajectoryProvider,
	findCrossing,
	patchedStateAt,
	patchedTrack,
	predictPatchedConics,
	predictWithManeuvers,
	propagate,
	soiRadius,
	toStateVector,
	trackOfSegments,
	trajectoryFor,
	type PatchedBody
} from '../src/index.ts';

const MU_HOME = 3.5316e12;
const MU_MOON = 5.776e10;
const A_MOON = 11.8e6;
const moonOrbit = { a: A_MOON, e: 0, i: 0, raan: 0, argp: 0, m0: 1, epoch: 0 };
const bodies: PatchedBody[] = [
	{ id: 'home', mu: MU_HOME, soi: Infinity, radius: 600_000 },
	{
		id: 'moon',
		mu: MU_MOON,
		soi: soiRadius(A_MOON, MU_MOON, MU_HOME),
		radius: 190_000,
		parent: 'home',
		orbit: moonOrbit
	}
];

// A transfer that meets the moon.
const r1 = 680_000;
const rm = A_MOON + 800_000;
const a = (r1 + rm) / 2;
const flight = Math.PI * Math.sqrt(a ** 3 / MU_HOME);
const n = Math.sqrt(MU_HOME / A_MOON ** 3);
const st = toStateVector(
	{ a, e: (rm - r1) / (rm + r1), i: 0, raan: 0, argp: 1 + n * flight - Math.PI, m0: 0, epoch: 0 },
	MU_HOME,
	0
);
const start = { body: 'home', r: st.r, v: st.v, t: 0 };
const nodes = [
	{ id: 0, time: 120, prograde: 40, normal: 5, radial: -3 },
	{ id: 1, time: 3_000, prograde: -25, normal: 0, radial: 10 }
];
const H = 400_000;
const p = createPatchedProvider(bodies);
const moonTrack = (t: number) => bodyStateAt(bodies, 'moon', t, 'system');

describe('patched trajectory provider', () => {
	test('capabilities and the body list', () => {
		expect(p.capabilities).toEqual({ model: 'patched', maneuvers: true, soiTransitions: true });
		expect(p.bodies).toBe(bodies);
	});

	test('each method equals the wrapped function exactly', () => {
		expect(p.predict(start, H)).toEqual(predictPatchedConics(bodies, start, H));
		expect(p.predict(start, H, { maxSegments: 3, maxStep: 300 })).toEqual(
			predictPatchedConics(bodies, start, H, { maxSegments: 3, maxStep: 300 })
		);
		expect(p.predictWithManeuvers(start, nodes, H)).toEqual(
			predictWithManeuvers(bodies, start, nodes, H)
		);
		for (const t of [0, 5_000, 120_000, 300_000]) {
			expect(p.stateAt(start, t)).toEqual(patchedStateAt(bodies, start, t));
			expect(p.bodyState('moon', t)).toEqual(bodyStateAt(bodies, 'moon', t));
			expect(p.bodyState('moon', t, 'system')).toEqual(bodyStateAt(bodies, 'moon', t, 'system'));
			expect(p.propagate(moonOrbit, MU_HOME, t)).toEqual(propagate(moonOrbit, MU_HOME, t));
			expect(p.bodyTrack('moon')(t)).toEqual(bodyTrack(bodies, 'moon')(t));
			expect(p.conicTrack('home', st.r, st.v, 0)(t)).toEqual(
				conicTrack(bodies, 'home', st.r, st.v, 0)(t)
			);
		}
		const segments = predictPatchedConics(bodies, start, H);
		const track = patchedTrack(bodies, start, H);
		expect(p.track(start, H).segments).toEqual(track.segments);
		expect(p.trackOfSegments(segments).segments).toEqual(
			trackOfSegments(bodies, segments).segments
		);
		expect(p.closestApproach(start, moonTrack, H)).toEqual(
			closestApproachPatched(bodies, start, moonTrack, H)
		);
		expect(p.closestApproachOnTrack(track, moonTrack)).toEqual(
			closestApproachOnTrack(track, moonTrack)
		);
		const own = (t: number) => propagate(moonOrbit, MU_HOME, t);
		const other = (t: number) => propagate({ ...moonOrbit, a: A_MOON * 1.1 }, MU_HOME, t);
		expect(p.conicClosestApproach(own, other, 0, 50_000)).toEqual(
			closestApproach(own, other, 0, 50_000)
		);
		const signed = (t: number) => t - 1234.5;
		expect(p.crossing(signed, 0, 5_000)).toBe(findCrossing(signed, 0, 5_000));
	});

	test('trajectoryFor caches one provider per body list; n-body has none yet', () => {
		expect(trajectoryFor(bodies)).toBe(trajectoryFor(bodies));
		expect(trajectoryFor([...bodies])).not.toBe(trajectoryFor(bodies));
		expect(createTrajectoryProvider('patched', bodies).capabilities.model).toBe('patched');
		expect(() => createTrajectoryProvider('n-body', bodies)).toThrow(
			'n-body worlds are not available yet'
		);
	});
});
