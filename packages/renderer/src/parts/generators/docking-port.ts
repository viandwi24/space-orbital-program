/**
 * Docking port (plan 222): a mounting collar, a short drum, and the docking ring on top with a
 * recessed face and three guide petals. Both faces reach the node radius (the plan 207 seams).
 */
import type { GenContext } from '../registry.ts';

export function dockingPort(ctx: GenContext): void {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const drum = R * 0.9;
	// the collar on the part below
	b.revolve('dark-metal', [
		{ r: 0, y: -h2 },
		{ r: R * 0.97, y: -h2 },
		{ r: R, y: -h2 + 0.015 },
		{ r: R, y: -h2 + 0.05 },
		{ r: drum, y: -h2 + 0.06 }
	]);
	b.revolve('paint-primary', [
		{ r: drum, y: -h2 + 0.06 },
		{ r: drum, y: h2 - 0.08 }
	]);
	// the docking ring and its recessed face
	b.revolve('metal', [
		{ r: drum, y: h2 - 0.08 },
		{ r: R, y: h2 - 0.06 },
		{ r: R, y: h2 - 0.015 },
		{ r: R * 0.85, y: h2 },
		{ r: R * 0.55, y: h2 },
		{ r: R * 0.5, y: h2 - 0.03 },
		{ r: 0, y: h2 - 0.03 }
	]);
	b.revolve('paint-accent', [
		{ r: drum + 0.003, y: -h2 + 0.09 },
		{ r: drum + 0.003, y: -h2 + 0.12 }
	]);
	if (detail.extras >= 1) {
		// three guide petals on the ring, inside its radius
		for (let i = 0; i < 3; i++) {
			const a = (i / 3) * Math.PI * 2;
			const r = R * 0.7;
			b.box('dark-metal', [R * 0.18, 0.03, 0.02], [Math.sin(a) * r, h2 - 0.02, Math.cos(a) * r], a);
		}
	}
}
