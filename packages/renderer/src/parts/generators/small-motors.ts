/**
 * Small motors (plan 276): the 0.625 m engine (a short chamber and a wide bell on a thrust plate)
 * and the separatron (a small solid motor with a bare nozzle that pushes a spent stage away).
 */
import type { ProfilePoint } from '../revolve.ts';
import type { GenContext, GeneratedPart } from '../registry.ts';

/** A mini liquid engine: plate, dome, one pump and a wide bell. Param `bellExit`: exit radius, m. */
export function engineMini(ctx: GenContext): GeneratedPart {
	const { radius: R, height: H, builder: b, moving: m, detail } = ctx;
	const h2 = H / 2;
	const exitR = ctx.param('bellExit', R * 0.85, 0.05, R * 0.95);
	const throatR = exitR * 0.22;
	const wall = 0.008;
	const plateBottom = h2 - 0.08;
	const throatY = h2 - H * 0.42;
	const bellLen = throatY + h2;
	const bellR = (y: number): number =>
		throatR + (exitR - throatR) * Math.pow(Math.max(0, (throatY - y) / bellLen), 0.58);
	b.revolve('dark-metal', [
		{ r: 0, y: plateBottom },
		{ r: R * 0.97, y: plateBottom },
		{ r: R, y: plateBottom + 0.015 },
		{ r: R, y: h2 - 0.015 },
		{ r: R * 0.94, y: h2 },
		{ r: 0, y: h2 }
	]);
	const outer: ProfilePoint[] = [
		{ r: exitR - wall, y: -h2 },
		{ r: exitR + wall, y: -h2 },
		{ r: exitR + wall, y: -h2 + 0.015 }
	];
	const steps = 8;
	for (let i = 1; i <= steps; i++) {
		const y = -h2 + 0.015 + ((throatY - (-h2 + 0.015)) * i) / steps;
		outer.push({ r: bellR(y) + wall, y, smooth: true });
	}
	outer.push({ r: R * 0.34, y: throatY + 0.05, smooth: true });
	outer.push({ r: R * 0.36, y: plateBottom - 0.06, smooth: true });
	outer.push({ r: R * 0.2, y: plateBottom - 0.015, smooth: true });
	outer.push({ r: 0, y: plateBottom });
	m.revolve('nozzle', outer);
	const inner: ProfilePoint[] = [];
	for (let i = 0; i <= steps; i++) {
		const y = throatY - ((throatY + h2) * i) / steps;
		inner.push({ r: Math.max(0.008, bellR(y)), y, smooth: i > 0 && i < steps });
	}
	m.revolve('nozzle-inner', inner);
	if (detail.extras >= 1) {
		m.revolveAt(
			'paint-primary',
			[
				{ r: 0, y: -0.06 },
				{ r: 0.045, y: -0.06 },
				{ r: 0.045, y: 0.05 },
				{ r: 0, y: 0.07 }
			],
			[R * 0.5, throatY + 0.1, 0],
			{ segments: 10 }
		);
	}
	return {
		pivot: [0, plateBottom, 0],
		shroud: { top: plateBottom + 0.02, bottom: -h2, radius: R, when: 'always' }
	};
}

/**
 * A separatron: a small solid motor for the side of a stage. A painted case with a nose cap, a
 * mounting strap and a bare nozzle at the bottom.
 */
export function separatron(ctx: GenContext): void {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const rb = R * 0.96;
	const exitR = R * 0.8;
	b.revolve('dark-metal', [
		{ r: exitR * 0.5, y: -h2 },
		{ r: exitR, y: -h2 },
		{ r: exitR, y: -h2 + 0.02 },
		{ r: exitR * 0.4, y: -h2 + H * 0.28, smooth: true },
		{ r: rb, y: -h2 + H * 0.3 }
	]);
	b.revolve('paint-primary', [
		{ r: rb, y: -h2 + H * 0.3 },
		{ r: rb, y: h2 - 0.04 }
	]);
	b.revolve('paint-accent', [
		{ r: rb + 0.003, y: h2 - 0.12 },
		{ r: rb + 0.003, y: h2 - 0.08 }
	]);
	b.revolve('dark-metal', [
		{ r: rb, y: h2 - 0.04 },
		{ r: R * 0.7, y: h2 - 0.01, smooth: true },
		{ r: 0, y: h2 }
	]);
	if (detail.extras >= 1) {
		b.revolve('metal', [
			{ r: rb, y: -0.02 },
			{ r: R, y: -0.012 },
			{ r: R, y: 0.012 },
			{ r: rb, y: 0.02 }
		]);
	}
}
