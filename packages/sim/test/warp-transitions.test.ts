/** Plan 206 / ADR 0202 points 5 and 7: an engine drops rails warp; unseen atmospheric vessels freeze. */
import { describe, expect, test } from 'bun:test';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { rapier, stack } from './helpers/vessels.ts';

const HOME = 600_000;
const burner = () =>
	stack('Burner', ['stock.command-pod', 'stock.tank-small', 'stock.engine-lv'], [[2]]);
const orbit = (alt: number) => ({
	body: 'stock.home',
	a: HOME + alt,
	e: 0,
	i: 0,
	raan: 0,
	argp: 0,
	m0: 0
});

describe('warp transitions', () => {
	test('starting an engine during 1k× drops to physics warp in the same tick', async () => {
		const sim = await createSim({ plugins: [Stock], backendFactory: rapier(16) });
		const r = sim.dispatch({ type: 'debug-set-orbit', design: burner(), orbit: orbit(300_000) });
		const id = Number(r.ok && r.vessel);
		expect(sim.dispatch({ type: 'warp', factor: 1000, vessel: id })).toEqual({
			ok: true,
			granted: 1000
		});
		const stopped: string[] = [];
		sim.events.on('warp:stopped', (e) => stopped.push(e.reason));
		sim.dispatch({ type: 'stage', vessel: id });
		expect(sim.dispatch({ type: 'throttle', vessel: id, value: 1 }).ok).toBe(true);
		expect(sim.warp).toBe(10);
		expect(stopped).toEqual(['engine running']);
		expect(sim.snapshot().vessels.find((v) => v.id === id)!.mode).toBe('flight');
		sim.dispose();
	});

	test('an unseen vessel at 30 km in the atmosphere is frozen during 1k× and not deleted', async () => {
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: rapier(16),
			maxFlightFrames: 2
		});
		const watched = sim.dispatch({
			type: 'debug-set-orbit',
			design: burner(),
			orbit: orbit(300_000)
		});
		const focus = Number(watched.ok && watched.vessel);
		// a probe falling through the atmosphere far from the watched vessel
		const probe = sim.dispatch({ type: 'load-vessel', design: burner() });
		const far = Number(probe.ok && probe.vessel);
		sim.dispatch({
			type: 'debug-set-location',
			vessel: far,
			location: { kind: 'air', latitude: 0.3, longitude: 2, altitude: 30_000, speed: 100 }
		});
		const frozen: number[] = [];
		sim.events.on('vessel:frozen', (e) => frozen.push(Number(e.vessel)));
		expect(sim.dispatch({ type: 'warp', factor: 1000, vessel: focus })).toEqual({
			ok: true,
			granted: 1000
		});
		expect(frozen).toEqual([far]);
		for (let i = 0; i < 20; i++) sim.step(0.5); // 10 000 s
		const v = sim.snapshot().vessels.find((x) => x.id === far)!;
		expect(v).toBeDefined();
		expect(v.frozen).toBe(true);
		// back at physics warp it thaws where it was
		sim.dispatch({ type: 'warp', factor: 1, vessel: focus });
		sim.step(0.02);
		const back = sim.snapshot().vessels.find((x) => x.id === far)!;
		expect(back.mode).toBe('flight');
		expect(back.frozen).toBeUndefined();
		expect(Math.hypot(back.position.x, back.position.y, back.position.z) - HOME).toBeGreaterThan(
			29_000
		);
		sim.dispose();
	});
});
