/**
 * Plan 011 benchmark at the backend level: a tower of N box parts (500 kg, 1.25 x 1 x 1.25 m)
 * under a heavy load (journal 004: 5 kN lateral + 20 kN axial on the top part, a gravity-like force
 * on every part), 10 s at dt = 0.02, Rapier with 16 solver iterations. Reports the step time and
 * the worst relative-transform error of any attachment (flex) at the end.
 *
 * Run: bun packages/physics/bench/grouping.ts [per-part|compound] [20 50 100]
 */
import type { BodyHandle, Transform, Vec3 } from '@orbital/core';
import { createRapierBackend } from '../src/index.ts';

const HALF = { x: 0.625, y: 0.5, z: 0.625 };
const MASS = 500;
const STEPS = 500;
const DT = 0.02;
/** Steps run before timing starts (JIT warm-up). */
const WARMUP = 100;
const ID = { x: 0, y: 0, z: 0, w: 1 };

/** `point` expressed in the frame of `frame`. */
function inFrame(frame: Transform, point: Vec3): Vec3 {
	const d = {
		x: point.x - frame.position.x,
		y: point.y - frame.position.y,
		z: point.z - frame.position.z
	};
	const q = frame.rotation;
	const u = { x: -q.x, y: -q.y, z: -q.z }; // conjugate
	const t = {
		x: 2 * (u.y * d.z - u.z * d.y),
		y: 2 * (u.z * d.x - u.x * d.z),
		z: 2 * (u.x * d.y - u.y * d.x)
	};
	return {
		x: d.x + q.w * t.x + (u.y * t.z - u.z * t.y),
		y: d.y + q.w * t.y + (u.z * t.x - u.x * t.z),
		z: d.z + q.w * t.z + (u.x * t.y - u.y * t.x)
	};
}

async function perPart(
	n: number
): Promise<{ us: number; bodies: number; joints: number; drift: number }> {
	const backend = await createRapierBackend({ solverIterations: 16 });
	const handles: BodyHandle[] = [];
	for (let i = 0; i < n; i++) {
		handles.push(
			backend.createBody({
				shape: { type: 'box', halfExtents: HALF },
				mass: MASS,
				position: { x: 0, y: i, z: 0 },
				rotation: ID
			})
		);
	}
	for (let i = 1; i < n; i++) {
		backend.createFixedJoint(
			handles[i - 1]!,
			handles[i]!,
			{ position: { x: 0, y: 0.5, z: 0 }, rotation: ID },
			{ position: { x: 0, y: -0.5, z: 0 }, rotation: ID }
		);
	}
	let wall = 0;
	for (let s = 0; s < STEPS; s++) {
		for (const h of handles) backend.applyForce(h, { x: 0, y: -MASS * 9.81, z: 0 });
		backend.applyForce(handles[n - 1]!, { x: 5_000, y: 20_000, z: 0 });
		const t0 = performance.now();
		backend.step(DT);
		if (s >= WARMUP) wall += performance.now() - t0;
	}
	// Flex: where each part sits in the frame of part 0, against its design position (0, i, 0).
	const base = backend.getTransform(handles[0]!);
	let drift = 0;
	for (let i = 1; i < n; i++) {
		const local = inFrame(base, backend.getTransform(handles[i]!).position);
		drift = Math.max(drift, Math.hypot(local.x, local.y - i, local.z));
	}
	backend.dispose();
	return { us: (wall / (STEPS - WARMUP)) * 1000, bodies: n, joints: n - 1, drift };
}

/** The same tower as one compound body: no joints, so no flex by construction. */
async function compound(
	n: number
): Promise<{ us: number; bodies: number; joints: number; drift: number }> {
	const backend = await createRapierBackend({ solverIterations: 16 });
	const shapes = Array.from({ length: n }, (_, i) => ({
		shape: { type: 'box' as const, halfExtents: HALF },
		position: { x: 0, y: i, z: 0 }
	}));
	const mass = MASS * n;
	const com = { x: 0, y: (n - 1) / 2, z: 0 };
	// Uniform boxes: inertia of the stack about its centre (parallel axis theorem per box).
	let ixx = 0;
	for (let i = 0; i < n; i++) {
		const d = i - com.y;
		ixx += (MASS / 12) * (1 + 1.25 * 1.25) + MASS * d * d;
	}
	const h = backend.createBody({
		shape: { type: 'compound', shapes },
		mass,
		inertia: { x: ixx, y: (mass / 12) * 2 * 1.25 * 1.25, z: ixx },
		centerOfMass: com,
		position: { x: 0, y: 0, z: 0 },
		rotation: ID
	});
	let wall = 0;
	for (let s = 0; s < STEPS; s++) {
		const t = backend.getTransform(h);
		const at = (y: number) => ({ x: t.position.x, y: t.position.y + y, z: t.position.z });
		backend.applyForce(h, { x: 0, y: -mass * 9.81, z: 0 });
		backend.applyForce(h, { x: 5_000, y: 20_000, z: 0 }, at(n - 1));
		const t0 = performance.now();
		backend.step(DT);
		if (s >= WARMUP) wall += performance.now() - t0;
	}
	backend.dispose();
	return { us: (wall / (STEPS - WARMUP)) * 1000, bodies: 1, joints: 0, drift: 0 };
}

const mode = process.argv[2] ?? 'per-part';
const sizes = process.argv.slice(3).map(Number);
for (const n of sizes.length > 0 ? sizes : [20, 50, 100]) {
	if (mode !== 'per-part' && mode !== 'compound') throw new Error(`unknown mode ${mode}`);
	const r = mode === 'compound' ? await compound(n) : await perPart(n);
	console.log(
		`${mode} ${n} parts: ${r.us.toFixed(1)} us/step, ${r.bodies} bodies, ${r.joints} joints, flex ${r.drift.toFixed(3)} m`
	);
}
