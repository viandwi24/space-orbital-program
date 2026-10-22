/**
 * Shuttle parts (plans 295, 356) and the launch escape tower (plan 276). The orbiter's body is a
 * loft of a rounded-square section (`loft.ts`): the top is +Z, black tiles under the chine.
 * - `orbiter-nose`: the crew cabin and nose, cockpit windows on the slope, a bottom joint only.
 * - `orbiter-bay`: the cargo bay, clamshell doors on top, a yellow lining and a keel beam.
 * - `orbiter-aft`: the engine section: a top joint, three main engines, two OMS pods and the tail.
 * - `delta-wing`: a double-delta wing (box shape, radial node on -X), white above, tiles under.
 * - `external-tank`: a foam-covered tank with an ogive nose, its joints at the bottom only.
 * - `escape-tower`: a lattice tower on a 0.625 m joint, a motor with four canted nozzles, a nose.
 */
import { Matrix4, Shape, Vector3 } from 'three';
import type { GeometryBuilder, SlotName } from '../builder.ts';
import type { GenContext, GeneratedPart } from '../registry.ts';
import type { ProfilePoint } from '../revolve.ts';
import { phase, pieces, type Piece } from './dyn.ts';
import { raisedRing, ribbedBell, stubPipe } from './kit.ts';
import { loft, loftCap, ringPoint, sectionSide, type LoftRing } from './loft.ts';

/** The orbiter's slots round its body: black tiles under the chine line, white above. */
const hullSlot = (a: number): SlotName => (Math.cos(a) < -0.2 ? 'tile' : 'paint-primary');

/** Columns round the orbiter's section: a multiple of four, so the corners fall on columns. */
const hullColumns = (b: GeometryBuilder): number => Math.max(16, Math.round(b.segments / 4) * 4);

/**
 * The nose's section at `t` (0 the joint, 1 the tip): the cabin, the windscreen slope from a
 * quarter of the way up, the belly rising past halfway, the planform tapering to a drooped tip.
 */
function noseRing(t: number, y: number): LoftRing {
	const u = (a: number) => Math.min(1, Math.max(0, (t - a) / (1 - a)));
	const w = Math.max(0.035, (1 - u(0.3) ** 2) ** 0.62);
	const top = 1 - 1.38 * u(0.24) ** 1.15;
	const bot = -1 + 0.6 * u(0.5) ** 1.5;
	return { y, w, h: Math.max(0.03, (top - bot) / 2), dz: (top + bot) / 2 };
}

/** A pane (or a frame) lying on the loft surface at `p`, `n` its outward normal, `u` sideways. */
function pane(
	b: GeometryBuilder,
	slot: SlotName,
	at: Vector3,
	n: Vector3,
	u: Vector3,
	w0: number,
	w1: number,
	h: number,
	lift: number
): void {
	const v = new Vector3().crossVectors(n, u).normalize();
	const s = new Shape();
	s.moveTo(-w0 / 2, -h / 2);
	s.lineTo(w0 / 2, -h / 2);
	s.lineTo(w1 / 2, h / 2);
	s.lineTo(-w1 / 2, h / 2);
	s.closePath();
	const m = new Matrix4().makeBasis(u, v, n).setPosition(at.clone().addScaledVector(n, lift));
	b.extrude(slot, s, 0.005, m);
}

/** Point, outward normal and sideways direction of the nose surface at (t, azimuth). */
function noseFrame(A: number, y0: number, H: number, t: number, a: number) {
	const p = (tt: number, aa: number) => new Vector3(...ringPoint(A, noseRing(tt, y0 + H * tt), aa));
	const at = p(t, a);
	const u = p(t, a + 1e-3)
		.sub(p(t, a - 1e-3))
		.normalize();
	const up = p(t + 1e-3, a)
		.sub(p(t - 1e-3, a))
		.normalize();
	const n = new Vector3().crossVectors(u, up).normalize();
	return { at, n, u };
}

/**
 * The crew cabin and nose (plan 356): a lofted rounded-square section that slopes into the
 * windscreen and droops to a dark nose cap; black tiles under the chine line, the cockpit windows
 * in black frames, forward RCS ports and the side hatch.
 */
export function orbiterNose(ctx: GenContext): void {
	const { radius: R, height: H, builder: b } = ctx;
	const h2 = H / 2;
	const A = sectionSide(R);
	const cols = hullColumns(b);
	const K = 18;
	// rings closer together toward the rounded tip
	const ts = Array.from({ length: K + 1 }, (_, k) => 1 - (1 - k / K) ** 1.6);
	const rings = ts.map((t) => noseRing(t, -h2 + H * t));
	const mid = (j: number) => (ts[j]! + ts[j + 1]!) / 2;
	loft(b, A, rings, {
		segments: cols,
		// where the top slopes and the belly stays flat the lower corners would bulge past R
		maxRadius: R,
		slot: (a, j) => {
			const t = mid(j);
			if (t > 0.94) return 'tile';
			return hullSlot(a);
		}
	});
	loftCap(b, A, rings[0]!, 'dark-metal', false, cols);
	loftCap(b, A, rings[K]!, 'tile', true, cols);
	// the windscreen: six panes across the slope, two side windows behind
	for (let i = 0; i < 6; i++) {
		const a = -0.48 + (0.96 * i) / 5;
		const f = noseFrame(A, -h2, H, 0.42, a);
		pane(b, 'tile', f.at, f.n, f.u, 0.28, 0.23, 0.26, 0);
		pane(b, 'glass', f.at, f.n, f.u, 0.22, 0.17, 0.2, 0.001);
	}
	for (const s of [-1, 1]) {
		const f = noseFrame(A, -h2, H, 0.36, s * 1.15);
		pane(b, 'tile', f.at, f.n, f.u, 0.26, 0.26, 0.24, 0);
		pane(b, 'glass', f.at, f.n, f.u, 0.18, 0.18, 0.16, 0.002);
	}
	// forward RCS ports on both sides near the nose cap
	for (const s of [-1, 1])
		for (let k = 0; k < 3; k++) {
			const f = noseFrame(A, -h2, H, 0.8 + k * 0.03, s * 1.3);
			pane(b, 'dark-metal', f.at, f.n, f.u, 0.06, 0.06, 0.05, 0.002);
		}
	// the side hatch (+X)
	const hy = -h2 + H * 0.21;
	b.cylinder('dark-metal', 0.3, 0.02, [A + 0.005, hy, 0], { tiltZ: Math.PI / 2 });
	b.cylinder('paint-primary', 0.26, 0.024, [A + 0.006, hy, 0], { tiltZ: Math.PI / 2 });
}

/**
 * The orbiter's cargo bay (plan 356): the lofted fuselage, open on top between two sills, a yellow
 * lining with frames, the fore and aft bulkheads, a keel beam on the floor (the keel node) and two
 * clamshell doors that open out along the whole length.
 */
export function orbiterBay(ctx: GenContext): GeneratedPart {
	const { radius: R, height: H, builder: b } = ctx;
	const h2 = H / 2;
	const A = sectionSide(R);
	const cols = hullColumns(b);
	// the doors cover the top between the sills, this far each way from +Z
	const sill = 1.15;
	const full: LoftRing[] = [
		{ y: -h2, w: 1, h: 1 },
		{ y: h2, w: 1, h: 1 }
	];
	loft(b, A, full, { segments: cols, start: sill, length: Math.PI * 2 - 2 * sill, slot: hullSlot });
	const inner: LoftRing[] = [
		{ y: -h2 + 0.04, w: 1, h: 1 },
		{ y: h2 - 0.04, w: 1, h: 1 }
	];
	loft(b, A, inner, {
		segments: cols,
		start: sill,
		length: Math.PI * 2 - 2 * sill,
		scale: 0.95,
		inward: true,
		slot: () => 'liner'
	});
	// the joint faces outside, the bulkheads seen from inside
	loftCap(b, A, full[0]!, 'dark-metal', false, cols);
	loftCap(b, A, full[1]!, 'dark-metal', true, cols);
	loftCap(b, A, inner[0]!, 'paint-primary', true, cols, 0.95);
	loftCap(b, A, inner[1]!, 'paint-primary', false, cols, 0.95);
	// frames round the lining
	const frames = ctx.detail.extras >= 1 ? 7 : 3;
	for (let k = 1; k <= frames; k++) {
		const y = -h2 + (H * k) / (frames + 1);
		loft(
			b,
			A,
			[
				{ y: y - 0.04, w: 1, h: 1 },
				{ y: y + 0.04, w: 1, h: 1 }
			],
			{
				segments: cols,
				start: sill,
				length: Math.PI * 2 - 2 * sill,
				scale: 0.93,
				inward: true,
				slot: () => 'metal'
			}
		);
	}
	// the sills: longerons along the door hinges
	for (const s of [-1, 1]) {
		const [x, , z] = ringPoint(A, full[0]!, s * sill, 0.975);
		b.box('dark-metal', [0.09, H - 0.08, 0.09], [x, 0, z]);
	}
	// the keel beam on the floor, the payload's port goes on it
	b.box('dark-metal', [0.3, H - 0.3, 0.06], [0, 0, -A * 0.95 + 0.03]);
	const [hx, , hz] = ringPoint(A, full[0]!, sill);
	const list: Piece[] = [-1, 1].map((s) => ({
		build: (g) => {
			const doorRings: LoftRing[] = [
				{ y: -h2 + 0.02, w: 1, h: 1 },
				{ y: h2 - 0.02, w: 1, h: 1 }
			];
			const opts = {
				segments: cols,
				start: s > 0 ? 0.006 : -sill,
				length: sill - 0.006,
				offset: [-s * hx, 0, -hz] as [number, number, number]
			};
			loft(g, A, doorRings, { ...opts, slot: () => 'paint-primary' });
			// radiator panels on the inside
			loft(g, A, doorRings, { ...opts, scale: 0.975, inward: true, slot: () => 'metal' });
		},
		pose: (o, p) => {
			o.position.set(s * hx, 0, hz);
			o.rotation.set(0, s * phase(p, 0, 1) * 2.4, 0);
		}
	}));
	return { dynamic: pieces(ctx, list) };
}

/**
 * The engine section (plan 356): the lofted aft fuselage with two OMS pods on its shoulders, three
 * main engines in a triangle on the tiled base, a body flap under them and the swept tail fin on
 * top (+Z) with a black leading edge and the rudder line.
 */
export function orbiterAft(ctx: GenContext): void {
	const { height: H, builder: b } = ctx;
	// the fuselage's corner radius; the shape is wider by the tail fin standing up out of its top
	const R = ctx.param('body', 1.25, 0.3, ctx.radius);
	const A = sectionSide(R);
	const cols = hullColumns(b);
	const h2 = H / 2;
	const base = -h2 + H * 0.35;
	const rings: LoftRing[] = [
		{ y: base, w: 0.97, h: 0.97 },
		{ y: base + 0.25, w: 1, h: 1 },
		{ y: h2, w: 1, h: 1 }
	];
	loft(b, A, rings, { segments: cols, slot: hullSlot });
	loftCap(b, A, rings[0]!, 'tile', false, cols);
	loftCap(b, A, rings[2]!, 'dark-metal', true, cols);
	// three main engines in a triangle, one up and two below
	const bell = {
		throat: R * 0.1,
		exit: R * 0.28,
		length: H * 0.35,
		rings: ctx.detail.extras >= 1 ? 2 : 0,
		slot: 'nozzle' as const,
		flare: 0.65,
		segments: Math.max(10, Math.round(b.segments * 0.6))
	};
	for (const [x, z] of [
		[0, R * 0.3],
		[-R * 0.36, -R * 0.2],
		[R * 0.36, -R * 0.2]
	] as const)
		ribbedBell(b, bell, [x, base, z]);
	// the body flap under the engines
	b.box('tile', [A * 1.5, 0.5, 0.1], [0, base - 0.25, -A * 0.82]);
	// OMS pods on the upper shoulders, the tail fin on top (+Z)
	for (const s of [-1, 1]) {
		b.revolveAt(
			'paint-primary',
			[
				{ r: 0, y: base - 0.05 },
				{ r: R * 0.22, y: base + 0.05 },
				{ r: R * 0.22, y: h2 - 0.3 },
				{ r: 0.02, y: h2 - 0.1 }
			],
			[s * A * 0.62, 0, A * 0.72]
		);
		ribbedBell(
			b,
			{
				throat: R * 0.05,
				exit: R * 0.1,
				length: 0.25,
				slot: 'nozzle',
				segments: Math.max(10, Math.round(b.segments * 0.6))
			},
			[s * A * 0.62, base - 0.05, A * 0.72]
		);
	}
	// the fin: a swept plate in the YZ plane, its root on the flat top
	const z0 = A * 0.98;
	const z1 = Math.max(z0 + 0.3, ctx.radius - 0.02);
	const yF = h2 - 0.15;
	const yB = base - 0.1;
	const L = yF - yB;
	const t = 0.08;
	// the plate is drawn in shape coordinates (outward, along Y) and turned so the shape's X is +Z
	const place = new Matrix4().makeBasis(
		new Vector3(0, 0, 1),
		new Vector3(0, 1, 0),
		new Vector3(-1, 0, 0)
	);
	const plate = (slot: SlotName, pts: ReadonlyArray<readonly [number, number]>, thick: number) => {
		const sh = new Shape();
		sh.moveTo(pts[0]![0], pts[0]![1]);
		for (const q of pts.slice(1)) sh.lineTo(q[0], q[1]);
		sh.closePath();
		b.extrude(slot, sh, thick, place.clone().setPosition(thick / 2, 0, 0));
	};
	const tipF = yB + 0.42 * L;
	const tipB = yB + 0.08 * L;
	plate(
		'paint-primary',
		[
			[z0, yB],
			[z0, yF],
			[z1, tipF],
			[z1, tipB]
		],
		t
	);
	// the black leading edge
	const lead = (k: number): [number, number] => [z0 + (z1 - z0) * k, yF + (tipF - yF) * k];
	const e = 0.1;
	plate('tile', [[z0, yF - e], [z0, yF], lead(1), [z1, tipF - e]], t + 0.012);
	// the rudder line, a quarter of the chord in from the trailing edge
	const trail = (k: number): [number, number] => [z0 + (z1 - z0) * k, yB + (tipB - yB) * k];
	const rl = (k: number): [number, number] => {
		const [z, yt] = trail(k);
		const [, yl] = lead(k);
		return [z, yt + (yl - yt) * 0.3];
	};
	plate(
		'dark-metal',
		[
			[z0 + 0.15, rl(0.08)[1] - 0.015],
			[z0 + 0.15, rl(0.08)[1] + 0.015],
			[rl(0.97)[0], rl(0.97)[1] + 0.015],
			[rl(0.97)[0], rl(0.97)[1] - 0.015]
		],
		t + 0.01
	);
}

export function deltaWing(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const b = ctx.builder;
	const hx = sx / 2;
	const h2 = sy / 2;
	const t = sz / 2;
	// planform in the XY plane: root along the hull (x = -hx), a strake forward, the tip aft
	const root0: [number, number] = [-hx, -h2];
	const nose: [number, number] = [-hx, h2];
	const kink: [number, number] = [-hx + sx * 0.25, h2 * 0.35];
	const tip: [number, number] = [hx, -h2 + sy * 0.15];
	const tipAft: [number, number] = [hx, -h2];
	const wing = new Shape();
	wing.moveTo(...root0);
	wing.lineTo(...nose);
	wing.lineTo(...kink);
	wing.lineTo(...tip);
	wing.lineTo(...tipAft);
	wing.closePath();
	// the tiles under the wing (-Z), or on +Z for the far wing of a pair (plan 356)
	const up = ctx.visual.params?.tilesUp === true;
	b.extrude(up ? 'tile' : 'paint-primary', wing, t, new Matrix4().makeTranslation(0, 0, 0));
	b.extrude(up ? 'paint-primary' : 'tile', wing, t, new Matrix4().makeTranslation(0, 0, -t));
	// the black leading edges (plan 356): a strip inside each edge, round both faces
	const strip = (p: [number, number], q: [number, number], w: number) => {
		const dx = q[0] - p[0];
		const dy = q[1] - p[1];
		const l = Math.hypot(dx, dy);
		// the inward normal: the planform lies to the right walking nose to tip
		const nx = dy / l;
		const ny = -dx / l;
		const sh = new Shape();
		sh.moveTo(...p);
		sh.lineTo(...q);
		sh.lineTo(q[0] + nx * w, q[1] + ny * w);
		sh.lineTo(p[0] + nx * w, p[1] + ny * w);
		sh.closePath();
		b.extrude('tile', sh, sz + 0.012, new Matrix4().makeTranslation(0, 0, -t - 0.006));
	};
	strip(nose, kink, 0.14);
	strip(kink, tip, 0.16);
	// the elevons along the trailing edge, in two halves
	const ew = sx * 0.85;
	for (const k of [0, 1])
		b.box(
			'dark-metal',
			[ew / 2 - 0.03, sy * 0.06, sz * 1.02],
			[-hx + sx * 0.1 + ew / 4 + (k * ew) / 2, -h2 + sy * 0.03, 0]
		);
}

export function externalTank(ctx: GenContext): void {
	const { radius: R, height: H, builder: b } = ctx;
	const h2 = H / 2;
	const node = ctx.param('node', R * 2, 0.5, R * 2) / 2;
	b.revolve('dark-metal', [
		{ r: 0, y: -h2 },
		{ r: node, y: -h2 },
		{ r: node, y: -h2 + 0.05 },
		{ r: R * 0.98, y: -h2 + 0.12 }
	]);
	const nose = h2 - H * 0.18;
	// the ogive ends under the nose spike
	const tip = h2 - 0.45;
	b.revolve('foam', [
		{ r: R * 0.98, y: -h2 + 0.12 },
		{ r: R * 0.98, y: nose }
	]);
	const prof: ProfilePoint[] = [];
	const steps = 10;
	for (let i = 0; i <= steps; i++) {
		const tt = i / steps;
		prof.push({
			r: Math.max(0.0001, R * 0.98 * Math.sqrt(1 - tt * tt) ** 0.9),
			y: nose + (tip - nose) * tt,
			smooth: i > 0 && i < steps
		});
	}
	b.revolve('foam', prof);
	// the foam ribs (plan 356): fine rings down the hydrogen tank, a wide intertank band, a few on
	// the oxygen tank, and the nose spike
	const inter = -h2 + H * 0.66;
	const ribs = ctx.detail.extras >= 1 ? 1.3 : 2.6;
	for (let y = -h2 + H * 0.06; y < inter - 0.6; y += ribs)
		raisedRing(b, 'foam', R * 0.98, y, 0.08, 0.012);
	raisedRing(b, 'foam', R * 0.98, inter, H * 0.07, 0.018);
	for (const y of [inter - H * 0.04, inter + H * 0.04])
		raisedRing(b, 'foam', R * 0.98, y, 0.05, 0.026);
	for (let y = inter + H * 0.08; y < nose - 0.2; y += ribs * 1.2)
		raisedRing(b, 'foam', R * 0.98, y, 0.06, 0.01);
	b.cylinder('dark-metal', 0.05, 0.5, [0, h2 - 0.25, 0], { radiusTop: 0.012 });
	// the feed line down the side and the attach struts' fittings
	stubPipe(b, 'foam', [R * 0.98 - R * 0.07, -h2 + 0.3, 0], [0, 1, 0], H * 0.75, R * 0.06, 10);
	for (const y of [-h2 + H * 0.12, -h2 + H * 0.68])
		b.box('dark-metal', [0.2, 0.25, 0.2], [0, y, -(R * 0.98 - 0.11)]);
}

export function escapeTower(ctx: GenContext): void {
	const { radius: R, height: H, builder: b } = ctx;
	const h2 = H / 2;
	const base = ctx.param('base', 0.3125, 0.1, R);
	b.revolve('dark-metal', [
		{ r: 0, y: -h2 },
		{ r: base, y: -h2 },
		{ r: base, y: -h2 + 0.05 },
		{ r: base * 0.6, y: -h2 + 0.08 }
	]);
	// the lattice: four legs converging, cross braces
	const towerTop = -h2 + H * 0.38;
	const legR0 = base * 0.85;
	const legR1 = R * 0.35;
	for (let i = 0; i < 4; i++) {
		const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
		const from: [number, number, number] = [Math.sin(a) * legR0, -h2 + 0.06, Math.cos(a) * legR0];
		const to: [number, number, number] = [Math.sin(a) * legR1, towerTop, Math.cos(a) * legR1];
		stubPipe(
			b,
			'paint-accent',
			from,
			[to[0] - from[0], to[1] - from[1], to[2] - from[2]],
			Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]),
			0.02,
			6
		);
		const b2 = ((i + 1) / 4) * Math.PI * 2 + Math.PI / 4;
		const mid = (y: number, r: number, ang: number): [number, number, number] => [
			Math.sin(ang) * r,
			y,
			Math.cos(ang) * r
		];
		const y1 = -h2 + 0.06 + (towerTop + h2) * 0.5;
		const r1 = legR0 + (legR1 - legR0) * 0.5;
		const p0 = mid(-h2 + 0.06, legR0, a);
		const p1 = mid(y1, r1, b2);
		stubPipe(
			b,
			'paint-accent',
			p0,
			[p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]],
			Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]),
			0.012,
			6
		);
	}
	// the motor with four canted nozzles, then the nose
	const motorTop = h2 - H * 0.2;
	b.revolve('paint-primary', [
		{ r: R * 0.32, y: towerTop },
		{ r: R * 0.38, y: towerTop + 0.1 },
		{ r: R * 0.38, y: motorTop }
	]);
	for (let i = 0; i < 4; i++) {
		const a = (i / 4) * Math.PI * 2;
		const dir: [number, number, number] = [Math.sin(a) * 0.6, -1, Math.cos(a) * 0.6];
		ribbedBell(
			b,
			{ throat: R * 0.05, exit: R * 0.11, length: R * 0.2, slot: 'nozzle' },
			[Math.sin(a) * R * 0.3, towerTop + 0.15, Math.cos(a) * R * 0.3],
			dir
		);
	}
	b.revolve('paint-accent', [
		{ r: R * 0.38, y: motorTop },
		{ r: R * 0.25, y: motorTop + (h2 - motorTop) * 0.6, smooth: true },
		{ r: 0.02, y: h2 - 0.01 },
		{ r: 0, y: h2 }
	]);
}
