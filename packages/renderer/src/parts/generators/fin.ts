/** Fin: a swept trapezoid plate with bevelled edges and a root fillet, span along +X, chord along Y. */
import { Matrix4, Shape } from 'three';
import type { GenContext } from '../registry.ts';

export function fin(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const { builder: b, detail } = ctx;
	const hx = sx / 2;
	const hy = sy / 2;
	const t = sz;
	const tipChord = ctx.param('tipChord', 0.5, 0.1, 1);
	// Trailing edge straight along the bottom, leading edge raked back to the tip.
	const shape = new Shape();
	shape.moveTo(-hx, -hy);
	shape.lineTo(hx, -hy);
	shape.lineTo(hx, -hy + sy * tipChord);
	shape.lineTo(-hx, hy);
	shape.closePath();
	b.extrude('paint-primary', shape, t, new Matrix4().makeTranslation(0, 0, -t / 2));
	// Root rail where it meets the body, and an accent stripe along the tip.
	b.box('dark-metal', [0.05, sy * 0.98, t * 1.6], [-hx + 0.025, 0, 0]);
	b.box(
		'paint-accent',
		[0.035, sy * tipChord, t * 1.12],
		[hx - 0.02, -hy + (sy * tipChord) / 2, 0]
	);
	if (detail.extras >= 1) {
		b.box('metal', [0.02, sy * 0.92, t * 1.25], [-hx + 0.15, 0, 0]);
	}
}
