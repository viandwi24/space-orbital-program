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
