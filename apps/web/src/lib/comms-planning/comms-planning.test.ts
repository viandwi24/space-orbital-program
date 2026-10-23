/**
 * Comms planning (plan 118, ADR 0163): the contact timeline against the sim's own link events, the
 * coverage grid of one station, the planner through the Worker protocol, the client's cache.
 */
import {
	GRAVITATIONAL_CONSTANT,
	partId,
	type PartDefinition,
	type VesselDesign
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim } from '@orbital/sim';
import { describe, expect, it } from 'vitest';
import { coverageGrid } from './coverage';
import { planNodes, planWorld, positionOf, type PlanVessel } from './geometry';
import { createPlanner, type PlanWorkerLike } from './planner';
import { answer, type PlanMessage, type PlanReply } from './protocol';
import { contactTimeline } from './timeline';

const probe: VesselDesign = {
	formatVersion: 1,
	name: 'Relay',
	parts: [{ index: 0, part: partId('stock.probe-core'), parent: null }],
	stages: []
};

const DAY = 86_400;

describe('the contact timeline (ADR 0163 point 2)', () => {
	it('matches the sim link events of a probe and the Space Center over 24 h within 1 s', async () => {
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: () => createRapierBackend({ solverIterations: 16 }),
			maxFlightFrames: 1
		});
		try {
			const home = sim.registries.bodies.get('stock.home')!;
			const r = home.radius + 2_000_000;
			const speed = Math.sqrt((GRAVITATIONAL_CONSTANT * home.mass) / r);
			// inclined 20°, so it passes the station at its latitude from time to time
			const tilt = (20 * Math.PI) / 180;
			const loaded = sim.dispatch({
				type: 'load-vessel',
				design: probe,
				placement: {
					kind: 'state',
					body: 'stock.home',
					position: { x: r, y: 0, z: 0 },
					velocity: { x: 0, y: speed * Math.sin(tilt), z: -speed * Math.cos(tilt) }
				} as never
			});
			if (!loaded.ok) throw new Error(loaded.reason);
			const vessel = loaded.vessel!;
			const events: Array<{ time: number; up: boolean }> = [];
			sim.events.on('comms:link-up', (e) => {
				if (e.vessel === vessel) events.push({ time: e.time, up: true });
			});
			sim.events.on('comms:link-down', (e) => {
				if (e.vessel === vessel) events.push({ time: e.time, up: false });
			});
			sim.step(0.02);
			const snap = sim.snapshot();
			const t0 = snap.t;

			const world = planWorld(sim.registries.bodies.list());
			const parts = new Map<string, PartDefinition>(
				sim.registries.parts.list().map((p) => [String(p.id), p])
			);
			const antennas = new Map(sim.registries.antennas.list().map((a) => [a.id, a]));
			const nodes = planNodes(world, snap, parts, antennas);
			const station = nodes.find((n) => n.kind === 'station')!;
			const relay = nodes.find((n) => n.id === `vessel:${vessel}`)!;
			expect(relay.range).toBe(sim.registries.antennas.get('stock.whip')!.range);
			const plan = contactTimeline(world, relay, station, t0, DAY);

			sim.dispatch({ type: 'warp', factor: 100_000 });
			for (let i = 0; i < 400 && sim.time < t0 + DAY; i++) {
				// an event (a construction done, plan 247) stops the warp: ask for it again
				if (sim.warp === 1) sim.dispatch({ type: 'warp', factor: 100_000 });
				sim.step(0.05); // 10k× is the top (plan 206)
			}
			expect(sim.time).toBeGreaterThanOrEqual(t0 + DAY);
			const seen = events.filter((e) => e.time <= t0 + DAY);

			expect(plan.events.length).toBeGreaterThanOrEqual(4);
			expect(plan.events.map((e) => e.up)).toEqual(seen.map((e) => e.up));
			for (let k = 0; k < seen.length; k++) {
				expect(Math.abs(plan.events[k]!.time - seen[k]!.time)).toBeLessThan(1);
			}
			expect(plan.windows.length).toBeGreaterThan(0);
			expect(plan.linkedFraction).toBeGreaterThan(0);
			expect(plan.linkedFraction).toBeLessThan(1);
		} finally {
			sim.dispose();
		}
	}, 120_000);
});

describe('the coverage grid (ADR 0163 point 4)', () => {
	it('a relay overhead covers the ground under it and not the far side', () => {
		const world = planWorld([
			{
				id: 'test.ball',
				label: 'Ball',
				mass: 5e22,
				radius: 600_000,
				rotationPeriod: 21_600
			} as never
		]);
		const relay: PlanVessel = {
			kind: 'vessel',
			id: 'vessel:1',
			label: 'Relay',
			body: 'test.ball',
			r: { x: 1_600_000, y: 0, z: 0 },
			v: { x: 0, y: 0, z: -Math.sqrt((GRAVITATIONAL_CONSTANT * 5e22) / 1_600_000) },
			t0: 0,
			range: 2e9
		};
		const grid = coverageGrid(world, {
			body: 'test.ball',
			nodes: [relay],
			range: 5e5,
			from: 0,
			horizon: 0,
			samples: 1
		});
		const at = (latitude: number, longitude: number) => {
			const row = Math.floor(((Math.PI / 2 - latitude) / Math.PI) * grid.height);
			const col = Math.floor(((longitude + Math.PI) / (2 * Math.PI)) * grid.width);
			return grid.values[row * grid.width + col]!;
		};
		expect(at(0.01, 0.01)).toBe(1);
		expect(at(0.01, Math.PI - 0.01)).toBe(0);
		expect(grid.mean).toBeGreaterThan(0);
		expect(grid.mean).toBeLessThan(0.5);
	});
});

describe('the planning Worker protocol and client (ADR 0163 point 1)', () => {
	const fakeWorker = () => {
		const sent: PlanMessage[] = [];
		const worker: PlanWorkerLike = {
			onmessage: null,
			postMessage(message) {
				sent.push(message);
				let reply: PlanReply;
				try {
					reply = { id: message.id, ok: true, result: answer(message.request) };
				} catch (e) {
					reply = { id: message.id, ok: false, error: (e as Error).message };
				}
				queueMicrotask(() => worker.onmessage?.({ data: reply } as MessageEvent<PlanReply>));
			},
			terminate() {}
		};
		return { worker, sent };
	};

	it('answers the constellation planner, caches by request and reports errors', async () => {
		const { worker, sent } = fakeWorker();
		let started = 0;
		const planner = createPlanner(() => {
			started += 1;
			return worker;
		});
		expect(started).toBe(0); // started on first use
		const input = { mu: 3.5316e12, bodyRadius: 600_000, radius: 1_600_000, count: 3 };
		const plan = await planner.plan({ kind: 'constellation', input });
		expect(plan.ratio).toEqual({ numerator: 4, denominator: 3 });
		await planner.plan({ kind: 'constellation', input: { ...input } });
		expect(sent).toHaveLength(1);
		expect(started).toBe(1);
		await expect(
			planner.plan({ kind: 'constellation', input: { ...input, count: 1 } })
		).rejects.toThrow(/count/);
		planner.dispose();
	});
});

describe('stations on a body with a tilted pole (system audit)', () => {
	it("the planner turns a station as the sim does: back to the snapshot's position at any time", () => {
		const earth = {
			id: 'x.earth',
			radius: 6_371_000,
			mass: 5.97e24,
			rotationPeriod: 86_164,
			rotation: { pole: { ra: 0.3, dec: 1.16 }, w0: 3.4, wDot: 7.29e-5, epoch: 'j2000' }
		} as never;
		const world = planWorld([earth]);
		const t = 12_345;
		const dir = { x: 0.6, y: 0.48, z: -0.64 };
		const station = {
			kind: 'station',
			id: 's',
			label: 's',
			body: 'x.earth',
			dir,
			radius: 6_371_030,
			range: 1
		} as const;
		const at = positionOf(world, station, t);
		// a bare spin about +Y puts the same point elsewhere on a tilted body
		expect(Math.abs(at.y - dir.y * station.radius)).toBeGreaterThan(1_000);
		const [node] = planNodes(
			world,
			{
				t,
				vessels: [],
				network: { stations: [{ id: 's', label: 's', body: 'x.earth', position: at, range: 1 }] }
			} as never,
			new Map(),
			new Map()
		);
		const back = positionOf(world, node!, t + 3_600);
		const turned = positionOf(world, station, t + 3_600);
		expect(Math.hypot(back.x - turned.x, back.y - turned.y, back.z - turned.z)).toBeLessThan(1);
	});
});
