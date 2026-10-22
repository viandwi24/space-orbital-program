/**
 * Spacecraft bodies (plans 296, 297, 298, 300): capsules, cabins, station modules, a satellite bus,
 * a telescope, a lunar lander's stages and a single landing leg. Stack parts keep a round joint
 * collar at each face that has a node (ADR 0212), whatever their body's shape.
 */
import { Matrix4, Path, Quaternion, Shape, Vector3 } from 'three';
import type { GeometryBuilder } from '../builder.ts';
import type { GenContext, GeneratedPart } from '../registry.ts';
import type { ProfilePoint } from '../revolve.ts';
import { roundedRect } from './capsule.ts';
import { phase, pieces, type Piece } from './dyn.ts';
import {
	boltCircle,
	hazardStripe,
	louvres,
	panelInset,
	raisedRing,
	ribbedBell,
	rim,
	stubPipe
} from './kit.ts';

/** A bottom joint disc and collar of radius `r`, `band` tall. */
function bottomJoint(b: GeometryBuilder, r: number, y: number, band: number, inner: number): void {
	b.revolve('dark-metal', [
		{ r: 0, y },
		{ r, y },
		{ r, y: y + band },
		{ r: inner, y: y + band }
	]);
}
/** A top joint collar of radius `r` from `y - band` to `y`, closed by a lid. */
function topJoint(b: GeometryBuilder, r: number, y: number, band: number, inner: number): void {
	b.revolve('dark-metal', [
		{ r: inner, y: y - band },
		{ r, y: y - band },
		{ r, y },
		{ r: 0, y }
	]);
}

/** Round windows (frame and glass) facing out from a wall of radius `r` at azimuths `angles`. */
function portholes(
	b: GeometryBuilder,
	r: number,
	y: number,
	angles: number[],
	size: number,
	tilt = 0
): void {
	for (const a of angles) {
		const q = new Quaternion()
			.setFromAxisAngle(new Vector3(0, 1, 0), a)
			.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -tilt));
		const out = new Vector3(0, 0, 1).applyQuaternion(q);
		const ring = new Shape();
		ring.absarc(0, 0, size / 2, 0, Math.PI * 2, false);
		const hole = new Path();
		hole.absarc(0, 0, size * 0.36, 0, Math.PI * 2, true);
		ring.holes.push(hole);
		const glass = new Shape();
		glass.absarc(0, 0, size * 0.36, 0, Math.PI * 2, false);
		const at = (lift: number) =>
			new Matrix4().compose(
				new Vector3(Math.sin(a) * r, y, Math.cos(a) * r).addScaledVector(out, lift),
				q,
				new Vector3(1, 1, 1)
			);
		b.extrude('dark-metal', ring, 0.025, at(-0.01));
		b.extrude('glass', glass, 0.01, at(-0.004));
	}
}

/**
 * A descent module shaped like a car's headlight (Soyuz kind): a wide shield at the base, a
 * convex body narrowing to a hatch collar, two portholes, a dark band of thrusters.
 */
export function headlight(ctx: GenContext): void {
	const { radius: R, height: H, builder: b } = ctx;
	const h2 = H / 2;
	const top = ctx.param('top', 0.3125, 0.1, R);
	b.revolve('ablator', [
		{ r: 0, y: -h2 },
		{ r: R * 0.9, y: -h2 + 0.015 },
		{ r: R, y: -h2 + 0.04 }
	]);
	const prof: ProfilePoint[] = [];
	const steps = 10;
	const bodyBottom = -h2 + 0.04;
	const bodyTop = h2 - 0.08;
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		// a bulging side: wide low, rounding in toward the top
		const r = top + (R - top) * Math.cos((t * Math.PI) / 2.15);
		prof.push({
			r: Math.max(top, r),
			y: bodyBottom + (bodyTop - bodyBottom) * t,
			smooth: i > 0 && i < steps
		});
	}
	b.revolve('paint-primary', prof);
	topJoint(b, top, h2, 0.08, top * 0.9);
	b.revolve('paint-secondary', [
		{ r: R * 0.995, y: bodyBottom + 0.02 },
		{ r: R * 0.99, y: bodyBottom + 0.1 }
	]);
	const yMid = bodyBottom + (bodyTop - bodyBottom) * 0.45;
	const rMid = top + (R - top) * Math.cos((0.45 * Math.PI) / 2.15);
	if (ctx.detail.extras >= 1) portholes(b, rMid, yMid, [0.6, -0.6], 0.16, 0.5);
}

/** A sphere capsule (Vostok kind) between joint collars: hatch, porthole, straps. */
export function sphereCapsule(ctx: GenContext): void {
	const { radius: R, height: H, builder: b } = ctx;
	const h2 = H / 2;
	const bottom = ctx.param('bottom', R * 0.6, 0.1, R);
	const top = ctx.param('top', 0.3125, 0.1, R);
	bottomJoint(b, bottom, -h2, 0.05, bottom * 0.95);
	topJoint(b, top, h2, 0.05, top * 0.95);
	const cy = 0;
	const sr = Math.min(R * 0.98, h2 - 0.04);
	const prof: ProfilePoint[] = [];
	const steps = 14;
	for (let i = 0; i <= steps; i++) {
		const t = -Math.PI / 2 + (Math.PI * i) / steps;
		prof.push({
			r: Math.max(Math.min(bottom, top) * 0.9, Math.cos(t) * sr),
			y: cy + Math.sin(t) * sr,
			smooth: i > 0 && i < steps
		});
	}
	b.revolve('ablator', prof);
	for (const y of [-sr * 0.3, sr * 0.3])
		raisedRing(b, 'dark-metal', Math.cos(Math.asin(y / sr)) * sr, y, 0.04, 0.012);
	portholes(b, sr * 0.92, sr * 0.1, [0.4], 0.18, 0.1);
	portholes(b, sr * 0.92, sr * 0.1, [Math.PI], 0.32, 0.1);
}

/** A small cone capsule (Mercury kind): ribbed cone, a cylinder neck for the chute, a porthole. */
export function coneCapsule(ctx: GenContext): void {
	const { radius: R, height: H, builder: b } = ctx;
	const h2 = H / 2;
	const top = ctx.param('top', 0.3125, 0.1, R);
	b.revolve('ablator', [
		{ r: 0, y: -h2 },
		{ r: R * 0.95, y: -h2 + 0.02 },
		{ r: R, y: -h2 + 0.04 }
	]);
	const neck = h2 - H * 0.25;
	b.revolve('dark-metal', [
		{ r: R, y: -h2 + 0.04 },
		{ r: top * 1.05, y: neck }
	]);
	b.revolve('paint-secondary', [
		{ r: top * 1.05, y: neck },
		{ r: top, y: neck + 0.01 },
		{ r: top, y: h2 - 0.05 }
	]);
	topJoint(b, top, h2, 0.05, top * 0.95);
	const ribs = ctx.detail.extras >= 1 ? 16 : 0;
	for (let i = 0; i < ribs; i++) {
		const a = (i / ribs) * Math.PI * 2;
		const y0 = -h2 + 0.08;
		const dir: [number, number, number] = [
			Math.sin(a) * (top * 1.05 - R),
			neck - y0,
			Math.cos(a) * (top * 1.05 - R)
		];
		stubPipe(
			b,
			'metal',
			[Math.sin(a) * R * 0.975, y0, Math.cos(a) * R * 0.975],
			dir,
			Math.hypot(...dir) * 0.97,
			0.008,
			4
		);
	}
	portholes(b, (R + top) * 0.5, (-h2 + neck) * 0.5, [0], 0.16, Math.atan2(R - top, neck + h2));
}

/** A crewed can: lander can, crew cabin or station module (`params.kind`). */
export function crewCan(ctx: GenContext): void {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const kind = String(ctx.visual.params?.kind ?? 'cabin');
	const topR = ctx.param('top', R, 0.1, R);
	const band = Math.min(0.08, H * 0.08);
	const wall = R * 0.97;
	bottomJoint(b, R, -h2, band, wall);
	topJoint(b, topR, h2, band, Math.min(wall, topR * 0.95));
	if (topR < R * 0.99)
		b.revolve('paint-primary', [
			{ r: wall, y: h2 - band - 0.15 },
			{ r: topR * 0.95, y: h2 - band }
		]);
	b.revolve(kind === 'lander' ? 'foil' : 'paint-primary', [
		{ r: wall, y: -h2 + band },
		{ r: wall, y: topR < R * 0.99 ? h2 - band - 0.15 : h2 - band }
	]);
	const n = kind === 'cabin' ? 4 : kind === 'lander' ? 3 : 6;
	const angles = Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2 + 0.3);
	// set a little into the wall, so a flat frame's corners stay inside the cylinder
	portholes(b, wall - 0.03, kind === 'lander' ? h2 * 0.2 : 0, angles, Math.min(0.3, H * 0.2));
	if (detail.extras >= 1) {
		for (const y of [-h2 * 0.5, h2 * 0.5]) raisedRing(b, 'metal', wall, y, 0.04, 0.01);
		if (kind === 'hab' || kind === 'lab') {
			for (let i = 0; i < 4; i++) {
				const a = (i / 4) * Math.PI * 2;
				panelInset(
					b,
					kind === 'lab' ? 'paint-secondary' : 'metal',
					wall,
					a,
					-h2 * 0.25,
					0.35,
					H * 0.3
				);
				// handrails along the module
				stubPipe(
					b,
					'paint-accent',
					[Math.sin(a + 0.4) * (wall + 0.02), -h2 * 0.7, Math.cos(a + 0.4) * (wall + 0.02)],
					[0, 1, 0],
					H * 0.6,
					0.012,
					6
				);
			}
		}
	}
}

/** A cupola: a joint below, a dome of window panes above (a bottom node only... and a top lid). */
export function cupola(ctx: GenContext): void {
	const { radius: R, height: H, builder: b } = ctx;
	const h2 = H / 2;
	bottomJoint(b, R, -h2, 0.06, R * 0.95);
	b.revolve('paint-primary', [
		{ r: R * 0.95, y: -h2 + 0.06 },
		{ r: R * 0.95, y: -h2 + H * 0.35 },
		{ r: R * 0.7, y: h2 - 0.1 },
		{ r: R * 0.45, y: h2 },
		{ r: 0, y: h2 }
	]);
	const n = ctx.detail.extras >= 1 ? 6 : 3;
	for (let i = 0; i < n; i++) {
		const a = (i / n) * Math.PI * 2;
		const q = new Quaternion()
			.setFromAxisAngle(new Vector3(0, 1, 0), a)
			.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.5));
		const out = new Vector3(0, 0, 1).applyQuaternion(q);
		const rr = R * 0.83;
		const y = -h2 + H * 0.6;
		const pane = roundedRect(R * 0.55, H * 0.3, 0.03) as Shape;
		b.extrude(
			'glass',
			pane,
			0.012,
			new Matrix4().compose(
				new Vector3(Math.sin(a) * rr, y, Math.cos(a) * rr).addScaledVector(out, -0.004),
				q,
				new Vector3(1, 1, 1)
			)
		);
	}
	b.revolve('glass', [
		{ r: R * 0.42, y: h2 - 0.004 },
		{ r: 0, y: h2 + 0.0 }
	]);
}

/** Radiator panels: a radial mount and a stack of thin panels with coolant lines. */
export function radiator(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const b = ctx.builder;
	const hx = sx / 2;
	b.box('dark-metal', [sx * 0.2, sy * 0.3, sz * 0.3], [-hx + sx * 0.1, 0, 0]);
	b.box('metal', [sx * 0.8, 0.03, 0.03], [-hx + sx * 0.6, 0, 0]);
	b.box('paint-primary', [sx * 0.75, sy, 0.015], [hx - sx * 0.375, 0, 0]);
	for (let i = 0; i < 8; i++)
		b.box('metal', [0.012, sy * 0.95, 0.02], [hx - sx * 0.7 + (i * sx * 0.65) / 7, 0, 0]);
}

/** A satellite bus: a foil box with mount faces, a joint at each end, an instrument deck. */
export function satelliteBus(ctx: GenContext): void {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const node = ctx.param('node', 1.25, 0.3, R * 2) / 2;
	bottomJoint(b, node, -h2, 0.05, node * 0.9);
	topJoint(b, node, h2, 0.05, node * 0.9);
	const w = R * Math.SQRT2 * 0.98;
	// the box stops short of the joints' 5 cm seam bands (ADR 0212)
	b.box('foil', [w, H - 0.14, w], [0, 0, 0]);
	if (detail.extras >= 1) {
		for (let i = 0; i < 4; i++) {
			const a = (i / 4) * Math.PI * 2;
			panelInset(
				b,
				i % 2 ? 'paint-primary' : 'paint-secondary',
				w / 2,
				a,
				H * 0.1,
				w * 0.6,
				H * 0.4,
				0.004
			);
		}
		louvres(b, 'metal', w / 2, Math.PI / 2, -h2 + 0.15, 6, { width: w * 0.5, pitch: 0.05 });
		boltCircle(b, 'metal', 8, node * 0.8, h2 - 0.05, { face: 'side', size: 0.02 });
	}
}

/**
 * A space telescope: a long tube with baffle rings and a hinged aperture door at the top, an
 * instrument section and a joint at the bottom (its only node). The door opens by the deploy
 * progress (the part's `stock.animate`).
 */
export function telescope(ctx: GenContext): GeneratedPart {
	const { radius: R, height: H, builder: b } = ctx;
	const h2 = H / 2;
	const node = ctx.param('node', 2.5, 0.5, R * 2) / 2;
	const tube = R * 0.92;
	bottomJoint(b, node, -h2, 0.06, Math.min(node, tube) * 0.95);
	const aft = -h2 + H * 0.28;
	b.revolve('foil', [
		{ r: Math.min(node, tube) * 0.95, y: -h2 + 0.06 },
		{ r: tube, y: -h2 + 0.1 },
		{ r: tube, y: aft }
	]);
	b.revolve('paint-primary', [
		{ r: tube, y: aft },
		{ r: tube, y: h2 - 0.06 },
		{ r: tube * 0.97, y: h2 - 0.04 }
	]);
	// the dark inside, seen through the open aperture
	b.revolve('nozzle-inner', [
		{ r: tube * 0.94, y: h2 - 0.04 },
		{ r: tube * 0.94, y: aft + 0.2 }
	]);
	for (let k = 1; k <= 4; k++)
		raisedRing(b, 'metal', tube, aft + ((h2 - aft) * k) / 5, 0.05, 0.012);
	hazardStripe(b, tube, aft - 0.08, aft - 0.02, { count: 24, out: 0.003 });
	const door: Piece = {
		build: (g) => {
			const lid = new Shape();
			lid.absarc(0, 0, tube, 0, Math.PI * 2, false);
			g.extrude(
				'paint-primary',
				lid,
				0.04,
				new Matrix4().compose(
					new Vector3(0, 0, tube),
					new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2),
					new Vector3(1, 1, 1)
				)
			);
		},
		pose: (o, p) => {
			o.position.set(0, h2 - 0.04, -tube);
			o.rotation.set(-phase(p, 0, 1) * 1.9, 0, 0);
		}
	};
	return { dynamic: pieces(ctx, [door]) };
}

/** A sensor boom: a radial mount, a long thin boom and a sensor box at its end. */
export function boom(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const b = ctx.builder;
	const hx = sx / 2;
	b.box('dark-metal', [0.06, sy, sz], [-hx + 0.03, 0, 0]);
	b.cylinder('metal', 0.015, sx - 0.12, [(-hx + 0.06 + hx - 0.08) / 2, 0, 0], {
		tiltZ: Math.PI / 2,
		segments: 8
	});
	b.box('paint-secondary', [0.08, sy * 0.8, sz * 0.8], [hx - 0.04, 0, 0]);
}

/**
 * A lander's descent stage (Apollo LM kind): an octagonal box in gold foil with a recessed engine,
 * four mount pads for single legs, a joint on top for the ascent stage.
 */
export function descentStage(ctx: GenContext): void {
	const { radius: R, height: H, builder: b } = ctx;
	const h2 = H / 2;
	const top = ctx.param('top', 0.625, 0.2, R);
	topJoint(b, top, h2, 0.05, top * 0.9);
	const corner = R * 0.98;
	const oct = new Shape();
	for (let k = 0; k < 8; k++) {
		const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
		const x = Math.sin(a) * corner;
		const z = Math.cos(a) * corner;
		if (k === 0) oct.moveTo(x, z);
		else oct.lineTo(x, z);
	}
	oct.closePath();
	const up = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
	b.extrude(
		'foil',
		oct,
		H - 0.25,
		new Matrix4().compose(new Vector3(0, -h2 + 0.2, 0), up, new Vector3(1, 1, 1))
	);
	b.box('dark-metal', [corner * 1.2, 0.04, corner * 1.2], [0, h2 - 0.07, 0]);
	// the engine bell recessed under the stage
	ribbedBell(
		b,
		{ throat: R * 0.12, exit: R * 0.35, length: 0.35, rings: 2, slot: 'bronze', flare: 0.7 },
		[0, -h2 + 0.35, 0]
	);
	b.revolve('dark-metal', [
		{ r: R * 0.4, y: -h2 + 0.2 },
		{ r: R * 0.13, y: -h2 + 0.34 }
	]);
}

/**
 * A lander's ascent cabin: a faceted crew cabin with triangular windows, a docking collar on top,
 * an ascent engine bell below, RCS stubs on the corners and a small dish.
 */
export function ascentCabin(ctx: GenContext): void {
	const { radius: R, height: H, builder: b } = ctx;
	const h2 = H / 2;
	const top = ctx.param('top', 0.3125, 0.1, R);
	const bottom = ctx.param('bottom', 0.625, 0.2, R);
	bottomJoint(b, bottom, -h2, 0.05, bottom * 0.9);
	topJoint(b, top, h2, 0.08, top * 0.9);
	// the faceted body: an irregular hexagon prism, front face forward (+Z)
	const w = R * 0.95;
	const body = new Shape();
	const pts: [number, number][] = [
		[-w * 0.9, -w * 0.5],
		[-w * 0.6, w * 0.6],
		[0, w * 0.95],
		[w * 0.6, w * 0.6],
		[w * 0.9, -w * 0.5],
		[0, -w * 0.8]
	];
	pts.forEach(([x, z], i) => (i === 0 ? body.moveTo(x, z) : body.lineTo(x, z)));
	body.closePath();
	const up = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
	const y0 = -h2 + 0.05;
	const bodyH = H - 0.05 - 0.08 - 0.12;
	// bare aluminium, as Apollo's ascent stage (plan 355), black panels round its lower faces
	b.extrude(
		'metal',
		body,
		bodyH,
		new Matrix4().compose(new Vector3(0, y0, 0), up, new Vector3(1, 1, 1))
	);
	b.extrude(
		'dark-metal',
		body,
		bodyH * 0.3,
		new Matrix4().compose(new Vector3(0, y0 + 0.002, 0), up, new Vector3(1.012, 1, 1.012))
	);
	b.revolve('foil', [
		{ r: top * 0.9, y: y0 + bodyH },
		{ r: Math.min(w * 0.55, R), y: y0 + bodyH },
		{ r: top * 1.1, y: h2 - 0.08 }
	]);
	// two triangular windows on the front faces
	for (const s of [-1, 1]) {
		const tri = new Shape();
		tri.moveTo(0, 0);
		tri.lineTo(0.18, 0);
		tri.lineTo(0, 0.22);
		tri.closePath();
		const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), s * 0.6);
		b.extrude(
			'glass',
			tri,
			0.01,
			new Matrix4().compose(
				new Vector3(s * w * 0.32, y0 + bodyH * 0.55, w * 0.8),
				q,
				new Vector3(s, 1, 1)
			)
		);
	}
	for (const [x, z] of [
		[-w * 0.85, -w * 0.45],
		[w * 0.85, -w * 0.45],
		[-w * 0.55, w * 0.55],
		[w * 0.55, w * 0.55]
	] as const)
		b.box('dark-metal', [0.08, 0.08, 0.08], [x, y0 + bodyH * 0.8, z]);
	rim(b, 'dark-metal', bottom * 0.9, y0 + 0.02, 0.03, 0.006);
}

/**
 * A single landing leg on a hull (radial node on -X): a hinge box; deployed, a strut and a brace
 * swing out and down to a round foot at `spread` out and `drop` down (the module's foot).
 */
export function singleLeg(ctx: GenContext): GeneratedPart {
	const [sx, sy, sz] = ctx.size;
	const b = ctx.builder;
	const hx = sx / 2;
	const spread = ctx.param('spread', 1.2, 0.3, 4);
	const drop = ctx.param('drop', 0.8, 0.1, 4);
	const foot = ctx.param('footSize', 0.3, 0.1, 1);
	b.box('dark-metal', [sx * 0.5, sy, sz], [-hx + sx * 0.25, 0, 0]);
	b.box('paint-primary', [sx * 0.5, sy * 0.85, sz * 0.7], [hx - sx * 0.25, 0, 0]);
	const hingeY = sy * 0.35;
	const list: Piece[] = [
		{
			build: (g) => {
				g.cylinder('metal', 0.035, 1, [0, -0.5, 0], { segments: 10 });
			},
			pose: (o, p) => {
				const e = phase(p, 0, 1);
				// stowed: along the hull (pointing down); deployed: to the foot
				const tx = spread * e + (hx - 0.03) * (1 - e);
				const ty = -drop * e + (hingeY - sy * 0.8) * (1 - e);
				const dx = tx - (hx - 0.03);
				const dy = ty - hingeY;
				const len = Math.max(0.05, Math.hypot(dx, dy));
				o.position.set(hx - 0.03, hingeY, 0);
				o.rotation.set(0, 0, Math.atan2(dx, -dy));
				o.scale.set(1, len, 1);
			}
		},
		{
			build: (g) => {
				g.cylinder('dark-metal', foot / 2, 0.05, [0, 0.025, 0], { segments: 16 });
				g.cylinder('metal', 0.05, 0.08, [0, 0.09, 0], { segments: 10 });
			},
			pose: (o, p) => {
				const e = phase(p, 0, 1);
				o.visible = e > 0.05;
				o.position.set(
					spread * e + (hx - 0.03) * (1 - e),
					-drop * e + (hingeY - sy * 0.8) * (1 - e) - 0.0,
					0
				);
			}
		}
	];
	return { dynamic: pieces(ctx, list) };
}
