/**
 * Control surface: a fixed root fairing and an all-moving plate that turns about its span (local
 * X) at the hinge line, driven by the module's `deflection` (ADR 0045). Same planform as the fin.
 */
import { Matrix4, Shape } from 'three';
import type { GenContext, GeneratedPart } from '../registry.ts';

export function controlSurface(ctx: GenContext): GeneratedPart {
	const [sx, sy, sz] = ctx.size;
	const { builder: b, moving: m, detail } = ctx;
	const hx = sx / 2;
	const hy = sy / 2;
	const t = sz;
	const tipChord = ctx.param('tipChord', 0.55, 0.1, 1);
	const root = 0.14;
	// Hinge line a third of the chord from the leading edge, where the force acts.
	const hingeY = hy - sy / 3;

	// Fixed root fairing and the actuator housing.
	b.box('dark-metal', [root, sy * 0.5, t * 2.4], [-hx + root / 2, hingeY, 0]);
	b.cylinder('metal', t * 1.6, root * 1.2, [-hx + root * 0.6, hingeY, 0], { tiltZ: Math.PI / 2 });

	// The plate: a swept trapezoid, leading edge raked back to the tip.
	const shape = new Shape();
	shape.moveTo(-hx + root, -hy);
	shape.lineTo(hx, -hy);
	shape.lineTo(hx, -hy + sy * tipChord);
	shape.lineTo(-hx + root, hy);
	shape.closePath();
	m.extrude('paint-primary', shape, t, new Matrix4().makeTranslation(0, 0, -t / 2));
	m.box(
		'paint-accent',
		[0.035, sy * tipChord, t * 1.12],
		[hx - 0.02, -hy + (sy * tipChord) / 2, 0]
	);
	// Panel seam along the span, and a spar line.
	m.box('dark-metal', [sx - root, 0.012, t * 1.06], [root / 2, -hy + sy * 0.28, 0]);
	if (detail.extras >= 1) {
		m.box('metal', [sx - root - 0.05, 0.02, t * 1.12], [root / 2, hingeY, 0]);
	}
	return { pivot: [0, hingeY, 0] };
}
