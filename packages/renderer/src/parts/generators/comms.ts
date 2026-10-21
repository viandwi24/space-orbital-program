/**
 * Antennas and instruments (plan 280, ADR 0259). Radial parts mount on their -X face.
 * - `antenna-whip`: a base; deployed, a mast swings up from the hull and telescopes out.
 * - `antenna-dish`: a base; deployed, an arm swings out and the dish opens like an umbrella.
 * - `antenna-relay`: a stack dish on a mast (only a bottom node), always open.
 * - `instrument`: one radial science instrument, its look by `params.kind`.
 * - `container`: a radial box of supplies, filters or data (`params.kind`).
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { GeometryBuilder } from '../builder.ts';
import type { GeneratedPart, GenContext } from '../registry.ts';
import { revolve, type ProfilePoint } from '../revolve.ts';
import { phase, pieces, type Piece } from './dyn.ts';
import { boltCircle, rim, stubPipe } from './kit.ts';

/** A paraboloid dish of rim radius `r` and depth `d`, its axis along +X, rim at x = `at`. */
function dish(b: GeometryBuilder, r: number, d: number, at: number, ribs = 8): void {
	const steps = 8;
	// walk the inner (front) face from the rim to the centre, then the back from the centre out
	const front: ProfilePoint[] = [];
	for (let i = steps; i >= 0; i--) {
		const t = i / steps;
		front.push({ r: r * t, y: d * t * t, smooth: i > 0 && i < steps });
	}
	const back: ProfilePoint[] = front.map((p) => ({ ...p, y: p.y - 0.012 })).reverse();
	const toX = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI / 2);
	const m = new Matrix4().compose(new Vector3(at - d, 0, 0), toX, new Vector3(1, 1, 1));
	b.add('paint-primary', revolve(front, { segments: b.segments }), m);
	b.add('metal', revolve(back, { segments: b.segments }), m);
	// ribs on the back and the feed horn on three struts
	for (let i = 0; i < ribs; i++) {
		const a = (i / ribs) * Math.PI * 2;
		b.box(
			'metal',
			[0.012, r * 0.95, 0.012],
			[at - d - 0.01, Math.cos(a) * r * 0.48, Math.sin(a) * r * 0.48],
			0,
			0
		);
	}
	const horn = at + r * 0.55;
	for (let i = 0; i < 3; i++) {
		const a = (i / 3) * Math.PI * 2;
		const from: [number, number, number] = [
			at - d * 0.3,
			Math.cos(a) * r * 0.85,
			Math.sin(a) * r * 0.85
		];
		const dir: [number, number, number] = [horn - from[0], -from[1], -from[2]];
		const len = Math.hypot(...dir);
		stubPipe(b, 'metal', from, dir, len, 0.006, 6);
	}
	b.cylinder('dark-metal', r * 0.08, r * 0.15, [horn, 0, 0], { tiltZ: Math.PI / 2, segments: 12 });
}

export function antennaWhip(ctx: GenContext): GeneratedPart {
	const [sx, sy, sz] = ctx.size;
	const b = ctx.builder;
	const hx = sx / 2;
	const length = ctx.param('length', 1.2, 0.2, 5);
	b.box('dark-metal', [sx * 0.4, sy, sz], [-hx + sx * 0.2, 0, 0]);
	b.cylinder('paint-primary', Math.min(sy, sz) * 0.35, sx * 0.6, [-hx + sx * 0.7, 0, 0], {
		tiltZ: Math.PI / 2,
		segments: 16
	});
	b.box('paint-accent', [0.01, sy * 0.25, sz * 0.25], [hx - 0.005, 0, 0]);
	const segs = 3;
	const list: Piece[] = [];
	for (let k = 0; k < segs; k++) {
		const r = 0.012 * (1 - k * 0.25);
		const segL = length / segs;
		list.push({
			build: (g) => {
				g.cylinder('metal', r, segL, [0, segL / 2, 0], { segments: 8 });
				if (k === segs - 1)
					g.cylinder('dark-metal', r * 2.2, r * 2.2, [0, segL, 0], { segments: 8 });
			},
			pose: (o, p) => {
				// swing up (0 → 0.3), then telescope out
				const lift = phase(p, 0, 0.3);
				const ext = phase(p, 0.3, 1);
				o.visible = p > 0.001;
				o.position.set(hx - 0.02 + 0.02 * lift, 0, 0);
				o.rotation.set(0, 0, -(1 - lift) * (Math.PI / 2));
				o.translateY(segL * k * ext);
				o.scale.set(1, k === 0 ? Math.max(0.05, lift) : Math.max(0.01, ext), 1);
			}
		});
	}
	return { dynamic: pieces(ctx, list) };
}

export function antennaDish(ctx: GenContext): GeneratedPart {
	const [sx, sy, sz] = ctx.size;
	const b = ctx.builder;
	const hx = sx / 2;
	const r = ctx.param('dish', 0.45, 0.1, 3);
	const arm = ctx.param('arm', 0.35, 0.05, 3);
	b.box('dark-metal', [sx * 0.3, sy, sz], [-hx + sx * 0.15, 0, 0]);
	b.box('paint-primary', [sx * 0.6, sy * 0.8, sz * 0.8], [-hx + sx * 0.55, 0, 0]);
	boltCircle(b, 'metal', 4, Math.min(sy, sz) * 0.3, 0);
	const list: Piece[] = [
		{
			build: (g) => {
				g.box('metal', [arm, 0.035, 0.035], [arm / 2, 0, 0]);
				g.box('dark-metal', [0.06, 0.08, 0.08], [arm, 0, 0]);
			},
			pose: (o, p) => {
				const e = phase(p, 0, 0.35);
				o.visible = p > 0.001;
				o.position.set(hx - 0.01, 0, 0);
				o.scale.set(Math.max(0.02, e), 1, 1);
			}
		},
		{
			build: (g) => dish(g, r, r * 0.35, 0),
			pose: (o, p) => {
				const out = phase(p, 0, 0.35);
				const open = phase(p, 0.35, 1);
				o.visible = p > 0.001;
				o.position.set(hx - 0.01 + arm * out + r * 0.35, 0, 0);
				// closed, the ribs fold toward the axis like an umbrella
				const s = 0.12 + 0.88 * open;
				o.scale.set(1, s, s);
			}
		}
	];
	return { dynamic: pieces(ctx, list) };
}

/** A relay dish on a mast over a stack plate (a bottom node only). */
export function antennaRelay(ctx: GenContext): void {
	const { radius: R, height: H, builder: b } = ctx;
	const h2 = H / 2;
	const plate = 0.06;
	b.revolve('dark-metal', [
		{ r: 0, y: -h2 },
		{ r: 0.625, y: -h2 },
		{ r: 0.625, y: -h2 + plate },
		{ r: 0, y: -h2 + plate }
	]);
	const mastTop = h2 - R * 0.45;
	b.cylinder('metal', 0.05, mastTop - (-h2 + plate), [0, (mastTop - h2 + plate) / 2, 0], {
		segments: 12
	});
	// the dish faces up
	const front: ProfilePoint[] = [];
	const steps = 10;
	const d = R * 0.3;
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		front.push({ r: R * 0.98 * t, y: mastTop + d * t * t, smooth: i > 0 && i < steps });
	}
	// outside (back) walks bottom to top from the centre out; the face walks from the rim in
	b.revolve(
		'metal',
		front.map((p) => ({ ...p, y: p.y - 0.015 }))
	);
	// the dish's face looks up and in, so it is walked from the rim down to the centre
	b.add('paint-primary', revolve([...front].reverse(), { segments: b.segments }));
	rim(b, 'dark-metal', R * 0.98, mastTop + d, 0.03, 0.004);
	const horn = Math.min(h2 - 0.02, mastTop + d + R * 0.35);
	for (let i = 0; i < 3; i++) {
		const a = (i / 3) * Math.PI * 2;
		const from: [number, number, number] = [
			Math.cos(a) * R * 0.8,
			mastTop + d * 0.64,
			Math.sin(a) * R * 0.8
		];
		const dir: [number, number, number] = [-from[0], horn - from[1], -from[2]];
		stubPipe(b, 'metal', from, dir, Math.hypot(...dir), 0.008, 6);
	}
	b.cylinder('dark-metal', R * 0.07, R * 0.12, [0, horn - R * 0.06, 0], { segments: 12 });
}

/** One radial science instrument; `params.kind` picks the look. */
export function instrument(ctx: GenContext): GeneratedPart | void {
	const [sx, sy, sz] = ctx.size;
	const b = ctx.builder;
	const hx = sx / 2;
	const kind = String(ctx.visual.params?.kind ?? 'box');
	b.box('dark-metal', [sx * 0.2, sy, sz], [-hx + sx * 0.1, 0, 0]);
	const bodyX = -hx + sx * 0.2;
	const depth = sx * 0.55;
	switch (kind) {
		case 'thermometer': {
			b.box('paint-primary', [depth, sy * 0.4, sz * 0.8], [bodyX + depth / 2, -sy * 0.3, 0]);
			b.cylinder('glass', 0.014, sy * 0.55, [bodyX + depth * 0.6, sy * 0.2, 0], { segments: 10 });
			b.cylinder('paint-accent', 0.02, 0.04, [bodyX + depth * 0.6, -sy * 0.06, 0], {
				segments: 10
			});
			break;
		}
		case 'barometer': {
			b.cylinder('paint-primary', Math.min(sy, sz) * 0.4, depth, [bodyX + depth / 2, 0, 0], {
				tiltZ: Math.PI / 2,
				segments: 18
			});
			b.cylinder('glass', Math.min(sy, sz) * 0.3, 0.02, [bodyX + depth + 0.01, 0, 0], {
				tiltZ: Math.PI / 2,
				segments: 18
			});
			b.box(
				'dark-metal',
				[0.006, Math.min(sy, sz) * 0.25, 0.01],
				[bodyX + depth + 0.022, 0.02, 0],
				0,
				0.6
			);
			break;
		}
		case 'seismometer': {
			b.box('paint-primary', [depth, sy * 0.6, sz * 0.8], [bodyX + depth / 2, 0, 0]);
			for (const z of [-sz * 0.3, sz * 0.3])
				stubPipe(b, 'metal', [bodyX + depth, -sy * 0.25, z], [1, -0.6, 0], sx * 0.22, 0.01, 6);
			break;
		}
		case 'atmosphere': {
			b.cylinder(
				'paint-primary',
				Math.min(sy, sz) * 0.32,
				depth * 0.7,
				[bodyX + depth * 0.35, 0, 0],
				{ tiltZ: Math.PI / 2, segments: 16 }
			);
			b.cylinder('dark-metal', Math.min(sy, sz) * 0.42, depth * 0.3, [bodyX + depth * 0.85, 0, 0], {
				tiltZ: Math.PI / 2,
				radiusTop: Math.min(sy, sz) * 0.2,
				segments: 16
			});
			break;
		}
		case 'surface': {
			b.box('paint-primary', [depth, sy * 0.5, sz * 0.7], [bodyX + depth / 2, sy * 0.15, 0]);
			stubPipe(b, 'metal', [bodyX + depth * 0.7, sy * 0.0, 0], [0.3, -1, 0], sy * 0.45, 0.012, 8);
			b.box('dark-metal', [0.06, 0.03, 0.08], [bodyX + depth * 0.82, -sy * 0.43, 0]);
			break;
		}
		case 'goo':
		case 'materials': {
			const goo = kind === 'goo';
			if (goo)
				b.cylinder('paint-primary', Math.min(sy, sz) * 0.4, sy * 0.9, [bodyX + depth / 2, 0, 0], {
					segments: 18
				});
			else b.box('paint-primary', [depth, sy * 0.9, sz * 0.9], [bodyX + depth / 2, 0, 0]);
			b.box('glass', [0.01, sy * 0.3, sz * 0.3], [bodyX + depth - 0.002, 0, 0]);
			// doors open by the experiment's animate module
			const doors: Piece[] = [-1, 1].map((s) => ({
				build: (g) =>
					g.box('paint-secondary', [0.012, sy * 0.85, sz * 0.4], [0.006, 0, (s * sz * 0.4) / 2]),
				pose: (o, p) => {
					o.position.set(bodyX + depth + 0.004, 0, s * sz * 0.02);
					o.rotation.set(0, -s * phase(p, 0, 1) * 1.9, 0);
				}
			}));
			return { dynamic: pieces(ctx, doors) };
		}
		default:
			b.box('paint-primary', [depth, sy * 0.8, sz * 0.8], [bodyX + depth / 2, 0, 0]);
	}
}

/** A radial container: supplies, a scrubber, or a data unit (`params.kind`). */
export function container(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const b = ctx.builder;
	const hx = sx / 2;
	const kind = String(ctx.visual.params?.kind ?? 'supplies');
	b.box('dark-metal', [sx * 0.15, sy, sz], [-hx + sx * 0.075, 0, 0]);
	const x0 = -hx + sx * 0.15;
	const depth = sx * 0.8;
	if (kind === 'supplies') {
		// three stacked canisters with valves between them
		const r = Math.min(depth, sz) * 0.42;
		for (const y of [-sy * 0.3, 0, sy * 0.3]) {
			b.cylinder('paint-primary', r, sy * 0.28, [x0 + depth / 2, y, 0], { segments: 18 });
			b.cylinder('paint-accent', r * 1.02, 0.02, [x0 + depth / 2, y + sy * 0.1, 0], {
				segments: 18
			});
		}
		stubPipe(b, 'metal', [x0 + depth / 2 + r, -sy * 0.45, 0], [0, 1, 0], sy * 0.9, 0.01, 6);
	} else if (kind === 'scrubber') {
		b.box('paint-primary', [depth, sy * 0.9, sz * 0.9], [x0 + depth / 2, 0, 0]);
		for (let i = 0; i < 7; i++)
			b.box(
				'dark-metal',
				[0.008, sy * 0.04, sz * 0.7],
				[x0 + depth + 0.002, sy * (0.33 - i * 0.1), 0]
			);
	} else {
		b.box('paint-secondary', [depth, sy * 0.85, sz * 0.85], [x0 + depth / 2, 0, 0]);
		for (let i = 0; i < 5; i++)
			b.box('metal', [depth * 0.9, 0.01, sz * 0.9], [x0 + depth / 2, sy * (-0.3 + i * 0.15), 0]);
		b.box('lamp', [0.006, 0.02, 0.02], [x0 + depth + 0.002, sy * 0.38, sz * 0.3]);
	}
}
