/**
 * Plan 041 / ADR 0071: an asparagus-style rocket (four boosters that feed the core through fuel
 * lines, struts from each booster to the core tank) reaches orbit through dispatch and snapshot
 * only, and the core tank is still full when the boosters are dropped. The same rocket without
 * lines has burnt most of it.
 */
import { expect, test } from 'bun:test';
import type { EntityId, VesselDesign } from '@orbital/core';
import { createAscent, defaultAscent } from './helpers/ascent.ts';
import { saturnAsparagus } from './helpers/structure.ts';
import { newTestSim } from './helpers/test-mod.ts';

const RADIUS = 600_000;
const LF = 'stock.liquid-fuel';

async function ascend(design: VesselDesign, tankIndex: number, limit = 1_500) {
	const sim = await newTestSim();
	const loaded = sim.dispatch({ type: 'load-vessel', design });
	if (!loaded.ok) throw new Error(loaded.reason);
	const vessel = loaded.vessel as EntityId;
	const order = design.parts.map((p) => p.index).sort((a, b) => a - b);
	const fuelIn = (index: number): number => {
		const v = sim.snapshot().vessels.find((x) => x.id === vessel)!;
		const part = v.parts[order.indexOf(index)]!;
		return (part.modules['stock.resource-container'] as { amounts: Record<string, number> })
			.amounts[LF]!;
	};
	const ascent = createAscent(sim, vessel, {
		...defaultAscent,
		// The radial decouplers are fired here, when every booster is dry; the cut fires the next stage.
		stageCount: 0,
		jettisonAtCut: true,
		apoapsis: 200_000,
		turnStart: 100,
		turnEnd: 12_000,
		turnPitch: 1.1
	});
	let droppedAt: number | undefined;
	let coreFuelAtDrop = NaN;
	while (sim.time < limit && ascent.phase !== 'done') {
		sim.step(0.02);
		ascent.update();
		const v = sim.snapshot().vessels.find((x) => x.id === vessel);
		if (!v) break;
		if (droppedAt === undefined && ascent.phase === 'ascent') {
			const boosters = design.parts
				.filter((p) => p.part === 'stock.booster-liquid')
				.map((p) => p.index);
			const dry = boosters.every(
				(i) =>
					(v.parts[order.indexOf(i)]!.modules['stock.engine'] as { flameout: boolean }).flameout
			);
			if (dry) {
				coreFuelAtDrop = fuelIn(tankIndex);
				droppedAt = sim.time;
				const r = sim.dispatch({ type: 'stage', vessel });
				if (!r.ok) throw new Error(r.reason);
			}
		}
	}
	return { sim, ascent, vessel, droppedAt, coreFuelAtDrop };
}

function periapsisOf(r: Awaited<ReturnType<typeof ascend>>): { periapsis: number; e: number } {
	for (let i = 0; i < 200; i++) r.sim.step(0.02);
	const orbit = r.sim.snapshot().vessels.find((x) => x.id === r.vessel)!.orbit!;
	return { periapsis: orbit.a * (1 - orbit.e) - RADIUS, e: orbit.e };
}

test('the asparagus rocket reaches orbit with its core tank full at booster separation', async () => {
	const design = saturnAsparagus(1);
	const lowerTank = 5;
	const r = await ascend(design, lowerTank);
	console.log(r.ascent.log.map((l) => `${l.t.toFixed(1)}s ${l.note}`).join('\n'));
	console.log(
		`boosters dry and dropped at ${r.droppedAt?.toFixed(1)} s, core tank ${r.coreFuelAtDrop.toFixed(1)} u`
	);
	expect(r.ascent.phase).toBe('done');
	const { periapsis, e } = periapsisOf(r);
	console.log(`asparagus: periapsis ${(periapsis / 1000).toFixed(1)} km, e ${e.toFixed(4)}`);
	expect(periapsis).toBeGreaterThan(70_000);
	expect(e).toBeLessThan(0.1);
	// The lines let the core engine eat the boosters first: its own tank is untouched (400 u).
	expect(r.coreFuelAtDrop).toBeGreaterThan(399);
	r.sim.dispose();
}, 90_000);

test('without the lines the core burns its own fuel meanwhile', async () => {
	const design = saturnAsparagus(1, { lines: false });
	const r = await ascend(design, 5);
	expect(r.droppedAt).toBeDefined();
	// Core engine at 6.6 u/s for the 44 s the boosters last.
	expect(r.coreFuelAtDrop).toBeLessThan(150);
	r.sim.dispose();
}, 90_000);
