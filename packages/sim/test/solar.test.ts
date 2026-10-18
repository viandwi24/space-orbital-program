/**
 * Plan 190: the stock solar panel charges the same in flight and on rails (`background`, ADR 0171).
 * Plan 208 (ADR 0213): the output follows the star's angle, the distance and the shadow of bodies.
 */
import { describe, expect, test } from 'bun:test';
import type { EntityId, Plugin } from '@orbital/core';
import Stock, {
	ElectricCharge,
	HomeBody,
	MoonBody,
	panelFactor,
	solarPanelConfigSchema,
	SunBody
} from '@orbital/mod-stock';
import { defineModule, definePlugin, type Vec3 } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import { tickDayLength } from '../src/tick.ts';
import { orbitState } from './helpers/measure.ts';
import { rapier, stack } from './helpers/vessels.ts';

const DAY = tickDayLength([SunBody, HomeBody, MoonBody]);

const batteryPart = (id: string, modules: Array<[string, unknown]>) => ({
	id,
	title: 'Battery',
	mass: 20,
	shape: { kind: 'cylinder' as const, radius: 0.625, height: 0.2 },
	attach: {
		top: {
			pos: [0, 0.1, 0] as [number, number, number],
			dir: [0, 1, 0] as [number, number, number]
		},
		bottom: {
			pos: [0, -0.1, 0] as [number, number, number],
			dir: [0, -1, 0] as [number, number, number]
		}
	},
	modules: [
		[
			'stock.resource-container',
			{ contents: { [ElectricCharge.id]: { capacity: 1e6, amount: 0 } } }
		],
		...modules
	] as Array<[string, unknown]>
});

/**
 * An empty battery big enough for a day of charge; `fix.battery-awake` also turns the vessel by a
 * negligible torque so it stays in flight (an idle vessel in a stable orbit goes on rails).
 */
const sunLog: Array<{ t: number; direction: Vec3 | null; flux: number }> = [];

const battery: Plugin = definePlugin({
	meta: { id: 'fix', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(ctx) {
		ctx.modules.register(
			defineModule({
				id: 'fix.awake',
				update(c) {
					c.vessel.applyTorque({ x: 1e-9, y: 0, z: 0 });
				}
			})
		);
		// records what a panel would see each step: the star's direction (part frame) and the flux
		ctx.modules.register(
			defineModule({
				id: 'fix.sun-log',
				update(c) {
					let direction: Vec3 | null = null;
					const flux = c.vessel.sunExposure(0, (d) => ((direction = d), 1));
					sunLog.push({ t: c.vessel.time, direction, flux });
				}
			})
		);
		ctx.parts.register(batteryPart('fix.battery', []));
		ctx.parts.register(batteryPart('fix.sun-meter', [['fix.sun-log', undefined]]));
		ctx.parts.register(batteryPart('fix.battery-awake', [['fix.awake', undefined]]));
	}
});

async function probe(warp: number): Promise<{ sim: Sim; id: EntityId; start: number }> {
	const sim = await createSim({ plugins: [Stock, battery], backendFactory: rapier(), seed: 7 });
	const r = sim.dispatch({
		type: 'load-vessel',
		design: stack(
			'Solar probe',
			[
				'stock.probe-core',
				'stock.solar-array-large',
				warp > 1 ? 'fix.battery' : 'fix.battery-awake'
			],
			[]
		),
		placement: { kind: 'state', ...orbitState(sim, 100_000) }
	});
	if (!r.ok) throw new Error(r.reason);
	const id = r.vessel!;
	const panel = sim
		.snapshot()
		.vessels[0]!.parts.find((p) => p.definition === 'stock.solar-array-large')!;
	const deployed = sim.dispatch({
		type: 'action',
		vessel: id,
		part: panel.id,
		module: 'stock.solar-panel',
		action: 'setDeployed',
		args: [true]
	});
	expect(deployed.ok ? '' : deployed.reason).toBe('');
	if (warp > 1) {
		// idle in a stable orbit, it goes on rails after RAILS_IDLE_TIME
		for (let g = 0; g < 600 && sim.snapshot().vessels[0]!.mode === 'flight'; g++) sim.step(1 / 60);
		const w = sim.dispatch({ type: 'warp', factor: warp });
		expect(w.ok ? '' : w.reason).toBe('');
		sim.step(0);
	}
	return { sim, id, start: sim.time };
}

const chargeOf = (sim: Sim): number => {
	let sum = 0;
	for (const part of sim.snapshot().vessels[0]!.parts) {
		const c = part.modules['stock.resource-container'] as
			{ amounts?: Record<string, number> } | undefined;
		sum += c?.amounts?.[ElectricCharge.id] ?? 0;
	}
	return sum;
};

describe('the stock solar panel (plan 190)', () => {
	test('over one game day a vessel on rails and one in flight charge the same within 1 %', async () => {
		const rails = await probe(1e4);
		expect(rails.sim.snapshot().vessels[0]!.mode).toBe('on-rails');
		const flight = await probe(1);
		expect(flight.sim.snapshot().vessels[0]!.mode).toBe('flight');
		const base = { rails: chargeOf(rails.sim), flight: chargeOf(flight.sim) };

		for (let g = 0; g < 1e6 && rails.sim.time < rails.start + DAY; g++)
			rails.sim.step(Math.min(1, (rails.start + DAY - rails.sim.time) / 1e4));
		rails.sim.save(); // brings `background` up to now
		const t0 = performance.now();
		for (let g = 0; g < 1e7 && flight.sim.time < flight.start + DAY; g++) flight.sim.step(1);
		console.log(`solar: a day in flight took ${((performance.now() - t0) / 1000).toFixed(1)} s`);
		expect(flight.sim.snapshot().vessels[0]!.mode).toBe('flight');

		const onRails = chargeOf(rails.sim) - base.rails;
		const inFlight = chargeOf(flight.sim) - base.flight;
		console.log(`solar: rails ${onRails.toFixed(1)} EC, flight ${inFlight.toFixed(1)} EC`);
		// the array sees the star part of the time: lit, but less than a day at full rating
		expect(onRails).toBeGreaterThan(0.2 * 8.25 * DAY);
		expect(onRails).toBeLessThan(8.25 * DAY);
		expect(Math.abs(onRails - inFlight) / onRails).toBeLessThan(0.01);
		rails.sim.dispose();
		flight.sim.dispose();
	}, 600_000);
});

describe('sunlight on a panel (plan 208, ADR 0213)', () => {
	test('facing the star gives the rating at the home distance, about half at 60 degrees, zero behind the home body', async () => {
		sunLog.length = 0;
		const sim = await createSim({ plugins: [Stock, battery], backendFactory: rapier(), seed: 7 });
		const r = sim.dispatch({
			type: 'load-vessel',
			design: stack(
				'Sun meter',
				['stock.probe-core', 'stock.solar-array-large', 'fix.sun-meter', 'fix.battery-awake'],
				[]
			),
			placement: { kind: 'state', ...orbitState(sim, 100_000) }
		});
		if (!r.ok) throw new Error(r.reason);
		// an action wakes the vessel into flight, where `update` runs every step
		const array = sim
			.snapshot()
			.vessels[0]!.parts.find((p) => p.definition === 'stock.solar-array-large')!;
		sim.dispatch({
			type: 'action',
			vessel: r.vessel!,
			part: array.id,
			module: 'stock.solar-panel',
			action: 'setDeployed',
			args: [true]
		});
		// a little over one orbit of about 2 000 s
		for (let g = 0; g < 2_400; g++) sim.step(1);
		const lit = sunLog.filter((s) => s.flux > 0);
		const dark = sunLog.filter((s) => s.flux === 0);
		expect(lit.length).toBeGreaterThan(0);
		expect(dark.length).toBeGreaterThan(0);
		// in low orbit the distance to the star is the home planet's, within 1e-3
		for (const s of lit) expect(Math.abs(s.flux - 1)).toBeLessThan(1e-3);
		const d = lit[0]!.direction!;
		const config = (normal: [number, number, number]) =>
			solarPanelConfigSchema.parse({ rate: 1, mode: 'flat', normal });
		expect(panelFactor(config([d.x, d.y, d.z]), d)).toBeCloseTo(1, 9);
		// a normal 60 degrees from the star: any unit vector u perpendicular to d
		const u = Math.abs(d.y) < 0.9 ? { x: d.z, y: 0, z: -d.x } : { x: 0, y: -d.z, z: d.y };
		const ul = Math.hypot(u.x, u.y, u.z);
		const c = Math.cos(Math.PI / 3);
		const sn = Math.sin(Math.PI / 3);
		const n: [number, number, number] = [
			c * d.x + (sn * u.x) / ul,
			c * d.y + (sn * u.y) / ul,
			c * d.z + (sn * u.z) / ul
		];
		expect(panelFactor(config(n), d)).toBeCloseTo(0.5, 9);
		// in the dark the home body is between the vessel and the star
		const v = sim.snapshot().vessels[0]!;
		expect(String(v.soi)).toBe('stock.home');
		sim.dispose();
	}, 120_000);
});
