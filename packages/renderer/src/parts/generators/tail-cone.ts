/**
 * Tail cone (plan 207): the end of a stack that tapers below its top joint, cutting base drag.
 * `params.tip` is the radius of the open bottom as a fraction of the part's radius.
 */
import type { ProfilePoint } from '../revolve.ts';
import type { GenContext } from '../registry.ts';

export function tailCone(ctx: GenContext): void {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const collar = 0.06;
	const tip = R * ctx.param('tip', 0.4, 0.1, 0.9);
	const steps = detail.extras >= 1 ? 10 : 6;
	const bodyH = H - collar;
	// A boat tail: the radius falls slowly under the joint and faster toward the tip.
	const profile: ProfilePoint[] = [{ r: 0, y: -h2 }];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const r = tip + (R * 0.985 - tip) * Math.sqrt(1 - (1 - t) * (1 - t));
		profile.push({ r, y: -h2 + bodyH * t, smooth: i > 0 && i < steps });
	}
	b.revolve('paint-primary', profile);
	b.revolve('dark-metal', [
		{ r: R, y: h2 - collar },
		{ r: R, y: h2 - 0.02 },
		{ r: R * 0.94, y: h2 },
		{ r: 0, y: h2 }
	]);
	if (detail.extras >= 1) {
		b.revolve('paint-secondary', [
			{ r: R * 0.99, y: h2 - collar - 0.07 },
			{ r: R * 0.99, y: h2 - collar - 0.03 }
		]);
	}
}
