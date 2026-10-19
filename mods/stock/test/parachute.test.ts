/** Parachutes (plan 209, ADR 0203 point 4): arming, the two deploy stages, safety and tearing. */
import { describe, expect, test } from 'bun:test';
import { SEA_LEVEL_PRESSURE, z } from '@orbital/sdk';
import {
	ModuleParachute,
	PartDrogueChute,
	PartParachute,
	parachuteConfigSchema,
	parachuteSafety,
	type ParachuteState
} from '../src/index.ts';
import { contextFor, fakeVessel, type FakeVessel } from './helpers.ts';

const schema = parachuteConfigSchema;
const configOf = (part: typeof PartParachute) =>
	part.modules!.find(([m]) => m === ModuleParachute.id)![1] as z.input<typeof schema>;

/** A main chute falling straight down (part +Y up) at `speed` through air at `atm` and `height`. */
function chute(part = PartParachute) {
	const vessel = fakeVessel();
	const ctx = contextFor(ModuleParachute, configOf(part), vessel);
	const events: string[] = [];
	ctx.events.on('stock:parachute-deployed', (e) => events.push(e.stage));
	ctx.events.on('stock:parachute-torn', () => events.push('torn'));
	const air = (atm: number, height: number, speed: number): void => {
		const v = vessel as FakeVessel;
		v.ambient = {
			pressure: atm * SEA_LEVEL_PRESSURE,
			density: 1.225 * atm,
			altitude: height,
			height
		};
		v.air = { x: 0, y: -speed, z: 0 };
	};
	const step = (seconds: number): void => {
		for (let t = 0; t < seconds - 1e-9; t += 0.02) ModuleParachute.update!(ctx, 0.02);
	};
	return { ctx, vessel, events, air, step, state: () => ctx.state as ParachuteState };
}

describe('parachute states (plan 209)', () => {
	test('an armed chute stays stowed above its min pressure, semi-deploys at 0.04 atm, full at 1000 m', () => {
		const c = chute();
		ModuleParachute.onStage!(c.ctx);
		expect(c.state().status).toBe('armed');
		c.air(0.03, 20_000, 150);
		c.step(1);
		expect(c.state().status).toBe('armed');
		expect(c.vessel.forces).toHaveLength(0);
		c.air(0.04, 18_000, 150);
		c.step(0.02);
		expect(c.state().status).toBe('semi');
		c.step(2);
		expect(c.state().opening).toBe(1);
		expect(c.vessel.forces.at(-1)!.force.y).toBeGreaterThan(0); // drag up, against the fall
		// semi all the way down to the full-deploy height
		c.air(0.8, 1_001, 60);
		c.step(1);
		expect(c.state().status).toBe('semi');
		c.air(0.85, 1_000, 60);
		c.step(0.02);
		expect(c.state().status).toBe('full');
		expect(c.events).toEqual(['semi', 'full']);
	});

	test('"when safe" at 400 m/s waits; forced at 400 m/s it tears', () => {
		const waiting = chute();
		ModuleParachute.onStage!(waiting.ctx);
		waiting.air(0.3, 8_000, 400);
		waiting.step(2);
		expect(waiting.state().status).toBe('armed');
		expect(waiting.state().safety).toBe('unsafe');
		// slowed to a safe speed, it opens
		waiting.air(0.3, 8_000, 200);
		waiting.step(0.04);
		expect(waiting.state().status).toBe('semi');

		const forced = chute();
		forced.air(0.3, 8_000, 400);
		ModuleParachute.actions!.forceDeploy!(forced.ctx);
		forced.step(0.1);
		expect(forced.state().status).toBe('torn');
		expect(forced.events).toEqual(['semi', 'torn']);
	});

	test('safety classes come from speed and dynamic pressure, a drogue takes twice the speed', () => {
		const main = schema.parse(configOf(PartParachute));
		const drogue = schema.parse(configOf(PartDrogueChute));
		expect(parachuteSafety(main, 200, 0.5)).toBe('safe');
		expect(parachuteSafety(main, 260, 0.1)).toBe('risky');
		expect(parachuteSafety(main, 400, 0.1)).toBe('unsafe');
		// slow but in thick air: dynamic pressure decides (½ · 1.225 · 300² ≈ 55 kPa, 380² at 0.6 ≈ 87)
		expect(parachuteSafety(main, 300, 1.225)).toBe('risky');
		expect(parachuteSafety(main, 320, 1.8)).toBe('unsafe');
		expect(parachuteSafety(drogue, 400, 0.3)).toBe('safe');
		expect(drogue.minPressure).toBe(0.02);
		expect(drogue.deployHeight).toBe(2_500);
	});

	test('Disarm and Cut, and the panel controls say why they are off', () => {
		const c = chute();
		ModuleParachute.actions!.deploy!(c.ctx);
		expect(c.state().status).toBe('armed');
		ModuleParachute.actions!.disarm!(c.ctx);
		expect(c.state().status).toBe('stowed');
		ModuleParachute.actions!.deploy!(c.ctx);
		c.air(0.5, 3_000, 80);
		c.step(1.5);
		expect(c.state().status).toBe('semi');
		ModuleParachute.actions!.cut!(c.ctx);
		expect(c.state().status).toBe('cut');
		const n = c.vessel.forces.length;
		c.step(1);
		expect(c.vessel.forces).toHaveLength(n); // no canopy, no drag
		const info = ModuleParachute.describe!(
			c.ctx.config,
			ModuleParachute.snapshot!(c.ctx.state) as ParachuteState
		);
		const byId = new Map(info.actions!.map((a) => [a.id, a]));
		expect(byId.get('cut')!.enabled).toBe(false);
		expect(byId.get('deploy')!.reason).toBe('The parachute is Cut');
		expect(info.readouts).toContainEqual({ id: 'status', label: 'Parachute', value: 'Cut' });
	});
});
