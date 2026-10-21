/**
 * Light (plan 242, ADR 0239): a small housing on the hull with a bezel round the lens. The lens
 * itself is the model's lamp effect (it glows when the module says it is on); here it is a dark
 * glass disc at `lamp.pos` facing `lamp.dir`.
 */
import type { GenContext } from '../registry.ts';

export function light(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const { builder: b } = ctx;
	// the housing sits on the hull side (-X); the lens looks out along +X
	b.box('paint-primary', [sx * 0.7, sy * 0.85, sz * 0.85], [-sx * 0.15, 0, 0]);
	b.box('dark-metal', [sx * 0.12, sy * 0.95, sz * 0.95], [sx * 0.31, 0, 0]);
	b.cylinder('metal', Math.min(sy, sz) * 0.36, sx * 0.1, [sx * 0.42, 0, 0], {
		tiltZ: -Math.PI / 2
	});
	if (ctx.detail.extras >= 1) {
		b.box('paint-accent', [sx * 0.5, sy * 0.08, sz * 0.7], [-sx * 0.1, sy * 0.46, 0]);
	}
}

/** A flat strip light (plan 311): a thin plate flush on the hull, a long lens on its face (+X). */
export function lightPanel(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const { builder: b } = ctx;
	b.box('paint-primary', [sx * 0.6, sy, sz], [-sx * 0.2, 0, 0]);
	b.box('dark-metal', [sx * 0.3, sy * 0.92, sz * 0.8], [sx * 0.25, 0, 0]);
	// the lens strip, and screws at its ends
	b.box('metal', [sx * 0.08, sy * 0.84, sz * 0.62], [sx * 0.44, 0, 0]);
	if (ctx.detail.extras >= 1) {
		for (const y of [-sy * 0.46, sy * 0.46])
			b.box('metal', [sx * 0.1, 0.012, 0.012], [sx * 0.42, y, 0]);
	}
}

/**
 * An angled light (plan 311): a wedge housing on the hull whose lens faces 45° up from the hull
 * normal (+X toward +Y), so the beam rakes along the side without tilting the part.
 */
export function lightAngled(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const { builder: b } = ctx;
	// the base on the hull
	b.box('paint-primary', [sx * 0.4, sy, sz * 0.9], [-sx * 0.3, 0, 0]);
	// the wedge, turned 45° about Z
	b.box(
		'paint-primary',
		[sx * 0.62, sy * 0.5, sz * 0.86],
		[sx * 0.05, sy * 0.05, 0],
		0,
		Math.PI / 4
	);
	// the lens on the slanted face
	b.cylinder('metal', Math.min(sy, sz) * 0.3, sx * 0.08, [sx * 0.2, sy * 0.2, 0], {
		tiltZ: -Math.PI / 4
	});
	if (ctx.detail.extras >= 1)
		b.box('paint-accent', [sx * 0.36, 0.02, sz * 0.92], [-sx * 0.3, -sy * 0.46, 0]);
}

/** A navigation light (plan 311): a small dome on a round foot. */
export function lightNav(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const { builder: b } = ctx;
	const r = Math.min(sy, sz) / 2;
	b.cylinder('dark-metal', r, sx * 0.35, [-sx * 0.32, 0, 0], { tiltZ: -Math.PI / 2 });
	// the dome: a short cone and a cap, out along +X
	b.cylinder('metal', r * 0.8, sx * 0.4, [sx * 0.05, 0, 0], {
		tiltZ: -Math.PI / 2,
		radiusTop: r * 0.45
	});
	b.cylinder('metal', r * 0.45, sx * 0.1, [sx * 0.3, 0, 0], {
		tiltZ: -Math.PI / 2,
		radiusTop: r * 0.15
	});
}
