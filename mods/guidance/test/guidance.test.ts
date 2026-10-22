/**
 * The Guidance Computer in the headless sim (plan 321): a node is executed, an orbit circularized,
 * a two-stage rocket flown from the pad to orbit, a lander set down on the moon; the player's
 * throttle wins during a burn (ADR 0276) and `program-stop` disengages.
 */
import { describe, expect, test } from 'bun:test';
import { partId, type CommandResult, type EntityId, type VesselDesign } from '@orbital/sdk';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim, type Sim } from '@orbital/sim';
import GuidanceMod, {
	cross,
	latLonOf,
	length,
	orbitOf,
	pointAt,
	rotate,
	surfaceDistance,
	visViva
} from '../src/index.ts';

const HOME_RADIUS = 600_000;
const MOON_RADIUS = 190_000;

const stack = (name: string, parts: string[], stages: number[][]): VesselDesign =>
	({
		formatVersion: 1,
		name,
		parts: parts.map((part, index) => ({
			index,
			part: partId(part),
			parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
		})),
		stages
	}) as VesselDesign;

/** One engine, one tank: for node and circularize burns. */
const tug = (): VesselDesign =>
	stack('Tug', ['stock.command-pod', 'stock.reaction-wheel', 'stock.tank-small', 'stock.engine-lv'], [[3]]);
/** The reference two-stage rocket (pod, wheel, tank, engine, decoupler, tank, engine). */
const twoStage = (): VesselDesign =>
	stack(
		'Two-stage',
		[
			'stock.command-pod',
			'stock.reaction-wheel',
			'stock.tank-small',
			'stock.engine-lv',
			'stock.decoupler',
			'stock.tank-small',
			'stock.engine-lv'
		],
		[[6], [4, 3]]
	);
/** Pod, two wheels, a medium tank, engine, legs. */
const lander = (): VesselDesign =>
	stack(
		'Lander',
		[
			'stock.command-pod',
			'stock.reaction-wheel',
			'stock.reaction-wheel',
			'stock.tank-medium',
			'stock.engine-lv',
			'stock.landing-legs'
		],
		[[4]]
	);

const loaded = (r: CommandResult): EntityId => {
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return r.vessel;
};
const newSim = (): Promise<Sim> =>
	createSim({
		plugins: [Stock, GuidanceMod],
		backendFactory: () => createRapierBackend({ solverIterations: 8 }),
		seed: 5
	});
const muOf = (sim: Sim, body: string): number => {
	const b = sim.registries.bodies.get(body)!;
	return b.mass * 6.6743e-11;
};
const vesselOf = (sim: Sim, id: EntityId) => sim.snapshot().vessels.find((v) => v.id === id);

/** Step until the vessel's autopilot ends (or `limit` sim seconds); returns how it ended. */
function fly(sim: Sim, id: EntityId, limit: number, each?: (t: number) => void): string {
	let ended = '';
	const off = sim.events.on('autopilot:ended', (e) => {
		if (e.vessel === id) ended = `${e.outcome}: ${e.reason}`;
	});
	const start = sim.time;
	while (!ended && sim.time - start < limit) {
		sim.step(0.1);
		each?.(sim.time - start);
	}
	off();
	return ended || 'still running';
}

/** A state on a circular equatorial orbit at `alt` around `body` (prograde about +Y). */
function circular(sim: Sim, body: string, radius: number, alt: number) {
	const r = radius + alt;
	return {
		body,
		position: { x: r, y: 0, z: 0 },
		velocity: { x: 0, y: 0, z: -Math.sqrt(muOf(sim, body) / r) }
	};
}

describe('Guidance Computer (plan 321)', () => {
	test('executes a 300 m/s prograde node to within a metre per second', async () => {
		const sim = await newSim();
		const mu = muOf(sim, 'stock.home');
		const id = loaded(
			sim.dispatch({
				type: 'load-vessel',
				design: tug(),
				placement: { kind: 'state', ...circular(sim, 'stock.home', HOME_RADIUS, 100_000) }
			})
		);
		expect(sim.dispatch({ type: 'stage', vessel: id }).ok).toBe(true);
		const at = sim.time + 90;
		expect(sim.dispatch({ type: 'node-set', vessel: id, time: at, prograde: 300, normal: 0, radial: 0 }).ok).toBe(true);
		expect(sim.dispatch({ type: 'autopilot-engage', vessel: id, autopilot: 'guidance.node' }).ok).toBe(true);
		let worst = 0;
		const ended = fly(sim, id, 300, () => {
			const node = vesselOf(sim, id)?.nodes?.[0];
			if (node) worst = node.dv;
		});
		expect(ended).toMatch(/^done/);
		expect(worst).toBeLessThan(1);
		// the impulsive prediction: from a 700 km circle, +300 m/s
		const r = HOME_RADIUS + 100_000;
		const v = Math.sqrt(mu / r) + 300;
		const a = 1 / (2 / r - (v * v) / mu);
		const s = vesselOf(sim, id)!;
		const o = orbitOf(s.position, s.velocity, mu);
		expect(Math.abs(o.apoapsis - (2 * a - r)) / (2 * a - r)).toBeLessThan(0.02);
		sim.dispose();
	}, 120_000);

	test('circularizes at the apoapsis of a 100 x 75 km orbit', async () => {
		const sim = await newSim();
		const mu = muOf(sim, 'stock.home');
		const rp = HOME_RADIUS + 75_000;
		const ra = HOME_RADIUS + 100_000;
		const a = (rp + ra) / 2;
		const e = (ra - rp) / (ra + rp);
		const p = a * (1 - e * e);
		// 150 degrees past the periapsis: the apoapsis is a few minutes ahead
		const nu = (150 * Math.PI) / 180;
		const rr = p / (1 + e * Math.cos(nu));
		const k = Math.sqrt(mu / p);
		const position = { x: rr * Math.cos(nu), y: 0, z: -rr * Math.sin(nu) };
		const radial = k * e * Math.sin(nu);
		const across = k * (1 + e * Math.cos(nu));
		const velocity = {
			x: radial * Math.cos(nu) - across * Math.sin(nu),
			y: 0,
			z: -(radial * Math.sin(nu) + across * Math.cos(nu))
		};
		expect(visViva(mu, length(position), a)).toBeCloseTo(length(velocity), 3);
		const id = loaded(
			sim.dispatch({
				type: 'load-vessel',
				design: tug(),
				placement: { kind: 'state', body: 'stock.home', position, velocity }
			})
		);
		sim.dispatch({ type: 'stage', vessel: id });
		expect(
			sim.dispatch({ type: 'autopilot-engage', vessel: id, autopilot: 'guidance.circularize', params: { at: 'apoapsis' } }).ok
		).toBe(true);
		const ended = fly(sim, id, 900);
		expect(ended).toMatch(/^done/);
		const s = vesselOf(sim, id)!;
		expect(orbitOf(s.position, s.velocity, mu).e).toBeLessThan(0.005);
		sim.dispose();
	}, 240_000);

	test('flies the two-stage rocket from the pad to an orbit above 70 km', async () => {
		const sim = await newSim();
		const mu = muOf(sim, 'stock.home');
		const id = loaded(sim.dispatch({ type: 'load-vessel', design: twoStage() }));
		expect(
			sim.dispatch({ type: 'autopilot-engage', vessel: id, autopilot: 'guidance.ascent', params: { altitude: 80_000 } }).ok
		).toBe(true);
		const ended = fly(sim, id, 1_500);
		const s = vesselOf(sim, id)!;
		const o = orbitOf(s.position, s.velocity, mu);
		expect(ended).toMatch(/^done/);
		expect(o.periapsis - HOME_RADIUS).toBeGreaterThan(70_000);
		sim.dispose();
	}, 600_000);

	test('flies the ascent to an inclination of 30° (plan 332)', async () => {
		const sim = await newSim();
		const id = loaded(sim.dispatch({ type: 'load-vessel', design: twoStage() }));
		expect(
			sim.dispatch({
				type: 'autopilot-engage',
				vessel: id,
				autopilot: 'guidance.ascent',
				params: { altitude: 80_000, inclination: 30 }
			}).ok
		).toBe(true);
		const ended = fly(sim, id, 1_500);
		expect(ended).toMatch(/^done/);
		const s = vesselOf(sim, id)!;
		const h = cross(s.position, s.velocity);
		const inclination = (Math.acos(h.y / length(h)) * 180) / Math.PI;
		expect(Math.abs(inclination - 30)).toBeLessThan(3);
		sim.dispose();
	}, 600_000);

	test('sets a lander down on the moon from 20 km', async () => {
		const sim = await newSim();
		const start = circular(sim, 'stock.cinder', MOON_RADIUS, 20_000);
		// a slow suborbital pass: a third of orbital speed
		start.velocity = { x: 0, y: 0, z: start.velocity.z / 3 };
		const id = loaded(
			sim.dispatch({
				type: 'load-vessel',
				design: lander(),
				placement: { kind: 'state', ...start, orientation: { x: 0, y: 0, z: -0.7071068, w: 0.7071068 } }
			})
		);
		sim.dispatch({ type: 'stage', vessel: id });
		const leg = vesselOf(sim, id)!.parts.find((p) => p.definition === 'stock.landing-legs')!;
		expect(sim.dispatch({ type: 'action', vessel: id, part: leg.id, module: 'stock.landing-leg', action: 'deploy' }).ok).toBe(true);
		const parts = vesselOf(sim, id)!.parts.length;
		expect(sim.dispatch({ type: 'autopilot-engage', vessel: id, autopilot: 'guidance.land' }).ok).toBe(true);
		let contact = Infinity;
		const ended = fly(sim, id, 900, () => {
			const s = vesselOf(sim, id);
			if (!s) return;
			// the autopilot's clearance of the lowest part: the speed when the feet reach the ground
			const h = s.autopilot?.readouts.Height;
			const v = s.autopilot?.readouts.Speed; // over the ground: the moon turns under the lander
			if (typeof h === 'number' && typeof v === 'number' && h <= 0.5 && contact === Infinity)
				contact = v;
		});
		expect(ended).toMatch(/^done/);
		const s = vesselOf(sim, id)!;
		expect(s.parts.length).toBe(parts);
		expect(contact).toBeLessThan(2);
		sim.dispose();
	}, 300_000);

	test('lands near a target picked 150° ahead on the moon, from a 20 km orbit (plan 372)', async () => {
		const sim = await newSim();
		const start = circular(sim, 'stock.cinder', MOON_RADIUS, 20_000);
		const id = loaded(
			sim.dispatch({
				type: 'load-vessel',
				design: lander(),
				placement: { kind: 'state', ...start, orientation: { x: 0, y: 0, z: -0.7071068, w: 0.7071068 } }
			})
		);
		sim.dispatch({ type: 'stage', vessel: id });
		const leg = vesselOf(sim, id)!.parts.find((p) => p.definition === 'stock.landing-legs')!;
		sim.dispatch({ type: 'action', vessel: id, part: leg.id, module: 'stock.landing-leg', action: 'deploy' });
		// the target: 150° along the orbit (prograde about +Y), in the moon's own axes now
		const moon = () => sim.snapshot().bodies.find((b) => b.id === 'stock.cinder')!;
		const conj = (q: { x: number; y: number; z: number; w: number }) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
		const ahead = (150 * Math.PI) / 180;
		const fixed = rotate(conj(moon().rotation), { x: Math.cos(ahead), y: 0, z: -Math.sin(ahead) });
		const target = { body: 'stock.cinder', ...latLonOf(fixed) };
		expect(
			sim.dispatch({ type: 'autopilot-engage', vessel: id, autopilot: 'guidance.land', params: { target } }).ok
		).toBe(true);
		let lastLog = -1e9;
		const ended = fly(sim, id, 4_000, (t) => {
			const ap = vesselOf(sim, id)?.autopilot;
			if (process.env.LAND_TRACE && ap && t - lastLog > 10) {
				lastLog = t;
				console.log(Math.round(t), ap.phase, ap.status, JSON.stringify(ap.readouts));
			}
		});
		expect(ended).toMatch(/^done/);
		const s = vesselOf(sim, id)!;
		const here = rotate(conj(moon().rotation), s.position);
		const miss = surfaceDistance(here, pointAt(target.lat, target.lon, MOON_RADIUS), MOON_RADIUS);
		console.log(`targeted landing: ${ended}, ${Math.round(miss)} m from the target`);
		expect(miss).toBeLessThan(3_000);
		sim.dispose();
	}, 300_000);

	test('the player throttle wins a burn, the burn goes on after; program-stop disengages', async () => {
		const sim = await newSim();
		const id = loaded(
			sim.dispatch({
				type: 'load-vessel',
				design: tug(),
				placement: { kind: 'state', ...circular(sim, 'stock.home', HOME_RADIUS, 100_000) }
			})
		);
		sim.dispatch({ type: 'stage', vessel: id });
		sim.dispatch({ type: 'node-set', vessel: id, time: sim.time + 40, prograde: 600, normal: 0, radial: 0 });
		sim.dispatch({ type: 'autopilot-engage', vessel: id, autopilot: 'guidance.node' });
		let burning = false;
		while (!burning && sim.time < 200) {
			sim.step(0.1);
			burning = vesselOf(sim, id)?.autopilot?.phase === 'burn';
		}
		expect(burning).toBe(true);
		sim.dispatch({ type: 'throttle', vessel: id, value: 0 }); // the player
		const dv = () => vesselOf(sim, id)!.nodes![0]!.dv;
		const held = dv();
		for (let i = 0; i < 5; i++) sim.step(0.1);
		expect(Math.abs(dv() - held)).toBeLessThan(1); // no burning while the player holds it
		for (let i = 0; i < 20; i++) sim.step(0.1);
		expect(dv()).toBeLessThan(held - 5); // the program took the throttle back
		const reasons: string[] = [];
		sim.events.on('autopilot:ended', (e) => reasons.push(`${e.outcome} ${e.reason}`));
		expect(sim.dispatch({ type: 'program-stop', vessel: id, reason: 'Delete key' }).ok).toBe(true);
		expect(reasons).toEqual(['disengaged Delete key']);
		expect(vesselOf(sim, id)!.autopilot).toBeUndefined();
		sim.dispose();
	}, 120_000);

	test('engaging without a node or engine says why', async () => {
		const sim = await newSim();
		const id = loaded(
			sim.dispatch({
				type: 'load-vessel',
				design: tug(),
				placement: { kind: 'state', ...circular(sim, 'stock.home', HOME_RADIUS, 100_000) }
			})
		);
		const node = sim.dispatch({ type: 'autopilot-engage', vessel: id, autopilot: 'guidance.node' });
		expect(node.ok ? '' : node.reason).toMatch(/no maneuver node/);
		const land = sim.dispatch({ type: 'autopilot-engage', vessel: id, autopilot: 'guidance.land' });
		expect(land.ok ? '' : land.reason).toMatch(/stage first/);
		sim.dispose();
	});
});
