/**
 * Shuttle parts (plan 295) and the launch escape tower (plan 276).
 * - `orbiter-nose`: the crew cabin and nose, cockpit windows forward (+Z), black heat tiles under
 *   (-Z half), a bottom joint only.
 * - `orbiter-aft`: the engine section: a top joint, three main engines, two OMS pods and the tail.
 * - `delta-wing`: a double-delta wing (box shape, radial node on -X), white above, tiles under.
 * - `external-tank`: a foam-covered tank with an ogive nose, its joints at the bottom only.
 * - `escape-tower`: a lattice tower on a 0.625 m joint, a motor with four canted nozzles, a nose.
 */
import { Matrix4, Quaternion, Shape, Vector3 } from 'three';
import type { GeometryBuilder, SlotName } from '../builder.ts';
import type { GenContext } from '../registry.ts';
import type { ProfilePoint } from '../revolve.ts';
import { raisedRing, ribbedBell, stubPipe } from './kit.ts';

/** A revolve whose -Z half (the belly) is heat tile and +Z half the given paint. */
function bellyRevolve(b: GeometryBuilder, top: SlotName, profile: readonly ProfilePoint[]): void {
	const seg = Math.max(4, Math.round(b.segments / 2));
	// azimuth from +Z toward +X: 0..π covers +X, π..2π covers -X; the belly is |azimuth − π| < π/2
	b.revolve(top, profile, { segments: seg, phiStart: -Math.PI / 2, phiLength: Math.PI });
	b.revolve('tile', profile, { segments: seg, phiStart: Math.PI / 2, phiLength: Math.PI });
}

export function orbiterNose(ctx: GenContext): void {
	const { radius: R, height: H, builder: b } = ctx;
	const h2 = H / 2;
	const band = 0.05;
	b.revolve('dark-metal', [
		{ r: 0, y: -h2 },
		{ r: R, y: -h2 },
		{ r: R, y: -h2 + band },
		{ r: R * 0.98, y: -h2 + band }
	]);
	const prof: ProfilePoint[] = [];
	const steps = 12;
	const cabin = -h2 + band + H * 0.35;
	prof.push({ r: R * 0.98, y: -h2 + band });
	prof.push({ r: R * 0.98, y: cabin });
	for (let i = 1; i <= steps; i++) {
		const t = i / steps;
		prof.push({
			r: R * 0.98 * Math.sqrt(Math.max(0, 1 - t * t)) + 0.0001,
			y: cabin + (h2 - cabin) * t,
			smooth: i < steps
		});
	}
	bellyRevolve(b, 'paint-primary', prof);
	// the cockpit windows: a row of dark panes on the upper front
	const n = 6;
	for (let i = 0; i < n; i++) {
		const a = -0.55 + (1.1 * i) / (n - 1);
		const t = 0.35;
		const y = cabin + (h2 - cabin) * t;
		const r = R * 0.98 * Math.sqrt(1 - t * t);
		const q = new Quaternion()
			.setFromAxisAngle(new Vector3(0, 1, 0), a)
			.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.6));
		const pane = new Shape();
		pane.moveTo(-0.11, -0.08);
		pane.lineTo(0.11, -0.08);
		pane.lineTo(0.08, 0.08);
		pane.lineTo(-0.08, 0.08);
		pane.closePath();
		b.extrude(
			'glass',
			pane,
			0.012,
			new Matrix4().compose(
				new Vector3(Math.sin(a) * r, y, Math.cos(a) * r),
				q,
				new Vector3(1, 1, 1)
			)
		);
	}
	// forward RCS ports on both sides of the nose
	for (const s of [-1, 1])
		for (let k = 0; k < 3; k++)
			b.box('dark-metal', [0.04, 0.03, 0.04], [s * R * 0.62, cabin + 0.25 + k * 0.08, R * 0.45]);
}

export function orbiterAft(ctx: GenContext): void {
	const { height: H, builder: b } = ctx;
	// the fuselage's radius; the shape is wider by the tail fin standing up out of its top (+Z)
	const R = ctx.param('body', 1.25, 0.3, ctx.radius);
	const finDepth = Math.max(0.1, ctx.radius - R - 0.02);
	const h2 = H / 2;
	const band = 0.05;
	b.revolve('dark-metal', [
		{ r: R * 0.98, y: h2 - band },
		{ r: R, y: h2 - band },
		{ r: R, y: h2 },
		{ r: 0, y: h2 }
	]);
	const base = -h2 + H * 0.35;
	bellyRevolve(b, 'paint-primary', [
		{ r: R * 0.7, y: base },
		{ r: R * 0.98, y: base + 0.2 },
		{ r: R * 0.98, y: h2 - band }
	]);
	b.revolve('tile', [
		{ r: 0, y: base },
		{ r: R * 0.7, y: base }
	]);
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
	// OMS pods on the upper sides, the tail fin on top (+Z)
	for (const s of [-1, 1]) {
		b.revolveAt(
			'paint-primary',
			[
				{ r: 0, y: base - 0.05 },
				{ r: R * 0.22, y: base + 0.05 },
				{ r: R * 0.22, y: h2 - 0.3 },
				{ r: 0.02, y: h2 - band - 0.05 }
			],
			[s * R * 0.55, 0, R * 0.62]
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
			[s * R * 0.55, base - 0.05, R * 0.62]
		);
	}
	// the fin: a tall thin plate standing out of the top (+Z) of the aft body
	b.box('paint-primary', [0.06, H * 0.55, finDepth], [0, base + H * 0.3, R * 0.96 + finDepth / 2]);
	b.box('tile', [0.065, H * 0.06, finDepth * 0.95], [0, base + H * 0.56, R * 0.96 + finDepth / 2]);
}

export function deltaWing(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const b = ctx.builder;
	const hx = sx / 2;
	const h2 = sy / 2;
	const t = sz / 2;
	// planform in the XY plane: root along the hull (x = -hx), a strake forward, the tip aft
	const wing = new Shape();
	wing.moveTo(-hx, -h2);
	wing.lineTo(-hx, h2);
	wing.lineTo(-hx + sx * 0.25, h2 * 0.35);
	wing.lineTo(hx, -h2 + sy * 0.15);
	wing.lineTo(hx, -h2);
	wing.closePath();
	b.extrude('paint-primary', wing, t, new Matrix4().makeTranslation(0, 0, 0));
	b.extrude('tile', wing, t, new Matrix4().makeTranslation(0, 0, -t));
	// the elevon along the trailing edge
	b.box(
		'dark-metal',
		[sx * 0.85, sy * 0.06, sz * 0.9],
		[-hx + sx * 0.1 + sx * 0.425, -h2 + sy * 0.03, 0]
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
			y: nose + (h2 - nose) * tt,
			smooth: i > 0 && i < steps
		});
	}
	b.revolve('foam', prof);
	for (const y of [-h2 + H * 0.3, -h2 + H * 0.62]) raisedRing(b, 'foam', R * 0.98, y, 0.15, 0.015);
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
