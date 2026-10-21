/** Plan 310, ADR 0271 point 7: the vessel-pilot controls in the ship API, all through commands. */
import { expect, test } from 'bun:test';
import { partId, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim } from '@orbital/sim';
import { createScriptRunner } from '../src/index.ts';

const craft = (name: string): VesselDesign =>
	({
		formatVersion: 3,
		name,
		parts: [
			{ index: 0, part: partId('stock.probe-core'), parent: null },
			{
				index: 1,
				part: partId('stock.docking-port'),
				parent: { index: 0, parentNode: 'top', node: 'bottom' }
			},
			{
				index: 2,
				part: partId('stock.reaction-wheel'),
				parent: { index: 0, parentNode: 'bottom', node: 'top' }
			}
		],
		stages: []
	}) as VesselDesign;

test('a script targets a port, controls from its own port, translates, points and reads ship.dock', async () => {
	const sim = await createSim({
		plugins: [Stock],
		backendFactory: () => createRapierBackend({ solverIterations: 16 }),
		seed: 1
	});
	const mu = 6.6743e-11 * sim.registries.bodies.get(sim.home)!.mass;
	const r = 750_000;
	const speed = Math.sqrt(mu / r);
	const place = (name: string, dy: number) => {
		const loaded = sim.dispatch({
			type: 'load-vessel',
			design: craft(name),
			placement: {
				kind: 'state',
				position: { x: r, y: dy, z: 0 },
				velocity: { x: 0, y: 0, z: -speed },
				orientation: dy === 0 ? { x: 0, y: 0, z: 0, w: 1 } : { x: 1, y: 0, z: 0, w: 0 }
			}
		});
		if (!loaded.ok) throw new Error(loaded.reason);
		return Number(loaded.vessel);
	};
	const vessel = place('Chaser', 0);
	const other = place('Station', 40);
	const run = await createScriptRunner(
		`
		const station = ship.targets.find((t) => t.kind === 'vessel');
		print(JSON.stringify(station.ports.length));
		print(JSON.stringify(await setTarget({ vessel: station.id, port: station.ports[0] })));
		print(JSON.stringify(await controlFrom(ship.ports[0].part)));
		print(JSON.stringify(await setRcs(true)));
		await nextTick();
		print(JSON.stringify({ part: ship.target.part, control: ship.controlPart, rcs: ship.rcs }));
		const d = ship.dock;
		print(JSON.stringify({ along: Math.round(d.along), angle: Math.round(d.angle * 100), same: d.sameSize }));
		translate(0, 0.5, 0);
		pointAt({ x: 0, y: 1, z: 0 });
		await nextTick();
		print(ship.sas);
		print(JSON.stringify(await engage('nobody.none')));
		`,
		{
			vessel,
			bodies: sim.registries.bodies.list(),
			parts: sim.registries.parts.list(),
			resources: sim.registries.resources.list(),
			budgetMs: 1_000
		}
	);
	const issued: string[] = [];
	let verdicts: Array<{ seq: number; ok: boolean; reason?: string }> = [];
	for (let i = 0; i < 30 && run.status === 'running'; i++) {
		const result = run.tick(sim.snapshot(), verdicts);
		verdicts = result.commands.map((command, k) => {
			issued.push(command.type);
			const res = sim.dispatch(command);
			return { seq: result.seqs[k]!, ok: res.ok, ...(res.ok ? {} : { reason: res.reason }) };
		});
		sim.step(0.02);
	}
	expect(run.status).toBe('finished');
	const portB = sim.snapshot().vessels.find((v) => Number(v.id) === other)!.ports![0]!.part;
	const portA = sim.snapshot().vessels.find((v) => Number(v.id) === vessel)!.ports![0]!.part;
	expect(run.logs.slice(0, 4)).toEqual(['1', '{"ok":true}', '{"ok":true}', '{"ok":true}']);
	expect(JSON.parse(run.logs[4]!)).toEqual({
		part: Number(portB),
		control: Number(portA),
		rcs: true
	});
	// the station's port faces down at the chaser's, 40 m up, face to face
	expect(JSON.parse(run.logs[5]!)).toMatchObject({ angle: 0, same: true });
	expect(Math.abs(JSON.parse(run.logs[5]!).along - 39)).toBeLessThanOrEqual(1);
	expect(run.logs[6]).toBe('direction');
	expect(run.logs[7]).toContain('unknown autopilot');
	expect(issued).toEqual(
		expect.arrayContaining(['target-set', 'set-control-part', 'set-rcs', 'attitude', 'sas'])
	);
	const own = sim.snapshot().vessels.find((v) => Number(v.id) === vessel)!;
	expect(own.sas?.mode).toBe('direction');
	sim.dispose();
});
