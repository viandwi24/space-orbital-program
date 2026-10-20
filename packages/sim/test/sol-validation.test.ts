/**
 * The Sol pack's validation suite (plan 124, ADR 0184 point 6), per variant: the reference rocket
 * reaches a stable orbit above the air; a transfer from that orbit enters the Moon's sphere; a
 * shielded probe comes back from orbital speed with no part over its limit; the home station links
 * to a lunar orbiter for the share the pack states.
 */
import { describe, expect, test } from 'bun:test';
import {
	GRAVITATIONAL_CONSTANT,
	LEGACY_SITE,
	legacyWorldInfo,
	type EntityId,
	type Snapshot,
	type WorldInfo
} from '@orbital/core';
import {
	bodyPathState,
	cross,
	fromStateVector,
	dot,
	length,
	normalize,
	propagate,
	scale,
	sub,
	type BodyPath,
	type Vec3
} from '@orbital/kepler';
import Sol, {
	lunarOrbiter,
	realScaleRocket,
	rescaledRocket,
	shieldedProbe,
	transferStage
} from '@orbital/mod-sol';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { createAscent, defaultAscent, type AscentOptions } from './helpers/ascent.ts';
import { burn, point, snapshotOf, warpTo, type Mission } from './helpers/mission.ts';
import { rapier } from './helpers/vessels.ts';

/** Per variant: the rocket, its ascent profile (relative to the air's height) and the link share. */
const VARIANTS = {
	'1:1': {
		rocket: realScaleRocket,
		turnEnd: 40_000,
		turnPitch: 1.45,
		engine: { thrust: 1_200_000, isp: 420 },
		/** Share of a two-day watch the station hears a 100 km lunar orbiter, at least. */
		linkShare: 0.25
	},
	rescaled: {
		rocket: rescaledRocket,
		turnEnd: 20_000,
		turnPitch: 1.4,
		engine: { thrust: 400_000, isp: 330 },
		linkShare: 0.25
	}
} as const;

const EPOCH_DAY = 9_575; // 2026-03-20 12:00 TT

const world = (variant: string): WorldInfo => ({
	...legacyWorldInfo(7),
	id: '3f2e1d0c-9b8a-4c7d-8e6f-5a4b3c2d1e0f',
	systemId: 'sol',
	systemVersion: '0.1.0',
	variant,
	epoch: { day: EPOCH_DAY, fraction: 0 },
	// the launch site, on the Earth's equator at the prime meridian
	sites: [{ ...LEGACY_SITE, id: 'equator', name: 'Equator', body: 'sol.earth' }]
});

const make = (variant: string): Promise<Sim> =>
	createSim({ plugins: [Stock, Sol], backendFactory: rapier(16), seed: 7, world: world(variant) });

function load(sim: Sim, design: ReturnType<typeof transferStage>, placement: unknown): EntityId {
	const r = sim.dispatch({ type: 'load-vessel', design, placement: placement as never });
	if (!r.ok) throw new Error(r.reason);
	return r.vessel!;
}

const vesselOf = (snap: Snapshot, id: EntityId) => snap.vessels.find((v) => v.id === id);

/** The Moon's path relative to the Earth, as the sim evaluates it (ADR 0183). */
function moonPath(sim: Sim): { path: BodyPath; mu: number; offset: number; soi: number } {
	const earth = sim.registries.bodies.get('sol.earth')!;
	const moon = sim.registries.bodies.get('sol.moon')!;
	const mu = GRAVITATIONAL_CONSTANT * earth.mass;
	const soi = moon.orbit!.a * (moon.mass / earth.mass) ** 0.4;
	return {
		path: { model: 'series', elements: moon.orbit!, series: moon.orbit!.series! },
		mu,
		offset: EPOCH_DAY * 86_400,
		soi
	};
}

/**
 * A departure time and an apoapsis radius from the parking orbit that bring the vessel within half
 * the Moon's sphere, from the closed forms: the next time the Moon crosses the parking plane, a
 * Hohmann transfer to meet it there, refined on a grid of departure times and apoapsis radii.
 */
function planTransfer(
	sim: Sim,
	r0: Vec3,
	v0: Vec3,
	t0: number
): { departure: number; apoapsis: number; miss: number } {
	const moon = moonPath(sim);
	const moonAt = (t: number) => bodyPathState(moon.path, moon.mu, t + moon.offset).r;
	const h = normalize(cross(r0, v0));
	const rPark = length(r0);
	const parked = (t: number) => {
		const s = propagateState(r0, v0, moon.mu, t - t0);
		return s;
	};
	const across = (t: number) => dot(moonAt(t), h);
	let best = { departure: 0, apoapsis: 0, miss: Infinity };
	let prev = across(t0 + 86_400);
	for (
		let t = t0 + 86_400 + 1_800;
		t < t0 + 30 * 86_400 && best.miss > 0.4 * moon.soi;
		t += 1_800
	) {
		const cur = across(t);
		if (Math.sign(cur) !== Math.sign(prev)) {
			let lo = t - 1_800;
			let hi = t;
			for (let k = 0; k < 40; k++) {
				const mid = (lo + hi) / 2;
				if (Math.sign(across(mid)) === Math.sign(prev)) lo = mid;
				else hi = mid;
			}
			const node = hi;
			const target = moonAt(node);
			const a = (rPark + length(target)) / 2;
			const flight = Math.PI * Math.sqrt(a ** 3 / moon.mu);
			// depart where the vessel is opposite the Moon's arrival point
			const period = 2 * Math.PI * Math.sqrt(rPark ** 3 / moon.mu);
			let dep = node - flight;
			let worst = Infinity;
			for (let s = -period; s <= period; s += period / 360) {
				const c = dot(normalize(parked(node - flight + s).r), normalize(target));
				if (c < worst) {
					worst = c;
					dep = node - flight + s;
				}
			}
			for (const k of [0.94, 0.96, 0.98, 1, 1.02, 1.04, 1.06, 1.08]) {
				for (let s = -180; s <= 180; s += 5) {
					const at = parked(dep + s);
					const apo = length(target) * k;
					const vNeed = Math.sqrt(moon.mu * (2 / rPark - 2 / (rPark + apo)));
					const v1 = scale(normalize(at.v), vNeed);
					let miss = Infinity;
					for (let tau = 0.5 * flight; tau < 1.6 * flight; tau += flight / 400) {
						const p = propagateState(at.r, v1, moon.mu, tau).r;
						miss = Math.min(miss, length(sub(p, moonAt(dep + s + tau))));
					}
					if (miss < best.miss) best = { departure: dep + s, apoapsis: apo, miss };
				}
			}
		}
		prev = cur;
	}
	return best;
}

/** Two-body state after `dt` from (r, v), elliptic or not. */
function propagateState(r: Vec3, v: Vec3, mu: number, dt: number) {
	return propagate({ ...elementsFrom(r, v, mu) }, mu, dt);
}
const elementsFrom = (r: Vec3, v: Vec3, mu: number) => fromStateVector(r, v, mu, 0);

for (const [variant, cfg] of Object.entries(VARIANTS)) {
	describe(`Sol ${variant}`, () => {
		test('the reference rocket reaches a stable orbit above the air, and a transfer from it reaches the Moon', async () => {
			const sim = await make(variant);
			const earth = sim.registries.bodies.get('sol.earth')!;
			const air = earth.atmosphere!.height;
			const rocket = load(sim, cfg.rocket(), { kind: 'site', site: 'equator' });
			const options: AscentOptions = {
				...defaultAscent,
				turnStart: 300,
				turnEnd: cfg.turnEnd,
				turnPitch: cfg.turnPitch,
				// 1.6 since plan 265: the pod's mass sits low now, the ascent differs by a kilometre of
				// periapsis, and the planner below (a grid search) then misses by twice as much from 1.8
				apoapsis: 1.6 * air,
				periapsis: 1.2 * air,
				stageCount: 1,
				stageAnyPhase: true,
				engine: cfg.engine
			};
			const ascent = createAscent(sim, rocket, options);
			while (sim.time < 1_500 && ascent.phase !== 'done') {
				sim.step(0.02);
				ascent.update();
			}
			expect(ascent.phase).toBe('done');
			for (let i = 0; i < 300; i++) sim.step(0.02);
			const parked = vesselOf(sim.snapshot(), rocket)!;
			const orbit = parked.orbit!;
			const periapsis = orbit.a * (1 - orbit.e) - earth.radius;
			console.log(
				`${variant}: orbit ${((orbit.a * (1 + orbit.e) - earth.radius) / 1000).toFixed(0)} x ${(periapsis / 1000).toFixed(0)} km at ${sim.time.toFixed(0)} s`
			);
			expect(periapsis).toBeGreaterThan(air);
			expect(orbit.e).toBeLessThan(0.1);

			// A transfer stage in the same orbit, 1 km ahead.
			const ahead = scale(normalize(parked.velocity), 1_000);
			const stage = load(sim, transferStage(), {
				kind: 'state',
				body: 'sol.earth',
				position: {
					x: parked.position.x + ahead.x,
					y: parked.position.y + ahead.y,
					z: parked.position.z + ahead.z
				},
				velocity: parked.velocity
			});
			const plan = planTransfer(sim, parked.position, parked.velocity, sim.time);
			const moon = moonPath(sim);
			console.log(
				`${variant}: departure in ${((plan.departure - sim.time) / 3600).toFixed(1)} h, planned miss ${(plan.miss / 1000).toFixed(0)} km of a ${(moon.soi / 1000).toFixed(0)} km sphere`
			);
			expect(plan.miss).toBeLessThan(0.5 * moon.soi);
			const m: Mission = { sim, vessel: stage, log: [] };
			point(m, 'prograde');
			warpTo(m, plan.departure - 60);
			while (sim.time < plan.departure - 10) sim.step(0.02);
			expect(sim.dispatch({ type: 'stage', vessel: stage }).ok).toBe(true); // light the engine
			const gap = () => {
				const o = snapshotOf(m).v.orbit;
				return o === undefined ? Infinity : plan.apoapsis - o.a * (1 + o.e);
			};
			burn(
				m,
				() => gap() <= 0,
				600,
				() => (gap() > 0.2 * plan.apoapsis ? 1 : 0.1)
			);
			const entered: number[] = [];
			sim.events.on('vessel:soi-changed', (e) => {
				if (e.vessel === stage && e.to === 'sol.moon') entered.push(sim.time);
			});
			for (let i = 0; i < 300 && snapshotOf(m).v.mode !== 'on-rails'; i++) sim.step(0.02);
			for (let k = 0; k < 40 && entered.length === 0; k++) warpTo(m, sim.time + 50_000, true);
			console.log(
				`${variant}: in the Moon's sphere ${entered.length > 0 ? ((entered[0]! - plan.departure) / 86_400).toFixed(2) + ' days after departure' : 'never'}`
			);
			expect(entered.length).toBeGreaterThan(0);
			sim.dispose();
		}, 600_000);

		test('a shielded probe comes back from orbital speed with no part over its limit', async () => {
			const sim = await make(variant);
			const earth = sim.registries.bodies.get('sol.earth')!;
			const mu = GRAVITATIONAL_CONSTANT * earth.mass;
			const r = earth.radius + earth.atmosphere!.height;
			const speed = Math.sqrt(mu / r) * 0.995;
			const angle = 0.02;
			const vx = -speed * Math.sin(angle);
			const vz = -speed * Math.cos(angle);
			const s = Math.SQRT1_2;
			const damaged: unknown[] = [];
			sim.events.on('part:damaged', (e) => damaged.push(e));
			const id = load(sim, shieldedProbe(), {
				kind: 'state',
				body: 'sol.earth',
				position: { x: r, y: 0, z: 0 },
				velocity: { x: vx, y: 0, z: vz },
				orientation: { x: (-vz / speed) * s, y: 0, z: (vx / speed) * s, w: s }
			});
			let peak = 0;
			let low = false;
			while (sim.time < 3_000) {
				sim.step(0.02);
				const v = vesselOf(sim.snapshot(), id);
				if (!v) break;
				for (const p of v.parts) peak = Math.max(peak, p.temperature!);
				if (length(v.position) - earth.radius < 5_000) {
					low = true;
					break;
				}
			}
			console.log(`${variant}: entry at ${speed.toFixed(0)} m/s, peak ${peak.toFixed(0)} K`);
			expect(low).toBe(true);
			expect(damaged).toEqual([]);
			expect(peak).toBeLessThan(900); // the tank's limit, the lowest aboard
			sim.dispose();
		}, 600_000);

		test(`the home station hears a lunar orbiter at least ${cfg.linkShare * 100} % of two days`, async () => {
			const sim = await make(variant);
			const moon = sim.registries.bodies.get('sol.moon')!;
			const r = moon.radius + 100_000;
			const v = Math.sqrt((GRAVITATIONAL_CONSTANT * moon.mass) / r);
			const id = load(sim, lunarOrbiter(), {
				kind: 'state',
				body: 'sol.moon',
				position: { x: r, y: 0, z: 0 },
				velocity: { x: 0, y: 0, z: -v }
			});
			let heard = 0;
			let samples = 0;
			const m: Mission = { sim, vessel: id, log: [] };
			for (let i = 0; i < 200; i++) sim.step(0.02);
			const end = sim.time + 2 * 86_400;
			// warpTo stops within 30 s of its target, so the watch ends a minute early
			while (sim.time < end - 60) {
				warpTo(m, Math.min(end, sim.time + 600));
				const link = sim.snapshot().network?.vessels.find((x) => x.vessel === id);
				samples++;
				if (link?.to) heard++;
			}
			console.log(
				`${variant}: link ${((100 * heard) / samples).toFixed(0)} % of ${samples} samples`
			);
			expect(heard / samples).toBeGreaterThanOrEqual(cfg.linkShare);
			sim.dispose();
		}, 600_000);
	});
}
