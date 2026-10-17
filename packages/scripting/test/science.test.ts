/** Plan 103: `ship.science` and `runExperiment`. */
import { expect, test } from 'bun:test';
import type { CommandVerdict } from '../src/index.ts';
import { newRig, stack } from './helpers.ts';

test('ship.science lists the experiments and runExperiment sends the run action', async () => {
	const rig = await newRig(
		stack('Lab', ['stock.command-pod', 'stock.thermometer', 'stock.data-drive'], [])
	);
	const thermo = rig.sim
		.snapshot()
		.vessels[0]!.parts.find((p) => p.definition === 'stock.thermometer')!.id;
	const runner = await rig.runner(`
		print(JSON.stringify(ship.science));
		print(JSON.stringify(await runExperiment('stock.temperature')));
		await nextTick();
		print(ship.science.experiments[0].state);
		try { runExperiment('stock.nothing'); } catch (e) { print(e.message); }
	`);
	let verdicts: CommandVerdict[] = [];
	for (let i = 0; i < 6 && runner.status === 'running'; i++) {
		rig.sim.step(0.02);
		const result = runner.tick(rig.sim.snapshot(), verdicts);
		verdicts = result.commands.map((command, k) => {
			rig.dispatched.push(command);
			const res = rig.sim.dispatch(command);
			return { seq: result.seqs[k]!, ok: res.ok, ...(res.ok ? {} : { reason: res.reason }) };
		});
	}
	expect(runner.error).toBeUndefined();
	expect(JSON.parse(runner.logs[0]!)).toEqual({
		situation: 'stock.landed',
		experiments: [
			{
				part: Number(thermo),
				experiment: 'stock.temperature',
				state: 'READY',
				reason: null,
				progress: 0
			}
		]
	});
	expect(runner.logs[1]).toBe('{"ok":true}');
	expect(runner.logs[2]).toBe('RUNNING');
	expect(runner.logs[3]).toBe('runExperiment: no experiment "stock.nothing" aboard');
	expect(rig.dispatched.find((c) => c.type === 'action')).toMatchObject({
		vessel: rig.vessel,
		part: thermo,
		module: 'stock.experiment',
		action: 'run',
		args: []
	});
	rig.sim.dispose();
});
