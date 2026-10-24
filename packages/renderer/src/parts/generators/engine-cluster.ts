/**
 * Cluster engine: one thrust plate and several bells on a ring, all hanging on the gimbal pivot
 * (plan 040, ADR 0081). Params: `bells` (2 to 9), `ring` (radius of the ring of bell axes, m),
 * `bellExit` (exit radius of each bell, m). `visual.plume.nozzles` lists each bell's exit centre.
 */
import type { ProfilePoint } from '../revolve.ts';
import type { GenContext, GeneratedPart } from '../registry.ts';
import { MAX_BELLS, MIN_BELLS, clusterLayout } from '../cluster.ts';
import { liveryOf } from './kit.ts';

export function engineCluster(ctx: GenContext): GeneratedPart {
	const { radius: R, height: H, builder: b, moving: m, detail } = ctx;
	const h2 = H / 2;
	const bells = Math.round(ctx.param('bells', 4, MIN_BELLS, MAX_BELLS));
	const exitR = ctx.param('bellExit', 0.2, 0.05, R * 0.5);
	const ring = ctx.param('ring', R * 0.5, 0, R - exitR);
	const throatR = Math.max(0.03, exitR * 0.3);
	const wall = 0.01;
	const plateBottom = h2 - 0.1;
	const throatY = plateBottom - 0.22;
	const bellLen = throatY + h2;
	const bellR = (y: number): number =>
		throatR + (exitR - throatR) * Math.pow(Math.max(0, (throatY - y) / bellLen), 0.58);

	b.revolve('dark-metal', [
		{ r: 0, y: plateBottom },
		{ r: R * 0.97, y: plateBottom },
		{ r: R, y: plateBottom + 0.02 },
		{ r: R, y: h2 - 0.02 },
		{ r: R * 0.94, y: h2 },
		{ r: 0, y: h2 }
	]);

	const outer: ProfilePoint[] = [
		{ r: exitR - wall, y: -h2 },
		{ r: exitR + wall, y: -h2 },
		{ r: exitR + wall, y: -h2 + 0.02, smooth: false }
	];
	const steps = 8;
	for (let i = 1; i <= steps; i++) {
		const y = -h2 + 0.02 + ((throatY - (-h2 + 0.02)) * i) / steps;
		outer.push({ r: bellR(y) + wall, y, smooth: true });
	}
	outer.push({ r: throatR + 0.05, y: throatY + 0.06, smooth: true });
	outer.push({ r: 0.07, y: plateBottom - 0.02, smooth: true });
	outer.push({ r: 0, y: plateBottom });
	const inner: ProfilePoint[] = [];
	for (let i = 0; i <= steps; i++) {
		const y = throatY - ((throatY + h2) * i) / steps;
		inner.push({ r: Math.max(0.008, bellR(y)), y, smooth: i > 0 && i < steps });
	}

	// many bells share the part's triangle budget: fewer sides each past four (plan 276)
	const bellSeg =
		bells > 4 ? { segments: Math.max(6, Math.round((m.segments * 4) / bells)) } : undefined;
	// plan 355: big first-stage engines in foil blankets, the outer ones under conical fairings
	const foil = liveryOf(ctx.visual.params) === 'foil-engines';
	const layout = clusterLayout(bells, ring, 0, ctx.visual.params?.centre === true);
	for (const [x, , z] of layout) {
		m.revolveAt(foil ? 'dark-metal' : 'nozzle', outer, [x, 0, z], bellSeg);
		m.revolveAt('nozzle-inner', inner, [x, 0, z], bellSeg);
		if (foil) {
			// the blanket: a puffy wrap over the upper bell and the turbopump above it
			const y0 = throatY - bellLen * 0.62;
			const wrap: ProfilePoint[] = [];
			for (let k = 0; k <= 5; k++) {
				const y = y0 + ((plateBottom - 0.02 - y0) * k) / 5;
				const puff = 1 + 0.06 * Math.sin(k * 2.1);
				wrap.push({ r: Math.max(bellR(Math.min(y, throatY)), throatR * 1.6) * puff + wall * 3, y });
			}
			m.revolveAt('blanket', wrap, [x, 0, z], bellSeg);
		}
		if (detail.extras >= 1 && bells <= 5) {
			for (const k of [2, 4]) {
				const y = throatY - (bellLen * k) / 6;
				m.revolveAt(
					'metal',
					[
						{ r: bellR(y - 0.02) + wall, y: y - 0.02 },
						{ r: bellR(y - 0.01) + wall + 0.01, y: y - 0.01 },
						{ r: bellR(y + 0.01) + wall + 0.01, y: y + 0.01 },
						{ r: bellR(y + 0.02) + wall, y: y + 0.02 }
					],
					[x, 0, z]
				);
			}
		}
	}

	// Verniers (plan 276, the RD-107's steering chambers): small bells on the outer rim between
	// the main ones, each on a pipe from the manifold. They swing with the engine and draw no plume.
	const verniers = Math.round(ctx.param('verniers', 0, 0, 4));
	if (verniers > 0) {
		const vr = Math.min(0.05, R * 0.08);
		const d = R - vr - 0.012;
		const vTop = -h2 + 0.42;
		const profile: ProfilePoint[] = [
			{ r: vr * 0.7, y: -h2 },
			{ r: vr, y: -h2 },
			{ r: vr * 0.82, y: -h2 + 0.12, smooth: true },
			{ r: vr * 0.5, y: -h2 + 0.26, smooth: true },
			{ r: vr * 0.6, y: vTop },
			{ r: 0, y: vTop + 0.04 }
		];
		for (let i = 0; i < verniers; i++) {
			const a = (i / verniers) * Math.PI * 2 + Math.PI / 2;
			const x = Math.sin(a) * d;
			const z = Math.cos(a) * d;
			m.revolveAt('nozzle', profile, [x, 0, z], { segments: 8 });
		}
	}

	if (foil) {
		// engine fairings round the outer bells: cones from the plate down a third of the bell
		const fair = Math.max(0.05, Math.min(exitR * 1.08, R * 0.995 - ring));
		for (const [x, , z] of layout) {
			if (Math.hypot(x, z) < 1e-6) continue;
			b.revolveAt(
				'paint-secondary',
				[
					{ r: fair * 0.98, y: throatY - bellLen * 0.32 },
					{ r: fair, y: throatY - bellLen * 0.3 },
					{ r: fair * 0.72, y: plateBottom - 0.01 },
					{ r: 0.01, y: plateBottom }
				],
				[x, 0, z],
				bellSeg
			);
		}
	}

	// A manifold ring under the plate that the bells hang from.
	b.revolve('metal', [
		{ r: ring + exitR * 0.5, y: plateBottom },
		{ r: ring + exitR * 0.5, y: plateBottom - 0.04 },
		{ r: Math.max(0.02, ring - exitR * 0.5), y: plateBottom - 0.04 },
		{ r: Math.max(0.02, ring - exitR * 0.5), y: plateBottom }
	]);

	// A skirt from the plate's rim to the part below covers the bells (plan 207).
	return {
		pivot: [0, plateBottom, 0],
		shroud: { top: plateBottom + 0.02, bottom: -h2, radius: R, when: 'always' }
	};
}
