import { partId, type Command, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createScriptRunner, type CommandVerdict } from '@orbital/scripting';
import { createSim } from '@orbital/sim';
import { describe, expect, it } from 'vitest';
import { MEMBERS } from './script-api';

/** Top to bottom: port, pod, thermometer, wheel, tank, engine: every kind of part the nested tables describe. */
const craft: VesselDesign = {
	formatVersion: 1,
	name: 'Probe',
	parts: [
		'stock.command-pod',
		'stock.thermometer',
		'stock.reaction-wheel',
		'stock.tank-small',
		'stock.engine-lv'
	].map((part, index) => ({
		index,
		part: partId(part),
		parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
	})),
	stages: [[4]]
};
// a docking port on the pod's top (plan 310: ship.ports, ship.dock)
craft.parts.push({
	index: 5,
	part: partId('stock.docking-port'),
	parent: { index: 0, parentNode: 'top', node: 'bottom' }
});

describe('the nested member tables against the real sandbox', () => {
	it('lists exactly the keys the engine produces for each nested object', async () => {
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: () => createRapierBackend({ solverIterations: 16 }),
			seed: 1
		});
		try {
			const mu = 6.6743e-11 * sim.registries.bodies.get(sim.home)!.mass;
			const place = (alt: number, phase: number): number => {
				const r = 600_000 + alt;
				const speed = Math.sqrt(mu / r);
				const loaded = sim.dispatch({
					type: 'load-vessel',
					design: craft,
					placement: {
						kind: 'state',
						position: { x: r * Math.cos(phase), y: 0, z: -r * Math.sin(phase) },
						velocity: { x: -speed * Math.sin(phase), y: 0, z: -speed * Math.cos(phase) }
					}
				});
				if (!loaded.ok) throw new Error(loaded.reason);
				return Number(loaded.vessel);
			};
			const vessel = place(150_000, 0);
			const other = place(165_000, 0.4);
			const runner = await createScriptRunner(
				`
				stage();
				stage(); // nothing left to fire: refused, so ship.refusals has an entry next tick
				await nextTick();
				const refused = ship.refusals.map((r) => ({ ...r }));
				await controlFrom(ship.ports[0].part);
				const station = ship.targets.find((t) => t.id === ${other});
				await setTarget({ vessel: station.id, port: station.ports[0] });
				await addNode({ time: time() + 1000, prograde: 10 });
				await nextTick();
				await nextTick();
				const keys = (o) => { if (!o) throw new Error('missing ' + new Error().stack); return Object.keys(o).sort(); };
				const union = (list) => [...new Set(list.flatMap((o) => keys(o)))].sort();
				const all = Object.values(bodies);
				const out = ({
					'ship.position': keys(ship.position),
					'ship.velocity': keys(ship.velocity),
					'ship.up': keys(ship.up),
					'ship.nose': keys(ship.nose),
					'ship.orientation': keys(ship.orientation),
					'ship.attitude': keys(ship.attitude),
					'ship.orbit': keys(ship.orbit),
					'ship.parts[]': keys(ship.parts[0]),
					'ship.parts[].position': keys(ship.parts[0].position),
					'ship.engines[]': keys(ship.engines[0]),
					'ship.wheels[]': keys(ship.wheels[0]),
					'ship.science': keys(ship.science),
					'ship.science.experiments[]': keys(ship.science.experiments[0]),
					'ship.nodes[]': keys(ship.nodes[0]),
					'ship.nodes[].vector': keys(ship.nodes[0].vector),
					'ship.target': keys(ship.target),
					'ship.target.position': keys(ship.target.position),
					'ship.target.velocity': keys(ship.target.velocity),
					'ship.target.approach': keys(ship.target.approach),
					'ship.targets[]': union(ship.targets),
					'ship.ports[]': keys(ship.ports[0]),
					'ship.ports[].direction': keys(ship.ports[0].direction),
					'ship.dock': keys(ship.dock),
					'ship.dock.lateral': keys(ship.dock.lateral),
					'ship.refusals[]': keys(refused[0]),
					'bodies[]': [...union(all), 'state'].sort(),
					'bodies[].atmosphere': keys(all.find((b) => b.atmosphere).atmosphere),
					'bodies[].orbit': keys(all.find((b) => b.orbit).orbit),
					stateIsFunction: typeof all[0].state === 'function'
				});
				for (const [k, v] of Object.entries(out)) print(k + '=' + JSON.stringify(v));
				`,
				{
					vessel,
					bodies: sim.registries.bodies.list(),
					parts: sim.registries.parts.list(),
					resources: sim.registries.resources.list(),
					budgetMs: 2_000
				}
			);
			let verdicts: CommandVerdict[] = [];
			for (let i = 0; i < 12 && runner.status === 'running'; i++) {
				const result = runner.tick(sim.snapshot(), verdicts);
				verdicts = result.commands.map((command: Command, k) => {
					const res = sim.dispatch(command);
					return { seq: result.seqs[k]!, ok: res.ok, ...(res.ok ? {} : { reason: res.reason }) };
				});
			}
			expect(runner.error).toBeUndefined();
			expect(runner.status).toBe('finished');
			const seen: Record<string, unknown> = {};
			for (const line of runner.logs) {
				const at = line.indexOf('=');
				seen[line.slice(0, at)] = JSON.parse(line.slice(at + 1));
			}
			expect(seen.stateIsFunction).toBe(true);
			delete seen.stateIsFunction;
			// Every path of the table was checked, and every checked path is in the table.
			expect(Object.keys(seen).sort()).toEqual(Object.keys(MEMBERS).sort());
			for (const [path, entries] of Object.entries(MEMBERS)) {
				expect(entries.map((e) => e.name).sort(), path).toEqual(seen[path]);
			}
		} finally {
			sim.dispose();
		}
	}, 30_000);
});
