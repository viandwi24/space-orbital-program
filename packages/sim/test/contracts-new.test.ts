/**
 * Plan 231's contracts (ADR 0231): a rescue spawns a crewed pod in orbit on accept, and boarding
 * and recovering its crew completes it; a docking contract completes on the first dock in orbit
 * of the named body; the templates wait for their milestones.
 */
import { describe, expect, test } from 'bun:test';
import {
	legacyWorldInfo,
	type CommandResult,
	type EntityId,
	type Plugin,
	type Quat
} from '@orbital/core';
import Stock, { ContractDocking, ContractRescue, ContractStation } from '@orbital/mod-stock';
import { defineContractTemplate, defineModule, definePlugin } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import { tickDayLength } from '../src/tick.ts';
import { orbitState } from './helpers/measure.ts';
import { openTree } from './helpers/tech.ts';
import { rapier, stack } from './helpers/vessels.ts';

/**
 * `only.*`: the stock templates of this plan at a weight that wins every draw, so a test meets
 * them in a day or two; `fix.awake` keeps an idle vessel in flight (as in `docking.test.ts`).
 */
const only: Plugin = definePlugin({
	meta: { id: 'only', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(ctx) {
		for (const t of [ContractRescue, ContractDocking, ContractStation]) {
			ctx.contractTemplates.register(
				defineContractTemplate({
					...t,
					id: `only.${t.id.slice('stock.'.length)}`,
					weight: 1e6,
					minReputation: 0
				})
			);
		}
		ctx.modules.register(
			defineModule({
				id: 'only.awake',
				update(c) {
					c.vessel.applyTorque({ x: 1e-9, y: 0, z: 0 });
				},
				actions: { wake: () => {} }
			})
		);
		ctx.parts.register({
			id: 'only.awake',
			title: 'Awake',
			mass: 1,
			shape: { kind: 'cylinder', radius: 0.3, height: 0.1 },
			attach: {
				top: { pos: [0, 0.05, 0], dir: [0, 1, 0] },
				bottom: { pos: [0, -0.05, 0], dir: [0, -1, 0] }
			},
			modules: [['only.awake', undefined]]
		});
	}
});

const career = (seed: number) => ({
	...legacyWorldInfo(seed),
	id: `contracts-new-${seed}`,
	preset: 'stock.career'
});
const make = (seed = 3) =>
	createSim({
		plugins: [Stock, openTree, only],
		backendFactory: rapier(8),
		world: career(seed)
	});
const day = (sim: Sim) => tickDayLength(sim.registries.bodies.list());

function warpDays(sim: Sim, n: number): void {
	const to = sim.time + n * day(sim);
	const r = sim.dispatch({ type: 'warp-to', time: to, factor: 1e4 });
	if (!r.ok) throw new Error(r.reason);
	for (let g = 0; (sim.time < to - 1e-6 || sim.warp !== 1) && g < 1e5; g++) sim.step(10);
}
const made = (r: CommandResult): EntityId => {
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return r.vessel;
};
const vessel = (sim: Sim, id: EntityId) => sim.snapshot().vessels.find((v) => v.id === id);
const offers = (sim: Sim) => sim.snapshot().contracts!.offers;
const milestones = (sim: Sim) => (sim.snapshot().milestones ?? []).map((m) => m.id);

/** A probe in a 100 km orbit: the world records `orbit:stock.home`. */
function firstOrbit(sim: Sim): EntityId {
	const id = made(
		sim.dispatch({
			type: 'load-vessel',
			design: stack('Probe', ['stock.probe-core'], []),
			placement: { kind: 'state', ...orbitState(sim, 100_000) }
		})
	);
	for (let i = 0; i < 5; i++) sim.step(0.02);
	expect(milestones(sim)).toContain('orbit:stock.home');
	return id;
}

/** Days until an offer of `template` shows, then that offer. */
function offerOf(sim: Sim, template: string, days = 10) {
	for (let d = 0; d < days; d++) {
		const o = offers(sim).find((x) => x.template === template);
		if (o) return o;
		warpDays(sim, 1);
	}
	throw new Error(`no ${template} offer after ${days} days`);
}

describe('plan 231 contracts', () => {
	test('the new templates wait for their milestones', async () => {
		const sim = await make(3);
		warpDays(sim, 6);
		const templates = offers(sim).map((o) => o.template);
		expect(templates.some((t) => t.startsWith('only.'))).toBe(false);
		firstOrbit(sim);
		const rescue = offerOf(sim, 'only.contract-rescue');
		expect(rescue.title).toMatch(/^Rescue a crew member from \d+ km above/);
		// the station needs a docking first
		expect(offers(sim).some((o) => o.template === 'only.contract-station')).toBe(false);
		sim.dispose();
	}, 120_000);

	test('accepting a rescue spawns a crewed pod in orbit; boarding and recovering the crew completes it', async () => {
		const sim = await make(5);
		firstOrbit(sim);
		const offer = offerOf(sim, 'only.contract-rescue');
		const before = sim.snapshot().vessels.map((v) => v.id);
		const crewBefore = sim.snapshot().crew?.length ?? 0;
		expect(sim.dispatch({ type: 'contract-accept', offer: offer.id })).toEqual({ ok: true });
		const pod = sim.snapshot().vessels.find((v) => !before.includes(v.id))!;
		expect(pod).toBeDefined();
		expect(pod.name).toBe('Stranded pod');
		expect(pod.mode).toBe('on-rails');
		const podA = pod.orbit!.a;
		expect(pod.orbit!.e).toBeLessThan(1e-6);
		expect(podA - 600_000).toBeGreaterThan(70_000);
		const stranded = sim.snapshot().crew!.at(-1)!;
		expect(sim.snapshot().crew!.length).toBe(crewBefore + 1);
		expect(stranded.status).toBe('assigned');
		expect(stranded.vessel).toBe(pod.id);
		const contract = () => sim.snapshot().contracts!.contracts.find((c) => c.id === offer.id)!;
		expect(contract().status).toBe('active');

		// a rescue craft just ahead of the pod; the member steps across and boards it
		const debug = sim.dispatch({ type: 'debug-mode', on: true });
		expect(debug.ok).toBe(true);
		const r = podA;
		const craft = made(
			sim.dispatch({
				type: 'debug-set-orbit',
				// a seat for its own pilot (a Career start has a crew, ADR 0322) and one for the stranded
				design: stack('Rescue craft', ['stock.pod-3'], []),
				orbit: { body: 'stock.home' as never, a: r, e: 0, i: 0, raan: 0, argp: 0, m0: 12 / r }
			})
		);
		// boarding from 12 m away needs the assist (plan 225: a hatch within 2 m otherwise)
		expect(sim.dispatch({ type: 'set-rule', rule: 'stock.eva-board-assist', value: true }).ok).toBe(
			true
		);
		const out = sim.dispatch({ type: 'crew-eva', vessel: pod.id, member: stranded.id });
		expect(out.ok).toBe(true);
		const suit = made(out);
		for (let i = 0; i < 25; i++) sim.step(0.02);
		expect(sim.dispatch({ type: 'crew-board', suit, vessel: craft })).toEqual({ ok: true });
		expect(contract().status).toBe('active');
		// home: the craft lands and is recovered with the member aboard
		expect(
			sim.dispatch({
				type: 'debug-set-location',
				vessel: craft,
				location: { kind: 'site', site: 'legacy' }
			}).ok
		).toBe(true);
		for (let i = 0; i < 400 && !vessel(sim, craft)?.recovery; i++) sim.step(0.02);
		expect(sim.dispatch({ type: 'recover-vessel', vessel: craft })).toEqual({ ok: true });
		sim.step(0.02);
		expect(sim.snapshot().crew!.find((m) => m.id === stranded.id)!.status).toBe('available');
		expect(contract().status).toBe('done');
		sim.dispose();
	}, 180_000);

	test('a docking contract completes on the first dock in orbit of its body', async () => {
		const sim = await make(7);
		firstOrbit(sim);
		const offer = offerOf(sim, 'only.contract-docking');
		expect(sim.dispatch({ type: 'contract-accept', offer: offer.id })).toEqual({ ok: true });
		const contract = () => sim.snapshot().contracts!.contracts.find((c) => c.id === offer.id)!;
		// two port vessels 5 m apart in orbit, closing at 0.3 m/s (the setup of docking.test.ts)
		const s = orbitState(sim, 200_000);
		const a = made(
			sim.dispatch({
				type: 'load-vessel',
				design: stack('Alpha', ['stock.docking-port', 'stock.tank-small', 'only.awake'], []),
				placement: { kind: 'state', ...s, orientation: { x: 0, y: 0, z: 0, w: 1 } }
			})
		);
		const flip: Quat = { x: 1, y: 0, z: 0, w: 0 };
		const b = made(
			sim.dispatch({
				type: 'load-vessel',
				design: stack('Beta', ['stock.docking-port', 'stock.tank-small', 'only.awake'], []),
				placement: {
					kind: 'state',
					position: { x: s.position.x, y: s.position.y + 5.3, z: s.position.z },
					velocity: { x: s.velocity.x, y: s.velocity.y - 0.3, z: s.velocity.z },
					orientation: flip
				}
			})
		);
		for (const id of [a, b]) {
			const part = vessel(sim, id)!.parts.find((p) => p.definition === 'only.awake')!;
			sim.dispatch({
				type: 'action',
				vessel: id,
				part: part.id,
				module: 'only.awake',
				action: 'wake'
			});
		}
		let docked = false;
		sim.events.on('vessel:docked', () => (docked = true));
		expect(contract().status).toBe('active');
		for (let i = 0; i < 40 * 50 && !docked; i++) sim.step(0.02);
		expect(docked).toBe(true);
		for (let i = 0; i < 5; i++) sim.step(0.02);
		expect(contract().status).toBe('done');
		// the first docking opens the station template
		expect(milestones(sim)).toContain('dock:stock.home');
		expect(offerOf(sim, 'only.contract-station').title).toMatch(/^A station for [234] around/);
		sim.dispose();
	}, 180_000);
});
