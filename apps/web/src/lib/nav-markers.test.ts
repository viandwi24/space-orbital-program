/** Plan 224: AN/DN of the orbit against a reference plane, and the apsides of a planned stretch. */
import { describe, expect, it } from 'vitest';
import { propagateUniversal, type StateVector } from '@orbital/kepler';
import { planeNodes, referenceNormal, stretchApsides } from './nav-markers';

const MU = 3.5316e12;
const R = 700_000;

/** A circular orbit of radius `r` inclined `deg` about +X (pole +Y), from the +X axis. */
function circular(r: number, deg: number, eAt = 0): StateVector {
	const i = (deg * Math.PI) / 180;
	const speed = Math.sqrt(MU / r) * (1 + eAt);
	return { r: { x: r, y: 0, z: 0 }, v: { x: 0, y: speed * Math.sin(i), z: -speed * Math.cos(i) } };
}

describe('plane nodes', () => {
	it('of two orbits 5 degrees apart are 180 degrees apart in true anomaly', () => {
		const own = circular(R + 100_000, 0, 0.05); // a little eccentric, so true anomaly is defined
		const other = circular(R + 300_000, 5);
		const ref = referenceNormal(
			own,
			{
				position: { x: other.r.x - own.r.x, y: other.r.y - own.r.y, z: other.r.z - own.r.z },
				velocity: { x: other.v.x - own.v.x, y: other.v.y - own.v.y, z: other.v.z - own.v.z },
				sameSphere: true
			},
			{ x: 0, y: 1, z: 0 }
		);
		expect(ref.relativeTo).toBe('target');
		const nodes = planeNodes(own, ref.normal, MU, 0);
		expect(nodes.map((n) => n.kind).sort()).toEqual(['ascending', 'descending']);
		const [a, b] = nodes as [(typeof nodes)[0], (typeof nodes)[0]];
		const gap = Math.abs(a.trueAnomaly - b.trueAnomaly);
		expect(Math.abs(gap - Math.PI)).toBeLessThan(1e-9);
		// both lie on the reference plane and on the vessel's path at their time
		for (const n of nodes) {
			const there = propagateUniversal(own.r, own.v, MU, n.time).r;
			expect(
				Math.hypot(there.x - n.position.x, there.y - n.position.y, there.z - n.position.z)
			).toBeLessThan(1e-3);
			const off =
				n.position.x * ref.normal.x + n.position.y * ref.normal.y + n.position.z * ref.normal.z;
			expect(Math.abs(off)).toBeLessThan(1);
		}
	});

	it('use the equator without a target; an orbit in the reference plane has none', () => {
		const tilted = circular(R + 100_000, 10);
		const ref = referenceNormal(tilted, null, { x: 0, y: 1, z: 0 });
		expect(ref.relativeTo).toBe('equator');
		const nodes = planeNodes(tilted, ref.normal, MU, 100);
		expect(nodes).toHaveLength(2);
		// the start point (+X, y = 0, heading +Y) is the ascending node: the next is a full period on
		const period = 2 * Math.PI * Math.sqrt((R + 100_000) ** 3 / MU);
		const asc = nodes.find((n) => n.kind === 'ascending')!;
		const desc = nodes.find((n) => n.kind === 'descending')!;
		expect(desc.time - 100).toBeCloseTo(period / 2, 3);
		expect(asc.time - 100 === 0 || Math.abs(asc.time - 100 - period) < 1e-3).toBe(true);
		expect(planeNodes(circular(R + 100_000, 0), { x: 0, y: 1, z: 0 }, MU, 0)).toEqual([]);
	});
});

describe('stretch apsides', () => {
	it('finds the apoapsis half a period after a periapsis start', () => {
		const start = circular(R + 100_000, 0, 0.1); // at periapsis, faster than circular
		const marks = stretchApsides(start, MU, 1e7);
		const ap = marks.find((m) => m.kind === 'apoapsis')!;
		const pe = marks.find((m) => m.kind === 'periapsis')!;
		const r = R + 100_000;
		const energy = (Math.sqrt(MU / r) * 1.1) ** 2 / 2 - MU / r;
		const a = -MU / (2 * energy);
		const period = 2 * Math.PI * Math.sqrt(a ** 3 / MU);
		expect(ap.after).toBeCloseTo(period / 2, 3);
		expect(ap.radius).toBeCloseTo(2 * a - r, 0);
		expect(pe.after).toBeLessThan(1e-6);
		expect(stretchApsides(start, MU, period / 4).map((m) => m.kind)).toEqual(['periapsis']);
	});
});
