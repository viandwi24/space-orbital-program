/** Plan 045: burn time, the burn indicator, handle drags and picking a time on the path. */
import { describe, expect, it } from 'vitest';
import {
	HANDLES,
	NODE_KEYS,
	burnIndicator,
	burnTime,
	dvFromDrag,
	dvPerPixel,
	modifierScale,
	orbitPeriod,
	parseDv,
	pickTime,
	shiftByOrbits,
	TIME_STEPS
} from './maneuver';
import { fromStateVector, trajectoryFor } from '@orbital/kepler';

const G0 = 9.80665;
/** The numbers of a stock stage: LV-T30-like engine, 215 kN, Isp 300 s, 7 t at start, 3 t at the end. */
const stage = (() => {
	const thrust = 215_000;
	const isp = 300;
	const massStart = 7_000;
	const massEnd = 3_000;
	const ve = isp * G0;
	return {
		dvVacuum: ve * Math.log(massStart / massEnd),
		burnTime: (massStart - massEnd) / (thrust / ve),
		massStart,
		massEnd,
		thrust,
		ve
	};
})();

describe('burn time', () => {
	it('equals the Tsiolkovsky value m0 (1 - exp(-dv/ve)) / mdot for a delta-v inside one stage (1e-9)', () => {
		for (const dv of [50, 400, 1_000, stage.dvVacuum * 0.99]) {
			const expected =
				(stage.massStart * (1 - Math.exp(-dv / stage.ve))) / (stage.thrust / stage.ve);
			const got = burnTime(dv, [stage]);
			expect(got.enough).toBe(true);
			expect(Math.abs(got.time - expected) / expected).toBeLessThan(1e-9);
		}
	});
	it('a whole stage takes its burn time, and stages add up in order', () => {
		const second = { dvVacuum: 800, burnTime: 20, massStart: 2_000, massEnd: 1_200 };
		const all = burnTime(stage.dvVacuum, [stage, second]);
		expect(all.time).toBeCloseTo(stage.burnTime, 9);
		const both = burnTime(stage.dvVacuum + 800, [stage, second]);
		expect(both.time).toBeCloseTo(stage.burnTime + 20, 9);
		expect(both.enough).toBe(true);
		const partial = burnTime(stage.dvVacuum + 100, [stage, second]);
		expect(partial.time).toBeGreaterThan(stage.burnTime);
		expect(partial.time).toBeLessThan(stage.burnTime + 20);
	});
	it('says when the fuel is not enough and skips stages with no burn', () => {
		const r = burnTime(10_000, [{ dvVacuum: 0, burnTime: 0, massStart: 1, massEnd: 1 }, stage]);
		expect(r.enough).toBe(false);
		expect(r.time).toBeCloseTo(stage.burnTime, 9);
		expect(burnTime(0, [stage])).toEqual({ time: 0, enough: true });
	});
});

describe('burn indicator', () => {
	const node = 1_000;
	const burn = 20; // starts at 990, ends at 1010
	const at = (now: number, remaining = 100) => burnIndicator(now, node, burn, remaining);
	it('counts down to the start half a burn before the node', () => {
		const i = at(900);
		expect(i.state).toBe('ahead');
		expect(i.toBurn).toBe(90);
		expect(i.toNode).toBe(100);
		expect(i.startsAt).toBe(990);
		expect(i.endsAt).toBe(1_010);
	});
	it('is "burn" inside the centred window and a few seconds after it', () => {
		expect(at(990).state).toBe('burn');
		expect(at(1_000, 50).state).toBe('burn');
		expect(at(1_012, 5).state).toBe('burn');
	});
	it('is overdue once the window is over and delta-v remains', () => {
		expect(at(1_020, 40).state).toBe('overdue');
		expect(at(1_020, 0.2).state).toBe('burn');
	});
	it('a zero burn time starts at the node', () => {
		expect(burnIndicator(999, node, 0, 10).state).toBe('ahead');
		expect(burnIndicator(1_000, node, 0, 10).state).toBe('burn');
	});
});

describe('handle drags', () => {
	const by = (kind: string) => HANDLES.find((h) => h.kind === kind)!;
	const right = { x: 1, y: 0 };
	it('dragging outward along a prograde handle adds prograde, along retrograde subtracts', () => {
		const pro = dvFromDrag(by('prograde'), right, 100, 0, 7_500);
		const retro = dvFromDrag(by('retrograde'), right, 100, 0, 7_500);
		expect(pro).toBeCloseTo(100 * dvPerPixel(7_500), 9);
		expect(retro).toBeCloseTo(-pro, 9);
		expect(pro).toBeGreaterThan(0);
	});
	it('normal/antinormal and radial out/in follow the same sign rule', () => {
		const up = { x: 0, y: -1 };
		expect(dvFromDrag(by('normal'), up, 0, -50, 2_000)).toBeGreaterThan(0);
		expect(dvFromDrag(by('anti-normal'), up, 0, -50, 2_000)).toBeLessThan(0);
		expect(dvFromDrag(by('radial-out'), up, 0, -50, 2_000)).toBeGreaterThan(0);
		expect(dvFromDrag(by('radial-in'), up, 0, -50, 2_000)).toBeLessThan(0);
	});
	it('only the motion along the handle counts, and dragging back undoes it', () => {
		expect(dvFromDrag(by('prograde'), right, 0, 80, 7_500)).toBeCloseTo(0, 12);
		expect(dvFromDrag(by('prograde'), right, -40, 0, 7_500)).toBeLessThan(0);
		const diag = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
		expect(dvFromDrag(by('prograde'), diag, 50, 50, 7_500)).toBeCloseTo(
			Math.hypot(50, 50) * dvPerPixel(7_500),
			9
		);
	});
	it('Shift is ten times coarser, Alt ten times finer, both cancel to 1', () => {
		const base = dvFromDrag(by('prograde'), right, 30, 0, 7_500);
		expect(dvFromDrag(by('prograde'), right, 30, 0, 7_500, { shift: true })).toBeCloseTo(
			10 * base,
			9
		);
		expect(dvFromDrag(by('prograde'), right, 30, 0, 7_500, { alt: true })).toBeCloseTo(
			base / 10,
			9
		);
		expect(modifierScale({ shift: true, alt: true })).toBe(1);
	});
	it('the scale grows with speed but never gets finer than 0.05 m/s per pixel', () => {
		expect(dvPerPixel(100)).toBe(0.05);
		expect(dvPerPixel(8_000)).toBeCloseTo(2, 9);
	});
	it('has six handles over three axes and a key for each', () => {
		expect(HANDLES).toHaveLength(6);
		expect(new Set(HANDLES.map((h) => h.axis)).size).toBe(3);
		expect(Object.keys(NODE_KEYS)).toHaveLength(6);
	});
});

describe('picking a time on the path', () => {
	// A horizontal line from x=0 (t=0) to x=100 (t=1000) at y=50, then down to y=150 at t=1500.
	const line = [
		{ x: 0, y: 50, t: 0 },
		{ x: 100, y: 50, t: 1_000 },
		{ x: 100, y: 150, t: 1_500 }
	];
	it('returns the interpolated time of the nearest point within the radius', () => {
		const hit = pickTime(line, 25, 55, 12)!;
		expect(hit.t).toBeCloseTo(250, 9);
		expect(hit.distance).toBeCloseTo(5, 9);
		expect(pickTime(line, 100, 100, 12)!.t).toBeCloseTo(1_250, 9);
	});
	it('returns nothing farther than the radius, and clamps beyond the ends', () => {
		expect(pickTime(line, 50, 80, 12)).toBeNull();
		expect(pickTime(line, 50, 63, 12)).toBeNull();
		expect(pickTime(line, 50, 62.5, 12.5)!.t).toBeCloseTo(500, 9);
		expect(pickTime(line, -5, 50, 12)!.t).toBe(0);
		expect(pickTime([], 0, 0)).toBeNull();
		expect(pickTime([line[0]!], 0, 50)).toBeNull();
	});
});

describe('node panel (plan 224)', () => {
	const MU = 3.5316e12;
	const R = 700_000;
	const bodies = [{ id: 'home', mu: MU, soi: 1e12, radius: R }];
	const r = R + 100_000;
	const start = {
		body: 'home',
		r: { x: r, y: 0, z: 0 },
		v: { x: 0, y: 0, z: -Math.sqrt(MU / r) * 1.02 },
		t: 0
	};

	it('reads typed delta-v with or without the unit, and refuses text that is no number', () => {
		expect(parseDv('250')).toBe(250);
		expect(parseDv(' 250 m/s ')).toBe(250);
		expect(parseDv('-12,5')).toBe(-12.5);
		expect(parseDv('abc')).toBeNull();
		expect(parseDv('')).toBeNull();
	});

	it('a typed value changes only its axis and resolves to that burn', () => {
		const node = { id: 1, time: 600, prograde: 0, normal: 0, radial: 0 };
		const typed = { ...node, prograde: parseDv('250')! };
		const path = trajectoryFor(bodies).predictWithManeuvers(start, [typed], 700);
		const done = path.nodes[0]!;
		expect(done.dv.prograde).toBeCloseTo(250, 9);
		expect(done.dv.normal).toBeCloseTo(0, 9);
		expect(done.dv.radial).toBeCloseTo(0, 9);
	});

	it('a node moved +1 orbit keeps its delta-v and shifts by one period', () => {
		const node = { id: 1, time: 900, prograde: 120, normal: -15, radial: 8 };
		const el = fromStateVector(start.r, start.v, MU, 0);
		const period = orbitPeriod(el.a, el.e, MU)!;
		const moved = shiftByOrbits(node, 1, period, 0)!;
		expect(moved.time - node.time).toBeCloseTo(period, 9);
		expect([moved.prograde, moved.normal, moved.radial]).toEqual([120, -15, 8]);
		const at = (n: typeof node) =>
			trajectoryFor(bodies).predictWithManeuvers(start, [n], n.time - start.t + 1).nodes[0]!;
		const a = at(node);
		const b = at(moved);
		// the same point of the orbit, the same burn, the same orbit after it
		expect(Math.hypot(a.pre.r.x - b.pre.r.x, a.pre.r.y - b.pre.r.y, a.pre.r.z - b.pre.r.z)).toBeLessThan(1e-3);
		expect(b.magnitude).toBeCloseTo(a.magnitude, 9);
		const ea = fromStateVector(a.post.r, a.post.v, MU, a.time);
		const eb = fromStateVector(b.post.r, b.post.v, MU, b.time);
		expect(eb.a).toBeCloseTo(ea.a, 3);
		expect(eb.e).toBeCloseTo(ea.e, 9);
		// an open orbit has no period; a move into the past is refused
		expect(shiftByOrbits(node, 1, null, 0)).toBeNull();
		expect(shiftByOrbits(node, -1, period, 0)).toBeNull();
		expect(TIME_STEPS).toEqual([1, 10, 60, 600]);
	});
});
