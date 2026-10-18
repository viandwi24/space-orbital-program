/**
 * Landing gear (plan 063, ADR 0161): a strut out along +X from the radial node and a tyre at its
 * end, the disc in the X-Y plane (rolling along Y), the axle along Z.
 */
import { Matrix4, Shape } from 'three';
import type { GenContext } from '../registry.ts';

export function gear(ctx: GenContext): void {
	const { builder: b, detail } = ctx;
	const [sx] = ctx.size;
	const reach = ctx.param('offset', 0.45, 0, 2);
	const radius = ctx.param('radius', 0.3, 0.05, 2);
	const width = ctx.param('width', 0.15, 0.02, 1);
	const root = -sx / 2;
	// the strut from the hull to the axle
	b.box('metal', [reach - root, 0.07, 0.07], [(reach + root) / 2, 0, 0]);
	const disc = (r: number, w: number, material: 'dark-metal' | 'metal') => {
		const s = new Shape();
		s.absarc(0, 0, r, 0, Math.PI * 2, false);
		b.extrude(material, s, w, new Matrix4().makeTranslation(reach, 0, -w / 2));
	};
	disc(radius, width, 'dark-metal');
	if (detail.extras >= 1) disc(radius * 0.45, width * 1.15, 'metal');
}
