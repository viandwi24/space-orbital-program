/**
 * Plan 043 / ADR 0050: a sim resumed from `save()` goes on exactly like the one that was saved.
 * Each case runs a sim to a checkpoint, saves it through JSON text (as a file would), resumes a
 * second sim from that text and then runs both with the same inputs. The state of the two is
 * compared as JSON text (snapshot, serialised world, clock, PRNG), at every simulated second and
 * at the end, so the first moment of divergence is reported by name.
 */
import { describe, expect, test } from 'bun:test';
import {
	createTerrainField,
	legacyWorldInfo,
	SIM_SAVE_VERSION,
	type SimSave,
	type WorldInfo
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { length, sub } from '@orbital/kepler';
import { createSim, type Sim } from '../src/index.ts';
import { launchInOrbit } from './helpers/sas.ts';
import { orbitState } from './helpers/measure.ts';
import { moonState, systemOf, transferState } from './helpers/moon.ts';
import { lander, moonLander, rapier, saturn, twoStage } from './helpers/vessels.ts';

const DT = 0.02;
/**
 * Allowed difference while a body touches the ground tile, in the units of the value (m, m/s, rad,
 * K). Measured worst case in these tests: 1.3e-3; the jitter of a vessel at rest on a rotating
 * tile is 3e-4 m/s in either direction, and `SURFACE_REST_SPEED` is 0.05 m/s (ADR 0050).
 */
const CONTACT_TOLERANCE = 5e-3;
const RADIUS = 600_000;

interface Rig {
	make(resume?: SimSave): Promise<Sim>;
}
const flat: Rig = {
	make: (resume) =>
		createSim({
			plugins: [Stock],
			backendFactory: rapier(16),
			seed: 1,
			...(resume ? { resume } : {})
		})
};
const terrain: Rig = {
	make: (resume) =>
		createSim({
			plugins: [Stock],
			backendFactory: rapier(16),
			seed: 1,
			terrain: (body) => createTerrainField({ radius: body.radius }),
			...(resume ? { resume } : {})
		})
};

/** A world of its own (format 5, plan 077): the rig passes it on a fresh start only. */
const WORLD: WorldInfo = {
	...legacyWorldInfo(1),
	id: '0b6e8c2d-1f4a-4e7b-9c3d-5a2f8e6b1c90',
	epoch: { day: 12_345, fraction: 0.5 }
};
const inWorld: Rig = {
	make: (resume) =>
		createSim({
			plugins: [Stock],
			backendFactory: rapier(16),
			seed: 1,
			...(resume ? { resume } : { world: WORLD })
		})
};

const fingerprint = (sim: Sim): string =>
	JSON.stringify({
		time: sim.time,
		rng: sim.rng.state(),
		snapshot: sim.snapshot(),
		world: sim.world.serialize()
	});

const run = (sim: Sim, seconds: number, each?: (sim: Sim, step: number) => void): void => {
	const steps = Math.round(seconds / DT);
	for (let i = 0; i < steps; i++) {
		each?.(sim, i);
		sim.step(DT);
	}
};

/**
 * Largest absolute difference between two JSON values of the same shape; `Infinity` when the
 * shapes, strings or booleans differ (discrete state must match exactly).
 */
function deviation(a: unknown, b: unknown): number {
	if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b);
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return Infinity;
		return a.reduce<number>((m, v, i) => Math.max(m, deviation(v, b[i])), 0);
	}
	if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
		const ka = Object.keys(a);
		const kb = Object.keys(b);
		if (ka.length !== kb.length) return Infinity;
		let m = 0;
		for (const k of ka) {
			if (!(k in b)) return Infinity;
			m = Math.max(
				m,
				deviation((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
			);
		}
		return m;
	}
	return a === b ? 0 : Infinity;
}

/**
 * The elements of an orbit near the equator are ill-conditioned: a micrometre of position can
 * turn `raan` and `argp` by pi (journal 002), so the tolerant comparison leaves the derived
 * `orbit` out and compares the state vectors it comes from.
 */
function withoutOrbits(fingerprint: {
	snapshot: { vessels: Array<Record<string, unknown>> };
}): unknown {
	for (const v of fingerprint.snapshot.vessels) delete v.orbit;
	return fingerprint;
}

interface Case {
	rig: Rig;
	/**
	 * Bodies touching the ground tile cannot be reproduced bit for bit (Rapier warm-starts its
	 * contact solver from impulses it keeps privately, ADR 0050): the allowed difference then, in
	 * the units of the value compared (m, m/s, rad, K, kg). Absent: byte for byte.
	 */
	tolerance?: number;
	/** Bring a fresh sim to the checkpoint. */
	prepare(sim: Sim): void;
	/** Inputs applied to both sims after the checkpoint, by step index. */
	inputs?(sim: Sim, step: number): void;
	seconds: number;
	/** Largest tolerated difference, in units of `JSON` text equality: 0 means byte for byte. */
	check?(sim: Sim): void;
}

/** Resume at the checkpoint and compare both futures; returns the diverging second or null. */
async function resumeMatches(c: Case): Promise<{ sim: Sim; resumed: Sim }> {
	const sim = await c.rig.make();
	c.prepare(sim);
	const text = JSON.stringify(sim.save());
	const resumed = await c.rig.make(JSON.parse(text));
	// The save of the resumed sim is the save it was made from, byte for byte.
	expect(JSON.stringify(resumed.save())).toBe(text);
	expect(fingerprint(resumed)).toBe(fingerprint(sim));
	for (let second = 1; second <= c.seconds; second++) {
		run(sim, 1, (s, i) => c.inputs?.(s, (second - 1) * 50 + i));
		run(resumed, 1, (s, i) => c.inputs?.(s, (second - 1) * 50 + i));
		const a = fingerprint(sim);
		const b = fingerprint(resumed);
		if (c.tolerance === undefined) {
			if (a !== b) throw new Error(`the resumed run diverged ${second} s after the checkpoint`);
		} else {
			const d = deviation(withoutOrbits(JSON.parse(a)), withoutOrbits(JSON.parse(b)));
			if (!(d <= c.tolerance)) {
				throw new Error(
					`${second} s after the checkpoint the runs differ by ${d} (allowed ${c.tolerance})`
				);
			}
		}
	}
	return { sim, resumed };
}

const load = (sim: Sim, design = twoStage(), placement?: object) => {
	const r = sim.dispatch({
		type: 'load-vessel',
		design,
		...(placement ? { placement } : {})
	} as never);
	if (!r.ok) throw new Error(r.reason);
	return r.vessel!;
};

describe('resume determinism: the resumed run equals the uninterrupted one', () => {
	test('on the pad, before ignition (flat ground)', async () => {
		let id = 0;
		await resumeMatches({
			rig: flat,
			prepare: (sim) => {
				id = load(sim);
				run(sim, 1);
			},
			inputs: (sim, step) => {
				if (step === 0) {
					sim.dispatch({ type: 'throttle', vessel: id as never, value: 1 });
					sim.dispatch({ type: 'stage', vessel: id as never });
				}
			},
			tolerance: CONTACT_TOLERANCE,
			seconds: 20
		});
	});

	test('on the pad on terrain, resting then lifting off', async () => {
		let id = 0;
		await resumeMatches({
			rig: terrain,
			prepare: (sim) => {
				id = load(sim);
				run(sim, 0.8);
			},
			inputs: (sim, step) => {
				if (step === 25) {
					sim.dispatch({ type: 'throttle', vessel: id as never, value: 1 });
					sim.dispatch({ type: 'stage', vessel: id as never });
				}
			},
			tolerance: CONTACT_TOLERANCE,
			seconds: 8
		});
	});

	test('mid-ascent under thrust, with attitude input', async () => {
		let id = 0;
		await resumeMatches({
			rig: terrain,
			prepare: (sim) => {
				id = load(sim, saturn(1));
				sim.dispatch({ type: 'throttle', vessel: id as never, value: 1 });
				sim.dispatch({ type: 'stage', vessel: id as never });
				run(sim, 25, (s, i) => {
					if (i === 500)
						s.dispatch({ type: 'attitude', vessel: id as never, pitch: 0.003, yaw: 0, roll: 0 });
				});
			},
			inputs: (sim, step) => {
				if (step === 100)
					sim.dispatch({ type: 'attitude', vessel: id as never, pitch: 0, yaw: 0, roll: 0.2 });
			},
			seconds: 20
		});
	});

	test('right after staging, with a second vessel in flight', async () => {
		let id = 0;
		await resumeMatches({
			rig: flat,
			prepare: (sim) => {
				id = load(sim);
				sim.dispatch({ type: 'throttle', vessel: id as never, value: 1 });
				sim.dispatch({ type: 'stage', vessel: id as never });
				run(sim, 50, (s, i) => {
					if (i === 0)
						s.dispatch({ type: 'attitude', vessel: id as never, pitch: 0, yaw: 0, roll: 0 });
				});
				const staged = sim.dispatch({ type: 'stage', vessel: id as never });
				expect(staged.ok).toBe(true);
				expect(sim.snapshot().vessels.length).toBeGreaterThanOrEqual(2);
			},
			seconds: 20
		});
	});

	test('on orbital rails, warped 100x, then woken and burning', async () => {
		let id = 0;
		await resumeMatches({
			rig: flat,
			prepare: (sim) => {
				id = load(sim, twoStage(), { kind: 'state', ...orbitState(sim, 200_000) });
				expect(sim.snapshot().vessels[0]!.mode).toBe('on-rails');
				sim.dispatch({ type: 'warp', factor: 100 });
				run(sim, 3);
			},
			inputs: (sim, step) => {
				if (step === 400) {
					sim.dispatch({ type: 'warp', factor: 1 });
					sim.dispatch({ type: 'throttle', vessel: id as never, value: 0.5 });
				}
			},
			seconds: 14
		});
	});

	test('on surface rails (settled at the pad), then woken by the throttle', async () => {
		let id = 0;
		const { sim } = await resumeMatches({
			rig: terrain,
			prepare: (sim) => {
				id = load(sim);
				run(sim, 8);
				const v = sim.snapshot().vessels[0]!;
				expect(v.mode).toBe('on-rails');
				expect(v.surface).toBe(true);
				sim.dispatch({ type: 'warp', factor: 50 });
				run(sim, 2);
			},
			inputs: (sim, step) => {
				if (step === 250) {
					sim.dispatch({ type: 'warp', factor: 1 });
					sim.dispatch({ type: 'throttle', vessel: id as never, value: 1 });
					sim.dispatch({ type: 'stage', vessel: id as never });
				}
			},
			seconds: 12
		});
		expect(sim.snapshot().vessels[0]!.mode).toBe('flight');
	});

	test('landed on terrain, resting on its legs in flight', async () => {
		let id = 0;
		await resumeMatches({
			rig: terrain,
			prepare: (sim) => {
				id = load(sim, lander());
				const v = sim.snapshot().vessels[0]!;
				const legs = v.parts.find((p) => p.definition === 'stock.landing-legs')!;
				sim.dispatch({
					type: 'action',
					vessel: id as never,
					part: legs.id,
					module: 'stock.deployable',
					action: 'deploy'
				});
				run(sim, 0.6);
			},
			inputs: (sim, step) => {
				if (step === 20) {
					sim.dispatch({ type: 'attitude', vessel: id as never, pitch: 0.2, yaw: 0, roll: 0 });
				}
				if (step === 30)
					sim.dispatch({ type: 'attitude', vessel: id as never, pitch: 0, yaw: 0, roll: 0 });
			},
			tolerance: CONTACT_TOLERANCE,
			seconds: 6
		});
	});

	test('during an SAS hold in orbit, with a pointing mode switched on after', async () => {
		let id = 0;
		await resumeMatches({
			rig: flat,
			prepare: (sim) => {
				id = launchInOrbit(sim, twoStage(), { x: 0.2, y: 0.1, z: 0, w: 0.97 });
				sim.dispatch({ type: 'sas', vessel: id as never, mode: 'hold' });
				run(sim, 6);
				expect(sim.snapshot().vessels[0]!.sas!.mode).toBe('hold');
			},
			inputs: (sim, step) => {
				if (step === 100)
					sim.dispatch({ type: 'sas', vessel: id as never, mode: 'prograde', reference: 'orbit' });
				if (step === 200)
					sim.dispatch({ type: 'attitude', vessel: id as never, pitch: 0.4, yaw: 0, roll: 0 });
				if (step === 260)
					sim.dispatch({ type: 'attitude', vessel: id as never, pitch: 0, yaw: 0, roll: 0 });
			},
			seconds: 12
		});
	});
});

describe('format 5 saves of a world (plan 077)', () => {
	test('on orbital rails, warped, then woken and burning in free space: byte for byte, world kept', async () => {
		let id = 0;
		const { sim, resumed } = await resumeMatches({
			rig: inWorld,
			prepare: (sim) => {
				id = load(sim, twoStage(), { kind: 'state', ...orbitState(sim, 200_000) });
				sim.dispatch({ type: 'warp', factor: 100 });
				run(sim, 2);
			},
			inputs: (sim, step) => {
				if (step === 200) {
					sim.dispatch({ type: 'warp', factor: 1 });
					sim.dispatch({ type: 'throttle', vessel: id as never, value: 1 });
					sim.dispatch({ type: 'stage', vessel: id as never });
				}
			},
			seconds: 10
		});
		expect(sim.snapshot().vessels[0]!.mode).toBe('flight');
		const save = resumed.save();
		expect(save.formatVersion).toBe(5);
		expect(save.worldInfo).toEqual(WORLD);
		expect(JSON.stringify(save)).toBe(JSON.stringify(sim.save()));
	});
});

describe('resume contract', () => {
	test('the save is plain JSON: parse(stringify(save)) equals the save', async () => {
		const sim = await flat.make();
		load(sim);
		run(sim, 1);
		const save = sim.save();
		expect(JSON.parse(JSON.stringify(save))).toEqual(save);
		expect(save.formatVersion).toBe(SIM_SAVE_VERSION);
		expect(save.mods.map((m) => m.id)).toEqual(['stock']);
		expect(save.frames[0]!.bodies).toHaveLength(1);
	});

	test('the sim time, warp, accumulator and PRNG come back', async () => {
		const sim = await flat.make();
		load(sim, twoStage(), { kind: 'state', ...orbitState(sim, 200_000) });
		sim.dispatch({ type: 'warp', factor: 10 });
		sim.step(0.0125); // leaves a remainder in the accumulator
		sim.rng.next();
		const resumed = await flat.make(JSON.parse(JSON.stringify(sim.save())));
		expect(resumed.time).toBe(sim.time);
		expect(resumed.warp).toBe(10);
		expect(resumed.rng.state()).toBe(sim.rng.state());
		expect(RADIUS).toBe(600_000);
	});
});

describe('resume across bodies (plan 044): the moon, its sphere and its ground', () => {
	test("on the moon's rails, warped 100x, then woken and burning", async () => {
		let id = 0;
		const { sim } = await resumeMatches({
			rig: flat,
			prepare: (sim) => {
				const s = systemOf(sim);
				const r = s.moon.radius + 50_000;
				id = load(sim, twoStage(), {
					kind: 'state',
					body: s.moon.id,
					position: { x: r, y: 0, z: 0 },
					velocity: { x: 0, y: 0, z: -Math.sqrt(s.moonMu / r) }
				});
				const v = sim.snapshot().vessels[0]!;
				expect(v.mode).toBe('on-rails');
				expect(String(v.soi)).toBe(s.moon.id);
				sim.dispatch({ type: 'warp', factor: 100 });
				run(sim, 3);
			},
			inputs: (sim, step) => {
				if (step === 400) {
					sim.dispatch({ type: 'warp', factor: 1 });
					sim.dispatch({ type: 'throttle', vessel: id as never, value: 0.5 });
				}
			},
			seconds: 14
		});
		expect(String(sim.snapshot().vessels[0]!.soi)).toBe('stock.cinder');
	});

	test("just before the vessel crosses into the moon's sphere, and through the crossing", async () => {
		const { sim, resumed } = await resumeMatches({
			rig: flat,
			prepare: (sim) => {
				const s = systemOf(sim);
				const st = transferState(s, 680_000, 800_000);
				load(sim, twoStage(), { kind: 'state', position: st.r, velocity: st.v });
				sim.dispatch({ type: 'warp', factor: 1000 });
				const toMoon = (): number => {
					const snap = sim.snapshot();
					return length(sub(snap.vessels[0]!.position, snap.bodies[1]!.position));
				};
				for (let i = 0; i < 5_000 && toMoon() > s.soi + 6_000; i++) {
					sim.step(0.01);
					if (sim.warp === 1) break;
				}
				sim.dispatch({ type: 'warp', factor: 1 });
				expect(String(sim.snapshot().vessels[0]!.soi)).toBe('stock.home');
			},
			seconds: 25
		});
		expect(String(sim.snapshot().vessels[0]!.soi)).toBe('stock.cinder');
		expect(String(resumed.snapshot().vessels[0]!.soi)).toBe('stock.cinder');
		expect(moonState(systemOf(sim), sim.time).r).toEqual(
			moonState(systemOf(resumed), resumed.time).r
		);
	});

	test('on surface rails on the moon, then woken by the throttle', async () => {
		let id = 0;
		const { sim } = await resumeMatches({
			rig: flat,
			prepare: (sim) => {
				id = load(sim, twoStage(), {
					kind: 'surface',
					body: 'stock.cinder',
					latitude: 0.2,
					longitude: 1
				});
				run(sim, 8);
				const v = sim.snapshot().vessels[0]!;
				expect(v.mode).toBe('on-rails');
				expect(v.surface).toBe(true);
				expect(String(v.soi)).toBe('stock.cinder');
				sim.dispatch({ type: 'warp', factor: 50 });
				run(sim, 2);
			},
			inputs: (sim, step) => {
				if (step === 250) {
					sim.dispatch({ type: 'warp', factor: 1 });
					sim.dispatch({ type: 'throttle', vessel: id as never, value: 1 });
					sim.dispatch({ type: 'stage', vessel: id as never });
				}
			},
			tolerance: CONTACT_TOLERANCE,
			seconds: 12
		});
		expect(sim.snapshot().vessels[0]!.mode).toBe('flight');
	});
});

describe('resume with maneuver nodes (plan 045)', () => {
	test('a node with a target, SAS maneuver and a burn in progress', async () => {
		let id = 0;
		const { sim } = await resumeMatches({
			rig: flat,
			prepare: (sim) => {
				id = launchInOrbit(sim, moonLander());
				sim.dispatch({
					type: 'node-set',
					vessel: id as never,
					time: 40,
					prograde: 300,
					normal: 20,
					radial: -10
				});
				sim.dispatch({ type: 'sas', vessel: id as never, mode: 'maneuver' });
				run(sim, 12);
				expect(sim.snapshot().vessels[0]!.nodes).toHaveLength(1);
			},
			inputs: (sim, step) => {
				if (step === 100) {
					sim.dispatch({ type: 'stage', vessel: id as never });
					sim.dispatch({ type: 'throttle', vessel: id as never, value: 1 });
				}
				if (step === 500) sim.dispatch({ type: 'throttle', vessel: id as never, value: 0 });
			},
			seconds: 14
		});
		// the burn shrank the remaining burn (it is the same in the resumed run, compared above)
		expect(sim.snapshot().vessels[0]!.nodes![0]!.dv).toBeLessThan(300);
	});

	test('nodes on orbital rails with a warp-to under way', async () => {
		let id = 0;
		await resumeMatches({
			rig: flat,
			prepare: (sim) => {
				id = load(sim, moonLander(), { kind: 'state', ...orbitState(sim, 150_000) });
				sim.dispatch({
					type: 'node-set',
					vessel: id as never,
					time: 3_000,
					prograde: 50,
					normal: 0,
					radial: 0
				});
				sim.dispatch({
					type: 'node-set',
					vessel: id as never,
					time: 6_000,
					prograde: 0,
					normal: 30,
					radial: 0
				});
				sim.dispatch({ type: 'warp-to', time: 2_900, factor: 100 });
				run(sim, 3);
			},
			seconds: 6
		});
	});
});
