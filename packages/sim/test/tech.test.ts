/** The tech tree in the sim (plan 105, ADR 0154): research gates, the lock at launch, the save. */
import { describe, expect, test } from 'bun:test';
import { legacyWorldInfo, type Plugin, type WorldInfo } from '@orbital/core';
import Sol from '@orbital/mod-sol';
import Stock from '@orbital/mod-stock';
import { defineTechNode, definePlugin } from '@orbital/sdk';
import { createSim } from '../src/index.ts';
import { orbitState } from './helpers/measure.ts';
import { probe, rapier, twoStage } from './helpers/vessels.ts';

const fixture: Plugin = definePlugin({
	meta: { id: 'fix', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(ctx) {
		ctx.techNodes.register(
			defineTechNode({
				id: 'fix.orbital',
				label: 'Orbital',
				tier: 2,
				cost: 0,
				requires: ['stock.basics'],
				milestone: 'orbit:stock.home'
			})
		);
	}
});

const career = () => ({ ...legacyWorldInfo(5), id: 'tech', preset: 'stock.career' });
const newSim = (resume?: unknown) =>
	createSim({
		plugins: [Stock, fixture],
		backendFactory: rapier(),
		seed: 5,
		...(resume ? { resume } : { world: career() })
	});

describe('tech tree', () => {
	test('researching a node whose milestone is missing is refused with the milestone named; with it, accepted', async () => {
		const sim = await newSim();
		const r = sim.dispatch({ type: 'research', node: 'fix.orbital' });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toContain('orbit:stock.home');
		const placed = sim.dispatch({
			type: 'load-vessel',
			design: probe(),
			placement: { kind: 'state', ...orbitState(sim, 100_000) }
		});
		expect(placed.ok).toBe(true);
		for (let i = 0; i < 5; i++) sim.step(0.02);
		expect(sim.dispatch({ type: 'research', node: 'fix.orbital' }).ok).toBe(true);
		expect(sim.snapshot().tech).toEqual({ enabled: true, researched: ['fix.orbital'] });
	});

	test('science short and a missing required node are refused with a sentence', async () => {
		const sim = await newSim();
		const short = sim.dispatch({ type: 'research', node: 'stock.instruments' });
		expect(short.ok).toBe(false);
		if (!short.ok) expect(short.reason).toBe('needs 10 science, the world has 0');
		const order = sim.dispatch({ type: 'research', node: 'stock.propulsion' });
		expect(order.ok).toBe(false);
		if (!order.ok) expect(order.reason).toContain('"Structures"');
	});

	test('a design with a locked part is refused at launch, naming the node; the basics launch', async () => {
		const sim = await newSim();
		expect(sim.dispatch({ type: 'load-vessel', design: twoStage() }).ok).toBe(true);
		const legs = twoStage();
		legs.parts.push({
			index: legs.parts.length,
			part: 'stock.landing-legs' as never,
			parent: { index: legs.parts.length - 1, parentNode: 'bottom', node: 'top' }
		});
		const r = sim.dispatch({ type: 'load-vessel', design: legs });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toBe('"Landing Legs" is locked: research "Landing" first');
	});

	test('the researched set is saved and resumed; Sandbox has no tree', async () => {
		const sim = await newSim();
		sim.dispatch({
			type: 'load-vessel',
			design: probe(),
			placement: { kind: 'state', ...orbitState(sim, 100_000) }
		});
		for (let i = 0; i < 5; i++) sim.step(0.02);
		sim.dispatch({ type: 'research', node: 'fix.orbital' });
		const saved = JSON.parse(JSON.stringify(sim.save()));
		expect(saved.tech).toEqual({ researched: ['fix.orbital'] });
		const resumed = await newSim(saved);
		expect(resumed.snapshot().tech?.researched).toEqual(['fix.orbital']);
		const sandbox = await createSim({ plugins: [Stock], backendFactory: rapier(), seed: 1 });
		const r = sandbox.dispatch({ type: 'research', node: 'stock.instruments' });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toBe('this world has no tech tree');
	});
});

describe('tech milestones in every system (system audit)', () => {
	const aliased: Plugin = definePlugin({
		meta: { id: 'fix2', version: '1.0.0', api: '^0.1' },
		depends: ['stock'],
		setup(ctx) {
			ctx.techNodes.register(
				defineTechNode({
					id: 'fix2.moon',
					label: 'Moon',
					tier: 2,
					cost: 0,
					requires: ['stock.basics'],
					milestone: 'flyby:moon'
				})
			);
		}
	});

	test('the stock tree names `home` and `moon`, never a stock body: a Sol career can finish it', async () => {
		const sim = await newSim();
		const named = sim.registries.techNodes
			.list()
			.filter((n) => n.id.startsWith('stock.'))
			.map((n) => n.milestone)
			.filter((m) => m !== undefined && /stock\./.test(m));
		expect(named).toEqual([]);
		sim.dispose();
	});

	test("`home` and `moon` are the world's own: Home and Cinder in stock, the Earth and the Moon in Sol", async () => {
		const stock = await createSim({
			plugins: [Stock, aliased],
			backendFactory: rapier(),
			seed: 5,
			world: career()
		});
		const a = stock.dispatch({ type: 'research', node: 'fix2.moon' });
		expect(a.ok ? '' : a.reason).toContain('"flyby:stock.cinder"');
		stock.dispose();
		const solWorld: WorldInfo = {
			...career(),
			id: 'tech-sol',
			systemId: 'sol',
			systemVersion: '0.1.0',
			variant: 'rescaled',
			sites: []
		};
		const sol = await createSim({
			plugins: [Stock, Sol, aliased],
			backendFactory: rapier(),
			seed: 5,
			world: solWorld
		});
		const b = sol.dispatch({ type: 'research', node: 'fix2.moon' });
		expect(b.ok ? '' : b.reason).toContain('"flyby:sol.moon"');
		sol.dispose();
	});
});
