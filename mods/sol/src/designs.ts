/**
 * Reference vessels of each variant (plan 124, ADR 0184 point 6): stock parts under the variant's
 * balance profile. The validation suite flies them; players can start from them.
 */
import { partId, type VesselDesign } from '@orbital/sdk';

/** A straight stack, top first; `stages` fire in order (indices into `chain`). */
function stack(name: string, chain: readonly string[], stages: number[][]): VesselDesign {
	return {
		formatVersion: 1,
		name,
		parts: chain.map((part, index) => ({
			index,
			part: partId(part),
			parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
		})),
		stages
	};
}

/** Two stages to a low Earth orbit at real scale. */
export function realScaleRocket(): VesselDesign {
	const chain = [
		'stock.command-pod',
		'stock.reaction-wheel',
		'stock.reaction-wheel',
		'stock.tank-medium',
		'stock.tank-medium',
		'stock.engine-lv',
		'stock.decoupler',
		'stock.tank-medium',
		'stock.tank-medium',
		'stock.tank-medium',
		'stock.tank-medium',
		'stock.tank-medium',
		'stock.tank-medium',
		'stock.engine-lv'
	];
	return stack('Sol 1:1 orbiter', chain, [[chain.length - 1], [6, 5]]);
}

/** Two stages to a low orbit of the rescaled Earth. */
export function rescaledRocket(): VesselDesign {
	const chain = [
		'stock.command-pod',
		'stock.reaction-wheel',
		'stock.reaction-wheel',
		'stock.tank-medium',
		'stock.engine-lv',
		'stock.decoupler',
		'stock.tank-medium',
		'stock.tank-medium',
		'stock.engine-lv'
	];
	return stack('Sol rescaled orbiter', chain, [[chain.length - 1], [5, 4]]);
}

/** A lunar orbiter: a probe core with a dish, for the link check. */
export function lunarOrbiter(): VesselDesign {
	return stack('Sol lunar orbiter', ['stock.probe-core', 'stock.dish-antenna'], []);
}

/** A transfer stage, placed in the parking orbit the ascent reached: pod, wheel, tank, engine. */
export function transferStage(): VesselDesign {
	return stack(
		'Sol transfer stage',
		['stock.command-pod', 'stock.reaction-wheel', 'stock.tank-medium', 'stock.engine-lv'],
		[[3]]
	);
}

/** A shielded probe for the re-entry check: pod, wheel, tank, heat shield (tail first). */
export function shieldedProbe(): VesselDesign {
	return stack(
		'Sol shielded probe',
		['stock.command-pod', 'stock.reaction-wheel', 'stock.tank-small', 'stock.heat-shield'],
		[]
	);
}
