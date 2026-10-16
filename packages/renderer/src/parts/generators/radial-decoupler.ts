/** Radial decoupler: a box-section clamp with a hazard band, pyro bolts and a separation lip. */
import type { GenContext } from '../registry.ts';

export function radialDecoupler(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const { builder: b, detail } = ctx;
	const hx = sx / 2;
	const hy = sy / 2;
	const hz = sz / 2;
	// Inner (core side) and outer (booster side) blocks with a lighter groove between them.
	const groove = Math.min(0.03, sx * 0.15);
	b.box('dark-metal', [hx - groove / 2, sy, sz], [-(hx + groove / 2) / 2 - 0.0, 0, 0]);
	b.box('dark-metal', [hx - groove / 2, sy, sz], [(hx + groove / 2) / 2, 0, 0]);
	b.box('paint-accent', [groove, sy * 0.96, sz * 0.96], [0, 0, 0]);
	// Raised rim on the booster face.
	b.box('metal', [0.012, sy * 0.9, sz * 0.9], [hx - 0.006, 0, 0]);
	if (detail.extras >= 1) {
		for (const z of [-hz * 0.62, hz * 0.62]) {
			for (const y of [-hy * 0.62, hy * 0.62]) {
				b.cylinder('metal', 0.022, 0.03, [hx - 0.02, y, z], { tiltZ: Math.PI / 2, segments: 10 });
			}
		}
	}
}
