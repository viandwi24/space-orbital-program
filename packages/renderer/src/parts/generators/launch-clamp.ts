/**
 * Launch clamp (plan 210): an arm that grips the side of the rocket and a lattice tower under it.
 * The tower is the moving piece, built 1 m long down from the arm's foot; the `extend`
 * articulation stretches it to the measured height, so it reaches the pad.
 */
import type { GenContext, GeneratedPart } from '../registry.ts';

export function launchClamp(ctx: GenContext): GeneratedPart {
	const [sx, sy, sz] = ctx.size;
	const { builder: b, moving: m, detail } = ctx;
	const hx = sx / 2;
	const hy = sy / 2;
	// the grip on the hull and the arm out to the tower
	b.box('dark-metal', [sx * 0.2, sy * 0.5, sz * 0.8], [-hx + sx * 0.1, hy * 0.3, 0]);
	b.box('paint-primary', [sx * 0.8, sy * 0.2, sz * 0.5], [0, hy * 0.3, 0]);
	b.box('paint-primary', [sx * 0.5, sy * 0.6, sz * 0.7], [hx * 0.5, -hy * 0.2, 0]);
	// the tower: four legs and the cross bars, y from 0 down to -1 (scaled to the pad)
	const w = Math.min(sx, sz) * 0.3;
	for (const [dx, dz] of [
		[1, 1],
		[1, -1],
		[-1, 1],
		[-1, -1]
	] as const) {
		m.box('paint-primary', [0.05, 1, 0.05], [dx * w, -0.5, dz * w]);
	}
	if (detail.extras >= 1) {
		for (const y of [-0.25, -0.5, -0.75]) {
			m.box('paint-secondary', [w * 2, 0.03, 0.03], [0, y, w]);
			m.box('paint-secondary', [w * 2, 0.03, 0.03], [0, y, -w]);
		}
	}
	m.box('dark-metal', [w * 2.6, 0.04, w * 2.6], [0, -0.98, 0]);
	return { pivot: [hx * 0.5, -hy * 0.5, 0] };
}
