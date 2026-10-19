/**
 * RCS thrusters (plan 211): a mounting block and its nozzles. `params.nozzles` 4 is a four-way
 * block (nozzles up, down and to both sides, in the plane of the hull); 1 is a single port that
 * blows out from the hull.
 */
import type { GenContext } from '../registry.ts';

export function rcsBlock(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const { builder: b, detail } = ctx;
	const hx = sx / 2;
	const four = ctx.param('nozzles', 4, 1, 4) >= 4;
	const seg = detail.extras >= 1 ? 14 : 8;
	// the base plate on the hull, then the body
	b.box('dark-metal', [sx * 0.25, sy, sz], [-hx + sx * 0.125, 0, 0]);
	b.box('paint-primary', [sx * 0.6, sy * 0.55, sz * 0.55], [0.0, 0, 0]);
	if (four) {
		const len = Math.min(sy, sz) * 0.22;
		const at = Math.min(sy, sz) / 2 - len / 2;
		// up and down along the hull
		for (const s of [1, -1]) {
			b.cylinder('nozzle', len * 0.45, len, [hx * 0.3, s * at, 0], {
				radiusTop: s > 0 ? len * 0.45 : len * 0.2,
				segments: seg
			});
			// sideways around the hull
			b.cylinder('nozzle', len * 0.45, len, [hx * 0.3, 0, s * at], {
				turnY: Math.PI / 2,
				tiltZ: (s * Math.PI) / 2,
				radiusTop: len * 0.2,
				segments: seg
			});
		}
	} else {
		const len = sx * 0.4;
		b.cylinder('nozzle', Math.min(sy, sz) * 0.22, len, [hx - len / 2, 0, 0], {
			tiltZ: Math.PI / 2,
			radiusTop: Math.min(sy, sz) * 0.1,
			segments: seg
		});
	}
}
