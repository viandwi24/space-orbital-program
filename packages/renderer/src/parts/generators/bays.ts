/**
 * Payload and structure (plan 281, ADR 0261): bays whose doors open by the deploy progress,
 * Apollo-style payload petals, multi-couplers, trusses, a docking hub and a lattice interstage.
 */
import { Vector3 } from 'three';
import type { GenContext, GeneratedPart } from '../registry.ts';
import type { GeometryBuilder } from '../builder.ts';
import { phase, pieces, type Piece } from './dyn.ts';
import { boltCircle, raisedRing, stubPipe } from './kit.ts';

/** Dark joint collars at both faces of a stack part, `band` tall, out to radius `R`. */
function collars(b: GeometryBuilder, R: number, h2: number, band: number, inner: number): void {
	b.revolve('dark-metal', [
		{ r: 0, y: -h2 },
		{ r: R, y: -h2 },
		{ r: R, y: -h2 + band },
		{ r: inner, y: -h2 + band }
	]);
	b.revolve('dark-metal', [
		{ r: inner, y: h2 - band },
		{ r: R, y: h2 - band },
		{ r: R, y: h2 },
		{ r: 0, y: h2 }
	]);
}

/**
 * A service bay (or, with `params.doors` 2 and `params.cargo`, a long cargo bay): a frame between
 * two collars, its walls `doors` panels that hinge out at their lower edge (cargo: at their side
 * edges, along the length).
 */
export function serviceBay(ctx: GenContext): GeneratedPart {
	const { radius: R, height: H, builder: b } = ctx;
	const h2 = H / 2;
	const band = Math.min(0.06, H * 0.05);
	const doors = Math.round(ctx.param('doors', 4, 2, 8));
	const cargo = ctx.visual.params?.cargo === true;
	const wall = R * 0.97;
	collars(b, R, h2, band, wall * 0.9);
	// the frame: longerons between the doors and a dark inside
	for (let i = 0; i < doors; i++) {
		const a = (i / doors) * Math.PI * 2;
		b.box(
			'metal',
			[0.05, H - band * 2, 0.05],
			[Math.sin(a) * wall * 0.98, 0, Math.cos(a) * wall * 0.98],
			a
		);
	}
	// the dark inside, walked top down so it faces the axis
	b.revolve('nozzle-inner', [
		{ r: wall * 0.85, y: h2 - band },
		{ r: wall * 0.85, y: -h2 + band }
	]);
	raisedRing(b, 'metal', wall * 0.85, 0, 0.05, 0.01);
	const sweep = (Math.PI * 2) / doors;
	const doorH = H - band * 2;
	const list: Piece[] = [];
	for (let i = 0; i < doors; i++) {
		const mid = (i + 0.5) * sweep;
		const edge = mid - sweep / 2;
		// the hinge: the middle of the lower edge (service bay), or the leading side edge (cargo)
		const hinge: [number, number, number] = cargo
			? [Math.sin(edge) * wall, 0, Math.cos(edge) * wall]
			: [Math.sin(mid) * wall, 0, Math.cos(mid) * wall];
		const at: [number, number, number] = [-hinge[0], 0, -hinge[2]];
		const seg = Math.max(3, Math.round(b.segments / doors));
		list.push({
			build: (g) => {
				// a curved door: a sector of the wall, drawn so its hinge is at the origin
				g.revolveAt(
					'paint-primary',
					[
						{ r: wall, y: 0 },
						{ r: wall, y: doorH }
					],
					at,
					{ segments: seg, phiStart: edge + 0.01, phiLength: sweep - 0.02 }
				);
				g.revolveAt(
					'paint-secondary',
					[
						{ r: wall + 0.004, y: doorH * 0.1 },
						{ r: wall + 0.004, y: doorH * 0.14 }
					],
					at,
					{ segments: seg, phiStart: edge + 0.05, phiLength: sweep - 0.1 }
				);
			},
			pose: (o, p) => {
				const e = phase(p, 0, 1);
				o.position.set(hinge[0], -h2 + band, hinge[2]);
				o.rotation.set(0, 0, 0);
				if (cargo) o.rotateY(-e * 1.6);
				else o.rotateOnAxis(new Vector3(Math.cos(mid), 0, -Math.sin(mid)), e * 1.9);
			}
		});
	}
	return { dynamic: pieces(ctx, list) };
}

/**
 * Payload petals (an Apollo SLA kind): a frustum from `params.top` (m, radius) to the part's
 * radius at the bottom, in four petals that hinge out at their lower edge.
 */
export function petals(ctx: GenContext): GeneratedPart {
	const { radius: R, height: H, builder: b } = ctx;
	const h2 = H / 2;
	const top = ctx.param('top', R * 0.6, 0.2, R);
	const band = 0.05;
	b.revolve('dark-metal', [
		{ r: 0, y: -h2 },
		{ r: R, y: -h2 },
		{ r: R, y: -h2 + band },
		{ r: R * 0.95, y: -h2 + band }
	]);
	b.revolve('dark-metal', [
		{ r: top * 0.95, y: h2 - band },
		{ r: top, y: h2 - band },
		{ r: top, y: h2 },
		{ r: 0, y: h2 }
	]);
	const list: Piece[] = [];
	const n = 4;
	const sweep = (Math.PI * 2) / n;
	for (let i = 0; i < n; i++) {
		const mid = (i + 0.5) * sweep;
		const hinge: [number, number, number] = [Math.sin(mid) * R * 0.99, 0, Math.cos(mid) * R * 0.99];
		list.push({
			build: (g) => petalSkin(g, R, top, H - band * 2, mid, sweep, [-hinge[0], 0, -hinge[2]], n),
			pose: (o, p) => {
				const e = phase(p, 0, 1);
				o.position.set(hinge[0], -h2 + band, hinge[2]);
				o.rotation.set(0, 0, 0);
				o.rotateOnAxis(new Vector3(Math.cos(mid), 0, -Math.sin(mid)), e * 0.8);
			}
		});
	}
	return { dynamic: pieces(ctx, list) };
}

/**
 * One petal thrown off (plan 345): the quarter `quarter` of the petals' cone, drawn round the
 * debris part's own origin, which starts at the quarter's middle just outside the shell
 * (`radius` + 0.45 m along it), as `ModuleBay`'s jettison places it.
 */
export function petalPanel(ctx: GenContext): void {
	const { builder: b } = ctx;
	const H = 3.5;
	const band = 0.05;
	const R = ctx.param('radius', 1.875, 0.3, 10);
	const top = ctx.param('top', R * 0.6, 0.2, R);
	const quarter = Math.round(ctx.param('quarter', 0, 0, 3));
	const sweep = Math.PI / 2;
	const mid = (quarter + 0.5) * sweep;
	const out = R + 0.45;
	petalSkin(
		b,
		R,
		top,
		H - 2 * band,
		mid,
		sweep,
		[-Math.sin(mid) * out, -H / 2 + band, -Math.cos(mid) * out],
		4
	);
}

/**
 * One petal of the SLA (plans 303, 355): a white outer skin, a tan inner one (the Apollo panels'
 * inside, seen when they open), a hinge strip along the foot and a red ring marking near the tip.
 * Drawn from the cone's foot (y 0) up `h`, shifted by `at`.
 */
function petalSkin(
	g: GeometryBuilder,
	R: number,
	top: number,
	h: number,
	mid: number,
	sweep: number,
	at: readonly [number, number, number],
	n: number
): void {
	const segments = Math.max(3, Math.round(g.segments / n));
	const span = { segments, phiStart: mid - sweep / 2 + 0.005, phiLength: sweep - 0.01 };
	g.revolveAt(
		'paint-primary',
		[
			{ r: R * 0.99, y: 0 },
			{ r: top * 0.99, y: h }
		],
		at,
		span
	);
	// the inside, facing in (top down, as a nozzle's inner wall)
	g.revolveAt(
		'tan',
		[
			{ r: top * 0.97, y: h },
			{ r: R * 0.97, y: 0 }
		],
		at,
		span
	);
	if (g.segments >= 24) {
		// the hinge along the foot: a chord inside the cone's foot
		const hr = R * 0.9;
		const chord = 2 * Math.sqrt(Math.max(0, (R * 0.98) ** 2 - hr ** 2));
		g.cylinder(
			'dark-metal',
			0.035,
			Math.min(chord, 2 * hr * Math.sin(sweep / 2) * 0.9),
			[Math.sin(mid) * hr + at[0], at[1] + 0.04, Math.cos(mid) * hr + at[2]],
			{ tiltZ: Math.PI / 2, turnY: mid, segments: 8 }
		);
		// a red ring near the tip, on the inside
		const t = 0.82;
		const rr = (R + (top - R) * t) * 0.96;
		g.cylinder(
			'paint-accent',
			0.16,
			0.012,
			[Math.sin(mid) * rr + at[0], at[1] + h * t, Math.cos(mid) * rr + at[2]],
			{ tiltZ: Math.PI / 2, turnY: mid - Math.PI / 2, segments: 16 }
		);
	}
}

/** A multi-coupler: a domed plate with `params.ways` skirts under it (2, 3 or 4). */
export function coupler(ctx: GenContext): void {
	const { radius: R, height: H, builder: b } = ctx;
	const h2 = H / 2;
	const ways = Math.round(ctx.param('ways', 2, 2, 4));
	const child = ctx.param('child', 0.625, 0.2, R);
	const off = ctx.param('offset', R - child, 0, R);
	// the top joint's radius (the plate); the skirts below may reach further out
	const T = ctx.param('top', R, 0.2, R);
	b.revolve('dark-metal', [
		{ r: T * 0.98, y: h2 - 0.06 },
		{ r: T, y: h2 - 0.04 },
		{ r: T, y: h2 },
		{ r: 0, y: h2 }
	]);
	b.revolve('paint-primary', [
		{ r: 0, y: -h2 + H * 0.45 },
		{ r: T * 0.98, y: h2 - 0.06 }
	]);
	for (let i = 0; i < ways; i++) {
		const a = (i / ways) * Math.PI * 2 + (ways === 2 ? Math.PI / 2 : 0);
		const x = Math.sin(a) * off;
		const z = Math.cos(a) * off;
		b.revolveAt(
			'paint-primary',
			[
				{ r: child, y: -h2 + 0.04 },
				{ r: child * 0.9, y: -h2 + H * 0.5 }
			],
			[x, 0, z]
		);
		b.revolveAt(
			'dark-metal',
			[
				{ r: 0, y: -h2 },
				{ r: child, y: -h2 },
				{ r: child, y: -h2 + 0.04 }
			],
			[x, 0, z]
		);
	}
}

/** A square truss segment (a box shape): four corner tubes, rings of cross members, diagonals. */
export function truss(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const b = ctx.builder;
	const hx = sx / 2 - 0.03;
	const hz = sz / 2 - 0.03;
	const h2 = sy / 2;
	for (const [x, z] of [
		[hx, hz],
		[-hx, hz],
		[hx, -hz],
		[-hx, -hz]
	] as const)
		b.box('metal', [0.05, sy, 0.05], [x, 0, z]);
	const bays = Math.max(1, Math.round(sy / Math.max(sx, sz)));
	for (let k = 0; k <= bays; k++) {
		const y = -h2 + 0.025 + ((sy - 0.05) * k) / bays;
		b.box('paint-primary', [sx - 0.06, 0.04, 0.04], [0, y, hz]);
		b.box('paint-primary', [sx - 0.06, 0.04, 0.04], [0, y, -hz]);
		b.box('paint-primary', [0.04, 0.04, sz - 0.06], [hx, y, 0]);
		b.box('paint-primary', [0.04, 0.04, sz - 0.06], [-hx, y, 0]);
	}
	for (let k = 0; k < bays; k++) {
		const y0 = -h2 + ((sy - 0.05) * k) / bays + 0.025;
		const dy = (sy - 0.05) / bays;
		for (const [from, dir] of [
			[
				[-hx, y0, hz],
				[2 * hx, dy, 0]
			],
			[
				[hx, y0, -hz],
				[-2 * hx, dy, 0]
			],
			[
				[hx, y0, hz],
				[0, dy, -2 * hz]
			],
			[
				[-hx, y0, -hz],
				[0, dy, 2 * hz]
			]
		] as const)
			stubPipe(b, 'metal', from, dir, Math.hypot(...dir), 0.015, 6);
	}
}

/** A docking hub: a sphere-ish node with six collars (top, bottom and four sides). */
export function hub(ctx: GenContext): void {
	const { radius: R, height: H, builder: b } = ctx;
	const h2 = H / 2;
	const port = ctx.param('port', 0.625, 0.2, R);
	collars(b, port, h2, 0.06, port * 0.95);
	const steps = 8;
	const prof = [];
	for (let i = 0; i <= steps; i++) {
		const t = -Math.PI / 2 + (Math.PI * i) / steps;
		const y = Math.sin(t) * (h2 - 0.06);
		prof.push({ r: Math.max(port * 0.95, Math.cos(t) * R * 0.82), y, smooth: i > 0 && i < steps });
	}
	b.revolve('paint-primary', prof);
	// side ports: collars of the node size ending at `R * 0.9`, where the side nodes are
	for (let i = 0; i < 4; i++) {
		const a = (i / 4) * Math.PI * 2;
		const dir: [number, number, number] = [Math.sin(a), 0, Math.cos(a)];
		stubPipe(
			b,
			'dark-metal',
			[dir[0] * R * 0.6, 0, dir[2] * R * 0.6],
			dir,
			R * 0.3,
			port,
			b.segments
		);
	}
	if (ctx.detail.extras >= 1) boltCircle(b, 'metal', 12, R * 0.6, 0);
}

/** A lattice interstage (Soyuz Blok I kind): two rings joined by crossed struts, open between. */
export function lattice(ctx: GenContext): void {
	const { radius: R, height: H, builder: b } = ctx;
	const h2 = H / 2;
	const band = 0.06;
	collars(b, R, h2, band, R * 0.9);
	const n = ctx.detail.extras >= 1 ? Math.max(8, Math.round(R * 10)) : 6;
	for (let i = 0; i < n; i++) {
		const a0 = (i / n) * Math.PI * 2;
		const a1 = ((i + 1) / n) * Math.PI * 2;
		const r = R * 0.95;
		for (const [fa, ta] of [
			[a0, a1],
			[a1, a0]
		] as const) {
			const from: [number, number, number] = [Math.sin(fa) * r, -h2 + band, Math.cos(fa) * r];
			const to: [number, number, number] = [Math.sin(ta) * r, h2 - band, Math.cos(ta) * r];
			const dir: [number, number, number] = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
			stubPipe(b, 'metal', from, dir, Math.hypot(...dir), 0.025, 6);
		}
	}
}
