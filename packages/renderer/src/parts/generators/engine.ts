/** Liquid engine: thrust plate, struts, chamber with dome, flared bell with ribs, turbopumps, plumbing. */
import type { ProfilePoint } from '../revolve.ts';
import type { GenContext } from '../registry.ts';

export function engine(ctx: GenContext): void {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const exitR = ctx.param('bellExit', 0.47, 0.15, R * 0.9);
	const throatR = ctx.param('throat', 0.13, 0.04, exitR * 0.6);
	const wall = 0.012;
	const plateBottom = h2 - 0.12;
	const chamberTop = plateBottom - 0.04;
	const throatY = h2 - 0.56; // y of the throat (0.04 for a 1.2 m part)
	const bellLen = throatY + h2;
	const bellR = (y: number): number =>
		throatR + (exitR - throatR) * Math.pow(Math.max(0, (throatY - y) / bellLen), 0.58);

	// Thrust plate (attach face on top).
	b.revolve('dark-metal', [
		{ r: 0, y: plateBottom },
		{ r: R * 0.97, y: plateBottom },
		{ r: R, y: plateBottom + 0.02 },
		{ r: R, y: h2 - 0.02 },
		{ r: R * 0.94, y: h2 },
		{ r: 0, y: h2 }
	]);

	// Bell outside (walked from the exit lip up to the chamber dome), then the sooty inside.
	const outer: ProfilePoint[] = [
		{ r: exitR - wall, y: -h2 },
		{ r: exitR + wall, y: -h2 },
		{ r: exitR + wall, y: -h2 + 0.02, smooth: false }
	];
	const bellSteps = 12;
	for (let i = 1; i <= bellSteps; i++) {
		const y = -h2 + 0.02 + ((throatY - (-h2 + 0.02)) * i) / bellSteps;
		outer.push({ r: bellR(y) + wall, y, smooth: true });
	}
	const chamber: Array<[number, number]> = [
		[throatR + 0.05, throatY + 0.06],
		[0.2, throatY + 0.16],
		[0.215, throatY + 0.27],
		[0.19, chamberTop - 0.08],
		[0.1, chamberTop - 0.02],
		[0, chamberTop]
	];
	chamber.forEach(([r, y], i) => outer.push({ r, y, smooth: i < chamber.length - 1 }));
	b.revolve('nozzle', outer);

	const inner: ProfilePoint[] = [];
	for (let i = 0; i <= bellSteps; i++) {
		const y = throatY - ((throatY + h2) * i) / bellSteps;
		inner.push({ r: Math.max(0.01, bellR(y)), y, smooth: i > 0 && i < bellSteps });
	}
	b.revolve('nozzle-inner', inner);

	// Cooling bands on the bell.
	if (detail.extras >= 1) {
		for (let k = 1; k <= 5; k++) {
			const y = throatY - (bellLen * k) / 6.2;
			b.revolve('metal', [
				{ r: bellR(y - 0.025) + wall, y: y - 0.025 },
				{ r: bellR(y - 0.015) + wall + 0.014, y: y - 0.015 },
				{ r: bellR(y + 0.015) + wall + 0.014, y: y + 0.015 },
				{ r: bellR(y + 0.025) + wall, y: y + 0.025 }
			]);
		}
	}

	// Struts from the plate to the chamber shoulder.
	const strutFrom: [number, number] = [R * 0.8, plateBottom + 0.02];
	const strutTo: [number, number] = [0.22, throatY + 0.2];
	const sx = (strutFrom[0] + strutTo[0]) / 2;
	const sy = (strutFrom[1] + strutTo[1]) / 2;
	const slope = Math.atan2(strutFrom[1] - strutTo[1], strutFrom[0] - strutTo[0]);
	const len = Math.hypot(strutFrom[0] - strutTo[0], strutFrom[1] - strutTo[1]);
	const azimuths = detail.extras >= 1 ? 4 : 0;
	for (let i = 0; i < azimuths; i++) {
		const a = ((i + 0.5) / azimuths) * Math.PI * 2;
		b.box(
			'dark-metal',
			[len, 0.035, 0.045],
			[Math.sin(a) * sx, sy, Math.cos(a) * sx],
			a - Math.PI / 2,
			slope
		);
	}

	// Turbopump beside the chamber, with feed and exhaust pipes.
	const px = 0.34;
	const py = throatY + 0.12;
	b.revolveAt(
		'paint-primary',
		[
			{ r: 0, y: -0.14 },
			{ r: 0.085, y: -0.14 },
			{ r: 0.085, y: 0.1 },
			{ r: 0.06, y: 0.15 },
			{ r: 0, y: 0.16 }
		],
		[px, py, 0]
	);
	b.revolveAt(
		'metal',
		[
			{ r: 0.085, y: -0.02 },
			{ r: 0.1, y: -0.02 },
			{ r: 0.1, y: 0.03 },
			{ r: 0.085, y: 0.03 }
		],
		[px, py, 0]
	);
	b.cylinder('nozzle', 0.016, px - 0.19, [(px + 0.19) / 2, py + 0.06, 0], {
		tiltZ: Math.PI / 2,
		segments: 12
	});
	if (detail.extras >= 1) {
		b.cylinder('metal', 0.02, 0.24, [px, throatY - 0.12, 0], { segments: 12 });
		b.cylinder('metal', 0.02, 0.1, [px - 0.005, throatY - 0.26, 0], {
			segments: 12,
			tiltZ: -0.5
		});
	}
	if (detail.extras >= 2) {
		// A smaller second pump opposite, and feed lines up to the plate.
		b.revolveAt(
			'paint-secondary',
			[
				{ r: 0, y: -0.1 },
				{ r: 0.06, y: -0.1 },
				{ r: 0.06, y: 0.08 },
				{ r: 0, y: 0.1 }
			],
			[-0.3, py + 0.04, 0]
		);
		b.cylinder('nozzle', 0.014, 0.15, [-0.245, py + 0.1, 0], { tiltZ: Math.PI / 2, segments: 10 });
		for (const s of [0.23, -0.23]) {
			b.cylinder('metal', 0.017, 0.28, [0, throatY + 0.2, s], { segments: 10 });
		}
	}
}
