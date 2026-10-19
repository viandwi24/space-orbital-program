/** Crew core in the sim (plan 106, ADR 0176). */
import { describe, expect, test } from 'bun:test';
import type { EntityId } from '@orbital/core';
import type { Sim } from '../src/index.ts';
import { systemOf, transferState } from './helpers/moon.ts';
import { newSim, probe, stack } from './helpers/vessels.ts';

const twoPods = () => stack('Two pods', ['stock.command-pod', 'stock.command-pod'], []);
const roster = (sim: Sim) => sim.snapshot().crew ?? [];
const member = (sim: Sim, id: string) => roster(sim).find((m) => m.id === id)!;

async function hired(professions: Array<'pilot' | 'engineer' | 'scientist' | 'tourist'>) {
	const sim = await newSim();
	for (const p of professions)
		expect(sim.dispatch({ type: 'crew-hire', profession: p }).ok).toBe(true);
	return sim;
}

function load(
	sim: Sim,
	design: ReturnType<typeof stack>,
	placement: unknown,
	crew: Array<{ member: string; part: number }>
): { ok: boolean; vessel?: EntityId; reason?: string } {
	return sim.dispatch({ type: 'load-vessel', design, placement: placement as never, crew });
}

function restAndRecover(sim: Sim, vessel: EntityId): void {
	for (let i = 0; i < 400; i++) {
		sim.step(0.02);
		const r = sim.dispatch({ type: 'recover-vessel', vessel });
		if (r.ok) return;
	}
	throw new Error('the vessel never came to rest');
}

describe('crew', () => {
	test('hiring is deterministic from the world seed; the roster starts empty and is saved once used', async () => {
		const a = await hired(['pilot', 'scientist']);
		const b = await hired(['pilot', 'scientist']);
		expect(roster(a).map((m) => [m.id, m.name, m.traits])).toEqual(
			roster(b).map((m) => [m.id, m.name, m.traits])
		);
		expect(roster(a)[0]!.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
		const fresh = await newSim();
		expect(fresh.snapshot().crew).toBeUndefined();
		expect('crew' in fresh.save()).toBe(false);
		expect(a.save().crew!.members).toHaveLength(2);
	});

	test('seats respect crewCapacity; crew-transfer moves a member between parts', async () => {
		const sim = await hired(['pilot', 'engineer']);
		expect(
			load(sim, probe(), undefined, [
				{ member: 'c1', part: 0 },
				{ member: 'c2', part: 0 }
			])
		).toEqual({
			ok: false,
			reason: expect.stringContaining('seat')
		});
		expect(load(sim, probe(), undefined, [{ member: 'c1', part: 2 }]).ok).toBe(false); // a tank has no seat
		const r = load(sim, twoPods(), undefined, [{ member: 'c1', part: 0 }]);
		expect(r.ok).toBe(true);
		const vessel = r.vessel!;
		const [podA, podB] = sim
			.snapshot()
			.vessels.find((v) => v.id === vessel)!
			.parts.map((p) => p.id) as [EntityId, EntityId];
		expect(
			sim
				.snapshot()
				.vessels.find((v) => v.id === vessel)!
				.crew!.map((c) => [c.member, c.part])
		).toEqual([['c1', podA]]);
		expect(sim.dispatch({ type: 'crew-transfer', vessel, member: 'c1', to: podB! }).ok).toBe(true);
		expect(sim.snapshot().vessels.find((v) => v.id === vessel)!.crew![0]!.part).toBe(podB!);
		expect(member(sim, 'c1').status).toBe('assigned');
		expect(load(sim, probe(), undefined, [{ member: 'c1', part: 0 }]).ok).toBe(false); // already aboard
	});

	test('a moon flyby on rails is recorded for the crew aboard', async () => {
		const sim = await hired(['pilot']);
		const s = systemOf(sim);
		const st = transferState(s, 680_000, 800_000);
		const r = load(sim, probe(), { kind: 'state', position: st.r, velocity: st.v }, [
			{ member: 'c1', part: 0 }
		]);
		expect(r.ok).toBe(true);
		let entered = false;
		sim.events.on('vessel:soi-changed', (e) => {
			if (e.to === 'stock.cinder') entered = true;
		});
		for (let i = 0; i < 20_000 && !entered; i++) {
			if (sim.warp === 1) sim.dispatch({ type: 'warp', factor: 1000 });
			sim.step(0.01);
		}
		expect(entered).toBe(true);
		sim.step(0.01);
		expect(member(sim, 'c1').places).toContain('flyby:stock.cinder');
	});

	test('a recovery on the moon books flyby and landed XP once per member; a second one books nothing new', async () => {
		const sim = await hired(['pilot', 'scientist']);
		// The Legacy world is a Sandbox: professions and experience are off there (078 presets).
		expect(sim.dispatch({ type: 'set-rule', rule: 'stock.crew-experience', value: true }).ok).toBe(
			true
		);
		const xp: Array<[string, string, number]> = [];
		sim.events.on('crew:xp', (e) => xp.push([e.member, e.place, e.xp]));
		const crew = [
			{ member: 'c1', part: 0 },
			{ member: 'c2', part: 1 }
		];
		const first = load(sim, twoPods(), { kind: 'surface', body: 'stock.cinder' }, crew);
		expect(first.ok).toBe(true);
		restAndRecover(sim, first.vessel!);
		expect(xp).toEqual([
			['c1', 'flyby:stock.cinder', 2],
			['c1', 'landed:stock.cinder', 4.6],
			['c2', 'flyby:stock.cinder', 2],
			['c2', 'landed:stock.cinder', 4.6]
		]);
		expect(member(sim, 'c1')).toMatchObject({ status: 'available', xp: 6.6, level: 1 });
		const second = load(sim, twoPods(), { kind: 'surface', body: 'stock.cinder' }, crew);
		expect(second.ok).toBe(true);
		restAndRecover(sim, second.vessel!);
		expect(xp).toHaveLength(4); // nothing new
	});

	test('death rule: permanent loses the crew, off returns them, return brings them back after the set days', async () => {
		const crash = async (death: string, days?: number) => {
			const sim = await hired(['pilot']);
			expect(sim.dispatch({ type: 'set-rule', rule: 'stock.crew-death', value: death }).ok).toBe(
				true
			);
			if (days !== undefined)
				sim.dispatch({ type: 'set-rule', rule: 'stock.crew-return-days', value: days });
			const r = load(
				sim,
				probe(),
				{ kind: 'state', position: { x: 601_000, y: 0, z: 0 }, velocity: { x: -300, y: 0, z: 0 } },
				[{ member: 'c1', part: 0 }]
			);
			expect(r.ok).toBe(true);
			for (let i = 0; i < 1_000 && sim.snapshot().vessels.length > 0; i++) sim.step(0.02);
			return sim;
		};
		expect(member(await crash('permanent'), 'c1').status).toBe('lost');
		expect(member(await crash('off'), 'c1').status).toBe('available');
		const sim = await crash('return', 1);
		expect(member(sim, 'c1').status).toBe('missing');
		const back: string[] = [];
		sim.events.on('crew:returned', (e) => back.push(e.member));
		sim.dispatch({ type: 'warp', factor: 1e4 });
		sim.step(5); // 50 000 s: more than two stock days
		expect(back).toEqual(['c1']);
		expect(member(sim, 'c1').status).toBe('available');
	});

	test('salaries are one ledger entry per tick when economy and salaries are on; hiring costs the recruit fee', async () => {
		const sim = await newSim();
		sim.dispatch({ type: 'set-rule', rule: 'stock.economy', value: true });
		sim.dispatch({ type: 'set-rule', rule: 'stock.crew-salaries', value: true });
		sim.dispatch({ type: 'crew-hire', profession: 'pilot' });
		sim.dispatch({ type: 'crew-hire', profession: 'scientist' });
		sim.dispatch({ type: 'warp', factor: 1e4 });
		sim.step(5); // two ticks
		const entries = sim.save().economy!.entries.filter((e) => e.cause.startsWith('crew.'));
		expect(entries.map((e) => [e.cause, e.amount])).toEqual([
			['crew.recruit', -8_000],
			['crew.recruit', -9_000],
			['crew.salaries', -850],
			['crew.salaries', -850]
		]);
	});
});

describe('crew-dismiss (contract request of plan 108, ADR 0152 point 4)', () => {
	test('an available member leaves the roster; a seated one cannot be let go', async () => {
		const sim = await hired(['pilot', 'engineer']);
		const [a, b] = roster(sim).map((m) => m.id);
		const gone: string[] = [];
		sim.events.on('crew:dismissed', (e) => gone.push(e.member));
		const seated = load(sim, twoPods(), undefined, [{ member: b!, part: 0 }]);
		expect(seated.ok).toBe(true);
		const refused = sim.dispatch({ type: 'crew-dismiss', member: b! });
		expect(refused.ok ? '' : refused.reason).toMatch(/is assigned and cannot be dismissed$/);
		expect(sim.dispatch({ type: 'crew-dismiss', member: a! }).ok).toBe(true);
		expect(roster(sim).map((m) => m.id)).toEqual([b!]);
		expect(gone).toEqual([a!]);
		const unknown = sim.dispatch({ type: 'crew-dismiss', member: 'nobody' });
		expect(unknown.ok ? '' : unknown.reason).toBe('no crew member "nobody"');
		sim.dispose();
	});
});
