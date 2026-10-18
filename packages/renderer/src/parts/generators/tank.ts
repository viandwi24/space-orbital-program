/** Propellant tank: painted barrel, forged end collars, stripe, bands, ribs and a feed line. */
import type { ProfilePoint } from '../revolve.ts';
import type { GenContext } from '../registry.ts';

export function tank(ctx: GenContext): void {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const rb = R * 0.955;
	const collar = ctx.param('collar', 0.12, 0.06, 0.3);
	const stripe = ctx.param('stripe', 0.28, 0, 0.9);
	const bands = Math.round(ctx.param('bands', Math.max(1, Math.round(H / 1.4)), 0, 8));

	// End collars: dark forged rings that carry the attach faces.
	const lower: ProfilePoint[] = [
		{ r: 0, y: -h2 },
		{ r: R * 0.9, y: -h2 },
		{ r: R, y: -h2 + 0.03 },
		{ r: R, y: -h2 + collar - 0.025 },
		{ r: rb + 0.012, y: -h2 + collar },
		{ r: rb + 0.012, y: -h2 + collar + 0.01 },
		{ r: rb, y: -h2 + collar + 0.01 }
	];
	b.revolve('dark-metal', lower);
	b.revolve('dark-metal', lower.map((p) => ({ ...p, y: -p.y })).reverse());

	// Barrel in the primary paint.
	b.revolve('paint-primary', [
		{ r: rb, y: -h2 + collar + 0.01 },
		{ r: rb, y: h2 - collar - 0.01 }
	]);

	// A painted roll stripe near the top (secondary), a thin accent line under it.
	let stripeBottom = h2 - collar;
	if (stripe > 0.01) {
		const top = h2 - collar - 0.12;
		const bottom = Math.max(-h2 + collar + 0.2, top - stripe * Math.min(1.2, H * 0.4));
		stripeBottom = bottom - 0.08;
		// A part too short for the band gets only the accent line: a band from `bottom` down to
		// `top` would run top to bottom and face inward (plan 207).
		if (bottom < top) {
			b.revolve('paint-secondary', [
				{ r: rb + 0.004, y: bottom },
				{ r: rb + 0.004, y: top }
			]);
		}
		b.revolve('paint-accent', [
			{ r: rb + 0.006, y: bottom - 0.05 },
			{ r: rb + 0.006, y: bottom - 0.02 }
		]);
	}

	// Raised bands (circumferential welds / stiffener rings).
	if (detail.extras >= 1) {
		for (let i = 1; i <= bands; i++) {
			const y = -h2 + (H * i) / (bands + 1);
			b.revolve('metal', [
				{ r: rb, y: y - 0.04 },
				{ r: rb + 0.014, y: y - 0.028 },
				{ r: rb + 0.014, y: y + 0.028 },
				{ r: rb, y: y + 0.04 }
			]);
		}
		// Vertical stringers between the collars.
		const ribs = detail.extras >= 2 ? 16 : 8;
		const ribBottom = -h2 + collar + 0.08;
		const len = stripeBottom - 0.04 - ribBottom;
		for (let i = 0; i < ribs && len > 0.2; i++) {
			const a = ((i + 0.5) / ribs) * Math.PI * 2;
			b.box(
				'paint-primary',
				[0.035, len, 0.012],
				[Math.sin(a) * (rb + 0.005), ribBottom + len / 2, Math.cos(a) * (rb + 0.005)],
				a
			);
		}
	}

	// Feed line with two clamps on one side.
	// (a part too short for the line between its collars has none: it would poke through a face)
	if (detail.extras >= 2 && H - 2 * collar - 0.1 > 0.1) {
		const a = Math.PI * 0.25;
		const px = Math.sin(a) * (rb + 0.004);
		const pz = Math.cos(a) * (rb + 0.004);
		b.cylinder('metal', 0.018, H - 2 * collar - 0.1, [px, 0, pz], { segments: 12 });
		for (const t of [-0.3, 0.3]) {
			b.cylinder('dark-metal', 0.026, 0.04, [Math.sin(a) * rb, t * H, Math.cos(a) * rb], {
				segments: 12
			});
		}
	}
}
