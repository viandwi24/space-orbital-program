/** Fairings (plan 219, ADR 0224): staging throws the shell off as two panels; momentum is conserved. */
import { describe, expect, test } from 'bun:test';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { fairingStack, shellMass } from './helpers/fairing.ts';
import { orbitState, vesselMass } from './helpers/measure.ts';
import { rapier } from './helpers/vessels.ts';

describe('fairing jettison (plan 219)', () => {
	test('staging the fairing makes two debris vessels; total momentum is conserved to 1e-6', async () => {
		const run = async (stage: boolean) => {
			const sim = await createSim({ plugins: [Stock], backendFactory: rapier(), seed: 1 });
			const s = orbitState(sim, 300_000);
			const loaded = sim.dispatch({
				type: 'load-vessel',
				design: fairingStack(),
				placement: { kind: 'state', ...s, orientation: { x: 0, y: 0, z: 0, w: 1 } }
			});
			if (!loaded.ok) throw new Error(loaded.reason);
			const id = loaded.vessel!;
			// both runs in flight (a stage wakes a vessel on rails; a throttle command does too)
			expect(sim.dispatch({ type: 'throttle', vessel: id, value: 0 })).toMatchObject({ ok: true });
			const created: number[] = [];
			sim.events.on('vessel:created', (e) => void created.push(Number(e.vessel)));
			if (stage) expect(sim.dispatch({ type: 'stage', vessel: id })).toMatchObject({ ok: true });
			sim.step(0.02);
			const snap = sim.snapshot();
			const parent = snap.vessels.find((v) => v.id === id)!;
			const panels = snap.vessels.filter((v) => v.id !== id);
			const out = { parent, panels, created, sim };
			return out;
		};
		const still = await run(false);
		const thrown = await run(true);
		expect(thrown.panels).toHaveLength(2);
		expect(thrown.created).toHaveLength(2);
		for (const p of thrown.panels) {
			expect(p.parts.map((x) => String(x.definition))).toEqual(['stock.fairing-panel']);
			expect(p.mode).toBe('flight');
		}
		// the panels carry the shell's mass, half each (the parent's dry parts are unchanged)
		const half = shellMass() / 2;
		expect(
			Math.abs(vesselMass(still.sim, still.parent) - vesselMass(thrown.sim, thrown.parent))
		).toBeLessThan(1e-6);
		// momentum in the parent's frame: the panels' pushes cancel, the parent got none
		const v0 = thrown.parent.velocity;
		let px = 0;
		let py = 0;
		let pz = 0;
		for (const p of thrown.panels) {
			px += half * (p.velocity.x - v0.x);
			py += half * (p.velocity.y - v0.y);
			pz += half * (p.velocity.z - v0.z);
		}
		const push =
			half *
			Math.hypot(
				thrown.panels[0]!.velocity.x - v0.x,
				thrown.panels[0]!.velocity.y - v0.y,
				thrown.panels[0]!.velocity.z - v0.z
			);
		expect(push).toBeGreaterThan(100); // each panel left with its 300 N·s
		expect(Math.hypot(px, py, pz) / push).toBeLessThan(1e-6);
		// total momentum (planet frame) against the same step without the jettison, relative
		const massOf = (sim: typeof still.sim, v: typeof still.parent, extra: number) =>
			vesselMass(sim, v) + extra;
		const pBefore = {
			x: massOf(still.sim, still.parent, 2 * half) * still.parent.velocity.x,
			y: massOf(still.sim, still.parent, 2 * half) * still.parent.velocity.y,
			z: massOf(still.sim, still.parent, 2 * half) * still.parent.velocity.z
		};
		const pAfter = { ...{ x: 0, y: 0, z: 0 } };
		const m = massOf(thrown.sim, thrown.parent, 0);
		pAfter.x = m * thrown.parent.velocity.x;
		pAfter.y = m * thrown.parent.velocity.y;
		pAfter.z = m * thrown.parent.velocity.z;
		for (const p of thrown.panels) {
			pAfter.x += half * p.velocity.x;
			pAfter.y += half * p.velocity.y;
			pAfter.z += half * p.velocity.z;
		}
		const err = Math.hypot(pAfter.x - pBefore.x, pAfter.y - pBefore.y, pAfter.z - pBefore.z);
		expect(err / Math.hypot(pBefore.x, pBefore.y, pBefore.z)).toBeLessThan(1e-6);
		still.sim.dispose();
		thrown.sim.dispose();
	}, 60_000);
});
