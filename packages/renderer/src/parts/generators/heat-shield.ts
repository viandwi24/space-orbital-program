/** Ablative heat shield: tiled convex dish facing -Y, retaining ring and bolts. */
import type { ProfilePoint } from '../revolve.ts';
import type { GenContext } from '../registry.ts';

export function heatShield(ctx: GenContext): void {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const ringBottom = -h2 + 0.09;
	const rimY = ringBottom - 0.01;
	// Retaining ring and mounting plate (the attach face on top).
	b.revolve('dark-metal', [
		{ r: R * 0.97, y: rimY },
		{ r: R, y: ringBottom },
		{ r: R, y: h2 - 0.02 },
		{ r: R * 0.94, y: h2 },
		{ r: 0, y: h2 }
	]);
	// The dish, walked from the axis out to the rim: lowest point on the axis at -h2.
	const steps = 8;
	const depth = rimY + h2;
	const dish: ProfilePoint[] = [];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		dish.push({
			r: R * 0.97 * t,
			y: -h2 + depth * (1 - Math.sqrt(Math.max(0, 1 - t * t))),
			smooth: i > 0 && i < steps
		});
	}
	b.revolve('ablator', dish);
	if (detail.extras >= 1) {
		const bolts = detail.extras >= 2 ? 32 : 16;
		for (let i = 0; i < bolts; i++) {
			const a = ((i + 0.5) / bolts) * Math.PI * 2;
			b.cylinder(
				'metal',
				0.014,
				0.02,
				[Math.sin(a) * R * 0.975, (ringBottom + h2 - 0.02) / 2, Math.cos(a) * R * 0.975],
				{ segments: 8 }
			);
		}
	}
}
