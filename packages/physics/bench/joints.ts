/**
 * Plan 288 (ADR 0262's gate): can Rapier's motored joints carry robotic parts? Talks to Rapier
 * directly, as the adapter does, and runs six scenarios for each joint kind:
 *
 *   A. hinge lift (revolute, position mode), B. piston (prismatic, position mode),
 *   C. rotor (revolute, velocity mode), D. a 6-joint chain with a kick at its tip,
 *   E. determinism of D (in-process and across processes), F. the step cost of D against one
 *   compound body with the same 7 colliders (today's vessel, ADR 0018).
 *
 * Impulse joints use Rapier's own motors (`configureMotorPosition` / `configureMotorVelocity`,
 * force-based). Rapier 0.21's JS API has no motor and no limit call on multibody joints, so the
 * multibody runs drive the same joints with a PD controller in software: a torque (or force) pair on
 * the two bodies each step. The gains are the same for both kinds.
 *
 * Run: bun packages/physics/bench/joints.ts [multibody|impulse|all]
 * (internal: `--state <kind>` prints scenario D's state hash, for the cross-process check)
 *
 * Diagnostic knobs (environment, not part of the verdict): `DT` and `ITER` (step and solver
 * iterations), `CHAIN_W` (the chain's natural frequency, rad/s, default 12), `MOTOR=accel` (Rapier's
 * acceleration-based motor model for impulse joints), `DIAG=1` (the chain's joint errors).
 */
import RAPIER from '@dimforge/rapier3d-compat';

type Kind = 'multibody' | 'impulse';
type V = { x: number; y: number; z: number };
type Q = { x: number; y: number; z: number; w: number };

const DT = Number(process.env.DT ?? 0.02);
const ITERATIONS = Number(process.env.ITER ?? 16);
const WARMUP = 100;
const G = 9.81;
const DEG = Math.PI / 180;

// ---- small vector and quaternion helpers ---------------------------------------------------------
const v = (x: number, y: number, z: number): V => ({ x, y, z });
const add = (a: V, b: V): V => v(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: V, b: V): V => v(a.x - b.x, a.y - b.y, a.z - b.z);
const scale = (a: V, k: number): V => v(a.x * k, a.y * k, a.z * k);
const dot = (a: V, b: V): number => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: V): number => Math.sqrt(dot(a, a));
const qMul = (a: Q, b: Q): Q => ({
	w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
	x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
	y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
	z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
});
const qConj = (q: Q): Q => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
const qAxis = (axis: V, angle: number): Q => {
	const s = Math.sin(angle / 2);
	return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(angle / 2) };
};
function rotate(q: Q, p: V): V {
	const t = scale(v(q.y * p.z - q.z * p.y, q.z * p.x - q.x * p.z, q.x * p.y - q.y * p.x), 2);
	return add(
		add(p, scale(t, q.w)),
		v(q.y * t.z - q.z * t.y, q.z * t.x - q.x * t.z, q.x * t.y - q.y * t.x)
	);
}

// ---- the world -----------------------------------------------------------------------------------
function newWorld(): RAPIER.World {
	const world = new RAPIER.World(v(0, -G, 0));
	world.integrationParameters.numSolverIterations = ITERATIONS;
	world.timestep = DT;
	return world;
}

/** A box body with its mass and inertia set exactly; its colliders never touch anything. */
function box(world: RAPIER.World, position: V, half: V, mass: number, fixed = false, rotation?: Q) {
	const desc = (fixed ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic())
		.setTranslation(position.x, position.y, position.z)
		.setCanSleep(false);
	if (rotation) desc.setRotation(rotation);
	const body = world.createRigidBody(desc);
	world.createCollider(
		RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z).setDensity(0).setCollisionGroups(0),
		body
	);
	if (!fixed) {
		const i = (a: number, b: number) => (mass / 3) * (a * a + b * b);
		body.setAdditionalMassProperties(
			mass,
			v(0, 0, 0),
			v(i(half.y, half.z), i(half.x, half.z), i(half.x, half.y)),
			{ x: 0, y: 0, z: 0, w: 1 },
			true
		);
	}
	return body;
}

/** PD gains for a natural frequency `w` (rad/s), critically damped, on an inertia (or mass) `m`. */
const gains = (m: number, w: number) => ({ k: m * w * w, c: 2 * m * w, w });

/**
 * One motored joint, either kind. `drive()` runs before each step: the software PD of a multibody
 * joint; nothing for an impulse joint, whose motor Rapier solves.
 */
interface Joint {
	/** Angle (rad) of a revolute joint, displacement (m) of a prismatic one. */
	value(): number;
	rate(): number;
	position(target: number): void;
	velocity(target: number): void;
	drive(): void;
}

function makeJoint(
	world: RAPIER.World,
	kind: Kind,
	type: 'revolute' | 'prismatic',
	b1: RAPIER.RigidBody,
	b2: RAPIER.RigidBody,
	anchor1: V,
	anchor2: V,
	axis: V,
	gain: { k: number; c: number; w?: number }
): Joint {
	const data =
		type === 'revolute'
			? RAPIER.JointData.revolute(anchor1, anchor2, axis)
			: RAPIER.JointData.prismatic(anchor1, anchor2, axis);
	const axisWorld = () => rotate(b1.rotation(), axis);
	const value =
		type === 'revolute'
			? () => {
					const r = qMul(qConj(b1.rotation()), b2.rotation());
					return 2 * Math.atan2(dot(v(r.x, r.y, r.z), axis), r.w);
				}
			: () => {
					const p1 = add(b1.translation(), rotate(b1.rotation(), anchor1));
					const p2 = add(b2.translation(), rotate(b2.rotation(), anchor2));
					return dot(sub(p2, p1), axisWorld());
				};
	const rate =
		type === 'revolute'
			? () => dot(sub(b2.angvel(), b1.angvel()), axisWorld())
			: () => dot(sub(b2.linvel(), b1.linvel()), axisWorld());
	let mode: { kind: 'position' | 'velocity'; target: number } = { kind: 'position', target: 0 };
	if (kind === 'impulse') {
		const joint = world.createImpulseJoint(data, b1, b2, true) as RAPIER.RevoluteImpulseJoint;
		joint.setContactsEnabled(false);
		const accel = process.env.MOTOR === 'accel' && gain.w !== undefined;
		joint.configureMotorModel(
			accel ? RAPIER.MotorModel.AccelerationBased : RAPIER.MotorModel.ForceBased
		);
		const k = accel ? gain.w! * gain.w! : gain.k;
		const c = accel ? 2 * gain.w! : gain.c;
		return {
			value,
			rate,
			position(target) {
				joint.configureMotorPosition(target, k, c);
			},
			velocity(target) {
				joint.configureMotorVelocity(target, c);
			},
			drive() {}
		};
	}
	const joint = world.createMultibodyJoint(data, b1, b2, true);
	joint.setContactsEnabled(false);
	return {
		value,
		rate,
		position(target) {
			mode = { kind: 'position', target };
		},
		velocity(target) {
			mode = { kind: 'velocity', target };
		},
		drive() {
			const u =
				mode.kind === 'position'
					? gain.k * (mode.target - value()) - gain.c * rate()
					: gain.c * (mode.target - rate());
			const a = axisWorld();
			b1.resetForces(true);
			b1.resetTorques(true);
			b2.resetForces(true);
			b2.resetTorques(true);
			if (type === 'revolute') {
				b2.addTorque(scale(a, u), true);
				if (!b1.isFixed()) b1.addTorque(scale(a, -u), true);
			} else {
				b2.addForce(scale(a, u), true);
				if (!b1.isFixed()) b1.addForce(scale(a, -u), true);
			}
		}
	};
}

function step(world: RAPIER.World, joints: readonly Joint[]): void {
	for (const j of joints) j.drive();
	world.step();
}

// ---- A: hinge lift --------------------------------------------------------------------------------
/** A 1 t arm, 2 m long, on a revolute joint about X on a fixed base: 0° (level), then 90° (up). */
function hingeLift(kind: Kind) {
	const world = newWorld();
	const base = box(world, v(0, 0, 0), v(0.5, 0.5, 0.5), 2000, true);
	const arm = box(world, v(0, 0, 1), v(0.1, 0.1, 1), 1000);
	const inertia = (1000 / 3) * (0.1 * 0.1 + 1 * 1) + 1000 * 1; // about the hinge
	const j = makeJoint(
		world,
		kind,
		'revolute',
		base,
		arm,
		v(0, 0, 0),
		v(0, 0, -1),
		v(1, 0, 0),
		gains(inertia, 25)
	);
	const target = -90 * DEG; // about +X a negative angle lifts +Z towards +Y
	j.position(0);
	for (let i = 0; i < WARMUP; i++) step(world, [j]);
	j.position(target);
	let reach: number | null = null;
	let overshoot = 0;
	let hold = 0;
	const steps = 61 / DT;
	for (let i = 0; i < steps; i++) {
		step(world, [j]);
		const err = (j.value() - target) / DEG;
		const t = (i + 1) * DT;
		if (reach === null && Math.abs(err) <= 0.5) reach = t;
		if (Math.sign(err) !== Math.sign(0 - target)) overshoot = Math.max(overshoot, Math.abs(err));
		if (t >= 1) hold = Math.max(hold, Math.abs(err));
	}
	world.free();
	return { reach, overshoot, hold, pass: reach !== null && hold <= 0.5 };
}

// ---- B: piston ------------------------------------------------------------------------------------
/** A prismatic joint along Y carrying 500 kg: 0 m, then 1.5 m. */
function piston(kind: Kind) {
	const world = newWorld();
	const base = box(world, v(0, 0, 0), v(0.5, 0.5, 0.5), 2000, true);
	const load = box(world, v(0, 1, 0), v(0.4, 0.25, 0.4), 500);
	const j = makeJoint(
		world,
		kind,
		'prismatic',
		base,
		load,
		v(0, 0.5, 0),
		v(0, -0.5, 0),
		v(0, 1, 0),
		gains(500, 40)
	);
	j.position(0);
	for (let i = 0; i < WARMUP; i++) step(world, [j]);
	const target = 1.5;
	j.position(target);
	let reach: number | null = null;
	let overshoot = 0;
	let hold = 0;
	for (let i = 0; i < 61 / DT; i++) {
		step(world, [j]);
		const err = j.value() - target;
		const t = (i + 1) * DT;
		if (reach === null && Math.abs(err) <= 0.01) reach = t;
		if (err > 0) overshoot = Math.max(overshoot, err);
		if (t >= 1) hold = Math.max(hold, Math.abs(err));
	}
	world.free();
	return { reach, overshoot, hold, pass: reach !== null && hold <= 0.01 };
}

// ---- C: rotor -------------------------------------------------------------------------------------
/** A 200 kg disc (1 m radius) on a revolute joint about Y in velocity mode: 60 rpm. */
function rotor(kind: Kind) {
	const world = newWorld();
	const base = box(world, v(0, 0, 0), v(0.5, 0.5, 0.5), 2000, true);
	const disc = box(world, v(0, 0.7, 0), v(0.7, 0.1, 0.7), 200);
	const inertia = (200 / 3) * (0.7 * 0.7 + 0.7 * 0.7); // about Y, as `box` sets it
	const j = makeJoint(
		world,
		kind,
		'revolute',
		base,
		disc,
		v(0, 0.5, 0),
		v(0, -0.2, 0),
		v(0, 1, 0),
		gains(inertia, 10)
	);
	const target = 2 * Math.PI; // 60 rpm
	for (let i = 0; i < WARMUP; i++) step(world, [j]);
	j.velocity(target);
	for (let i = 0; i < 5 / DT; i++) step(world, [j]);
	const rpm = (j.rate() * 60) / (2 * Math.PI);
	world.free();
	const error = Math.abs(rpm - 60) / 60;
	return { rpm, error, pass: error <= 0.02 };
}

// ---- D: chain -------------------------------------------------------------------------------------
const LINKS = Number(process.env.CHAIN_LINKS ?? 6);
const LINK_MASS = 100;
const LINK_HALF = v(0.1, 0.5, 0.1);
const CHAIN_AXES = [v(1, 0, 0), v(0, 0, 1)];
const CHAIN_TARGET = 30 * DEG;

/** A fixed base and six 1 m links standing on it, joint i about X or Z by turns. */
function chain(world: RAPIER.World, kind: Kind) {
	const base = box(world, v(0, 0, 0), v(0.5, 0.5, 0.5), 2000, true);
	const bodies = [base];
	const joints: Joint[] = [];
	for (let i = 0; i < LINKS; i++) {
		const link = box(world, v(0, 1 + i, 0), LINK_HALF, LINK_MASS);
		const parent = bodies[bodies.length - 1]!;
		// stiff enough for the base joint, which holds the five links above it
		const g = gains(LINK_MASS * (LINKS - i) ** 2, Number(process.env.CHAIN_W ?? 12));
		const j = makeJoint(
			world,
			kind,
			'revolute',
			parent,
			link,
			i === 0 ? v(0, 0.5, 0) : v(0, 0.5, 0),
			v(0, -0.5, 0),
			CHAIN_AXES[i % 2]!,
			g
		);
		j.position(0);
		joints.push(j);
		bodies.push(link);
	}
	return { bodies, joints };
}

/** Where the tip's far end is when every joint is exactly at the target. */
function chainTargetTip(): V {
	let q: Q = { x: 0, y: 0, z: 0, w: 1 };
	let p = v(0, 0.5, 0); // top of the base
	for (let i = 0; i < LINKS; i++) {
		q = qMul(q, qAxis(CHAIN_AXES[i % 2]!, CHAIN_TARGET));
		p = add(p, rotate(q, v(0, 1, 0)));
	}
	return p;
}

const tipOf = (link: RAPIER.RigidBody): V =>
	add(link.translation(), rotate(link.rotation(), v(0, 0.5, 0)));

/** D: hold 30° on every joint; a 5 kN sideways kick on the tip at 2 s; the tip after 10 s. */
function chainRun(kind: Kind) {
	const world = newWorld();
	const { bodies, joints } = chain(world, kind);
	const tip = bodies[bodies.length - 1]!;
	for (const j of joints) j.position(CHAIN_TARGET);
	for (let i = 0; i < WARMUP; i++) step(world, joints);
	let speedLate = 0;
	let unstable = false;
	const total = 12 / DT;
	for (let i = 0; i < total; i++) {
		const t = i * DT;
		if (Math.abs(t - 2) < DT / 2) tip.addForce(v(5000, 0, 0), true);
		step(world, joints);
		if (Math.abs(t - 2) < DT / 2) tip.resetForces(true);
		const s = len(tip.linvel());
		if (!Number.isFinite(s) || s > 1e3) unstable = true;
		if (t >= 11) speedLate = Math.max(speedLate, s);
	}
	const drift = len(sub(tipOf(tip), chainTargetTip()));
	if (process.env.DIAG)
		console.log(
			'joint errors (deg):',
			joints.map((j) => ((j.value() - CHAIN_TARGET) / DEG).toFixed(3)).join(' ')
		);
	world.free();
	const settled = !unstable && speedLate < 1e-3;
	return { drift, speedLate, settled, pass: settled && drift < 0.01 };
}

// ---- E: determinism -------------------------------------------------------------------------------
/** Scenario D for 500 steps; every body's position, rotation and velocities as float32 bits. */
function chainState(kind: Kind): string {
	const world = newWorld();
	const { bodies, joints } = chain(world, kind);
	for (const j of joints) j.position(CHAIN_TARGET);
	for (let i = 0; i < 500; i++) {
		if (i === 100) bodies[bodies.length - 1]!.addForce(v(5000, 0, 0), true);
		step(world, joints);
		if (i === 100) bodies[bodies.length - 1]!.resetForces(true);
	}
	const values: number[] = [];
	for (const b of bodies) {
		const t = b.translation();
		const r = b.rotation();
		const l = b.linvel();
		const a = b.angvel();
		values.push(t.x, t.y, t.z, r.x, r.y, r.z, r.w, l.x, l.y, l.z, a.x, a.y, a.z);
	}
	world.free();
	const bits = new Uint32Array(new Float32Array(values).buffer);
	let h = 0x811c9dc5;
	for (const w of bits) h = Math.imul(h ^ w, 0x01000193) >>> 0;
	return `${h.toString(16).padStart(8, '0')}:${bits.length}`;
}

function determinism(kind: Kind) {
	const a = chainState(kind);
	const b = chainState(kind);
	const child = Bun.spawnSync([process.execPath, import.meta.path, '--state', kind]);
	const other = new TextDecoder().decode(child.stdout).trim();
	return { inProcess: a === b, crossProcess: a === other, hash: a, other };
}

// ---- F: cost --------------------------------------------------------------------------------------
/** µs per step of D, and of one body carrying the same 7 colliders (the vessel of ADR 0018). */
function cost(kind: Kind) {
	const time = (world: RAPIER.World, joints: readonly Joint[]) => {
		for (let i = 0; i < WARMUP; i++) step(world, joints);
		const steps = 500;
		const t0 = performance.now();
		for (let i = 0; i < steps; i++) step(world, joints);
		return ((performance.now() - t0) * 1000) / steps;
	};
	const jw = newWorld();
	const { joints } = chain(jw, kind);
	for (const j of joints) j.position(CHAIN_TARGET);
	const jointed = time(jw, joints);
	jw.free();
	const cw = newWorld();
	const body = cw.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setCanSleep(false));
	cw.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setCollisionGroups(0), body);
	for (let i = 0; i < LINKS; i++) {
		cw.createCollider(
			RAPIER.ColliderDesc.cuboid(LINK_HALF.x, LINK_HALF.y, LINK_HALF.z)
				.setTranslation(0, 1 + i, 0)
				.setCollisionGroups(0),
			body
		);
	}
	const compound = time(cw, []);
	cw.free();
	return { jointed, compound, ratio: jointed / compound, pass: jointed <= 3 * compound };
}

// ---- the table ------------------------------------------------------------------------------------
const f = (x: number | null, d = 2) => (x === null ? 'never' : x.toFixed(d));

function run(kind: Kind): boolean {
	const a = hingeLift(kind);
	const b = piston(kind);
	const c = rotor(kind);
	const d = chainRun(kind);
	const e = determinism(kind);
	const fc = cost(kind);
	const ok = (p: boolean) => (p ? 'pass' : 'FAIL');
	console.log(`\n${kind} joints (dt ${DT} s, ${ITERATIONS} solver iterations)`);
	console.log(
		'scenario       | measure                                         | rule        | result'
	);
	console.log(
		`A hinge lift   | 90° in ${f(a.reach)} s, overshoot ${f(a.overshoot)}°, hold err ${f(a.hold, 3)}° (60 s) | ≤ 0.5°      | ${ok(a.pass)}`
	);
	console.log(
		`B piston       | 1.5 m in ${f(b.reach)} s, overshoot ${f(b.overshoot * 100)} cm, hold err ${f(b.hold * 100, 2)} cm | ≤ 1 cm      | ${ok(b.pass)}`
	);
	console.log(
		`C rotor        | ${f(c.rpm)} rpm after 5 s (error ${f(c.error * 100)} %)              | ≤ 2 %       | ${ok(c.pass)}`
	);
	console.log(
		`D chain        | tip drift ${f(d.drift * 100)} cm after 10 s, late speed ${f(d.speedLate * 1000, 2)} mm/s, settled ${d.settled} | < 1 cm      | ${ok(d.pass)}`
	);
	console.log(
		`E determinism  | in-process ${e.inProcess}, cross-process ${e.crossProcess} (${e.hash} / ${e.other}) | bit-equal   | ${ok(e.inProcess && e.crossProcess)}`
	);
	console.log(
		`F cost         | chain ${f(fc.jointed, 1)} µs/step, compound ${f(fc.compound, 1)} µs/step (${f(fc.ratio)}×) | ≤ 3×        | ${ok(fc.pass)}`
	);
	return a.pass && b.pass && c.pass && d.pass && e.inProcess && fc.pass;
}

await RAPIER.init();
const args = process.argv.slice(2);
if (args[0] === '--state') {
	console.log(chainState(args[1] as Kind));
} else {
	const which = args[0] ?? 'all';
	const kinds: Kind[] = which === 'all' ? ['multibody', 'impulse'] : [which as Kind];
	console.log(
		`Rapier ${RAPIER.version()} · ${process.platform} ${process.arch} · Bun ${Bun.version}`
	);
	const results = kinds.map((k) => [k, run(k)] as const);
	console.log('');
	for (const [k, pass] of results)
		console.log(`${k}: ${pass ? 'go (cross-process determinism above)' : 'no-go on some rule'}`);
}
