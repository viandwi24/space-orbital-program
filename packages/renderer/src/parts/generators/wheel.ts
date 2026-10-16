/** Reaction wheel: dark drum with a lit accent band, vents and an indicator lamp. */
import type { GenContext } from '../registry.ts';

export function reactionWheel(ctx: GenContext): void {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const rb = R * 0.93;
	const flange = Math.min(0.07, H * 0.2);
	// Flanges at both ends carry the attach faces.
	for (const s of [-1, 1] as const) {
		const edge = s * h2;
		const inner = s * (h2 - flange);
		b.revolve(
			'metal',
			s < 0
				? [
						{ r: 0, y: edge },
						{ r: R * 0.92, y: edge },
						{ r: R, y: edge + 0.02 },
						{ r: R, y: inner },
						{ r: rb, y: inner }
					]
				: [
						{ r: rb, y: inner },
						{ r: R, y: inner },
						{ r: R, y: edge - 0.02 },
						{ r: R * 0.92, y: edge },
						{ r: 0, y: edge }
					]
		);
	}
	// Drum, then a raised accent band in the middle.
	b.revolve('paint-secondary', [
		{ r: rb, y: -h2 + flange },
		{ r: rb, y: h2 - flange }
	]);
	const bandH = H * 0.3;
	b.revolve('paint-accent', [
		{ r: rb, y: -bandH / 2 },
		{ r: R * 0.97, y: -bandH / 2 + 0.012 },
		{ r: R * 0.97, y: bandH / 2 - 0.012 },
		{ r: rb, y: bandH / 2 }
	]);
	if (detail.extras >= 1) {
		const vents = detail.extras >= 2 ? 16 : 8;
		for (let i = 0; i < vents; i++) {
			const a = ((i + 0.5) / vents) * Math.PI * 2;
			b.box(
				'dark-metal',
				[0.085, bandH * 0.55, 0.012],
				[Math.sin(a) * R * 0.968, 0, Math.cos(a) * R * 0.968],
				a
			);
		}
		b.box('lamp', [0.05, 0.02, 0.012], [0, h2 - flange - 0.04, rb + 0.002]);
	}
}
