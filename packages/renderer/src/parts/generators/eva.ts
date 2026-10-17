/**
 * EVA figures (plan 109, ADR 0120 point 7): a suited crew member (boots, legs, torso, arms, pack,
 * helmet with a visor; no KSP likeness) and a planted flag (pole, cloth, foot). Both fit the part's
 * box shape.
 */
import type { GenContext } from '../registry.ts';

export function suit(ctx: GenContext): void {
	const { builder: b, size } = ctx;
	const k = size[1] / 1.8; // the figures are drawn for a 1.8 m suit
	const y = (v: number) => v * k;
	for (const side of [-1, 1]) {
		b.box('dark-metal', [0.2 * k, 0.12 * k, 0.28 * k], [side * 0.12 * k, y(-0.84), 0.03 * k]);
		b.box('paint-primary', [0.18 * k, 0.72 * k, 0.2 * k], [side * 0.12 * k, y(-0.42), 0]);
		b.box('paint-primary', [0.13 * k, 0.56 * k, 0.14 * k], [side * 0.32 * k, y(0.18), 0]);
		b.box('rubber', [0.12 * k, 0.1 * k, 0.12 * k], [side * 0.32 * k, y(-0.14), 0]);
	}
	b.box('paint-primary', [0.5 * k, 0.64 * k, 0.32 * k], [0, y(0.22), 0]);
	b.box('paint-accent', [0.5 * k, 0.05 * k, 0.33 * k], [0, y(0.0), 0]);
	b.box('paint-secondary', [0.42 * k, 0.52 * k, 0.16 * k], [0, y(0.24), -0.23 * k]);
	b.revolveAt(
		'paint-primary',
		[
			{ r: 0, y: -0.17 * k },
			{ r: 0.13 * k, y: -0.14 * k },
			{ r: 0.17 * k, y: 0 },
			{ r: 0.13 * k, y: 0.14 * k },
			{ r: 0, y: 0.17 * k }
		],
		[0, y(0.72), 0]
	);
	b.box('glass', [0.22 * k, 0.12 * k, 0.04 * k], [0, y(0.73), 0.15 * k]);
}

export function flag(ctx: GenContext): void {
	const { builder: b, size } = ctx;
	const h = size[1];
	b.cylinder('metal', 0.02, h, [0, 0, 0], { segments: 10 });
	b.cylinder('dark-metal', 0.16, 0.04, [0, -h / 2 + 0.02, 0], { segments: 16 });
	b.box('paint-accent', [0.7, 0.45, 0.01], [0.36, h / 2 - 0.3, 0]);
	b.box('paint-primary', [0.7, 0.06, 0.012], [0.36, h / 2 - 0.3, 0]);
}
