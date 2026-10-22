/**
 * Docking port (plan 222): a mounting collar, a short drum, and the docking ring on top with a
 * recessed face and three guide petals. Both faces reach the node radius (the plan 207 seams).
 */
import { Matrix4 } from 'three';
import type { GenContext } from '../registry.ts';
import { revolve } from '../revolve.ts';

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

/**
 * A side port (plan 356): a white drum between two joint collars, with a docking ring standing out
 * of its side (+Z), the face at the part's `side` node.
 */
export function sidePort(ctx: GenContext): void {
	const { height: H, builder: b } = ctx;
	// the drum's radius; the part is wider by the ring standing out of its side
	const R = ctx.param('body', 0.625, 0.2, ctx.radius);
	const h2 = H / 2;
	const drum = R * 0.94;
	b.revolve('dark-metal', [
		{ r: 0, y: -h2 },
		{ r: R * 0.97, y: -h2 },
		{ r: R, y: -h2 + 0.015 },
		{ r: R, y: -h2 + 0.05 },
		{ r: drum, y: -h2 + 0.06 }
	]);
	b.revolve('paint-primary', [
		{ r: drum, y: -h2 + 0.06 },
		{ r: drum, y: h2 - 0.06 }
	]);
	b.revolve('dark-metal', [
		{ r: drum, y: h2 - 0.06 },
		{ r: R, y: h2 - 0.05 },
		{ r: R, y: h2 - 0.015 },
		{ r: R * 0.97, y: h2 },
		{ r: 0, y: h2 }
	]);
	for (const y of [-h2 + 0.14, h2 - 0.17])
		b.revolve('paint-accent', [
			{ r: drum + 0.003, y },
			{ r: drum + 0.003, y: y + 0.03 }
		]);
	// the ring, drawn along +Y and turned onto +Z; its face at the node, 0.69 m out
	const face = 0.69;
	const ring = R * 0.5;
	const m = new Matrix4().makeRotationX(Math.PI / 2);
	const seg = Math.max(12, b.segments);
	b.add(
		'paint-primary',
		revolve(
			[
				{ r: ring * 0.85, y: drum * 0.7 },
				{ r: ring * 0.85, y: face - 0.09 }
			],
			{ segments: seg }
		),
		m
	);
	b.add(
		'metal',
		revolve(
			[
				{ r: ring * 0.85, y: face - 0.09 },
				{ r: ring, y: face - 0.07 },
				{ r: ring, y: face - 0.015 },
				{ r: ring * 0.85, y: face },
				{ r: ring * 0.55, y: face },
				{ r: ring * 0.5, y: face - 0.03 },
				{ r: 0, y: face - 0.03 }
			],
			{ segments: seg }
		),
		m
	);
}
