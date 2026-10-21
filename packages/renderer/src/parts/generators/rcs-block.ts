/**
 * RCS thrusters (plan 211, remodelled in plan 277): a dark base plate bolted to the hull, a
 * rounded housing with an inset keypad panel, and for every nozzle a short stub pipe and a ribbed,
 * hollow bronze bell.
 *
 * The bells are drawn where the part's thruster puffs are (`visual.puffs.nozzles`, the same list as
 * its `stock.rcs` module), so the model, the puffs and the forces always agree: a nozzle's `pos` is
 * the centre of its bell's exit and its `dir` the way it pushes the vessel, so the exhaust leaves
 * along `-dir`. A part without puff data gets the plan 211 layout from `params.nozzles` (4: a
 * four-way block, 1: a single port).
 *
 * The radial node is on -X: the plate sits on the -X face of the shape's box.
 */
import { Matrix4, Quaternion, Shape, Vector3 } from 'three';
import type { GenContext } from '../registry.ts';
import { roundedRect } from './capsule.ts';
import { ribbedBell, stubPipe, type Vec3 } from './kit.ts';

interface Nozzle {
	pos: Vec3;
	dir: Vec3;
}

const norm = (v: Vec3): Vec3 => {
	const n = Math.hypot(v[0], v[1], v[2]) || 1;
	return [v[0] / n, v[1] / n, v[2] / n];
};

/** The plan 211 layout for parts without puff data. */
function legacyNozzles(ctx: GenContext): Nozzle[] {
	const [sx, sy, sz] = ctx.size;
	const hx = sx / 2;
	if (ctx.param('nozzles', 4, 1, 4) < 4) return [{ pos: [hx, 0, 0], dir: [-1, 0, 0] }];
	const at = Math.min(sy, sz) / 2 - 0.01;
	return [
		{ pos: [hx * 0.3, at, 0], dir: [0, -1, 0] },
		{ pos: [hx * 0.3, -at, 0], dir: [0, 1, 0] },
		{ pos: [hx * 0.3, 0, at], dir: [0, 0, -1] },
		{ pos: [hx * 0.3, 0, -at], dir: [0, 0, 1] }
	];
}

export function rcsBlock(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const { builder: b, detail } = ctx;
	const hx = sx / 2;
	const nozzles: Nozzle[] =
		ctx.visual.puffs?.nozzles?.map((n) => ({ pos: n.pos, dir: norm(n.dir) })) ?? legacyNozzles(ctx);
	const seg = detail.extras >= 1 ? 16 : 10;

	// Bell size from the part's size: a 0.3 m block has 6.6 cm bells with 3.3 cm exits.
	const base = Math.min(sy, sz);
	const bellLen = base * 0.22;
	const exitR = base * 0.11;
	const throat = exitR * 0.42;
	const stubMin = Math.max(0.006, base * 0.04);

	// The housing: as big as the nozzles leave room for, between the plate and the front.
	const plateT = Math.max(0.012, sx * 0.14);
	const x0 = -hx + plateT;
	let hy = sy * 0.3;
	let hz = sz * 0.3;
	let x1 = hx * 0.55;
	let outwardFace = false;
	for (const n of nozzles) {
		const e = [-n.dir[0], -n.dir[1], -n.dir[2]] as const; // exhaust direction
		const throatAt: Vec3 = [
			n.pos[0] - e[0] * bellLen,
			n.pos[1] - e[1] * bellLen,
			n.pos[2] - e[2] * bellLen
		];
		if (Math.abs(e[1]) > 0.7) hy = Math.min(hy, Math.abs(throatAt[1]) - stubMin);
		else if (Math.abs(e[2]) > 0.7) hz = Math.min(hz, Math.abs(throatAt[2]) - stubMin);
		else if (e[0] > 0.7) {
			x1 = Math.min(x1, throatAt[0] - stubMin);
			outwardFace = true;
		}
		if (Math.abs(e[0]) < 0.7) x1 = Math.max(x1, Math.min(hx - 0.004, n.pos[0] + throat * 1.6));
	}
	hy = Math.max(0.02, hy);
	hz = Math.max(0.02, hz);
	x1 = Math.max(x0 + 0.02, x1);
	const depth = x1 - x0;

	// Base plate: a dark slab a little larger than the housing, bolted at its corners.
	const pw = Math.min(sz * 0.98, hz * 2 + 0.03);
	const ph = Math.min(sy * 0.98, hy * 2 + 0.03);
	b.box('dark-metal', [plateT, ph, pw], [-hx + plateT / 2, 0, 0]);
	if (detail.extras >= 1) {
		const s = Math.max(0.006, base * 0.03);
		for (const [y, z] of [
			[1, 1],
			[1, -1],
			[-1, 1],
			[-1, -1]
		] as const) {
			b.box(
				'metal',
				[s * 0.6, s, s],
				[x0 + s * 0.3, (y * (ph - s * 2)) / 2, (z * (pw - s * 2)) / 2]
			);
		}
	}

	// Housing: a rounded box (corners along X), drawn as a rounded rectangle extruded from the plate.
	const corner = Math.min(hy, hz) * 0.35;
	const outline = roundedRect(hz * 2, hy * 2, corner) as Shape;
	const toX = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
	b.extrude(
		'paint-primary',
		outline,
		depth,
		new Matrix4().compose(new Vector3(x0, 0, 0), toX, new Vector3(1, 1, 1))
	);
	// A seam band around the housing near the plate.
	const seam = Math.min(0.012, depth * 0.15);
	const band = roundedRect(hz * 2 + 0.004, hy * 2 + 0.004, corner + 0.002) as Shape;
	b.extrude(
		'paint-secondary',
		band,
		seam,
		new Matrix4().compose(new Vector3(x0 + seam, 0, 0), toX, new Vector3(1, 1, 1))
	);

	// Keypad panel: a light plate with a 3 x 4 grid of keys, on the front face (or the +Z side
	// when a nozzle points out of the front).
	if (detail.extras >= 1) {
		const pwK = (outwardFace ? depth : hz * 2) * 0.55;
		const phK = hy * 2 * 0.6;
		const key = Math.min(pwK / 4.2, phK / 5.6);
		if (key > 0.003) {
			const face = (u: number, v: number, lift: number): readonly [number, number, number] =>
				outwardFace ? [x0 + depth / 2 + u, v, hz + lift] : [x1 + lift, v, u];
			const plate = (w: number, h: number, t: number): readonly [number, number, number] =>
				outwardFace ? [w, h, t] : [t, h, w];
			b.box('metal', plate(pwK, phK, 0.004), face(0, 0, 0.002));
			for (let c = 0; c < 3; c++) {
				for (let r = 0; r < 4; r++) {
					const u = (c - 1) * key * 1.3;
					const v = (r - 1.5) * key * 1.3;
					b.box(
						r === 0 && c === 2 ? 'paint-accent' : 'dark-metal',
						plate(key, key, 0.004),
						face(u, v, 0.005)
					);
				}
			}
		}
	}

	// Each nozzle: a stub from the housing to the throat, a collar, and the bell.
	const centre: Vec3 = [(x0 + x1) / 2, 0, 0];
	const half: Vec3 = [depth / 2, hy, hz];
	for (const n of nozzles) {
		const e: Vec3 = [-n.dir[0], -n.dir[1], -n.dir[2]];
		const throatAt: Vec3 = [
			n.pos[0] - e[0] * bellLen,
			n.pos[1] - e[1] * bellLen,
			n.pos[2] - e[2] * bellLen
		];
		const reach =
			(throatAt[0] - centre[0]) * e[0] +
			(throatAt[1] - centre[1]) * e[1] +
			(throatAt[2] - centre[2]) * e[2];
		const surface = Math.abs(e[0]) * half[0] + Math.abs(e[1]) * half[1] + Math.abs(e[2]) * half[2];
		const stub = Math.max(0.004, reach - surface);
		const from: Vec3 = [
			throatAt[0] - e[0] * stub,
			throatAt[1] - e[1] * stub,
			throatAt[2] - e[2] * stub
		];
		stubPipe(b, 'metal', from, e, stub + throat * 0.4, throat * 0.95, seg);
		stubPipe(
			b,
			'dark-metal',
			[
				throatAt[0] - e[0] * throat * 0.5,
				throatAt[1] - e[1] * throat * 0.5,
				throatAt[2] - e[2] * throat * 0.5
			],
			e,
			throat * 0.6,
			throat * 1.35,
			seg
		);
		ribbedBell(
			b,
			{
				throat,
				exit: exitR,
				length: bellLen,
				rings: detail.extras >= 1 ? 3 : 0,
				flare: 0.75,
				steps: detail.extras >= 1 ? 9 : 5,
				wall: exitR * 0.08,
				slot: 'bronze',
				segments: seg
			},
			throatAt,
			e
		);
	}
}
