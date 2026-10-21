/**
 * Parachute (plan 209): a packed canister (a stack chute's drum and cap, or a radial chute's box)
 * and the canopy, a dynamic piece that follows the module's `canopy` flag. Up to `SEMI_CANOPY`
 * (0.3) the canopy is a narrow streamer on long lines, the semi-deployed state; from there it
 * opens to a dome of `canopy` metres radius. Hidden at 0 (stowed, armed, cut or torn).
 */
import {
	CylinderGeometry,
	Group,
	Matrix4,
	Mesh,
	Quaternion,
	Shape,
	SphereGeometry,
	Vector3,
	type BufferGeometry,
	type Material
} from 'three';
import type { SlotName } from '../builder.ts';
import type { GenContext, GeneratedPart } from '../registry.ts';
import { roundedRect } from './capsule.ts';
import { stubPipe } from './kit.ts';

/** The module's semi-deployed opening on the deploy flag (`stock` `SEMI_CANOPY`). */
export const SEMI_OPENING = 0.3;
const LINES = 8;

/** Canopy radius and line length as fractions of the full canopy, for a deploy progress 0..1. */
export function canopyShape(progress: number): { radius: number; lines: number; visible: boolean } {
	const p = Math.min(1, Math.max(0, progress));
	if (p <= 0.002) return { radius: 0, lines: 0, visible: false };
	if (p <= SEMI_OPENING) {
		const s = p / SEMI_OPENING;
		return { radius: 0.02 + 0.1 * s, lines: 0.5 + 0.6 * s, visible: true };
	}
	const f = (p - SEMI_OPENING) / (1 - SEMI_OPENING);
	const e = f * f * (3 - 2 * f);
	return { radius: 0.12 + 0.88 * e, lines: 1.1 + 0.1 * e, visible: true };
}

/** Default wall slope (radius lost per metre of height) of a stack chute: the stock pod's cone. */
export const POD_TAPER = 0.6;

/**
 * Parachutes (plan 209, remodelled in plan 278, ADR 0260).
 * - A stack chute is a short frustum whose wall continues the pod's slope (`params.taper`, radius
 *   lost per metre), white with a two-tone cap: the pod and its chute read as one shape, not a can
 *   on a lid. `params.drogue` gives the cap a point.
 * - `params.ring`: a docking chute ring. A shell on the pod's apex holds three mains around a
 *   central tunnel and has its own top node for a docking port; its canopies open around the port.
 * - `params.radial`: a slim rounded pack on the hull with a cap and two straps.
 */
export function parachute(ctx: GenContext): GeneratedPart {
	const { radius: R, height: H, builder: b, size, detail } = ctx;
	const h2 = H / 2;
	const canopyRadius = ctx.param('canopy', 11, 1, 40);
	if (ctx.visual.params?.radial === true) {
		radialPack(ctx);
		return { dynamic: canopyDynamic(ctx, canopyRadius, h2) };
	}
	if (ctx.visual.params?.ring === true) {
		const tunnel = ctx.param('tunnel', 0.3125, 0.1, R);
		const anchors = chuteRing(ctx, tunnel);
		return {
			dynamic: canopyDynamic(ctx, canopyRadius / Math.sqrt(anchors.length), h2, anchors)
		};
	}
	const taper = ctx.param('taper', POD_TAPER, 0, 1.5);
	const drogue = ctx.visual.params?.drogue === true;
	const seat = Math.min(0.03, H * 0.1);
	// the cap takes the top third (a drogue's pointed cap the top half)
	const capH = H * (drogue ? 0.5 : 0.36);
	const bodyTop = h2 - capH;
	const rAt = (y: number): number => Math.max(0.02, R - taper * (y - (-h2 + seat)));
	const rTop = rAt(bodyTop);
	// the seat ring on the pod's collar, then the white body continuing the pod's slope
	b.revolve('dark-metal', [
		{ r: 0, y: -h2 },
		{ r: R, y: -h2 },
		{ r: R, y: -h2 + seat }
	]);
	b.revolve('paint-primary', [
		{ r: R, y: -h2 + seat },
		{ r: rTop, y: bodyTop }
	]);
	// a thin dark seam where the cap pushes off, then the cap
	b.revolve('dark-metal', [
		{ r: rTop, y: bodyTop },
		{ r: rTop + 0.006, y: bodyTop + 0.004 },
		{ r: rTop + 0.006, y: bodyTop + 0.016 },
		{ r: rTop * 0.985, y: bodyTop + 0.02 }
	]);
	const cap: { r: number; y: number; smooth?: boolean }[] = drogue
		? [
				{ r: rTop * 0.985, y: bodyTop + 0.02 },
				{ r: rTop * 0.7, y: bodyTop + capH * 0.45, smooth: true },
				{ r: rTop * 0.25, y: h2 - 0.02, smooth: true },
				{ r: 0, y: h2 }
			]
		: [
				{ r: rTop * 0.985, y: bodyTop + 0.02 },
				{ r: rTop * 0.9, y: bodyTop + capH * 0.55, smooth: true },
				{ r: rTop * 0.55, y: h2 - 0.008, smooth: true },
				{ r: 0, y: h2 }
			];
	b.revolve('paint-accent', cap);
	if (detail.extras >= 1) {
		// four retaining clips on the body, a band of the secondary paint under the seam
		const clips = 4;
		const yc = (-h2 + seat + bodyTop) / 2;
		const rc = rAt(yc);
		for (let i = 0; i < clips; i++) {
			const a = ((i + 0.5) / clips) * Math.PI * 2;
			b.box(
				'dark-metal',
				[0.035, (bodyTop - (-h2 + seat)) * 0.55, 0.012],
				[Math.sin(a) * (rc + 0.002), yc, Math.cos(a) * (rc + 0.002)],
				a
			);
		}
		const bandTop = bodyTop - 0.006;
		const bandBottom = bandTop - Math.min(0.03, (bodyTop + h2) * 0.18);
		b.revolve('paint-secondary', [
			{ r: rAt(bandBottom) + 0.003, y: bandBottom },
			{ r: rAt(bandTop) + 0.003, y: bandTop }
		]);
	}
	return { dynamic: canopyDynamic(ctx, canopyRadius, h2) };
}

/** A slim rounded pack on the hull (radial node on -X): body, cap, two straps, a mounting plate. */
function radialPack(ctx: GenContext): void {
	const { height: H, builder: b, size, detail } = ctx;
	const h2 = H / 2;
	const depth = size[0] * 0.8;
	const w = size[2] * 0.82;
	const x0 = -size[0] / 2;
	const corner = Math.min(w, depth) * 0.45;
	const toY = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
	// the body: a rounded rectangle (depth along X, width along Z) extruded up, white
	const body = roundedRect(depth, w, corner) as Shape;
	const bodyH = H * 0.74;
	b.extrude(
		'paint-primary',
		body,
		bodyH,
		new Matrix4().compose(
			new Vector3(x0 + 0.02 + depth / 2, -h2 + 0.01, 0),
			toY,
			new Vector3(1, 1, 1)
		)
	);
	// the cap the canopy pushes off: accent, a little proud
	const cap = roundedRect(depth + 0.008, w + 0.008, corner + 0.004) as Shape;
	b.extrude(
		'paint-accent',
		cap,
		H * 0.24,
		new Matrix4().compose(
			new Vector3(x0 + 0.02 + depth / 2, -h2 + 0.01 + bodyH, 0),
			toY,
			new Vector3(1, 1, 1)
		)
	);
	// the mounting plate on the hull
	b.box('dark-metal', [0.02, H * 0.9, w * 0.7], [x0 + 0.01, 0, 0]);
	if (detail.extras >= 1) {
		for (const t of [0.3, 0.62]) {
			const strap = roundedRect(depth + 0.006, w + 0.006, corner + 0.003) as Shape;
			b.extrude(
				'dark-metal',
				strap,
				0.025,
				new Matrix4().compose(
					new Vector3(x0 + 0.02 + depth / 2, -h2 + 0.01 + bodyH * t, 0),
					toY,
					new Vector3(1, 1, 1)
				)
			);
		}
	}
}

/**
 * The docking chute ring's shell: 0.625 m joints at both faces, a shoulder that steps out over the
 * pod's collar and tapers back to the tunnel, three canopy caps around it. Returns the canopy
 * anchors (x, z) on the top face.
 */
function chuteRing(ctx: GenContext, tunnel: number): Array<[number, number]> {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const band = 0.05;
	const shoulder = Math.min(R * 0.97, tunnel + 0.05);
	const yShoulder = -h2 + band + 0.04;
	// the shell meets the collar a little below the top joint's 5 cm seam band (ADR 0212)
	const yTaper = h2 - band - 0.01;
	const slope = (shoulder - (tunnel + 0.004)) / (yTaper - yShoulder);
	const rAt = (y: number): number => shoulder - slope * (y - yShoulder);
	// bottom joint, shoulder, white shell tapering in, top collar for the port
	b.revolve('dark-metal', [
		{ r: 0, y: -h2 },
		{ r: tunnel, y: -h2 },
		{ r: tunnel, y: -h2 + band }
	]);
	b.revolve('paint-primary', [
		{ r: tunnel, y: -h2 + band },
		{ r: shoulder, y: yShoulder },
		{ r: tunnel + 0.004, y: yTaper }
	]);
	b.revolve('dark-metal', [
		{ r: tunnel + 0.004, y: yTaper },
		{ r: tunnel, y: yTaper + 0.006 },
		{ r: tunnel, y: h2 },
		{ r: 0, y: h2 }
	]);
	const anchors: Array<[number, number]> = [];
	const count = 3;
	const capR = Math.min(0.08, (yTaper - yShoulder) * 0.32);
	for (let i = 0; i < count; i++) {
		const a = (i / count) * Math.PI * 2 + Math.PI / 6;
		const y = (yShoulder + yTaper) / 2;
		const r = rAt(y);
		const out: [number, number, number] = [Math.sin(a), slope, Math.cos(a)];
		// a canopy cap: a short accent disc on the sloping shell, with a dark rim
		stubPipe(
			b,
			'paint-accent',
			[Math.sin(a) * (r - 0.012), y, Math.cos(a) * (r - 0.012)],
			out,
			0.028,
			capR,
			14
		);
		if (detail.extras >= 1)
			stubPipe(
				b,
				'dark-metal',
				[Math.sin(a) * (r - 0.014), y, Math.cos(a) * (r - 0.014)],
				out,
				0.02,
				capR + 0.008,
				14
			);
		anchors.push([Math.sin(a) * tunnel * 0.9, Math.cos(a) * tunnel * 0.9]);
	}
	return anchors;
}

/**
 * The canopy as a dynamic piece (a stack or radial chute's, and the suit's, plan 249): `anchorY` is
 * where the lines meet the part, in the part frame, and `canopyRadius` the full dome's radius, m.
 * `anchors` (x, z) gives one canopy per point (the docking chute ring's three, plan 278); the
 * default is one canopy on the axis.
 */
export function canopyDynamic(
	ctx: GenContext,
	canopyRadius: number,
	anchorY: number,
	anchors: ReadonlyArray<readonly [number, number]> = [[0, 0]]
): NonNullable<GeneratedPart['dynamic']> {
	const { detail } = ctx;
	return (material: (slot: SlotName) => Material) => {
		const root = new Group();
		root.name = 'canopy';
		// the canopy follows the preset's detail like the revolved parts
		const segments = Math.max(8, Math.round(detail.segments * 0.75));
		const rings = Math.max(4, Math.round(segments / 3));
		// a unit hemisphere, open side down; the inside drawn too (seen from the capsule)
		const outer = new SphereGeometry(1, segments, rings, 0, Math.PI * 2, 0, Math.PI / 2);
		const inner = outer.clone();
		const index = inner.getIndex();
		if (index) {
			const a = index.array;
			for (let i = 0; i < a.length; i += 3) {
				const t = a[i + 1]!;
				a[i + 1] = a[i + 2]!;
				a[i + 2] = t;
			}
			index.needsUpdate = true;
		}
		const line: BufferGeometry = new CylinderGeometry(0.012, 0.012, 1, 3, 1).translate(0, 0.5, 0);
		// several canopies lean apart, as a cluster of mains does
		const spread = anchors.length > 1 ? 0.35 : 0;
		const canopies = anchors.map(([ax, az], k) => {
			const group = new Group();
			group.name = anchors.length > 1 ? `canopy-${k}` : 'canopy-0';
			group.position.set(ax, 0, az);
			const dome = new Group();
			dome.name = 'dome';
			for (const [g, slot] of [
				[outer, 'paint-primary'],
				[inner, 'paint-accent']
			] as const) {
				const m = new Mesh(g, material(slot));
				m.castShadow = true;
				m.receiveShadow = true;
				dome.add(m);
			}
			group.add(dome);
			const lines: Mesh[] = [];
			for (let i = 0; i < LINES; i++) {
				const m = new Mesh(line, material('dark-metal'));
				m.name = `line-${i}`;
				lines.push(m);
				group.add(m);
			}
			const len = Math.hypot(ax, az);
			const lean: [number, number] =
				len > 1e-6 ? [(ax / len) * spread, (az / len) * spread] : [0, 0];
			root.add(group);
			return { dome, lines, lean };
		});
		const animate = (progress: number): void => {
			const s = canopyShape(progress);
			root.visible = s.visible;
			if (!s.visible) return;
			const r = canopyRadius * s.radius;
			const length = canopyRadius * s.lines;
			for (const c of canopies) {
				// the skirt sits `length` above the anchor (leaning out for a cluster); the dome is flattened like a real canopy
				const skirt = anchorY + length;
				const cx = c.lean[0] * length;
				const cz = c.lean[1] * length;
				c.dome.position.set(cx, skirt, cz);
				c.dome.scale.set(r, r * (s.radius < 0.2 ? 2.5 : 0.6), r);
				c.lines.forEach((m, i) => {
					const a = (i / LINES) * Math.PI * 2;
					const dx = cx + Math.cos(a) * r;
					const dy = skirt - anchorY;
					const dz = cz + Math.sin(a) * r;
					const lineLen = Math.hypot(dx, dy, dz);
					m.position.set(0, anchorY, 0);
					m.scale.set(1, lineLen, 1);
					// turn the unit +Y line toward the rim point
					m.quaternion.setFromUnitVectors(UP, new Vector3(dx, dy, dz).divideScalar(lineLen));
				});
			}
		};
		animate(0);
		return {
			object: root,
			animate,
			triangles: (segments * rings * 2 * 2 + LINES * 6) * anchors.length,
			dispose() {
				for (const g of [outer, inner, line]) g.dispose();
			}
		};
	};
}

const UP = new Vector3(0, 1, 0);
