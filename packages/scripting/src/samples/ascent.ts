/**
 * Sample autopilot: the plan 007 two-stage ascent written against the scripting API. Full
 * throttle, vertical to 10 km, pitch-over towards east by 40 km, prograde after, stage when an
 * engine runs dry, cut at an 80 km apoapsis, coast, circularise around apoapsis until the
 * periapsis reaches 76 km. Attitude is a PD loop on the orientation (rate by finite difference)
 * sent as `ship.attitude`. Constants of the stock vessel (reaction wheel torque, engine thrust
 * and Isp) are written out in the script because telemetry does not expose them.
 *
 * Plain JavaScript (an async function body); no backticks or `${` because it is a template literal.
 */
export const ascentScript = String.raw`
const TURN_START = 10000, TURN_END = 40000, TURN_PITCH = Math.PI / 4;
const TARGET_APOAPSIS = 80000, TARGET_PERIAPSIS = 76000;
const BANDWIDTH = 0.5, TORQUE_MAX = 5000;
const THRUST = 215000, ISP = 300, G0 = 9.80665;

const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = (a) => mul(a, 1 / Math.hypot(a.x, a.y, a.z));
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const conj = (q) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
const qmul = (a, b) => ({
	x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
	y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
	z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
	w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
});
const rotate = (q, v) => {
	const u = { x: q.x, y: q.y, z: q.z };
	const t = mul(cross(u, v), 2);
	return add(add(v, mul(t, q.w)), cross(u, t));
};

let prev = null;
// Point the ship's +Y axis at target (any magnitude); call once per tick.
function steer(target) {
	const q = ship.orientation, t = ship.t;
	const dt = prev ? t - prev.t : 0;
	let rate = { x: 0, y: 0, z: 0 };
	if (prev && dt > 0) {
		const dq = qmul(q, conj(prev.q));
		const sign = dq.w < 0 ? -1 : 1;
		rate = rotate(conj(q), mul({ x: dq.x, y: dq.y, z: dq.z }, (2 * sign) / dt));
	}
	prev = { q: { x: q.x, y: q.y, z: q.z, w: q.w }, t };
	const err = rotate(conj(q), cross(ship.nose, unit(target)));
	const alpha = TORQUE_MAX / ship.inertia;
	const kp = (BANDWIDTH * BANDWIDTH) / alpha, kd = (2 * BANDWIDTH) / alpha;
	ship.attitude = {
		pitch: clamp(kp * err.x - kd * rate.x, -1, 1),
		yaw: clamp(kp * err.z - kd * rate.z, -1, 1),
		roll: clamp(-kd * rate.y, -1, 1)
	};
}

ship.throttle = 1;
stage();
print('liftoff');

// Ascent: gravity turn until the apoapsis is high enough.
let staged = false;
while (true) {
	const dry = ship.parts.some((p) => p.modules['stock.engine'] && p.modules['stock.engine'].flameout);
	if (dry && !staged) {
		staged = true;
		stage();
		print('staged at ' + ship.t.toFixed(1) + ' s');
	}
	const east = unit(cross({ x: 0, y: 1, z: 0 }, ship.up));
	const frac = clamp((ship.altitude - TURN_START) / (TURN_END - TURN_START), 0, 1);
	const pitch = TURN_PITCH * frac;
	const target = ship.altitude > TURN_END
		? unit(ship.velocity)
		: add(mul(ship.up, Math.cos(pitch)), mul(east, Math.sin(pitch)));
	steer(target);
	if (ship.apoapsis !== null && ship.apoapsis >= TARGET_APOAPSIS) break;
	await nextTick();
}
ship.throttle = 0;
print('cut: apoapsis ' + ship.apoapsis.toFixed(0) + ' m');

// Coast until half the burn before apoapsis.
const MU = ship.mu;
while (true) {
	steer(unit(ship.velocity));
	const o = ship.orbit;
	const n = Math.sqrt(MU / (o.a * o.a * o.a));
	const toApoapsis = ((Math.PI - o.m0 + 2 * Math.PI) % (2 * Math.PI)) / n;
	const apoR = o.a * (1 + o.e);
	const vApo = Math.sqrt(MU * (2 / apoR - 1 / o.a));
	const dv = Math.sqrt(MU / apoR) - vApo;
	// Rocket equation for one engine: the burn is shorter than dv*m/F because the ship gets lighter.
	const ve = ISP * G0;
	const burn = (ship.mass * ve * (1 - Math.exp(-dv / ve))) / THRUST;
	if (toApoapsis <= burn / 2) {
		print('circularise: dv ' + dv.toFixed(0) + ' m/s, t to apoapsis ' + toApoapsis.toFixed(0) + ' s');
		break;
	}
	await nextTick();
}

// Circularise: burn horizontally until the periapsis is high enough.
ship.throttle = 1;
while (ship.periapsis === null || ship.periapsis < TARGET_PERIAPSIS) {
	steer(unit(sub(ship.velocity, mul(ship.up, dot(ship.velocity, ship.up)))));
	await nextTick();
}
ship.throttle = 0;
ship.attitude = { pitch: 0, yaw: 0, roll: 0 };
print('done: periapsis ' + ship.periapsis.toFixed(0) + ' m');
`;
