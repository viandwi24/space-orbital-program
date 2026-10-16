/** Plan 045: scripts read, create, edit and remove maneuver nodes, warp to one and burn it. */
import { expect, test } from 'bun:test';
import { partId, type Command, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim } from '@orbital/sim';
import { createScriptRunner } from '../src/index.ts';

const lander: VesselDesign = {
	formatVersion: 1,
	name: 'Lander',
	parts: [
		'stock.command-pod',
		'stock.reaction-wheel',
		'stock.reaction-wheel',
		'stock.tank-medium',
		'stock.engine-lv'
	].map((part, index) => ({
		index,
		part: partId(part),
		parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
	})),
	stages: [[4]]
};

async function rig() {
	const sim = await createSim({
		plugins: [Stock],
		backendFactory: () => createRapierBackend({ solverIterations: 16 }),
		seed: 1
	});
	const mu = 6.6743e-11 * sim.registries.bodies.list()[0]!.mass;
	const r = 750_000;
	const loaded = sim.dispatch({
		type: 'load-vessel',
		design: lander,
		placement: {
			kind: 'state',
			position: { x: r, y: 0, z: 0 },
			velocity: { x: 0, y: 0, z: -Math.sqrt(mu / r) }
		}
	});
	if (!loaded.ok) throw new Error(loaded.reason);
	const vessel = Number(loaded.vessel);
	const issued: Command[] = [];
	const refused: string[] = [];
	const runner = (source: string) =>
		createScriptRunner(source, {
			vessel,
			bodies: sim.registries.bodies.list(),
			parts: sim.registries.parts.list(),
			resources: sim.registries.resources.list(),
			budgetMs: 1_000
		});
	/** Tick the runner on the current snapshot and dispatch what it issued, answering the verdicts. */
	let verdicts: Array<{ seq: number; ok: boolean; reason?: string }> = [];
	const drive = (run: Awaited<ReturnType<typeof runner>>) => {
		const result = run.tick(sim.snapshot(), verdicts);
		verdicts = [];
		result.commands.forEach((command, i) => {
			issued.push(command);
			const res = sim.dispatch(command);
			if (!res.ok) refused.push(res.reason);
			verdicts.push({
				seq: result.seqs[i]!,
				ok: res.ok,
				...(res.ok ? {} : { reason: res.reason })
			});
		});
		return result;
	};
	return { sim, vessel, issued, refused, runner, drive };
}

test('a script plans a node, warps to it, points with SAS maneuver and burns it off', async () => {
	const { sim, issued, refused, runner, drive } = await rig();
	const run = await runner(`
		const dv = 250;
		const at = time() + 500;
		const planned = await addNode({ time: at, prograde: dv });
		print('planned', JSON.stringify(planned));
		await nextTick();
		const n = ship.nodes[0];
		print('node', n.id, Math.round(n.dv), Math.round(n.time - time()), ship.nodes.length);
		ship.sas = 'maneuver';
		const warped = await warpTo(n.time - 60);
		print('warp', JSON.stringify(warped));
		await waitUntil(() => time() >= n.time - 60 - 1e-6);
		await wait(40);
		print('sas', ship.sas, ship.nodes[0].dv.toFixed(1));
		await stage();
		while (ship.nodes.length > 0 && time() < n.time + 120) {
			ship.throttle = ship.nodes[0].dv > 6 ? 1 : ship.nodes[0].dv > 0.4 ? 0.1 : 0;
			await nextTick();
		}
		ship.throttle = 0;
		print('done', ship.nodes.length, ship.apoapsis > 250000);
	`);
	for (let i = 0; i < 60_000 && run.status === 'running'; i++) {
		sim.step(sim.warp > 1 ? 0.1 : 0.02);
		drive(run);
	}
	expect(run.status).toBe('finished');
	expect(refused).toEqual([]);
	expect(run.logs[0]).toBe('planned {"ok":true}');
	expect(run.logs[1]).toMatch(/^node 1 250 \d+ 1$/);
	expect(run.logs[2]).toBe('warp {"ok":true}');
	expect(run.logs[3]).toMatch(/^sas maneuver 25\d\.\d$|^sas maneuver 24\d\.\d$/);
	expect(run.logs[4]).toBe('done 0 true');
	const types = issued.map((c) => c.type);
	expect(types).toContain('node-set');
	expect(types).toContain('warp-to');
	expect(types).toContain('sas');
	sim.dispose();
}, 60_000);

test('setNode keeps the fields it is not given, removeNode with and without an id', async () => {
	const { sim, runner, drive } = await rig();
	const run = await runner(`
		await addNode({ time: time() + 900, prograde: 30, normal: 5 });
		await addNode({ time: time() + 1800, radial: 10 });
		await nextTick();
		await setNode(1, { prograde: 44 });
		await nextTick();
		print(JSON.stringify(ship.nodes.map((n) => [n.id, Math.round(n.prograde), Math.round(n.normal), Math.round(n.radial)])));
		await removeNode(2);
		await nextTick();
		print(ship.nodes.length);
		await removeNode();
		await nextTick();
		print(ship.nodes.length);
		const bad = await addNode({ time: -5, prograde: 1 });
		print(JSON.stringify(bad).includes('passed'));
		try { await addNode({ time: NaN }); } catch (e) { print(e.name); }
		try { ship.nodes.push(1); } catch (e) { print('readonly'); }
	`);
	for (let i = 0; i < 30 && run.status === 'running'; i++) {
		sim.step(0.02);
		drive(run);
	}
	expect(run.status).toBe('finished');
	expect(run.logs[0]).toBe('[[1,44,5,0],[2,0,0,10]]');
	expect(run.logs[1]).toBe('1');
	expect(run.logs[2]).toBe('0');
	expect(run.logs[3]).toBe('true');
	expect(run.logs[4]).toBe('RangeError');
	sim.dispose();
});
