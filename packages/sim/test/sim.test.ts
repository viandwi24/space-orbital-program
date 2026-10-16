import { describe, expect, test } from 'bun:test';
import { partId, type Command, type VesselDesign } from '@orbital/core';
import { add, dot, length, normalize, scale, sub } from '@orbital/kepler';
import { definePlugin, defineSystem } from '@orbital/sdk';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { altitude, orbitState, partMasses, vesselMass } from './helpers/measure.ts';
import { newSim, probe, rapier, twoStage } from './helpers/vessels.ts';

const LF = 'stock.liquid-fuel';
const amounts = (
	v: { parts: { modules: Record<string, unknown> }[] },
	i: number
): Record<string, number> =>
	(v.parts[i]!.modules['stock.resource-container'] as { amounts: Record<string, number> }).amounts;
const rotate = (
	q: { x: number; y: number; z: number; w: number },
	v: { x: number; y: number; z: number }
) => {
	const u = { x: q.x, y: q.y, z: q.z };
	const t = {
		x: 2 * (u.y * v.z - u.z * v.y),
		y: 2 * (u.z * v.x - u.x * v.z),
		z: 2 * (u.x * v.y - u.y * v.x)
	};
	return {
		x: v.x + q.w * t.x + (u.y * t.z - u.z * t.y),
		y: v.y + q.w * t.y + (u.z * t.x - u.x * t.z),
		z: v.z + q.w * t.z + (u.x * t.y - u.y * t.x)
	};
};

async function pad(design: VesselDesign = twoStage()) {
	const sim = await newSim();
	const r = sim.dispatch({ type: 'load-vessel', design });
	if (!r.ok) throw new Error(r.reason);
	return { sim, id: r.vessel! };
}

function run(sim: { step(dt: number): void }, seconds: number): void {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) sim.step(0.02);
}

describe('commands are validated at the boundary', () => {
	test('malformed commands are refused with a reason, never thrown', async () => {
		const { sim, id } = await pad();
		const bad: unknown[] = [
			null,
			'stage',
			{ type: 'explode' },
			{ type: 'throttle', vessel: id, value: 2 },
			{ type: 'throttle', vessel: 'x', value: 1 },
			{ type: 'attitude', vessel: id, pitch: 0, yaw: 5, roll: 0 },
			{ type: 'warp', factor: 0 },
			{ type: 'warp', factor: 1e12 },
			{ type: 'load-vessel', design: { formatVersion: 1 } }
		];
		for (const c of bad) {
			const r = sim.dispatch(c);
			expect(r.ok).toBe(false);
		}
		expect(sim.dispatch({ type: 'warp', factor: 1e12 })).toMatchObject({ ok: false });
	});

	test('semantic refusals: unknown vessel, no control source, no stage left, bad part, bad design', async () => {
		const { sim, id } = await pad();
		const refused = (c: Command) => {
			const r = sim.dispatch(c);
			if (r.ok) throw new Error('expected a refusal');
			return r.reason;
		};
		expect(refused({ type: 'throttle', vessel: 9999 as never, value: 1 })).toContain(
			'unknown vessel'
		);
		expect(
			refused({
				type: 'action',
				vessel: id,
				part: 9999 as never,
				module: 'stock.engine',
				action: 'x'
			})
		).toContain('not part of');

		const part = sim.snapshot().vessels[0]!.parts[6]!.id;
		expect(
			refused({ type: 'action', vessel: id, part, module: 'stock.command', action: 'x' })
		).toContain('no module');
		expect(
			refused({ type: 'action', vessel: id, part, module: 'stock.engine', action: 'nope' })
		).toContain('no action');
		expect(
			refused({
				type: 'action',
				vessel: id,
				part,
				module: 'stock.engine',
				action: 'setThrottle',
				args: ['x']
			})
		).toContain('failed');

		sim.dispatch({ type: 'stage', vessel: id });
		sim.dispatch({ type: 'stage', vessel: id });
		expect(refused({ type: 'stage', vessel: id })).toContain('no stage left');

		const noPod: VesselDesign = {
			formatVersion: 1,
			name: 'tank',
			parts: [{ index: 0, part: partId('stock.tank-small'), parent: null }],
			stages: []
		};
		const lone = sim.dispatch({
			type: 'load-vessel',
			design: noPod,
			placement: { kind: 'state', ...orbitState(sim, 100_000) }
		});
		if (!lone.ok) throw new Error(lone.reason);
		expect(refused({ type: 'throttle', vessel: lone.vessel!, value: 1 })).toContain(
			'no control source'
		);

		const broken: VesselDesign = {
			...noPod,
			parts: [{ index: 0, part: partId('stock.nope'), parent: null }]
		};
		expect(refused({ type: 'load-vessel', design: broken })).toContain('unknown part');
		expect(
			refused({
				type: 'load-vessel',
				design: noPod,
				placement: { kind: 'surface', body: 'stock.other' as never }
			})
		).toContain('unknown body');
	});

	test('actions run a module action and report its failure as a refusal', async () => {
		const { sim, id } = await pad();
		const wheel = sim.snapshot().vessels[0]!.parts[1]!.id;
		expect(
			sim.dispatch({
				type: 'action',
				vessel: id,
				part: wheel,
				module: 'stock.reaction-wheel',
				action: 'setEnabled',
				args: [false]
			}).ok
		).toBe(true);
		expect(sim.snapshot().vessels[0]!.parts[1]!.modules['stock.reaction-wheel']).toEqual({
			enabled: false
		});
	});
});

describe('the pad', () => {
	test('without thrust the vessel stays where it is on the rotating ground (0.5 m in 10 s)', async () => {
		const { sim } = await pad();
		const s0 = sim.snapshot();
		run(sim, 10);
		const s1 = sim.snapshot();
		// Undo the planet's rotation: the pad is fixed in the ground frame.
		const spin = (t: number, p: { x: number; y: number; z: number }) => {
			const a = (2 * Math.PI * t) / 21_600;
			return {
				x: p.x * Math.cos(a) - p.z * Math.sin(a),
				y: p.y,
				z: p.x * Math.sin(a) + p.z * Math.cos(a)
			};
		};
		const drift = length(
			sub(spin(s1.t, s1.vessels[0]!.position), spin(s0.t, s0.vessels[0]!.position))
		);
		expect(drift).toBeLessThan(0.5);
		expect(s1.vessels[0]!.mode).toBe('flight');
		expect(s1.bodies[0]!.rotation.y).toBeGreaterThan(0); // the body turns
	});

	test('with thrust above weight it lifts off and the pad hold lets go for good', async () => {
		const { sim, id } = await pad();
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		sim.dispatch({ type: 'stage', vessel: id });
		run(sim, 5);
		const a5 = altitude(sim.snapshot().vessels[0]!.position);
		expect(a5).toBeGreaterThan(50);
		sim.dispatch({ type: 'throttle', vessel: id, value: 0 });
		run(sim, 5);
		expect(altitude(sim.snapshot().vessels[0]!.position)).toBeGreaterThan(a5); // coasting up, not re-pinned
	});

	test('thrust below weight never lifts it: a throttled engine of a heavy stack stays down', async () => {
		const { sim, id } = await pad();
		sim.dispatch({ type: 'throttle', vessel: id, value: 0.5 }); // TWR about 0.8
		sim.dispatch({ type: 'stage', vessel: id });
		run(sim, 5);
		expect(altitude(sim.snapshot().vessels[0]!.position)).toBeLessThan(8);
	});
});

describe('snapshot frames (ADR 0016)', () => {
	test('part positions are root-relative in BCI axes and part orientations are absolute', async () => {
		const { sim } = await pad();
		const v = sim.snapshot().vessels[0]!;
		expect(v.parts[0]!.position).toEqual({ x: 0, y: 0, z: 0 });
		const up = normalize(v.position);
		const nose = rotate(v.orientation, { x: 0, y: 1, z: 0 });
		expect(dot(nose, up)).toBeGreaterThan(1 - 1e-9);
		// Engine 6.9 m below the pod along the stack axis.
		const engine = v.parts[6]!;
		expect(dot(engine.position, up)).toBeCloseTo(-6.9, 3);
		expect(length(sub(engine.position, scale(up, -6.9)))).toBeLessThan(1e-3);
		expect(engine.orientation).toEqual(v.orientation);
		expect(v.parts.map((p) => p.definition)).toContain(partId('stock.decoupler'));
		expect(String(v.soi)).toBe('stock.home');
	});
});

describe('resource flow and staging', () => {
	test('a decoupler is a crossfeed barrier: each engine drains only its own side of the stack', async () => {
		const { sim, id } = await pad();
		const ps = sim.snapshot().vessels[0]!.parts;
		const [upperTank, upperEngine, lowerEngine] = [ps[2]!.id, ps[3]!.id, ps[6]!.id];
		const act = (part: number, module: string, action: string, ...args: unknown[]) =>
			sim.dispatch({ type: 'action', vessel: id, part: part as never, module, action, args });
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });

		// Upper engine alone: it drains its own tank (above it), never the lower one.
		act(upperEngine, 'stock.engine', 'activate');
		run(sim, 3);
		let v = sim.snapshot().vessels[0]!;
		expect(amounts(v, 2)[LF]).toBeLessThan(400);
		expect(amounts(v, 5)[LF]).toBe(400);

		// Empty its tank by hand: with the barrier the engine starves instead of reaching across.
		act(upperTank, 'stock.resource-container', 'withdraw', LF, 1e6);
		const flameouts: unknown[] = [];
		sim.events.on('stock:engine-flameout', (e) => flameouts.push(e));
		run(sim, 2);
		v = sim.snapshot().vessels[0]!;
		expect(v.parts[3]!.modules['stock.engine']).toMatchObject({ flameout: true });
		expect(flameouts).toHaveLength(1);
		expect(amounts(v, 5)[LF]).toBe(400);

		// Lower engine: drains the lower tank only.
		act(lowerEngine, 'stock.engine', 'activate');
		run(sim, 3);
		v = sim.snapshot().vessels[0]!;
		expect(amounts(v, 5)[LF]).toBeLessThan(400);
		expect(amounts(v, 2)[LF]).toBe(0);
	});

	test('mass follows the propellant: the vessel gets lighter as it burns', async () => {
		const { sim, id } = await pad();
		const m0 = vesselMass(sim, sim.snapshot().vessels[0]!);
		expect(m0).toBeCloseTo(12_890, 3); // plus 50 mg of electric charge
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		sim.dispatch({ type: 'stage', vessel: id });
		run(sim, 10);
		const v = sim.snapshot().vessels[0]!;
		const burned = 400 * 5 + 490 * 5 - (amounts(v, 5)[LF]! + amounts(v, 5)['stock.oxidizer']!) * 5;
		expect(burned).toBeCloseTo(73.08 * 10, -1); // about 730 kg at 73.08 kg/s (sea-level Isp changes thrust, not flow)
		expect(vesselMass(sim, v)).toBeCloseTo(m0 - burned, 3);
	});

	test('the physics body masses follow the propellant (setMass reaches the backend)', async () => {
		const real = await rapier()();
		const calls: number[] = [];
		const spy = {
			...real,
			setMass: (h: never, m: number, i?: never) => (calls.push(m), real.setMass(h, m, i))
		};
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: () => spy,
			maxFlightFrames: 1
		});
		const r = sim.dispatch({ type: 'load-vessel', design: twoStage() });
		if (!r.ok) throw new Error(r.reason);
		sim.dispatch({ type: 'throttle', vessel: r.vessel!, value: 1 });
		sim.dispatch({ type: 'stage', vessel: r.vessel! });
		run(sim, 2);
		const v = sim.snapshot().vessels[0]!;
		const tank = partMasses(sim, v)[5]!;
		expect(calls.length).toBeGreaterThan(50);
		// The last mass handed to the backend is the one before the final step's burn (0.04 kg per step at most).
		expect(calls.some((m) => Math.abs(m - tank) < 2)).toBe(true);
		expect(Math.min(...calls)).toBeLessThan(4_700 + 250 - 100);
	});

	test('an engine that runs dry flames out and the event names the part', async () => {
		const { sim, id } = await pad();
		const out: unknown[] = [];
		sim.events.on('stock:engine-flameout', (e) => out.push(e));
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		sim.dispatch({ type: 'stage', vessel: id });
		run(sim, 70);
		const v = sim.snapshot().vessels[0]!;
		expect(v.parts[6]!.modules['stock.engine']).toMatchObject({ ignited: false, flameout: true });
		expect(out).toEqual([{ part: v.parts[6]!.id }]);
	});

	test('firing the decoupler splits the vessel: control side keeps the id, momentum is conserved, impulse as configured', async () => {
		const sim = await newSim();
		const placed = sim.dispatch({
			type: 'load-vessel',
			design: twoStage(),
			placement: { kind: 'state', ...orbitState(sim, 100_000) }
		});
		if (!placed.ok) throw new Error(placed.reason);
		const id = placed.vessel!;
		const created: unknown[] = [];
		sim.events.on('vessel:created', (e) => created.push(e));
		expect(sim.dispatch({ type: 'stage', vessel: id }).ok).toBe(true); // wakes the vessel, lights the lower engine
		const before = sim.snapshot().vessels[0]!;
		expect(before.mode).toBe('flight');
		const mTotal = vesselMass(sim, before);
		expect(sim.dispatch({ type: 'stage', vessel: id }).ok).toBe(true); // decoupler + upper engine
		const after = sim.snapshot();
		expect(after.vessels).toHaveLength(2);
		const [kept, debris] = after.vessels as [typeof before, typeof before];
		expect(kept.id).toBe(id);
		expect(kept.parts).toHaveLength(4);
		expect(debris.parts).toHaveLength(3);
		expect(created).toEqual([{ vessel: debris.id, from: id }]);

		const mKept = vesselMass(sim, kept);
		const mDebris = vesselMass(sim, debris);
		expect(mKept + mDebris).toBeCloseTo(mTotal, 9);
		// Momentum before = after (the impulse is equal and opposite); f32 velocities, so ~1e-4 m/s.
		const p0 = scale(before.velocity, mTotal);
		const p1 = add(scale(kept.velocity, mKept), scale(debris.velocity, mDebris));
		expect(length(sub(p1, p0)) / mTotal).toBeLessThan(1e-3);
		// The halves separate along the stack axis with relative speed J (1/m1 + 1/m2).
		const axis = rotate(before.orientation, { x: 0, y: 1, z: 0 });
		const rel = dot(sub(kept.velocity, debris.velocity), axis);
		expect(rel).toBeCloseTo(2_000 * (1 / mKept + 1 / mDebris), 2);
		// The side with the command pod is controllable; the debris is not.
		expect(sim.dispatch({ type: 'throttle', vessel: debris.id, value: 1 }).ok).toBe(false);
		expect(debris.parts.map((p) => p.definition)).toEqual([
			partId('stock.decoupler'),
			partId('stock.tank-small'),
			partId('stock.engine-lv')
		]);
		expect(partMasses(sim, debris)[0]).toBe(50);
	});
});

describe('flight frames', () => {
	test('a second vessel within range joins the frame; one far away needs a free frame', async () => {
		const sim = await newSim({ maxFlightFrames: 1 });
		const a = sim.dispatch({ type: 'load-vessel', design: probe() });
		const near = sim.dispatch({
			type: 'load-vessel',
			design: probe(),
			placement: { kind: 'surface', longitude: 0.001 }
		});
		const far = sim.dispatch({
			type: 'load-vessel',
			design: probe(),
			placement: { kind: 'surface', longitude: 0.01 }
		});
		expect(a.ok && near.ok).toBe(true);
		expect(far.ok).toBe(false);
		if (!far.ok) expect(far.reason).toContain('no free physics frame');
		expect(sim.snapshot().vessels).toHaveLength(2);
		run(sim, 2);
		expect(sim.snapshot().vessels.every((v) => v.mode === 'flight')).toBe(true);
	});

	test('far vessels on separate frames both stay put', async () => {
		const sim = await newSim({ maxFlightFrames: 2 });
		expect(sim.dispatch({ type: 'load-vessel', design: probe() }).ok).toBe(true);
		expect(
			sim.dispatch({
				type: 'load-vessel',
				design: probe(),
				placement: { kind: 'surface', longitude: 0.5 }
			}).ok
		).toBe(true);
		run(sim, 3);
		for (const v of sim.snapshot().vessels)
			expect(altitude(v.position)).toBeCloseTo(altitude(sim.snapshot().vessels[0]!.position), 0);
	});

	test('maxStepsPerCall bounds the work per step() and keeps the rest of the time', async () => {
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: rapier(),
			maxStepsPerCall: 10
		});
		sim.dispatch({ type: 'load-vessel', design: probe() });
		sim.step(1);
		expect(sim.time).toBeCloseTo(0.2, 9);
		sim.step(0);
		expect(sim.time).toBeCloseTo(0.4, 9);
	});

	test('an uncontrolled vessel that hits the ground hard is destroyed; a controlled one is only stopped', async () => {
		const sim = await newSim();
		const lonePod: VesselDesign = {
			...probe(),
			parts: probe()
				.parts.slice(1, 3)
				.map((p, i) => ({
					...p,
					index: i,
					parent: i === 0 ? null : { index: 0, parentNode: 'bottom', node: 'top' }
				})),
			stages: []
		};
		const surfaceState = (alt: number, vz: number) => ({
			kind: 'state' as const,
			position: { x: 600_000 + alt, y: 0, z: 0 },
			velocity: { x: -150, y: 0, z: vz }
		});
		const dead = sim.dispatch({
			type: 'load-vessel',
			design: lonePod,
			placement: surfaceState(500, -174.5)
		});
		const alive = sim.dispatch({
			type: 'load-vessel',
			design: probe(),
			placement: { ...surfaceState(500, -174.5), position: { x: 600_500, y: 0, z: 30 } }
		});
		if (!dead.ok || !alive.ok) throw new Error('load failed');
		const destroyed: unknown[] = [];
		sim.events.on('vessel:destroyed', (e) => destroyed.push(e));
		run(sim, 15);
		expect(destroyed).toEqual([{ vessel: dead.vessel!, reason: 'crashed into the ground' }]);
		const left = sim.snapshot().vessels;
		expect(left.map((v) => v.id)).toEqual([alive.vessel!]);
		expect(altitude(left[0]!.position)).toBeLessThan(10);
		expect(sim.world.hasEntity(dead.vessel!)).toBe(false);
	});
});

describe('systems', () => {
	test('registered systems run every step in their phase with the step length', async () => {
		const calls: string[] = [];
		const Counter = definePlugin({
			meta: { id: 'counter', version: '1.0.0', api: '^0.1' },
			depends: [Stock],
			setup(ctx) {
				ctx.systems.register(
					defineSystem({
						id: 'counter.before',
						phase: 'pre-physics',
						update: (_w, dt) => void calls.push(`pre ${dt}`)
					})
				);
				ctx.systems.register(
					defineSystem({
						id: 'counter.after',
						phase: 'post-physics',
						update: (_w, dt) => void calls.push(`post ${dt}`)
					})
				);
			}
		});
		const sim = await createSim({ plugins: [Stock, Counter], backendFactory: rapier(4) });
		sim.dispatch({ type: 'load-vessel', design: probe() });
		sim.step(0.02);
		sim.step(0.02);
		expect(calls).toEqual(['pre 0.02', 'post 0.02', 'pre 0.02', 'post 0.02']);
	});

	test('createSim rejects a plugin set without a root body', async () => {
		const Empty = definePlugin({
			meta: { id: 'empty', version: '1.0.0', api: '^0.1' },
			setup() {}
		});
		await expect(createSim({ plugins: [Empty], backendFactory: rapier(4) })).rejects.toThrow(
			'no root body'
		);
	});
});
