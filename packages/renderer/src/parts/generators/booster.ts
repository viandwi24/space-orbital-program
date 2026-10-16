/** Side booster: painted body with stripes and rings, a skirt around a bell nozzle, a flat top ring. */
import type { ProfilePoint } from '../revolve.ts';
import type { GenContext } from '../registry.ts';

export function booster(ctx: GenContext): void {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const rb = R * 0.965;
	const skirtTop = -h2 + 0.55;
	const exitR = ctx.param('bellExit', 0.3, 0.1, R * 0.9);
	const throatR = 0.09;

	// Top ring (the attach face for a cone).
	b.revolve('dark-metal', [
		{ r: 0, y: h2 },
		{ r: R * 0.94, y: h2 },
		{ r: R, y: h2 - 0.025 },
		{ r: R, y: h2 - 0.14 },
		{ r: rb, y: h2 - 0.155 }
	]);
	// Body.
	b.revolve('paint-primary', [
		{ r: rb, y: skirtTop + 0.18 },
		{ r: rb, y: h2 - 0.155 }
	]);
	// Stripes: a secondary band under the top ring and an accent line below it.
	const band = ctx.param('stripe', 0.5, 0, 1.2);
	if (band > 0.01) {
		b.revolve('paint-secondary', [
			{ r: rb + 0.004, y: h2 - 0.3 - band },
			{ r: rb + 0.004, y: h2 - 0.3 }
		]);
		b.revolve('paint-accent', [
			{ r: rb + 0.006, y: h2 - 0.36 - band },
			{ r: rb + 0.006, y: h2 - 0.31 - band }
		]);
	}
	if (detail.extras >= 1) {
		for (const t of [0.25, 0.5, 0.75]) {
			const y = skirtTop + 0.3 + (h2 - 0.5 - skirtTop) * t;
			b.revolve('metal', [
				{ r: rb, y: y - 0.03 },
				{ r: rb + 0.012, y: y - 0.02 },
				{ r: rb + 0.012, y: y + 0.02 },
				{ r: rb, y: y + 0.03 }
			]);
		}
		const ribs = detail.extras >= 2 ? 12 : 6;
		for (let i = 0; i < ribs; i++) {
			const a = ((i + 0.5) / ribs) * Math.PI * 2;
			b.box(
				'paint-primary',
				[0.03, h2 - 0.6 - (skirtTop + 0.3), 0.012],
				[Math.sin(a) * (rb + 0.005), (h2 - 0.6 + skirtTop + 0.3) / 2, Math.cos(a) * (rb + 0.005)],
				a
			);
		}
	}
	// Skirt: dark ring tapering to the bell.
	b.revolve('dark-metal', [
		{ r: exitR + 0.02, y: -h2 + 0.12 },
		{ r: R * 0.9, y: -h2 + 0.3 },
		{ r: R, y: skirtTop - 0.1 },
		{ r: R, y: skirtTop + 0.15 },
		{ r: rb, y: skirtTop + 0.18 }
	]);
	// Bell: outside, then the sooty inside.
	const outer: ProfilePoint[] = [];
	const inner: ProfilePoint[] = [];
	const steps = 10;
	const topY = -h2 + 0.5;
	const bottomY = -h2;
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const y = topY + (bottomY - topY) * t;
		const r = throatR + (exitR - throatR) * Math.pow(t, 0.6);
		outer.unshift({ r: r + 0.012, y, smooth: i > 0 && i < steps });
		inner.push({ r: Math.max(0.01, r), y, smooth: i > 0 && i < steps });
	}
	b.revolve('nozzle', [{ r: 0, y: topY + 0.05 }, ...outer.reverse().reverse()]);
	b.revolve('nozzle-inner', inner.reverse());
}
