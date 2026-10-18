/** Comms tier 3 (plan 117, ADR 0188): relays and routes, pointing, the signal-delay rule, format 7. */
import { describe, expect, test } from 'bun:test';
import {
	SPEED_OF_LIGHT,
	legacyWorldInfo,
	readSimSave,
	type EntityId,
	type Snapshot,
	type Vec3
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { VESSEL } from '../src/state.ts';
import fixtureV6 from './fixtures/save-v6.json';
import { orbitState } from './helpers/measure.ts';
import { openTree } from './helpers/tech.ts';
import { rapier, stack } from './helpers/vessels.ts';

const world = (delay: string) => {
	const base = legacyWorldInfo(9);
	return {
		...base,
		id: `routing-${delay}`,
		preset: 'stock.career',
		rules: {
			...base.rules,
			'stock.signal-delay': delay,
			'stock.control-without-signal': 'none'
		}
	};
};
const make = (delay = 'display') =>
	createSim({ plugins: [Stock, openTree], backendFactory: rapier(16), world: world(delay) });

const link = (snap: Snapshot, id: EntityId) => snap.network!.vessels.find((v) => v.vessel === id)!;
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

/** A probe with a dish `d` m from the first station, straight up from it, at rest in its SOI's frame. */
function farProbe(sim: Sim, d: number): EntityId {
	const snap = sim.snapshot();
	const station = snap.network!.stations[0]!;
	const home = snap.bodies.find((b) => String(b.id) === station.body)!.position;
	const up = sub(station.position, home);
	const k = 1 / Math.hypot(up.x, up.y, up.z);
	const at = {
		x: station.position.x + up.x * k * d,
		y: station.position.y + up.y * k * d,
		z: station.position.z + up.z * k * d
	};
	const sun = snap.bodies.find((b) => String(b.id) === 'stock.sun')!.position;
	const r = sim.dispatch({
		type: 'load-vessel',
		design: stack(
			'Far probe',
			['stock.probe-core', 'stock.dish-antenna', 'stock.tank-small', 'stock.engine-lv'],
			[[3]]
		),
		placement: {
			kind: 'state',
			body: 'stock.sun',
			position: sub(at, sun),
			velocity: { x: 0, y: 0, z: 0 }
		} as never
	});
	if (!r.ok) throw new Error(r.reason);
	return r.vessel!;
}

const throttleOf = (sim: Sim, id: EntityId): number => sim.world.get(id, VESSEL)!.control.throttle;

describe('the signal-delay rule', () => {
	test('enforced: a throttle 3 light-seconds away applies exactly 3 s later', async () => {
		const sim = await make('enforced');
		const id = farProbe(sim, 3 * SPEED_OF_LIGHT);
		for (let i = 0; i < 10; i++) sim.step(0.02);
		const latency = link(sim.snapshot(), id).latency!;
		expect(latency).toBeCloseTo(3, 6);
		const t0 = sim.time;
		const r = sim.dispatch({ type: 'throttle', vessel: id, value: 0.5 });
		expect(r).toMatchObject({ ok: true });
		expect((r as { queued: number }).queued).toBeCloseTo(t0 + latency, 9);
		const at = (r as { queued: number }).queued;
		// nothing until the step that starts at the arrival
		while (sim.time < at - 1e-9) {
			expect(throttleOf(sim, id)).toBe(0);
			sim.step(0.02);
		}
		expect(throttleOf(sim, id)).toBe(0);
		const start = sim.time;
		sim.step(0.02);
		expect(throttleOf(sim, id)).toBe(0.5);
		// that step started 3 light-seconds after the dispatch
		expect(start - t0).toBeCloseTo(latency, 6);
		// the queue is saved: a resumed run applies what was waiting
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		const resumed = await createSim({
			plugins: [Stock, openTree],
			backendFactory: rapier(16),
			resume: sim.save()
		});
		expect(resumed.save().comms.queue).toHaveLength(1);
		for (let i = 0; i < 200; i++) resumed.step(0.02);
		expect(throttleOf(resumed, id)).toBe(1);
		sim.dispose();
		resumed.dispose();
	});

	test('display: it applies at once and the latency is shown', async () => {
		const sim = await make('display');
		const id = farProbe(sim, 3 * SPEED_OF_LIGHT);
		for (let i = 0; i < 10; i++) sim.step(0.02);
		const r = sim.dispatch({ type: 'throttle', vessel: id, value: 0.5 });
		expect(r).toEqual({ ok: true });
		sim.step(0.02);
		expect(throttleOf(sim, id)).toBe(0.5);
		expect(link(sim.snapshot(), id).latency).toBeCloseTo(3, 6);
		expect(link(sim.snapshot(), id).route).toEqual([link(sim.snapshot(), id).to!]);
		sim.dispose();
	});

	test('flight computer: the script does not wait, the player does', async () => {
		const sim = await make('flight-computer');
		const id = farProbe(sim, 3 * SPEED_OF_LIGHT);
		for (let i = 0; i < 10; i++) sim.step(0.02);
		expect(
			sim.dispatch({ type: 'throttle', vessel: id, value: 0.3 }, { source: 'script' })
		).toEqual({
			ok: true
		});
		const player = sim.dispatch({ type: 'throttle', vessel: id, value: 0.7 });
		expect((player as { queued?: number }).queued).toBeGreaterThan(sim.time + 2.9);
		sim.step(0.02);
		expect(throttleOf(sim, id)).toBe(0.3);
		// planning never waits
		expect(sim.dispatch({ type: 'target-set', vessel: id, target: null })).toMatchObject({
			ok: true
		});
		sim.dispose();
	});
});

/** A probe landed `east` m from the pad, and a relay probe in a 300 km orbit over it. */
async function relaySetup() {
	const sim = await make('display');
	const home = sim.registries.bodies.get('stock.home')!;
	const ground = sim.dispatch({
		type: 'load-vessel',
		design: stack('Rover', ['stock.probe-core'], []),
		placement: { kind: 'surface', latitude: 0, longitude: 2_000 / home.radius }
	});
	if (!ground.ok) throw new Error(ground.reason);
	const s = orbitState(sim, 300_000);
	const relay = sim.dispatch({
		type: 'load-vessel',
		design: stack('Relay', ['stock.probe-core'], []),
		placement: { kind: 'state', position: s.position, velocity: s.velocity }
	});
	if (!relay.ok) throw new Error(relay.reason);
	for (let i = 0; i < 400; i++) sim.step(0.02);
	return { sim, ground: ground.vessel!, relay: relay.vessel! };
}

describe('routes', () => {
	test('a Manual route through a relay is used even with a direct link, and breaks when the relay is occluded', async () => {
		const { sim, ground, relay } = await relaySetup();
		const station = link(sim.snapshot(), ground).to!;
		expect(link(sim.snapshot(), ground).route).toEqual([station]); // Auto: direct
		const via = [`vessel:${relay}`, station];
		expect(
			sim.dispatch({ type: 'comms-route', vessel: ground, mode: { kind: 'manual', via } }).ok
		).toBe(true);
		sim.step(0.02);
		const pinned = link(sim.snapshot(), ground);
		expect(pinned.route).toEqual(via);
		expect(pinned.mode).toEqual({ kind: 'manual', via });
		expect(pinned.latency!).toBeGreaterThan(link(sim.snapshot(), relay).latency!);
		// a quarter of an orbit later the relay is below the horizon
		const r = sim.dispatch({ type: 'warp-to', time: sim.time + 900, factor: 100 });
		expect(r.ok).toBe(true);
		for (let g = 0; g < 1e5 && (sim.warp !== 1 || sim.time < 900); g++) sim.step(1);
		const broken = link(sim.snapshot(), ground);
		expect(broken.to).toBeNull();
		expect(broken.reason).toMatch(/^route broken at /);
		// back to Auto: direct again
		sim.dispatch({ type: 'comms-route', vessel: ground, mode: { kind: 'auto' } });
		sim.step(0.02);
		expect(link(sim.snapshot(), ground).route).toEqual([station]);
		sim.dispose();
	});

	test('a policy picks among the candidates; an unknown one is refused', async () => {
		const { sim, ground } = await relaySetup();
		const station = link(sim.snapshot(), ground).to!;
		expect(
			sim.dispatch({
				type: 'comms-route',
				vessel: ground,
				mode: { kind: 'policy', policy: 'stock.lowest-latency' }
			}).ok
		).toBe(true);
		sim.step(0.02);
		expect(link(sim.snapshot(), ground).route).toEqual([station]);
		const bad = sim.dispatch({
			type: 'comms-route',
			vessel: ground,
			mode: { kind: 'policy', policy: 'acme.none' }
		});
		expect(bad.ok).toBe(false);
		sim.dispose();
	});

	test('a dish pointed away links nothing; pointed at the station it links again', async () => {
		const sim = await make('display');
		const id = farProbe(sim, 1e8);
		for (let i = 0; i < 10; i++) sim.step(0.02);
		const station = link(sim.snapshot(), id).to!;
		const dish = sim.snapshot().vessels.find((v) => v.id === id)!.parts[1]!
			.id as unknown as EntityId;
		expect(
			sim.dispatch({ type: 'antenna-point', vessel: id, part: dish, target: 'stock.cinder' }).ok
		).toBe(true);
		sim.step(0.02);
		expect(link(sim.snapshot(), id).to).toBeNull();
		expect(
			sim.dispatch({ type: 'antenna-point', vessel: id, part: dish, target: station }).ok
		).toBe(true);
		sim.step(0.02);
		expect(link(sim.snapshot(), id).to).toBe(station);
		sim.dispose();
	});
});

describe('save format 7', () => {
	test('a frozen format-6 save migrates: empty routes and queue, then saves as 7', async () => {
		const read = readSimSave(fixtureV6);
		expect(read.formatVersion).toBe(7);
		expect(read.comms).toEqual({ seq: 0, routes: [], queue: [] });
		const sim = await createSim({
			plugins: [Stock, openTree],
			backendFactory: rapier(16),
			resume: fixtureV6
		});
		const saved = sim.save();
		expect(saved.formatVersion).toBe(7);
		expect(saved.comms).toEqual({ seq: 0, routes: [], queue: [] });
		sim.dispose();
	});
});
