/** Plan 035: scripts read and set the target, see the closest approach, point SAS at it and read a body's orbit over time. */
import { expect, test } from 'bun:test';
import { partId, type Command, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim } from '@orbital/sim';
import { createScriptRunner, type BodyStateProvider } from '../src/index.ts';

const probe: VesselDesign = {
	formatVersion: 1,
	name: 'Probe',
	parts: ['stock.command-pod', 'stock.reaction-wheel', 'stock.tank-small'].map((part, index) => ({
		index,
		part: partId(part),
		parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
	})),
	stages: []
};

async function rig(options: { bodyState?: BodyStateProvider } = {}) {
	const sim = await createSim({
		plugins: [Stock],
		backendFactory: () => createRapierBackend({ solverIterations: 16 }),
		seed: 1
	});
	const mu = 6.6743e-11 * sim.registries.bodies.get(sim.home)!.mass;
	const place = (alt: number, phase: number) => {
		const r = 600_000 + alt;
		const speed = Math.sqrt(mu / r);
		const c = Math.cos(phase);
		const n = Math.sin(phase);
		const loaded = sim.dispatch({
			type: 'load-vessel',
			design: probe,
			placement: {
				kind: 'state',
				position: { x: r * c, y: 0, z: -r * n },
				velocity: { x: -speed * n, y: 0, z: -speed * c }
			}
		});
		if (!loaded.ok) throw new Error(loaded.reason);
		return Number(loaded.vessel);
	};
	const vessel = place(150_000, 0);
	const other = place(165_000, 0.4);
	const issued: Command[] = [];
	const refused: string[] = [];
	let verdicts: Array<{ seq: number; ok: boolean; reason?: string }> = [];
	const runner = (source: string) =>
		createScriptRunner(source, {
			vessel,
			bodies: sim.registries.bodies.list(),
			parts: sim.registries.parts.list(),
			resources: sim.registries.resources.list(),
			budgetMs: 1_000,
			...options
		});
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
	return { sim, vessel, other, issued, refused, runner, drive };
}

test('ship.target is null, ship.targets lists the bodies and the other vessels with names', async () => {
	const { sim, vessel, other, runner, drive } = await rig();
	const run = await runner(`
		print(JSON.stringify(ship.target));
		print(JSON.stringify(ship.targets));
	`);
	drive(run);
	expect(run.status).toBe('finished');
	expect(run.logs[0]).toBe('null');
	const targets = JSON.parse(run.logs[1]!);
	expect(
		targets.filter((t: { kind: string }) => t.kind === 'body').map((t: { id: string }) => t.id)
	).toEqual(sim.registries.bodies.list().map((b) => String(b.id)));
	expect(targets.filter((t: { kind: string }) => t.kind === 'vessel')).toEqual([
		{ kind: 'vessel', id: other, name: 'Probe' }
	]);
	expect(targets.some((t: { id: unknown }) => t.id === vessel)).toBe(false);
	sim.dispose();
});

test('setTarget by vessel id, then the target, its relative state and its approach show up on the next tick', async () => {
	const { sim, other, runner, drive } = await rig();
	const run = await runner(`
		const first = await setTarget(${other});
		await nextTick();
		const t = ship.target;
		print(JSON.stringify({ first, kind: t.kind, id: t.id, name: t.name, distance: t.distance, speed: t.relativeSpeed, approach: t.approach }));
	`);
	for (let i = 0; i < 3; i++) drive(run);
	expect(run.status).toBe('finished');
	const out = JSON.parse(run.logs[0]!);
	expect(out.first).toEqual({ ok: true });
	expect(out).toMatchObject({ kind: 'vessel', id: other, name: 'Probe' });
	const truth = sim.snapshot().vessels.find((v) => v.target !== undefined)!.target!;
	expect(out.distance).toBe(truth.distance);
	expect(out.approach).toEqual(truth.approach);
	expect(out.approach.time).toBeGreaterThan(sim.time);
	sim.dispose();
});

test('a script can pick a body or a listed entry, clear the target, and a refusal is reported', async () => {
	const { sim, runner, drive, issued } = await rig();
	const run = await runner(`
		const log = [];
		log.push(await setTarget('stock.cinder'));
		await nextTick();
		log.push(ship.target.kind + ':' + ship.target.id);
		const probe = ship.targets.find((t) => t.kind === 'vessel');
		log.push(await setTarget(probe));
		await nextTick();
		log.push(ship.target.kind + ':' + ship.target.name);
		log.push(await setTarget(null));
		await nextTick();
		log.push(String(ship.target));
		log.push(await setTarget(424242));
		print(JSON.stringify(log));
	`);
	for (let i = 0; i < 8; i++) drive(run);
	expect(run.status).toBe('finished');
	const log = JSON.parse(run.logs[0]!);
	expect(log[0]).toEqual({ ok: true });
	expect(log[1]).toBe('body:stock.cinder');
	expect(log[2]).toEqual({ ok: true });
	expect(log[3]).toBe('vessel:Probe');
	expect(log[4]).toEqual({ ok: true });
	expect(log[5]).toBe('null');
	expect(log[6].ok).toBe(false);
	expect(log[6].reason).toContain('unknown vessel 424242');
	expect(issued.filter((c) => c.type === 'target-set')).toHaveLength(4);
	sim.dispose();
});

test('setTarget rejects what it cannot read, inside the script', async () => {
	const { sim, runner, drive } = await rig();
	for (const arg of ['{}', 'true', 'undefined', '{ kind: "planet", id: 1 }']) {
		const run = await runner(`await setTarget(${arg});`);
		drive(run);
		expect(run.status).toBe('failed');
		expect(run.error).toMatch(/setTarget needs a body id|target-set/);
	}
	sim.dispose();
});

test('ship.sas accepts target and anti-target', async () => {
	const { sim, vessel, runner, drive } = await rig();
	const run = await runner(`
		await setTarget(ship.targets.find((t) => t.kind === 'vessel'));
		await nextTick();
		ship.sas = 'target';
		await nextTick();
		print(ship.sas);
		ship.sas = 'anti-target';
		await nextTick();
		print(ship.sas);
		let threw = false;
		try { ship.sas = 'sideways'; } catch (e) { threw = true; }
		print(String(threw));
	`);
	for (let i = 0; i < 6; i++) {
		drive(run);
		sim.step(0.02);
	}
	expect(run.status).toBe('finished');
	expect(run.logs).toEqual(['target', 'anti-target', 'true']);
	expect(sim.snapshot().vessels.find((v) => Number(v.id) === vessel)!.sas!.mode).toBe(
		'anti-target'
	);
	sim.dispose();
});

test('bodies[id].state(t, frame) asks the host, validates its arguments and stays out of printed data', async () => {
	const calls: Array<[string, number, string]> = [];
	const provider: BodyStateProvider = (id, t, frame) => {
		calls.push([id, t, frame]);
		return { position: { x: t, y: 0, z: 1 }, velocity: { x: 0, y: 2, z: 0 } };
	};
	const { sim, runner, drive } = await rig({ bodyState: provider });
	const run = await runner(`
		const moon = bodies['stock.cinder'];
		print(JSON.stringify(moon.state(100)));
		print(JSON.stringify(moon.state(200, 'system')));
		print(Object.keys(moon).includes('state') ? 'listed' : 'hidden');
		for (const bad of [() => moon.state(NaN), () => moon.state('1'), () => moon.state(1, 'sun')]) {
			try { bad(); print('no error'); } catch (e) { print('error'); }
		}
		print(String(Object.isFrozen(moon)));
	`);
	drive(run);
	expect(run.status).toBe('finished');
	expect(JSON.parse(run.logs[0]!)).toEqual({
		position: { x: 100, y: 0, z: 1 },
		velocity: { x: 0, y: 2, z: 0 }
	});
	expect(JSON.parse(run.logs[1]!).position.x).toBe(200);
	expect(run.logs.slice(2)).toEqual(['hidden', 'error', 'error', 'error', 'true']);
	expect(calls).toEqual([
		['stock.cinder', 100, 'parent'],
		['stock.cinder', 200, 'system']
	]);
	sim.dispose();
});

test('without a provider bodies.state says so', async () => {
	const { sim, runner, drive } = await rig();
	const run = await runner(`bodies['stock.home'].state(0);`);
	drive(run);
	expect(run.status).toBe('failed');
	expect(run.error).toContain('not available in this host');
	sim.dispose();
});

test('a provider that throws reaches the script as an exception it can catch', async () => {
	const { sim, runner, drive } = await rig({
		bodyState: () => {
			throw new RangeError('nope');
		}
	});
	const run = await runner(`
		try { bodies['stock.home'].state(0); } catch (e) { print('caught ' + e.message); }
	`);
	drive(run);
	expect(run.status).toBe('finished');
	expect(run.logs[0]).toBe('caught nope');
	sim.dispose();
});
