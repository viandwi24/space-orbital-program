/**
 * Plan 011 benchmark: a tall stock stack in flight through the whole sim (Rapier, 16 solver
 * iterations). Reports wall time per flight step and the largest deviation of any part from its
 * design offset (joint drift) while the engine burns and the reaction wheel swings the stack.
 *
 * Run: bun packages/sim/bench/stack.ts [20 50 100]
 */
import { partId, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { add, length, sub } from '@orbital/kepler';
import { createSim } from '../src/index.ts';

const RADIUS = 600_000;

/** Pod, wheel, (n - 3) small tanks, engine: n parts. */
function tower(n: number): VesselDesign {
	const parts = ['stock.command-pod', 'stock.reaction-wheel'];
	while (parts.length < n - 1) parts.push('stock.tank-small');
	parts.push('stock.engine-lv');
	return {
		formatVersion: 1,
		name: `Tower ${n}`,
		parts: parts.map((part, index) => ({
			index,
			part: partId(part),
			parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
		})),
		stages: [[n - 1]]
	};
}

const heights: Record<string, number> = {
	'stock.command-pod': 1,
	'stock.reaction-wheel': 0.4,
	'stock.tank-small': 2,
	'stock.engine-lv': 1.2
};

async function run(n: number, steps: number): Promise<void> {
	const sim = await createSim({
		plugins: [Stock],
		backendFactory: () => createRapierBackend({ solverIterations: 16 }),
		seed: 1,
		maxFlightFrames: 1
	});
	const design = tower(n);
	// Free fall from 60 km with the engine lit and a pitch command: axial and bending load.
	const loaded = sim.dispatch({
		type: 'load-vessel',
		design,
		placement: {
			kind: 'state',
			position: { x: RADIUS + 60_000, y: 0, z: 0 },
			velocity: { x: 0, y: 0, z: -300 }
		}
	});
	if (!loaded.ok) throw new Error(loaded.reason);
	const id = loaded.vessel!;
	sim.dispatch({ type: 'stage', vessel: id });
	sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
	// Distance of each part from the root along the stack in the design.
	const offsets: number[] = [0];
	for (let i = 1; i < n; i++) {
		const a = heights[design.parts[i - 1]!.part]!;
		const b = heights[design.parts[i]!.part]!;
		offsets.push(offsets[i - 1]! + (a + b) / 2);
	}
	let drift = 0;
	let wall = 0;
	for (let i = 0; i < steps; i++) {
		sim.dispatch({ type: 'attitude', vessel: id, pitch: Math.sin(i * 0.02 * 2) > 0 ? 1 : -1, yaw: 0, roll: 0 });
		const t0 = performance.now();
		sim.step(0.02);
		wall += performance.now() - t0;
		if (i % 10 === 0) {
			const v = sim.snapshot().vessels[0]!;
			const root = v.parts[0]!.position;
			v.parts.forEach((p, k) => {
				drift = Math.max(drift, Math.abs(length(sub(p.position, root)) - offsets[k]!));
			});
		}
	}
	const v = sim.snapshot().vessels[0]!;
	console.log(
		`${n} parts: ${((wall / steps) * 1000).toFixed(1)} us/step, max length drift ${drift.toFixed(4)} m, mode ${v.mode}, parts ${v.parts.length}, speed ${length(add(v.velocity, { x: 0, y: 0, z: 0 })).toFixed(1)} m/s`
	);
	sim.dispose();
}

const sizes = process.argv.slice(2).map(Number);
for (const n of sizes.length > 0 ? sizes : [20, 50, 100]) await run(n, 500);
