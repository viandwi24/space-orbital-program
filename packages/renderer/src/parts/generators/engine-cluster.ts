/**
 * Cluster engine: one thrust plate and several bells on a ring, all hanging on the gimbal pivot
 * (plan 040, ADR 0081). Params: `bells` (2 to 9), `ring` (radius of the ring of bell axes, m),
 * `bellExit` (exit radius of each bell, m). `visual.plume.nozzles` lists each bell's exit centre.
 */
import type { ProfilePoint } from '../revolve.ts';
import type { GenContext, GeneratedPart } from '../registry.ts';
import { MAX_BELLS, MIN_BELLS, clusterLayout } from '../cluster.ts';

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
	for (const [x, , z] of clusterLayout(bells, ring, 0, ctx.visual.params?.centre === true)) {
		m.revolveAt('nozzle', outer, [x, 0, z], bellSeg);
		m.revolveAt('nozzle-inner', inner, [x, 0, z], bellSeg);
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
