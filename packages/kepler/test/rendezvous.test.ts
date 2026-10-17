import { describe, expect, test } from 'bun:test';
import {
	add,
	bodyStateAt,
	bodyTrack,
	closestApproachPatched,
	conicTrack,
	cross,
	dot,
	hohmannToTarget,
	hohmannTransfer,
	length,
	matchVelocityBurn,
	normalize,
	patchedTrack,
	propagateUniversal,
	relativeNodes,
	scale,
	soiRadius,
	sub,
	type PatchedBody,
	type StateVector,
	type Vec3
} from '../src/index.ts';
import { MU_EARTH } from './helpers.ts';

const MU_HOME = 3.5316e12;
const MU_MOON = 5.776e10;
const A_MOON = 11.8e6;
const bodies: PatchedBody[] = [
	{ id: 'home', mu: MU_HOME, soi: Infinity, radius: 600_000 },
	{
		id: 'moon',
		mu: MU_MOON,
		soi: soiRadius(A_MOON, MU_MOON, MU_HOME),
		radius: 190_000,
		parent: 'home',
		orbit: { a: A_MOON, e: 0, i: 0, raan: 0, argp: 0, m0: 1, epoch: 0 }
	}
];

/** The minimum of |b - a| by a dense scan followed by a fine scan around the best sample. */
function reference(
	a: (t: number) => StateVector,
	b: (t: number) => StateVector,
	t0: number,
	t1: number
): { t: number; d: number } {
	const d = (t: number): number => length(sub(b(t).r, a(t).r));
	const n = 20_000;
	const h = (t1 - t0) / n;
	let best = 0;
	let bestD = Infinity;
	for (let i = 0; i <= n; i++) {
		const x = d(t0 + i * h);
		if (x < bestD) {
			bestD = x;
			best = i;
		}
	}
	const lo = Math.max(t0, t0 + (best - 1) * h);
	const hi = Math.min(t1, t0 + (best + 1) * h);
	let t = lo;
	let out = Infinity;
	for (let i = 0; i <= 4_000; i++) {
		const tt = lo + ((hi - lo) * i) / 4_000;
		const x = d(tt);
		if (x < out) {
			out = x;
			t = tt;
		}
	}
	return { t, d: out };
}

const circ = (mu: number, radius: number, angle: number): StateVector => {
	const v = Math.sqrt(mu / radius);
	return {
		r: { x: radius * Math.cos(angle), y: 0, z: radius * Math.sin(angle) },
		v: { x: -v * Math.sin(angle), y: 0, z: v * Math.cos(angle) }
	};
};

describe('closestApproachPatched against a dense scan', () => {
	test('(a) a vessel and a body in one sphere', () => {
		const s = circ(MU_HOME, 3_000_000, 0.3);
		const start = { body: 'home', r: s.r, v: s.v, t: 0 };
		const track = patchedTrack(bodies, start, 60_000);
		expect(track.segments).toHaveLength(1);
		const moon = bodyTrack(bodies, 'moon');
		const found = closestApproachPatched(bodies, start, moon, 60_000);
		const ref = reference((t) => track.at(t).system, moon, track.t0, track.t1);
		expect(Math.abs(found.distance - ref.d)).toBeLessThan(1);
		expect(Math.abs(found.t - ref.t)).toBeLessThan(1);
		expect(found.body).toBe('home');
	});

	/** A vessel that coasts to the moon: leaves 680 km, apoapsis at the moon's radius, arrives with the moon there. */
	const toMoon = (): { start: { body: string; r: Vec3; v: Vec3; t: number }; arrive: number } => {
		const r0 = 680_000;
		const at = (r0 + A_MOON) / 2;
		const arrive = Math.PI * Math.sqrt((at * at * at) / MU_HOME);
		const moon = bodyStateAt(bodies, 'moon', arrive, 'system');
		const n = normalize(cross(moon.r, moon.v));
		const rHat = scale(normalize(moon.r), -1);
		const speed = Math.sqrt(MU_HOME * (2 / r0 - 1 / at));
		return {
			start: {
				body: 'home',
				r: scale(rHat, r0),
				v: scale(normalize(cross(n, rHat)), speed),
				t: 0
			},
			arrive
		};
	};

	test('(b) a vessel on its way to the moon against the moon, across the moon sphere', () => {
		const { start, arrive } = toMoon();
		const moon = bodyTrack(bodies, 'moon');
		const horizon = arrive * 1.2;
		const track = patchedTrack(bodies, start, horizon);
		expect(track.segments.length).toBeGreaterThanOrEqual(2);
		expect(track.segments.some((s) => s.body === 'moon')).toBe(true);
		const found = closestApproachPatched(bodies, start, moon, horizon);
		const ref = reference((t) => track.at(t).system, moon, track.t0, track.t1);
		expect(Math.abs(found.distance - ref.d)).toBeLessThan(1);
		expect(Math.abs(found.t - ref.t)).toBeLessThan(1);
		// It really passes the moon: well inside its sphere.
		expect(found.distance).toBeLessThan(bodies[1]!.soi);
		expect(found.body).toBe('moon');
		// The track agrees with plain propagation on the first stretch.
		const early = track.at(1_000);
		const plain = propagateUniversal(start.r, start.v, MU_HOME, 1_000);
		expect(length(sub(early.relative.r, plain.r))).toBeLessThan(1e-3);
		expect(length(sub(early.system.r, plain.r))).toBeLessThan(1e-3);
	});

	test('(c) a vessel in the moon sphere against a vessel orbiting the planet', () => {
		const start = {
			body: 'moon',
			r: circ(MU_MOON, 500_000, 0).r,
			v: circ(MU_MOON, 500_000, 0).v,
			t: 0
		};
		const moon = bodyStateAt(bodies, 'moon', 0, 'parent');
		const other = circ(MU_HOME, 11_000_000, 1);
		void moon;
		const target = conicTrack(bodies, 'home', other.r, other.v, 0);
		const horizon = 40_000;
		const track = patchedTrack(bodies, start, horizon);
		const found = closestApproachPatched(bodies, start, target, horizon);
		const ref = reference((t) => track.at(t).system, target, track.t0, track.t1);
		expect(Math.abs(found.distance - ref.d)).toBeLessThan(1);
		expect(Math.abs(found.t - ref.t)).toBeLessThan(1);
		expect(found.relativeSpeed).toBeGreaterThan(0);
	});
});

describe('matchVelocityBurn', () => {
	test('is target.v - own.v, in the orbital frame of the vessel, and zeroes the relative speed', () => {
		const own = circ(MU_HOME, 700_000, 0);
		const tgt = circ(MU_HOME, 760_000, 0.02);
		const m = matchVelocityBurn(own, tgt);
		const prograde = normalize(own.v);
		const radial = normalize(own.r);
		const expectedPro = dot(sub(tgt.v, own.v), prograde);
		expect(Math.abs(m.dv.prograde - expectedPro)).toBeLessThan(1e-9);
		expect(Math.abs(m.dv.radial - dot(sub(tgt.v, own.v), radial))).toBeLessThan(1e-9);
		expect(Math.abs(m.dv.normal)).toBeLessThan(1e-9);
		const after = add(own.v, m.burn);
		expect(length(sub(tgt.v, after))).toBeLessThan(1e-6);
		expect(m.magnitude).toBeCloseTo(length(sub(tgt.v, own.v)), 9);
	});
});

describe('hohmannTransfer', () => {
	test('equals the vis-viva hand values, LEO radius to geostationary radius', () => {
		const r1 = 7_000_000;
		const r2 = 42_164_000;
		const h = hohmannTransfer(MU_EARTH, r1, r2);
		const at = (r1 + r2) / 2;
		const vc1 = Math.sqrt(MU_EARTH / r1);
		const vp = Math.sqrt(MU_EARTH * (2 / r1 - 1 / at));
		const va = Math.sqrt(MU_EARTH * (2 / r2 - 1 / at));
		const vc2 = Math.sqrt(MU_EARTH / r2);
		expect(Math.abs(h.dv1 / (vp - vc1) - 1)).toBeLessThan(1e-6);
		expect(Math.abs(h.dv2 / (vc2 - va) - 1)).toBeLessThan(1e-6);
		expect(
			Math.abs(h.transferTime / (Math.PI * Math.sqrt((at * at * at) / MU_EARTH)) - 1)
		).toBeLessThan(1e-9);
		// Textbook magnitudes for this pair: about 2.4 and 1.5 km/s.
		expect(h.dv1).toBeGreaterThan(2_300);
		expect(h.dv1).toBeLessThan(2_500);
		expect(h.dv2).toBeGreaterThan(1_400);
		expect(h.dv2).toBeLessThan(1_550);
	});

	test('an inward transfer burns retrograde twice', () => {
		const h = hohmannTransfer(MU_EARTH, 42_164_000, 7_000_000);
		expect(h.dv1).toBeLessThan(0);
		expect(h.dv2).toBeLessThan(0);
	});
});

describe('hohmannToTarget', () => {
	for (const [name, r1, r2, a2] of [
		['outward', 7_000_000, 12_000_000, 1.0],
		['inward', 12_000_000, 7_000_000, 2.5]
	] as const) {
		test(`${name}: the vessel arrives within 1 m of the target after the transfer`, () => {
			const own = circ(MU_EARTH, r1, 0);
			const tgt = circ(MU_EARTH, r2, a2);
			const plan = hohmannToTarget(own, tgt, MU_EARTH, 100)!;
			expect(plan).toBeDefined();
			expect(plan.time).toBeCloseTo(100 + plan.wait, 9);
			const dep = propagateUniversal(own.r, own.v, MU_EARTH, plan.wait);
			const tDep = propagateUniversal(tgt.r, tgt.v, MU_EARTH, plan.wait);
			// The target leads by the phase angle of the research note at the departure.
			const lead = Math.atan2(
				dot(cross(normalize(dep.r), normalize(tDep.r)), normalize(cross(dep.r, dep.v))),
				dot(normalize(dep.r), normalize(tDep.r))
			);
			expect(
				Math.abs(Math.atan2(Math.sin(lead - plan.phaseAngle), Math.cos(lead - plan.phaseAngle)))
			).toBeLessThan(1e-9);
			const burned = { r: dep.r, v: add(dep.v, scale(normalize(dep.v), plan.dv1)) };
			const arrive = propagateUniversal(burned.r, burned.v, MU_EARTH, plan.transferTime);
			const there = propagateUniversal(tgt.r, tgt.v, MU_EARTH, plan.wait + plan.transferTime);
			expect(length(sub(arrive.r, there.r))).toBeLessThan(1);
		});
	}

	test('a window nearer than minWait gives way to the next one, a synodic period later', () => {
		const own = circ(MU_EARTH, 7_000_000, 0);
		const tgt = circ(MU_EARTH, 12_000_000, 1);
		const first = hohmannToTarget(own, tgt, MU_EARTH, 0)!;
		const next = hohmannToTarget(own, tgt, MU_EARTH, 0, first.wait + 1)!;
		const n1 = Math.sqrt(MU_EARTH / 7_000_000 ** 3);
		const n2 = Math.sqrt(MU_EARTH / 12_000_000 ** 3);
		expect(Math.abs(next.wait - first.wait - (2 * Math.PI) / (n1 - n2))).toBeLessThan(1e-6);
	});

	test('a target that goes the other way round, or shares the mean motion, has no window', () => {
		const own = circ(MU_EARTH, 7_000_000, 0);
		const back = circ(MU_EARTH, 9_000_000, 1);
		back.v = scale(back.v, -1);
		expect(hohmannToTarget(own, back, MU_EARTH, 0)).toBeUndefined();
		expect(hohmannToTarget(own, circ(MU_EARTH, 7_000_000, 1), MU_EARTH, 0)).toBeUndefined();
	});
});

describe('relativeNodes', () => {
	const tilt = (s: StateVector, angle: number): StateVector => {
		const rot = (p: Vec3): Vec3 => ({
			x: p.x,
			y: p.y * Math.cos(angle) - p.z * Math.sin(angle),
			z: p.y * Math.sin(angle) + p.z * Math.cos(angle)
		});
		return { r: rot(s.r), v: rot(s.v) };
	};

	test('two circular orbits 20 degrees apart: nodes on the line of nodes, half a period apart, 2 v sin(10 degrees)', () => {
		const own = circ(MU_EARTH, 7_000_000, 0.7);
		const tgt = tilt(circ(MU_EARTH, 9_000_000, 2), (20 * Math.PI) / 180);
		const nodes = relativeNodes(own, tgt, MU_EARTH, 50);
		expect(nodes).toHaveLength(2);
		const periodS = 2 * Math.PI * Math.sqrt(7_000_000 ** 3 / MU_EARTH);
		expect(Math.abs(nodes[1]!.time - nodes[0]!.time - periodS / 2)).toBeLessThan(1e-6);
		expect(new Set(nodes.map((n) => n.kind)).size).toBe(2);
		const v = Math.sqrt(MU_EARTH / 7_000_000);
		for (const n of nodes) {
			const there = propagateUniversal(own.r, own.v, MU_EARTH, n.time - 50);
			// On the x axis (the line of nodes of a tilt about x).
			const off = Math.acos(Math.min(1, Math.abs(there.r.x) / length(there.r)));
			expect(off).toBeLessThan(1e-9);
			expect(Math.abs(n.magnitude / (2 * v * Math.sin((10 * Math.PI) / 180)) - 1)).toBeLessThan(
				1e-6
			);
			const h2 = normalize(cross(there.r, add(there.v, n.burn)));
			const hT = normalize(cross(tgt.r, tgt.v));
			expect(Math.acos(Math.min(1, dot(h2, hT)))).toBeLessThan(1e-9);
			expect(n.angle).toBeCloseTo((20 * Math.PI) / 180, 9);
		}
	});

	test('a node nearer than minWait gives way to the next pass, with the same burn', () => {
		const own = circ(MU_EARTH, 7_000_000, 0.7);
		const tgt = tilt(circ(MU_EARTH, 9_000_000, 2), (20 * Math.PI) / 180);
		const all = relativeNodes(own, tgt, MU_EARTH, 0);
		const late = relativeNodes(own, tgt, MU_EARTH, 0, all[0]!.time + 1);
		const periodS = 2 * Math.PI * Math.sqrt(7_000_000 ** 3 / MU_EARTH);
		expect(late[0]!.kind).toBe(all[1]!.kind);
		expect(Math.abs(late[1]!.time - (all[0]!.time + periodS))).toBeLessThan(1e-6);
		expect(Math.abs(late[1]!.magnitude - all[0]!.magnitude)).toBeLessThan(1e-9);
	});

	test('parallel planes and escape orbits have no relative nodes', () => {
		const own = circ(MU_EARTH, 7_000_000, 0);
		expect(relativeNodes(own, circ(MU_EARTH, 9_000_000, 1), MU_EARTH, 0)).toEqual([]);
		const fast = { r: own.r, v: scale(own.v, 2) };
		expect(relativeNodes(fast, tilt(circ(MU_EARTH, 9_000_000, 1), 0.3), MU_EARTH, 0)).toEqual([]);
	});
});
