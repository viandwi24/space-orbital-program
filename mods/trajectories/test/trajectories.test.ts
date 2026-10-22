/** Plans 347 and 366, ADRs 0296 and 0307: where a coasting vessel comes down, and when it shows. */
import { describe, expect, test } from 'bun:test';
import { conicImpact, type Quat, type Vec3 } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '@orbital/sim';
import { orbitState } from '../../../packages/sim/test/helpers/measure.ts';
import { probe, rapier } from '../../../packages/sim/test/helpers/vessels.ts';
import Trajectories, {
	CLEAR_TARGET,
	PATH,
	predict,
	rotate,
	arcPieces,
	CLEAR_OF_VESSEL,
	PICK_TARGET,
	SET_SETTINGS,
	SET_TARGET,
	Settings,
	surfaceDistance,
	Target,
	visibility
} from '../src/index.ts';

const R = 600_000;
const MU = 3.5316e12;
const conj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

describe('predict (pure)', () => {
	test('without air or spin it comes down where the conic does', () => {
		const r = { x: R + 50_000, y: 0, z: 0 };
		const v = { x: 0, y: 300, z: -1_500 };
		const p = predict({
			r,
			v,
			mu: MU,
			radius: R,
			soi: 8e7,
			omega: { x: 0, y: 0, z: 0 },
			rotation: { x: 0, y: 0, z: 0, w: 1 },
			atmosphereHeight: 0,
			air: () => ({ density: 0 }),
			machFactor: () => 1,
			ground: () => 0,
			mass: 1_000,
			dragArea: 1
		});
		const conic = conicImpact(MU, r, v, R)!;
		expect(p.end).toBe('ground');
		expect(p.impact!.time).toBeCloseTo(conic.time, -1); // within 5 s
		expect(surfaceDistance(p.impact!.position, conic.position, R)).toBeLessThan(500);
		expect(p.path.length).toBeGreaterThan(10);
	});

	test('drag brings it down shorter; an orbit runs out of time', () => {
		const base = {
			r: { x: R + 30_000, y: 0, z: 0 },
			v: { x: 0, y: 0, z: -1_200 },
			mu: MU,
			radius: R,
			soi: 8e7,
			omega: { x: 0, y: 0, z: 0 },
			rotation: { x: 0, y: 0, z: 0, w: 1 },
			atmosphereHeight: 70_000,
			air: (h: number) => ({ density: 1.225 * Math.exp(-h / 5_000), speedOfSound: 300 }),
			machFactor: () => 1,
			ground: () => 0,
			mass: 1_000,
			dragArea: 1
		};
		const vac = predict({ ...base, dragArea: 0 });
		const air = predict(base);
		const here: Vec3 = base.r;
		expect(surfaceDistance(here, air.impact!.position, R)).toBeLessThan(
			surfaceDistance(here, vac.impact!.position, R)
		);
		expect(air.impact!.speed).toBeLessThan(vac.impact!.speed / 3);
		const orbit = predict({
			...base,
			r: { x: R + 200_000, y: 0, z: 0 },
			v: { x: 0, y: 0, z: -Math.sqrt(MU / (R + 200_000)) },
			maxTime: 600
		});
		expect(orbit.impact).toBeNull();
	});
});

const make = () =>
	createSim({ plugins: [Stock, Trajectories], backendFactory: rapier(16), seed: 4 });
function drop(sim: Sim, alt: number, speedFactor: number): number {
	const r = sim.dispatch({
		type: 'load-vessel',
		design: probe(),
		placement: {
			kind: 'state',
			...orbitState(sim, alt, speedFactor),
			orientation: { x: 0, y: 0, z: 0, w: 1 }
		}
	});
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return Number(r.vessel);
}

describe('when the path shows (plan 366: pad, ascent, orbit, re-entry, landed)', () => {
	const both = Settings.initial;
	const impact = { impact: { position: { x: R, y: 0, z: 0 }, time: 60, speed: 200 } };
	const at = (situation: string, height: number, radial: number) => ({
		situation: situation as never,
		radarAltitude: height,
		altitude: height,
		position: { x: R + height, y: 0, z: 0 },
		velocity: { x: radial, y: 0, z: 1_200 }
	});
	test('never on the pad, landed or splashed', () => {
		for (const s of ['prelaunch', 'landed', 'splashed'])
			expect(visibility(both, at(s, 0, 0), impact)).toEqual({ flight: 0, map: false });
	});
	test('ascent: hidden near the pad, fading in from 1 to 2 km, in the map whenever it comes down', () => {
		expect(visibility(both, at('flying', 400, 150), impact)).toEqual({ flight: 0, map: true });
		expect(visibility(both, at('flying', 1_500, 150), impact).flight).toBeCloseTo(0.5, 6);
		expect(visibility(both, at('flying', 8_000, 150), impact)).toEqual({ flight: 1, map: true });
		// only when descending: not on the way up
		const down = { ...both, descendingOnly: true };
		expect(visibility(down, at('flying', 8_000, 150), impact).map).toBe(false);
	});
	test('a stable orbit, or a path that never comes down, shows nothing', () => {
		expect(visibility(both, at('orbiting', 100_000, 0), impact)).toEqual({ flight: 0, map: false });
		expect(visibility(both, at('sub-orbital', 100_000, -50), { impact: null }).map).toBe(false);
	});
	test('re-entry: coming down through the air it shows in both; map only and off', () => {
		const reentry = at('sub-orbital', 60_000, -400);
		expect(visibility(both, reentry, impact)).toEqual({ flight: 1, map: true });
		expect(visibility({ ...both, descendingOnly: true }, reentry, impact).flight).toBe(1);
		expect(visibility({ ...both, show: 'map' }, reentry, impact)).toEqual({ flight: 0, map: true });
		expect(visibility({ ...both, show: 'off' }, reentry, impact)).toEqual({
			flight: 0,
			map: false
		});
	});
	test('the arc: nothing within 30 m of the vessel, faint near it, red where it is hot', () => {
		const path = Array.from({ length: 50 }, (_, i) => ({
			x: R + 5_000 - i * 100,
			y: 0,
			z: i * 10
		}));
		const samples = path.map((_, i) => ({ speed: 2_500 - i * 40, density: i < 25 ? 0.002 : 0.5 }));
		path.splice(1, 0, { x: path[0]!.x - 10, y: 0, z: 0 }); // 10 m from the vessel: dropped
		samples.splice(1, 0, samples[0]!);
		const pieces = arcPieces({ path, samples }, 1);
		const first = pieces[0]!.points[0]!;
		expect(
			Math.hypot(first.x - path[0]!.x, first.y - path[0]!.y, first.z - path[0]!.z)
		).toBeGreaterThanOrEqual(CLEAR_OF_VESSEL);
		const alpha = (c: string) => Number.parseInt(c.slice(7, 9), 16) / 255;
		expect(alpha(pieces[0]!.color)).toBeLessThan(alpha(pieces.at(-1)!.color));
		expect(pieces.some((p) => p.color.startsWith('#ef4444'))).toBe(true); // hot: low and fast
		expect(pieces.length).toBeLessThanOrEqual(10);
	});
});

describe('Trajectories in a sim', () => {
	const pathOf = (sim: Sim) => sim.snapshot().overlays?.[PATH.id];
	test('on the pad nothing; on a stable orbit nothing; map only and off from the panel', async () => {
		const sim = await make();
		const pad = sim.dispatch({ type: 'load-vessel', design: probe() });
		expect(pad.ok).toBe(true);
		for (let i = 0; i < 30; i++) sim.step(0.02);
		expect(pathOf(sim)).toBeUndefined();
		const orbit = drop(sim, 120_000, 1);
		for (let i = 0; i < 30; i++) sim.step(0.02);
		expect(pathOf(sim)).toBeUndefined();
		// a re-entry: it shows, in both views
		const id = drop(sim, 50_000, 0.6);
		for (let i = 0; i < 2 * 50; i++) sim.step(0.02);
		const views = pathOf(sim)!
			.shapes.filter((s) => Number(s.vessel) === id)
			.map((s) => s.views?.join('+'));
		expect(views).toContain('flight+map');
		expect(pathOf(sim)!.shapes.some((s) => Number(s.vessel) === orbit)).toBe(false);
		// map only
		expect(
			sim.dispatch({ type: 'mod-key', key: SET_SETTINGS.id, vessel: id, data: { show: 'map' } }).ok
		).toBe(true);
		for (let i = 0; i < 15; i++) sim.step(0.02);
		expect(sim.snapshot().stores?.[Settings.id]).toEqual({ show: 'map', descendingOnly: false });
		expect(pathOf(sim)!.shapes.every((s) => s.views?.join('+') === 'map')).toBe(true);
		sim.dispatch({ type: 'mod-key', key: SET_SETTINGS.id, data: { show: 'off' } });
		for (let i = 0; i < 15; i++) sim.step(0.02);
		expect(pathOf(sim)).toBeUndefined();
		sim.dispose();
	}, 120_000);

	test('a landing target picked on the map', async () => {
		const sim = await make();
		const id = drop(sim, 30_000, 0.5);
		expect(
			sim.dispatch({
				type: 'mod-key',
				key: PICK_TARGET.id,
				vessel: id,
				data: { body: 'stock.home', x: 0, y: 1, z: 0 }
			}).ok
		).toBe(true);
		expect(sim.snapshot().stores?.[Target.id]).toMatchObject({
			body: 'stock.home',
			lat: Math.PI / 2
		});
		for (let i = 0; i < 15; i++) sim.step(0.02);
		expect(pathOf(sim)!.shapes.some((s) => s.kind === 'marker' && s.style === 'target')).toBe(true);
		sim.dispose();
	}, 120_000);

	test('a probe dropped from 30 km lands near the predicted cross-hair; the target and its error', async () => {
		const sim = await make();
		const id = drop(sim, 30_000, 0.5);
		// a controlled descent: SAS holds retrograde, so the drag area settles (a tumbling probe's
		// swings with its attitude; the prediction then converges only as it falls)
		sim.dispatch({ type: 'sas', vessel: id as never, mode: 'retrograde' });
		for (let i = 0; i < 10 * 50; i++) sim.step(0.02);
		const s0 = sim.snapshot();
		const layer = s0.overlays?.[PATH.id];
		expect(layer).toBeDefined();
		const cross = layer!.shapes.find((s) => s.kind === 'marker' && s.style === 'cross');
		if (!cross || cross.kind !== 'marker') throw new Error('no impact cross-hair');
		expect(cross.frame).toBe('body-fixed');
		expect(Number(cross.vessel)).toBe(id);
		const predictedTime = layer!.meta![`time:${id}`] as number;
		const flight = layer!.meta![`distance:${id}`] as number;
		expect(predictedTime).toBeGreaterThan(30);

		// set the landing target at the impact: the overlay draws it, about 0 m off
		expect(sim.dispatch({ type: 'mod-key', key: SET_TARGET.id, vessel: id })).toMatchObject({
			ok: true
		});
		for (let i = 0; i < 15; i++) sim.step(0.02);
		expect(sim.snapshot().stores?.[Target.id]).toMatchObject({ body: 'stock.home' });
		const withTarget = sim.snapshot().overlays![PATH.id]!;
		expect(withTarget.shapes.some((s) => s.kind === 'marker' && s.style === 'target')).toBe(true);
		expect(withTarget.meta![`error:${id}`] as number).toBeLessThan(0.02 * flight + 50);

		// fly it down and note where it ends, in the body's axes
		let last: Vec3 | null = null;
		let t = 0;
		for (let i = 0; i < 400 * 50; i++) {
			sim.step(0.02);
			if (i % 10 !== 0) continue;
			const snap = sim.snapshot();
			const v = snap.vessels.find((x) => Number(x.id) === id);
			if (!v) break;
			const home = snap.bodies.find((b) => b.id === 'stock.home')!;
			last = rotate(conj(home.rotation), v.position);
			t = snap.t;
			if (v.situation === 'landed' || v.situation === 'splashed') break;
		}
		expect(last).not.toBeNull();
		const miss = surfaceDistance(last!, cross.position, R);
		console.log(
			`trajectories: predicted ${predictedTime} s over ${flight} m; flew ${Math.round(t - s0.t)} s; missed by ${Math.round(miss)} m`
		);
		expect(miss).toBeLessThan(0.02 * flight + 100);
		expect(Math.abs(t - s0.t - predictedTime)).toBeLessThan(0.05 * predictedTime + 2);

		sim.dispatch({ type: 'mod-key', key: CLEAR_TARGET.id, vessel: id });
		expect(sim.snapshot().stores?.[Target.id]).toBeNull();
		sim.dispose();
	}, 120_000);
});
