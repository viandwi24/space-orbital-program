/**
 * The tank shapes beyond the barrel (plan 275): a toroid, a sphere with a mounting ring and a
 * tapered tank (the booster and the adapter tank). Each keeps the part's forged end collars at the
 * node radius, so the seam test (a rim at the node radius within 1 mm) holds, and a body in the
 * barrel's paint (the livery's steel, or the plain primary) with a stripe and welds on top.
 */
import type { ProfilePoint } from '../revolve.ts';
import type { GenContext } from '../registry.ts';
import { barrelSlot, keepsStripe, liveryOf } from './kit.ts';

/** The forged collar at an end of a part: a disc at the face and a short ring of radius `r`. */
function endCollars(ctx: GenContext, rTop: number, rBottom: number, height: number): void {
	const { builder: b, height: H } = ctx;
	const h2 = H / 2;
	const lower: ProfilePoint[] = [
		{ r: 0, y: -h2 },
		{ r: rBottom * 0.94, y: -h2 },
		{ r: rBottom, y: -h2 + 0.02 },
		{ r: rBottom, y: -h2 + height }
	];
	b.revolve('dark-metal', lower);
	b.revolve('dark-metal', [
		{ r: rTop, y: h2 - height },
		{ r: rTop, y: h2 - 0.02 },
		{ r: rTop * 0.94, y: h2 },
		{ r: 0, y: h2 }
	]);
}

/** Points of the arc of a circle centred at (`cr`, `cy`) of radius `rad`, from angle `a0` to `a1` (radians). */
function arc(
	cr: number,
	cy: number,
	rad: number,
	a0: number,
	a1: number,
	steps: number
): ProfilePoint[] {
	const out: ProfilePoint[] = [];
	for (let i = 0; i <= steps; i++) {
		const a = a0 + ((a1 - a0) * i) / steps;
		out.push({ r: cr + rad * Math.cos(a), y: cy + rad * Math.sin(a), smooth: true });
	}
	return out;
}

/**
 * A toroid: a core tube of radius `core` carries the two joints, and a ring tank (a torus whose
 * tube touches the core) sits around its middle. The part's radius is the ring's outer edge.
 */
export function tankToroid(ctx: GenContext): void {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const core = ctx.param('core', R * 0.45, 0.1, R);
	const half = (R - core) / 2;
	// a hair inside the part's radius: the stripe stands off the ring
	const tube = half - 0.005;
	const major = core + half;
	const livery = liveryOf(ctx.visual.params);
	const steps = detail.extras >= 2 ? 24 : 12;
	endCollars(ctx, core, core, 0.05);
	// the core tube between the collars
	b.revolve('dark-metal', [
		{ r: core, y: -h2 + 0.05 },
		{ r: core, y: h2 - 0.05 }
	]);
	// the ring, one closed profile: outside up, inside down (it lies against the core)
	const ring: ProfilePoint[] = [
		...arc(major, 0, tube, -Math.PI / 2, Math.PI / 2, steps),
		...arc(major, 0, tube, Math.PI / 2, (3 * Math.PI) / 2, steps).slice(1)
	];
	b.revolve(barrelSlot(livery), ring);
	if (keepsStripe(livery)) {
		const stripe: ProfilePoint[] = arc(major, 0, tube + 0.004, -0.22, 0.22, 4);
		b.revolve('paint-secondary', stripe);
	}
	// a weld ring on the core above and below the tank, and brackets joining it to the tube
	if (detail.extras >= 1) {
		const brackets = detail.extras >= 2 ? 8 : 4;
		for (let i = 0; i < brackets; i++) {
			const a = ((i + 0.5) / brackets) * Math.PI * 2;
			for (const s of [-1, 1]) {
				b.box(
					'metal',
					[0.05, 0.03, tube * 0.9],
					[Math.sin(a) * (core + 0.02), s * (tube + 0.015), Math.cos(a) * (core + 0.02)],
					a
				);
			}
		}
	}
}

/**
 * A sphere on two short collars, with a mounting ring at its equator. The sphere's radius is
 * `sphere` (the part's radius less the ring), the collars are `core` across.
 */
export function tankSphere(ctx: GenContext): void {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const core = ctx.param('core', R * 0.45, 0.1, R);
	const sphere = R * 0.96;
	const livery = liveryOf(ctx.visual.params);
	const cut = Math.acos(Math.min(1, core / sphere));
	endCollars(ctx, core, core, 0.05);
	b.revolve('dark-metal', [
		{ r: core, y: -h2 + 0.05 },
		{ r: core, y: h2 - 0.05 }
	]);
	b.revolve(barrelSlot(livery), arc(0, 0, sphere, -cut, cut, detail.extras >= 2 ? 32 : 16));
	if (keepsStripe(livery)) {
		b.revolve('paint-secondary', arc(0, 0, sphere + 0.004, cut * 0.45, cut * 0.62, 3));
	}
	// the mounting ring round the equator, with lugs
	b.revolve('metal', [
		{ r: sphere * 0.985, y: -0.07 },
		{ r: R, y: -0.05 },
		{ r: R, y: 0.05 },
		{ r: sphere * 0.985, y: 0.07 }
	]);
	if (detail.extras >= 1) {
		const lugs = detail.extras >= 2 ? 12 : 6;
		for (let i = 0; i < lugs; i++) {
			const a = ((i + 0.5) / lugs) * Math.PI * 2;
			b.box(
				'dark-metal',
				[0.06, 0.16, 0.06],
				[Math.sin(a) * (R - 0.05), 0, Math.cos(a) * (R - 0.05)],
				a
			);
		}
	}
}

/**
 * A tapered tank: the wall runs from the `bottom` collar radius to the `top` one (`params`, m;
 * the larger is the part's radius), with welds along it. Its top may be narrow: the booster tank
 * of a strap-on narrows to a nose collar.
 */
export function tankTaper(ctx: GenContext): void {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const rt = ctx.param('top', R / 2, 0.05, R);
	const rl = ctx.param('bottom', R, 0.05, R);
	const collar = Math.min(0.12, H * 0.08);
	const livery = liveryOf(ctx.visual.params);
	endCollars(ctx, rt, rl, collar);
	const y0 = -h2 + collar;
	const y1 = h2 - collar;
	const at = (t: number, out = 0): ProfilePoint => ({
		r: (rl + (rt - rl) * t) * 0.975 + out,
		y: y0 + (y1 - y0) * t
	});
	b.revolve(barrelSlot(livery), [at(0), at(1)]);
	if (keepsStripe(livery)) {
		const stripe = ctx.param('stripe', 0.2, 0, 0.6);
		if (stripe > 0.01) b.revolve('paint-secondary', [at(0.1, 0.004), at(0.1 + stripe, 0.004)]);
		b.revolve('paint-accent', [at(0.06, 0.006), at(0.075, 0.006)]);
	}
	if (detail.extras >= 1) {
		const welds = Math.round(ctx.param('welds', Math.max(2, Math.round(H / 1.2)), 0, 10));
		for (let i = 1; i <= welds; i++) {
			const t = i / (welds + 1);
			const c = at(t);
			b.revolve('metal', [
				{ r: c.r, y: c.y - 0.035 },
				{ r: c.r + 0.012, y: c.y - 0.022 },
				{ r: c.r + 0.012, y: c.y + 0.022 },
				{ r: c.r, y: c.y + 0.035 }
			]);
		}
	}
}
