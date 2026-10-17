/**
 * Wing: a lifting plank with a rounded leading edge, a slight taper, ribs and a wing-tip light
 * strip. Span along +X from the root (the attach node at the -X end), chord along Y with the
 * leading edge at +Y, thickness along Z (ADR 0075).
 */
import { Matrix4, Shape } from 'three';
import type { GenContext } from '../registry.ts';

export function wing(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const { builder: b, detail } = ctx;
	const hx = sx / 2;
	const hy = sy / 2;
	const t = sz;
	// The tip chord as a fraction of the root chord: a gentle taper, trailing edge straight back.
	const taper = ctx.param('taper', 0.72, 0.3, 1);
	const tipLe = hy - 0.05 * sy;
	const shape = new Shape();
	shape.moveTo(-hx, -hy);
	shape.lineTo(hx, tipLe - taper * sy);
	shape.lineTo(hx, tipLe);
	shape.lineTo(-hx, hy);
	shape.closePath();
	b.extrude('paint-primary', shape, t * 0.8, new Matrix4().makeTranslation(0, 0, -t * 0.4));
	// Leading edge: a rounded bar along the raked front.
	const rake = Math.atan2(hy - tipLe, sx);
	const r = t * 0.5;
	b.cylinder('metal', r, Math.hypot(sx, hy - tipLe) - 4 * r, [0, (hy + tipLe) / 2 - 1.3 * r, 0], {
		tiltZ: Math.PI / 2 - rake,
		segments: 10
	});
	// Root rail, tip cap with an accent stripe.
	b.box('dark-metal', [0.06, sy, t * 1.4], [-hx + 0.03, 0, 0]);
	b.box(
		'paint-accent',
		[0.04, taper * sy * 0.98, t * 0.95],
		[hx - 0.02, tipLe - (taper * sy) / 2, 0]
	);
	// Panel seam behind the leading edge.
	b.box('dark-metal', [sx - 0.12, 0.012, t * 0.86], [0.03, -hy + sy * 0.3, 0]);
	if (detail.extras >= 1) {
		for (const f of [0.25, 0.5, 0.75]) {
			const x = -hx + sx * f;
			const chord = sy * (1 - (1 - taper) * f);
			b.box(
				'metal',
				[0.015, chord * 0.9, t * 0.9],
				[x, tipLe - chord / 2 + (hy - tipLe) * (1 - f), 0]
			);
		}
	}
}
