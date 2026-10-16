import type { Quat, Vec3 } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import {
	attitudeAngles,
	groundRegion,
	localHorizon,
	markerDirections,
	normalize,
	projectDirection,
	qRotate,
	visibleRuns,
	elevationCircle,
	cross,
	type BallPoint
} from './navball-math';

const DEG = Math.PI / 180;
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const mul = (a: Vec3, s: number): Vec3 => v(a.x * s, a.y * s, a.z * s);
const plus = (...xs: Vec3[]): Vec3 =>
	xs.reduce((a, b) => v(a.x + b.x, a.y + b.y, a.z + b.z), v(0, 0, 0));

/** Unit quaternion of the rotation whose columns are the images of local X, Y, Z. */
function quatFromAxes(x: Vec3, y: Vec3, z: Vec3): Quat {
	const m = [x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z] as const;
	const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
	const tr = m00 + m11 + m22;
	let q: Quat;
	if (tr > 0) {
		const s = Math.sqrt(tr + 1) * 2;
		q = { w: s / 4, x: (m21 - m12) / s, y: (m02 - m20) / s, z: (m10 - m01) / s };
	} else if (m00 > m11 && m00 > m22) {
		const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
		q = { w: (m21 - m12) / s, x: s / 4, y: (m01 + m10) / s, z: (m02 + m20) / s };
	} else if (m11 > m22) {
		const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
		q = { w: (m02 - m20) / s, x: (m01 + m10) / s, y: s / 4, z: (m12 + m21) / s };
	} else {
		const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
		q = { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: s / 4 };
	}
	return q;
}

/** Vessel orientation from where its nose and its "up" (+Z) axis point; right = nose x up. */
const orient = (noseIn: Vec3, upIn: Vec3): Quat => {
	const nose = normalize(noseIn);
	const d = nose.x * upIn.x + nose.y * upIn.y + nose.z * upIn.z;
	const up = normalize(v(upIn.x - d * nose.x, upIn.y - d * nose.y, upIn.z - d * nose.z));
	return quatFromAxes(cross(nose, up), nose, up);
};

// A point on the +X axis of the home body: up = +X, north = +Y, east = north x up = -Z.
const POS = v(600_000, 0, 0);
const h = localHorizon(POS);

describe('local horizon', () => {
	it('is east/north/up with +Y north (right-handed)', () => {
		expect(h.up).toEqual(v(1, 0, 0));
		expect(h.north).toEqual(v(0, 1, 0));
		expect(h.east.z).toBeCloseTo(-1, 12);
	});
});

describe('attitudeAngles', () => {
	const expectAngles = (q: Quat, pitch: number, heading: number, roll: number): void => {
		const a = attitudeAngles(q, POS);
		expect(a.pitch / DEG).toBeCloseTo(pitch, 6);
		expect(a.heading / DEG).toBeCloseTo(heading, 6);
		expect(a.roll / DEG).toBeCloseTo(roll, 6);
	};
	it('the pad pose (local X east, Y up, Z south) reads pitch 90, heading 0, roll 0', () => {
		expectAngles(quatFromAxes(h.east, h.up, mul(h.north, -1)), 90, 0, 0);
	});
	it('level, nose north / east / south / west', () => {
		expectAngles(orient(h.north, h.up), 0, 0, 0);
		expectAngles(orient(h.east, h.up), 0, 90, 0);
		expectAngles(orient(mul(h.north, -1), h.up), 0, 180, 0);
		expectAngles(orient(mul(h.east, -1), h.up), 0, 270, 0);
	});
	it('pitched 45 degrees up towards the east', () => {
		const s = Math.SQRT1_2;
		expectAngles(
			orient(plus(mul(h.east, s), mul(h.up, s)), plus(mul(h.east, -s), mul(h.up, s))),
			45,
			90,
			0
		);
	});
	it('rolled 30 degrees right (right side down), nose north', () => {
		const c = Math.cos(30 * DEG);
		const s = Math.sin(30 * DEG);
		expectAngles(orient(h.north, plus(mul(h.up, c), mul(h.east, s))), 0, 0, 30);
		expectAngles(orient(h.north, plus(mul(h.up, c), mul(h.east, -s))), 0, 0, -30);
	});
	it('nose straight down keeps a continuous heading from the up axis', () => {
		expectAngles(orient(mul(h.up, -1), h.north), -90, 0, 0);
	});
	it('the rotation helper agrees with the quaternion', () => {
		const q = orient(h.east, h.up);
		expect(qRotate(q, v(0, 1, 0)).z).toBeCloseTo(-1, 12);
	});
});

describe('projection and markers', () => {
	const q = orient(h.north, h.up);
	it('the nose is the centre, right and up are the ball axes, behind is hidden', () => {
		expect(projectDirection(h.north, q)).toMatchObject({ x: 0, y: 0, z: 1 });
		const r = projectDirection(h.east, q); // nose north, up up => right is east
		expect(r.x).toBeCloseTo(1, 12);
		expect(projectDirection(h.up, q).y).toBeCloseTo(1, 12);
		expect(projectDirection(mul(h.north, -1), q).z).toBe(-1);
	});
	it('prograde points along the velocity, retrograde opposite; radial and normal from the state', () => {
		const vel = v(0, 100, 0);
		const m = markerDirections(POS, vel, vel);
		const by = (k: string) => m.find((x) => x.kind === k)!.dir;
		expect(by('prograde')).toEqual(v(0, 1, 0));
		expect(by('retrograde')).toEqual(v(0, -1, 0));
		expect(by('radial-out')).toEqual(v(1, 0, 0));
		// h = r x v = (6e5,0,0) x (0,100,0) = +Z * 6e7
		expect(by('normal')).toEqual(v(0, 0, 1));
	});
	it('has no markers when slow', () => {
		expect(markerDirections(POS, v(0, 0.1, 0), v(0, 0.1, 0))).toEqual([]);
	});
	it('prograde is in the ball centre when the nose follows the velocity', () => {
		const pro = markerDirections(POS, v(0, 5, 0), v(0, 5, 0))[0]!;
		const p = projectDirection(pro.dir, q);
		expect(Math.hypot(p.x, p.y)).toBeCloseTo(0, 12);
	});
});

describe('ball geometry', () => {
	it('visible runs of the horizon stay on the front hemisphere and end on the rim', () => {
		const q = orient(h.north, h.up);
		const runs = visibleRuns(elevationCircle(h, 0), q);
		expect(runs.length).toBeGreaterThan(0);
		for (const run of runs) {
			for (const p of run) expect(p.z).toBeGreaterThanOrEqual(-1e-12);
			const e = run[run.length - 1]!;
			expect(Math.hypot(e.x, e.y)).toBeLessThanOrEqual(1 + 1e-9);
		}
	});

	// The ground region polygon must agree with a brute-force classification of the disc.
	const inside = (poly: BallPoint[], x: number, y: number): boolean => {
		let c = false;
		for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
			const a = poly[i]!;
			const b = poly[j]!;
			if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
		}
		return c;
	};
	const polygonOf = (
		r: Extract<ReturnType<typeof groundRegion>, { kind: 'region' }>
	): BallPoint[] => {
		const pts = [...r.horizon];
		const steps = 90;
		let delta = r.rimTo - r.rimFrom;
		if (r.ccw) while (delta < 0) delta += 2 * Math.PI;
		else while (delta > 0) delta -= 2 * Math.PI;
		for (let i = 1; i < steps; i++) {
			const a = r.rimFrom + (delta * i) / steps;
			pts.push({ x: Math.cos(a), y: Math.sin(a), z: 0 });
		}
		return pts;
	};
	const orientations: Quat[] = [
		orient(h.north, h.up),
		orient(h.east, h.up),
		orient(plus(mul(h.north, 0.8), mul(h.up, 0.6)), plus(mul(h.north, -0.6), mul(h.up, 0.8))),
		orient(plus(mul(h.north, 0.6), mul(h.up, -0.8)), plus(mul(h.north, 0.8), mul(h.up, 0.6))),
		orient(
			normalize(plus(h.north, h.east, mul(h.up, 0.3))),
			normalize(plus(mul(h.up, 1), mul(h.east, 0.4)))
		),
		orient(mul(h.up, -1), h.north),
		orient(h.up, h.east)
	];
	it.each(orientations.map((q, i) => [i, q] as const))(
		'ground region matches brute force (orientation %i)',
		(_i, q) => {
			const region = groundRegion(h, q);
			const nViewZ = projectDirection(mul(h.up, -1), q);
			let mismatches = 0;
			let total = 0;
			for (let x = -0.97; x <= 0.97; x += 0.06) {
				for (let y = -0.97; y <= 0.97; y += 0.06) {
					if (x * x + y * y > 0.94) continue;
					const z = Math.sqrt(1 - x * x - y * y);
					const ground = x * nViewZ.x + y * nViewZ.y + z * nViewZ.z > 0;
					const got =
						region.kind === 'full'
							? true
							: region.kind === 'none'
								? false
								: inside(polygonOf(region), x, y);
					total++;
					if (got !== ground) mismatches++;
				}
			}
			expect(mismatches / total).toBeLessThan(0.01);
		}
	);
});
