/** Plan 203 / ADR 0200 point 9: the `debug` global exists only with `debug: true` and drives the sim's debug commands. */
import { expect, test } from 'bun:test';
import { newRig } from './helpers.ts';

test('without debug there is no debug global', async () => {
	const rig = await newRig();
	const runner = await rig.runner(`print(typeof debug);`);
	rig.drive(runner);
	expect(runner.logs).toEqual(['undefined']);
	runner.dispose();
	rig.sim.dispose();
});

test('debug.setOrbit and debug.setResource reach the sim (a Sandbox world)', async () => {
	const rig = await newRig();
	const runner = await rig.runner(
		`
		const r = await debug.setOrbit({ apoapsis: 100000, periapsis: 100000 });
		print(r.ok, ship.mode);
		await nextTick();
		print(Math.round(ship.apoapsis), Math.round(ship.periapsis), ship.mode);
		await debug.setResource({ resource: 'stock.liquid-fuel', fraction: 0 });
		await nextTick();
		print(Object.keys(debug).sort().join(','));
		`,
		{ debug: true }
	);
	// the promises settle on the verdicts the next tick passes back
	let verdicts: Array<{ seq: number; ok: boolean; reason?: string }> = [];
	for (let i = 0; i < 8 && runner.status === 'running'; i++) {
		rig.sim.step(0.02);
		const result = runner.tick(rig.sim.snapshot(), verdicts);
		verdicts = result.commands.map((command, k) => {
			rig.dispatched.push(command);
			const r = rig.sim.dispatch(command);
			return r.ok
				? { seq: result.seqs[k]!, ok: true }
				: { seq: result.seqs[k]!, ok: false, reason: r.reason };
		});
	}
	expect(runner.status).toBe('finished');
	expect(runner.logs[1]).toBe('100000 100000 on-rails');
	expect(runner.logs[2]).toBe('log,setCheat,setLocation,setOrbit,setResource,setTemperature');
	expect(rig.dispatched.map((c) => c.type)).toEqual(['debug-set-orbit', 'debug-set-resource']);
	runner.dispose();
	rig.sim.dispose();
});
