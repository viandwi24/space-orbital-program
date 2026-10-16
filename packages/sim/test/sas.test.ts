/** Plan 042 / ADR 0049: the stability assist, flown headlessly through dispatch and snapshot. */
import { describe, expect, test } from 'bun:test';
import type { Quat, VesselDesign } from '@orbital/core';
import {
	attitudeAngle,
	launchInOrbit,
	modeDirection,
	noseOf,
	newSasSim,
	pointingError,
	quatAbout,
	vesselOf,
	withDisturber
} from './helpers/sas.ts';
import { orbitState } from './helpers/measure.ts';
import { lander, saturn, stack, twoStage } from './helpers/vessels.ts';

const DEG = 180 / Math.PI;
const vessels: Array<[string, () => VesselDesign]> = [
	['two-stage', () => twoStage()],
	['saturn(1)', () => saturn(1)],
	['lander', () => lander()]
];
const MODES = [
	'prograde',
	'retrograde',
	'normal',
	'antinormal',
	'radial-out',
	'radial-in'
] as const;

describe('hold', () => {
	for (const [name, make] of vessels) {
		test(`${name}: holds within 3 degrees under a 20 % pitch disturbance, 1 degree after 20 s`, async () => {
			const sim = await newSasSim();
			const id = launchInOrbit(sim, withDisturber(make()));
			sim.dispatch({ type: 'sas', vessel: id, mode: 'hold' });
			const start = vesselOf(sim, id).orientation;
			const v0 = vesselOf(sim, id);
			const part = v0.parts.find((p) => p.definition === 'test.disturber')!;
			sim.dispatch({
				type: 'action',
				vessel: id,
				part: part.id,
				module: 'test.disturbance',
				action: 'set',
				args: [1000, 0, 0]
			});
			let worst = 0;
			let late = 0;
			for (let i = 0; i < 60 * 50; i++) {
				sim.step(0.02);
				const e = attitudeAngle(vesselOf(sim, id).orientation, start) * DEG;
				worst = Math.max(worst, e);
				if (sim.time > 20) late = Math.max(late, e);
			}
			console.log(`${name}: hold worst ${worst.toFixed(2)} deg, after 20 s ${late.toFixed(2)} deg`);
			expect(worst).toBeLessThan(3);
			expect(late).toBeLessThan(1);
			sim.dispose();
		}, 60_000);
	}
});

describe('modes', () => {
	for (const [name, make] of vessels) {
		for (const mode of MODES) {
			test(`${name}: ${mode} from 90 degrees off`, async () => {
				const sim = await newSasSim();
				const off: Quat = quatAbout({ x: 1, y: 0, z: 1 }, Math.PI / 2);
				const id = launchInOrbit(sim, make(), off);
				sim.dispatch({ type: 'sas', vessel: id, mode, reference: 'orbit' });
				let hit = -1;
				let tail = 0;
				for (let i = 0; i < 100 * 50; i++) {
					sim.step(0.02);
					const v = vesselOf(sim, id);
					const e = pointingError(v.orientation, modeDirection(mode, v.position, v.velocity)) * DEG;
					if (hit < 0 && e < 2) hit = sim.time;
					if (sim.time > 60) tail = Math.max(tail, e);
				}
				console.log(
					`${name} ${mode}: within 2 deg at ${hit.toFixed(1)} s, tail ${tail.toFixed(3)}`
				);
				expect(hit).toBeGreaterThan(0);
				expect(hit).toBeLessThan(30);
				expect(tail).toBeLessThan(0.25);
				sim.dispose();
			}, 60_000);
		}
	}
});

describe('limit cycle', () => {
	for (const [name, make] of vessels) {
		test(`${name}: settled, the error stays below 0.25 degree and the rate below 0.005 rad/s for 60 s`, async () => {
			const sim = await newSasSim();
			const id = launchInOrbit(sim, make(), quatAbout({ x: 0, y: 0, z: 1 }, 1.2));
			sim.dispatch({ type: 'sas', vessel: id, mode: 'prograde', reference: 'orbit' });
			for (let i = 0; i < 40 * 50; i++) sim.step(0.02);
			let worst = 0;
			let rate = 0;
			let prev = vesselOf(sim, id).orientation;
			for (let i = 0; i < 60 * 50; i++) {
				sim.step(0.02);
				const v = vesselOf(sim, id);
				worst = Math.max(
					worst,
					pointingError(v.orientation, modeDirection('prograde', v.position, v.velocity))
				);
				rate = Math.max(rate, attitudeAngle(v.orientation, prev) / 0.02);
				prev = v.orientation;
			}
			console.log(
				`${name}: settled error ${(worst * DEG).toFixed(4)} deg, rate ${rate.toExponential(2)} rad/s`
			);
			expect(worst * DEG).toBeLessThan(0.25);
			expect(rate).toBeLessThan(0.005);
			sim.dispose();
		}, 60_000);
	}
});

describe('under thrust', () => {
	test('saturn(1) burning in vacuum: prograde hold through the gimbal, stable', async () => {
		const sim = await newSasSim();
		const id = launchInOrbit(sim, saturn(1), quatAbout({ x: 0, y: 0, z: 1 }, 0.5));
		sim.dispatch({ type: 'sas', vessel: id, mode: 'prograde', reference: 'orbit' });
		sim.dispatch({ type: 'stage', vessel: id });
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		let worst = 0;
		for (let i = 0; i < 30 * 50; i++) {
			sim.step(0.02);
			const v = vesselOf(sim, id);
			if (sim.time > 10) {
				worst = Math.max(
					worst,
					pointingError(v.orientation, modeDirection('prograde', v.position, v.velocity)) * DEG
				);
			}
		}
		console.log(`under thrust: worst error after 10 s ${worst.toFixed(3)} deg`);
		expect(worst).toBeLessThan(1.5);
		sim.dispose();
	}, 60_000);
});

describe('ascent', () => {
	const cases: Array<[string, () => VesselDesign, number, number]> = [
		// name, design, kick (degrees of nose tilt when the player lets go), altitude checked (m)
		['two-stage', () => twoStage(), 5, 10_000],
		['saturn(1)', () => saturn(1), 20, 20_000]
	];
	for (const [name, make, kick, checkAt] of cases) {
		test(`${name}: a kick, then SAS prograde (surface) flies a gravity turn with a small angle of attack`, async () => {
			const sim = await newSasSim();
			const loaded = sim.dispatch({ type: 'load-vessel', design: make() });
			if (!loaded.ok) throw new Error(loaded.reason);
			const id = loaded.vessel!;
			const home = sim.registries.bodies.get('stock.home')!;
			const omega = (2 * Math.PI) / home.rotationPeriod;
			sim.dispatch({ type: 'sas', vessel: id, mode: 'prograde', reference: 'surface' });
			sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
			sim.dispatch({ type: 'stage', vessel: id });
			const log: string[] = [];
			sim.events.on('part:damaged', (e) => log.push(`damaged ${JSON.stringify(e)}`));
			sim.events.on('vessel:created', (e) =>
				log.push(`created ${e.vessel} t=${sim.time.toFixed(1)}`)
			);
			let kicked = false;
			let staged = 0;
			let engaged = Infinity;
			let worstAoa = 0;
			let tilt20 = -1;
			for (let i = 0; i < 400 * 50; i++) {
				sim.step(0.02);
				const v = vesselOf(sim, id);
				if (!v)
					throw new Error(
						`vessel gone at ${sim.time}; ${log.join(' | ')}; ${JSON.stringify(sim.snapshot().vessels.map((x) => x.id))}`
					);
				const r = Math.hypot(v.position.x, v.position.y, v.position.z);
				const up = { x: v.position.x / r, y: v.position.y / r, z: v.position.z / r };
				const sv = {
					x: v.velocity.x - omega * v.position.z,
					y: v.velocity.y,
					z: v.velocity.z + omega * v.position.x
				};
				const speed = Math.hypot(sv.x, sv.y, sv.z);
				const nose = noseOf(v.orientation);
				const dry = v.parts.some(
					(p) => (p.modules['stock.engine'] as { flameout?: boolean } | undefined)?.flameout
				);
				if (dry && staged < 1) {
					staged++;
					sim.dispatch({ type: 'stage', vessel: id });
				}
				if (!kicked && speed > 60) {
					sim.dispatch({ type: 'attitude', vessel: id, pitch: 1, yaw: 0, roll: 0 });
					kicked = true;
				} else if (kicked && engaged === Infinity) {
					const tilt = Math.acos(nose.x * up.x + nose.y * up.y + nose.z * up.z) * DEG;
					if (tilt > kick) {
						sim.dispatch({ type: 'attitude', vessel: id, pitch: 0, yaw: 0, roll: 0 });
						engaged = sim.time;
					}
				}
				if (sim.time > engaged + 3 && speed > 30) {
					const aoa =
						Math.acos(Math.min(1, (nose.x * sv.x + nose.y * sv.y + nose.z * sv.z) / speed)) * DEG;
					worstAoa = Math.max(worstAoa, aoa);
				}
				const alt = r - home.radius;
				if (alt > checkAt && tilt20 < 0) {
					tilt20 = Math.acos(nose.x * up.x + nose.y * up.y + nose.z * up.z) * DEG;
				}
				if (alt > checkAt) break;
			}
			console.log(
				`${name}: engaged ${engaged.toFixed(1)} s, worst AoA ${worstAoa.toFixed(2)} deg, tilt at ${checkAt} m ${tilt20.toFixed(1)} deg, t ${sim.time.toFixed(0)}`
			);
			expect(engaged).toBeLessThan(Infinity);
			expect(worstAoa).toBeLessThan(5);
			expect(tilt20).toBeGreaterThan(20);
			sim.dispose();
		}, 120_000);
	}
});

describe('player input', () => {
	test('hold: input steers, then SAS latches the new attitude and holds it', async () => {
		const sim = await newSasSim();
		const id = launchInOrbit(sim, twoStage());
		sim.dispatch({ type: 'sas', vessel: id, mode: 'hold' });
		for (let i = 0; i < 5 * 50; i++) sim.step(0.02);
		const before = vesselOf(sim, id).orientation;
		sim.dispatch({ type: 'attitude', vessel: id, pitch: 1, yaw: 0, roll: 0 });
		for (let i = 0; i < 4 * 50; i++) sim.step(0.02);
		const turned = attitudeAngle(vesselOf(sim, id).orientation, before) * DEG;
		sim.dispatch({ type: 'attitude', vessel: id, pitch: 0, yaw: 0, roll: 0 });
		// Wait until the rate has died down and the attitude is latched.
		let prev = vesselOf(sim, id).orientation;
		let latched: Quat | undefined;
		for (let i = 0; i < 30 * 50 && !latched; i++) {
			sim.step(0.02);
			const q = vesselOf(sim, id).orientation;
			if (attitudeAngle(q, prev) / 0.02 < 0.002 && sim.time > 0) latched = q;
			prev = q;
		}
		expect(latched).toBeDefined();
		let drift = 0;
		for (let i = 0; i < 20 * 50; i++) {
			sim.step(0.02);
			drift = Math.max(drift, attitudeAngle(vesselOf(sim, id).orientation, latched!) * DEG);
		}
		console.log(
			`input: turned ${turned.toFixed(1)} deg, drift after latch ${drift.toFixed(3)} deg`
		);
		expect(turned).toBeGreaterThan(5);
		expect(drift).toBeLessThan(1);
		sim.dispose();
	}, 60_000);

	test('pointing mode: input steps aside while held and SAS points again on release', async () => {
		const sim = await newSasSim();
		const id = launchInOrbit(sim, twoStage());
		sim.dispatch({ type: 'sas', vessel: id, mode: 'prograde', reference: 'orbit' });
		for (let i = 0; i < 30 * 50; i++) sim.step(0.02);
		sim.dispatch({ type: 'attitude', vessel: id, pitch: 1, yaw: 0, roll: 0 });
		for (let i = 0; i < 4 * 50; i++) sim.step(0.02);
		const v = vesselOf(sim, id);
		expect(
			pointingError(v.orientation, modeDirection('prograde', v.position, v.velocity)) * DEG
		).toBeGreaterThan(5);
		sim.dispatch({ type: 'attitude', vessel: id, pitch: 0, yaw: 0, roll: 0 });
		for (let i = 0; i < 40 * 50; i++) sim.step(0.02);
		const w = vesselOf(sim, id);
		expect(
			pointingError(w.orientation, modeDirection('prograde', w.position, w.velocity)) * DEG
		).toBeLessThan(0.5);
		sim.dispose();
	}, 60_000);
});

describe('rails', () => {
	test('a settled pointing vessel goes on rails, keeps pointing through 100x warp and wakes steady', async () => {
		const sim = await newSasSim();
		const id = launchInOrbit(sim, twoStage(), quatAbout({ x: 0, y: 0, z: 1 }, 1));
		sim.dispatch({ type: 'sas', vessel: id, mode: 'prograde', reference: 'orbit' });
		for (let i = 0; i < 60 * 50 && vesselOf(sim, id).mode !== 'on-rails'; i++) sim.step(0.02);
		expect(vesselOf(sim, id).mode).toBe('on-rails');
		expect(sim.dispatch({ type: 'warp', factor: 100 }).ok).toBe(true);
		sim.step(1.2);
		const v = vesselOf(sim, id);
		expect(v.mode).toBe('on-rails');
		const error =
			pointingError(v.orientation, modeDirection('prograde', v.position, v.velocity)) * DEG;
		console.log(`rails: error after 120 s at 100x ${error.toFixed(4)} deg`);
		expect(error).toBeLessThan(1);
		sim.dispatch({ type: 'warp', factor: 1 });
		sim.dispatch({ type: 'attitude', vessel: id, pitch: 1e-9, yaw: 0, roll: 0 });
		sim.dispatch({ type: 'attitude', vessel: id, pitch: 0, yaw: 0, roll: 0 });
		for (let i = 0; i < 25; i++) sim.step(0.02);
		const w = vesselOf(sim, id);
		expect(w.mode).toBe('flight');
		expect(
			pointingError(w.orientation, modeDirection('prograde', w.position, w.velocity)) * DEG
		).toBeLessThan(1);
		sim.dispose();
	}, 60_000);

	test('hold on rails: the attitude does not change through a warp', async () => {
		const sim = await newSasSim();
		const id = launchInOrbit(sim, twoStage(), quatAbout({ x: 0, y: 0, z: 1 }, 1));
		sim.dispatch({ type: 'sas', vessel: id, mode: 'hold' });
		for (let i = 0; i < 60 * 50 && vesselOf(sim, id).mode !== 'on-rails'; i++) sim.step(0.02);
		expect(vesselOf(sim, id).mode).toBe('on-rails');
		const before = vesselOf(sim, id).orientation;
		sim.dispatch({ type: 'warp', factor: 100 });
		sim.step(1.2);
		expect(attitudeAngle(vesselOf(sim, id).orientation, before)).toBeLessThan(1e-9);
		sim.dispose();
	}, 60_000);
});

describe('protocol', () => {
	test('refusals, state in the snapshot and determinism', async () => {
		const sim = await newSasSim();
		expect(sim.dispatch({ type: 'sas', vessel: 4242, mode: 'hold' }).ok).toBe(false);
		expect(sim.dispatch({ type: 'sas', vessel: 0, mode: 'sideways' }).ok).toBe(false);
		const id = launchInOrbit(sim, twoStage());
		expect(vesselOf(sim, id).sas).toEqual({ mode: 'off', reference: 'surface', error: 0 });
		expect(
			sim.dispatch({ type: 'sas', vessel: id, mode: 'retrograde', reference: 'orbit' }).ok
		).toBe(true);
		expect(vesselOf(sim, id).sas?.mode).toBe('retrograde');
		expect(vesselOf(sim, id).sas?.reference).toBe('orbit');
		// An omitted field keeps its value.
		sim.dispatch({ type: 'sas', vessel: id, mode: 'hold' });
		expect(vesselOf(sim, id).sas?.reference).toBe('orbit');
		sim.dispatch({ type: 'sas', vessel: id, mode: 'off' });
		expect(vesselOf(sim, id).sas?.mode).toBe('off');
		sim.dispose();
		// A probe without a command part cannot use SAS.
		const bare = await newSasSim();
		const res = bare.dispatch({
			type: 'load-vessel',
			design: stack('Bare', ['stock.tank-small', 'stock.engine-lv'], [[1]]),
			placement: { kind: 'state', ...orbitState(bare, 200_000) }
		});
		expect(res.ok).toBe(true);
		const refused = bare.dispatch({ type: 'sas', vessel: res.ok ? res.vessel! : 0, mode: 'hold' });
		expect(refused.ok).toBe(false);
		bare.dispose();
	});

	test('two runs of the same scenario give identical snapshots', async () => {
		const run = async (): Promise<string> => {
			const sim = await newSasSim();
			const id = launchInOrbit(sim, saturn(1), quatAbout({ x: 1, y: 0, z: 1 }, 1.4));
			sim.dispatch({ type: 'sas', vessel: id, mode: 'prograde', reference: 'orbit' });
			for (let i = 0; i < 40 * 50; i++) sim.step(0.02);
			sim.dispatch({ type: 'sas', vessel: id, mode: 'retrograde' });
			for (let i = 0; i < 40 * 50; i++) sim.step(0.02);
			const out = JSON.stringify(sim.snapshot());
			sim.dispose();
			return out;
		};
		expect(await run()).toBe(await run());
	}, 60_000);
});
