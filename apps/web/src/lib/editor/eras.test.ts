/**
 * The tech tree carries the era (plan 380, ADR 0317): in the stock system a start-of-career rocket
 * needs two stages to reach orbit, while a later-tier rocket does it on one. Flown headlessly on the
 * Guidance Computer's ascent to Home's 80 km orbit: the trip planner's figure is pessimistic (its
 * reference rocket loses more than Guidance does), so only a flight can show a stage falls short.
 */
import { GRAVITATIONAL_CONSTANT, loadPlugins, partId, type VesselDesign } from '@orbital/core';
import Guidance from '@orbital/mod-guidance';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim } from '@orbital/sim';
import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { blueprintDesign } from '../blueprint-registry';

const { registries } = loadPlugins([Stock]);

/** A straight stack, top first, its engine (the last part) firing as the only stage. */
function singleStage(chain: readonly string[]): VesselDesign {
	return {
		formatVersion: 3,
		name: 'Single stage',
		parts: chain.map((part, index) => ({
			index,
			part: partId(part),
			parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
		})),
		stages: [[chain.length - 1]]
	};
}

/** The periapsis altitude Guidance's ascent reaches, m (-Infinity when the vessel is lost). */
async function periapsisAfterAscent(design: VesselDesign): Promise<number> {
	const sim = await createSim({
		plugins: [Stock, Guidance],
		backendFactory: () => createRapierBackend({ solverIterations: 16 }),
		maxFlightFrames: 1
	});
	try {
		const r = sim.dispatch({ type: 'load-vessel', design });
		if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
		const id = r.vessel;
		sim.dispatch({
			type: 'autopilot-engage',
			vessel: id,
			autopilot: 'guidance.ascent',
			params: { altitude: 80_000 }
		});
		let ended = false;
		sim.events.on('autopilot:ended', (e) => {
			if (e.vessel === id) ended = true;
		});
		for (let t = 0; !ended && t < 1_500; t += 0.1) sim.step(0.1);
		const v = sim.snapshot().vessels.find((x) => x.id === id);
		if (!v) return -Infinity;
		const home = sim.registries.bodies.get('stock.home')!;
		const mu = GRAVITATIONAL_CONSTANT * home.mass;
		const p = v.position;
		const w = v.velocity;
		const rr = Math.hypot(p.x, p.y, p.z);
		const a = -mu / (2 * (Math.hypot(w.x, w.y, w.z) ** 2 / 2 - mu / rr));
		const h = Math.hypot(p.y * w.z - p.z * w.y, p.z * w.x - p.x * w.z, p.x * w.y - p.y * w.x);
		return a * (1 - Math.sqrt(Math.max(0, 1 - (h * h) / (mu * a)))) - home.radius;
	} finally {
		sim.dispose();
	}
}

const AIR = 70_000;
const POD = ['stock.command-pod', 'stock.reaction-wheel'];
const report = (line: string): void => {
	console.log(`[eras] ${line}`);
	if (process.env.ORBITAL_FLIGHT_REPORT) appendFileSync(process.env.ORBITAL_FLIGHT_REPORT, `eras | ${line}\n`);
};

describe('eras in the stock system (plan 380)', () => {
	it('no start-of-career single stage reaches orbit (Basics and Structures parts)', async () => {
		const small = (n: number) => Array.from({ length: n }, () => 'stock.tank-small');
		for (const [label, chain] of [
			['1 small tank', [...POD, ...small(1), 'stock.engine-lv']],
			['2 small tanks', [...POD, ...small(2), 'stock.engine-lv']],
			['3 small tanks', [...POD, ...small(3), 'stock.engine-lv']],
			['1 medium tank', [...POD, 'stock.tank-medium', 'stock.engine-lv']]
		] as const) {
			const pe = await periapsisAfterAscent(singleStage(chain));
			report(`early single stage, ${label}: periapsis ${(pe / 1000).toFixed(0)} km`);
			expect(pe, label).toBeLessThan(AIR);
		}
	}, 600_000);

	it('the two-stage starter reaches orbit', async () => {
		const pe = await periapsisAfterAscent(blueprintDesign('stock.two-stage', registries.blueprints.list()));
		report(`two-stage starter: periapsis ${(pe / 1000).toFixed(0)} km`);
		expect(pe).toBeGreaterThan(AIR);
	}, 600_000);

	it('a heavy-lift tier rocket reaches orbit on one stage: the late tech is easier', async () => {
		const pe = await periapsisAfterAscent(
			singleStage([...POD, 'stock.adapter-large', 'stock.tank-wide', 'stock.engine-wide'])
		);
		report(`heavy-lift single stage: periapsis ${(pe / 1000).toFixed(0)} km`);
		expect(pe).toBeGreaterThan(AIR);
	}, 600_000);
});
