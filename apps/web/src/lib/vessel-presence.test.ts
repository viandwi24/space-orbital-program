/**
 * Plan 047: a healthy launch must never read as "Vessel lost". The real sim host feeds the real
 * sim client through a queue, and a HUD check runs between every two Worker messages (a browser
 * may run a frame at any such point). The old rule (judge the latest snapshot, which predates the
 * load) fails this; the presence rule does not.
 */
import { createTerrainField, type EntityId, type Snapshot } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim } from '@orbital/sim';
import { describe, expect, it } from 'vitest';
import { referenceTwoStage } from './design';
import type { ClientMessage, WorkerMessage } from './messages';
import { createSimClient, type WorkerLike } from './sim-client';
import { createSimHost } from './sim-host';
import { computeTelemetry } from './telemetry';
import { createVesselPresence } from './vessel-presence';

/** A small seeded generator so a failing timing can be replayed. */
function rng(seed: number): () => number {
	let s = seed >>> 0 || 1;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

interface Run {
	/** HUD checks that would have shown "Vessel lost" by the old rule. */
	oldLost: number;
	/** HUD checks that show it by the presence rule. */
	newLost: number;
	checks: number;
	destroyed: string[];
	lastSnapshot: Snapshot | null;
}

async function launch(seed: number): Promise<Run> {
	const random = rng(seed);
	const inbox: WorkerMessage[] = [];
	let clock = random() * 5_000;
	const host = createSimHost({
		createSim: () =>
			createSim({
				plugins: [Stock],
				backendFactory: () => createRapierBackend({ solverIterations: 16 }),
				terrain: (body) => createTerrainField({ radius: body.radius })
			}),
		post: (m) => void inbox.push(m),
		now: () => clock
	});
	const worker: WorkerLike = {
		postMessage: (m: ClientMessage) => host.handle(m),
		onmessage: null,
		onerror: null,
		terminate: () => {}
	};
	const client = createSimClient(worker);
	const presence = createVesselPresence();
	const run: Run = { oldLost: 0, newLost: 0, checks: 0, destroyed: [], lastSnapshot: null };
	let vessel: EntityId | null = null;
	let flying = false;
	let bodies: { id: string; radius: number }[] = [];
	client.onSnapshot((s) => {
		run.lastSnapshot = s;
		presence.snapshot(s);
	});
	client.onSimEvent((e) => {
		if (e.type === 'vessel-destroyed') run.destroyed.push(e.reason);
	});

	// the page's frame: the old and the new reading of the same state
	const hudCheck = (): void => {
		if (!flying || vessel === null) return;
		run.checks += 1;
		const snap = client.latest;
		if (snap && !computeTelemetry(snap, vessel, bodies)) run.oldLost += 1;
		if (presence.lost()) run.newLost += 1;
	};
	const deliver = (): void => {
		while (inbox.length > 0) {
			worker.onmessage?.({ data: inbox.shift() });
			hudCheck();
		}
	};

	await host.start();
	deliver();
	const catalog = await client.ready;
	bodies = catalog.bodies.map((b) => ({ id: b.id, radius: b.radius }));
	// the Worker keeps ticking while the page builds its renderer: irregular gaps, sometimes a stall
	for (let i = Math.floor(random() * 4); i > 0; i -= 1) {
		clock += random() < 0.3 ? 400 + random() * 600 : 5 + random() * 40;
		host.tick();
		deliver();
	}
	const pending = client.dispatch({ type: 'load-vessel', design: referenceTwoStage() });
	deliver();
	const result = await pending;
	if (!result.ok || result.vessel === undefined) throw new Error('launch refused');
	vessel = result.vessel;
	presence.attach(vessel);
	flying = true;
	hudCheck(); // a frame between the answer and the first snapshot
	for (let i = 0; i < 120; i += 1) {
		clock += random() < 0.1 ? 100 + random() * 300 : 8 + random() * 30;
		host.tick();
		deliver();
	}
	host.dispose();
	return run;
}

describe('a healthy launch is never read as lost (plan 047)', () => {
	// it boots a real sim: under the parallel full run that takes longer than the 5 s default
	it('the old rule misreads the gap between the load answer and the first snapshot', async () => {
		const run = await launch(1);
		expect(run.oldLost).toBeGreaterThan(0);
	}, 30_000);

	it('the presence rule never reports a loss, over 12 timings', async () => {
		for (let seed = 1; seed <= 12; seed += 1) {
			const run = await launch(seed);
			expect(run.destroyed, `seed ${seed}`).toEqual([]);
			expect(run.newLost, `seed ${seed}`).toBe(0);
			expect(run.checks).toBeGreaterThan(100);
			expect(run.lastSnapshot?.vessels.length, `seed ${seed}`).toBe(1);
		}
	}, 60_000);
});

describe('vessel presence', () => {
	const snapshotWith = (ids: number[]): Snapshot =>
		({ t: 0, vessels: ids.map((id) => ({ id })) }) as unknown as Snapshot;

	it('says nothing before a snapshot taken after the load has arrived', () => {
		const presence = createVesselPresence();
		presence.snapshot(snapshotWith([]));
		presence.attach(5 as EntityId);
		expect(presence.lost()).toBe(false);
	});

	it('reports a loss when a later snapshot lacks the vessel, and not before', () => {
		const presence = createVesselPresence();
		presence.attach(5 as EntityId);
		presence.snapshot(snapshotWith([5]));
		expect(presence.lost()).toBe(false);
		presence.snapshot(snapshotWith([]));
		expect(presence.lost()).toBe(true);
	});
});
