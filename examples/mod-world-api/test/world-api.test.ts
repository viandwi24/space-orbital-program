import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { createWorldQuery, parseModPackage, type EntityId, type PanelInput } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '@orbital/sim';
import { buildMod } from '../../../tools/mod-build/build-mod.ts';
import { orbitState } from '../../../packages/sim/test/helpers/measure.ts';
import { probe, rapier } from '../../../packages/sim/test/helpers/vessels.ts';
import WorldApi, { FleetPanel, FlightLog, TargetNearestKey, type FlightLogValue } from '../src/index.ts';

const make = () => createSim({ plugins: [Stock, WorldApi], backendFactory: rapier(16), seed: 5 });

function inOrbit(sim: Sim, name: string, alt: number): EntityId {
	const r = sim.dispatch({
		type: 'load-vessel',
		design: { ...probe(), name },
		placement: { kind: 'state', ...orbitState(sim, alt), orientation: { x: 0, y: 0, z: 0, w: 1 } }
	});
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return r.vessel;
}
const run = (sim: Sim, seconds: number): void => {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) sim.step(0.02);
};

describe('World API sample (plan 343)', () => {
	test('builds into a package the game can read', async () => {
		const built = await buildMod(join(import.meta.dir, '..'));
		const parsed = await parseModPackage(built.text);
		expect(parsed.ok).toBe(true);
	});

	test('logs a landing with a notice, keeps it in the save, targets the nearest on its key', async () => {
		const sim = await make();
		const a = inOrbit(sim, 'Alpha', 120_000);
		const b = inOrbit(sim, 'Beta', 125_000);
		const notices: string[] = [];
		sim.events.on('mod:notice', (n) => notices.push(n.text));
		run(sim, 0.1);

		// the key: the page sends `mod-key` with the flown vessel
		expect(sim.dispatch({ type: 'mod-key', key: TargetNearestKey.id, vessel: a })).toMatchObject({ ok: true });
		expect(sim.snapshot().vessels.find((v) => v.id === a)?.target).toMatchObject({ kind: 'vessel', id: b });
		expect(notices.at(-1)).toMatch(/^Target: Beta \(5\.0 km\)$/);

		// a landing (here by the debug tools of a sandbox world)
		sim.dispatch({
			type: 'debug-set-location',
			vessel: b,
			location: { kind: 'surface', latitude: 0.2, longitude: 0.1 }
		});
		run(sim, 1);
		const log = sim.snapshot().stores?.[FlightLog.id] as FlightLogValue;
		expect(log.landings).toBe(1);
		expect(log.lines.at(-1)).toMatch(/^Beta (landed|splashed) on home$/);
		expect(notices.at(-1)).toBe(log.lines.at(-1));

		// the panel reads the same world through its input
		const snapshot = sim.snapshot();
		const input = {
			snapshot,
			vessel: snapshot.vessels[0]!,
			altitude: null,
			speed: null,
			time: snapshot.t,
			world: createWorldQuery(snapshot, { bodies: sim.registries.bodies })
		} satisfies PanelInput;
		const view = FleetPanel.view;
		if (view.kind !== 'section') throw new Error('expected a section');
		const fleet = view.children[2]!;
		if (fleet.kind !== 'list') throw new Error('expected a list');
		expect(fleet.items(input).map((r) => r.name).sort()).toEqual(['landed', 'orbiting']);

		// saved with the world
		const resumed = await createSim({
			plugins: [Stock, WorldApi],
			backendFactory: rapier(16),
			resume: JSON.parse(JSON.stringify(sim.save()))
		});
		expect(resumed.snapshot().stores?.[FlightLog.id]).toEqual(log);
		sim.dispose();
		resumed.dispose();
	}, 60_000);
});
