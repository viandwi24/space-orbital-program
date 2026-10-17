/** Plan 041 tool, not a test: writes a game save of the editor's glider in a glide at 8 km, for the browser run. `bun glider-save.tool.ts <file>` */
import { writeFileSync } from 'node:fs';
import { createBodyTerrainField, loadPlugins, type EntityId } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { wingCoefficients, wingConfigSchema } from '@orbital/mod-stock';
import { glider } from '../../../apps/web/src/lib/editor/examples.ts';
import { buildGameSave } from '../../../apps/web/src/lib/save/game-save.ts';
import { createSim } from '../src/index.ts';
import { qFromBasis } from '../src/math.ts';
import { VESSEL } from '../src/state.ts';
import { vesselMass } from './helpers/measure.ts';
import { rapier } from './helpers/vessels.ts';

const out = process.argv[2]!;
const { registries } = loadPlugins([Stock]);
const design = glider({ parts: registries.parts, modules: registries.modules });
const sim = await createSim({
	plugins: [Stock],
	backendFactory: rapier(16),
	seed: 1,
	terrain: createBodyTerrainField
});
const alt = 8_000;
const omega = (2 * Math.PI) / 21_600;
const R = 600_000;
const g = 3.5316e12 / (R + alt) ** 2;
const cl = wingCoefficients(wingConfigSchema.parse({ area: 3, aspectRatio: 6 }), 0.15).cl;
const probe = await createSim({ plugins: [Stock], backendFactory: rapier(16), seed: 1 });
const p = probe.dispatch({ type: 'load-vessel', design });
if (!p.ok) throw new Error(p.reason);
const mass = vesselMass(probe, probe.snapshot().vessels[0]!);
probe.dispose();
const rho = 1.225 * Math.exp(-alt / 5_600);
const speed = Math.sqrt((2 * mass * g) / (rho * 6 * cl));
const gamma = Math.atan(1 / 5);
const f = { x: -Math.sin(gamma), y: 0, z: -Math.cos(gamma) };
const x0 = R + alt;
const r = sim.dispatch({
	type: 'load-vessel',
	design,
	placement: {
		kind: 'state',
		position: { x: x0, y: 0, z: 0 },
		velocity: { x: speed * f.x, y: 0, z: speed * f.z - omega * x0 },
		orientation: qFromBasis({ x: 0, y: -1, z: 0 }, f, {
			x: Math.cos(gamma),
			y: 0,
			z: -Math.sin(gamma)
		})
	}
});
if (!r.ok) throw new Error(r.reason);
const id = r.vessel as EntityId;
for (let i = 0; i < 100; i++) sim.step(0.02);
const s = sim.world.get(id, VESSEL)!;
console.log(
	`speed ${speed.toFixed(1)} m/s, mass ${mass.toFixed(0)} kg, alt ${(Math.hypot(s.com.x, s.com.y, s.com.z) - R).toFixed(0)}`
);
const save = buildGameSave({
	id: 'glider',
	name: 'Glider',
	kind: 'manual',
	createdAt: Date.now(),
	sim: sim.save(),
	focus: Number(id),
	design,
	thumbnail: null,
	bodyRadius: R
});
writeFileSync(out, JSON.stringify(save));
