/**
 * Reference vessels of each variant (plan 124, ADR 0184 point 6): stock parts as they are in every
 * system (plan 380, ADR 0317). The validation suite flies them; players can start from them.
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

/**
 * Two stages to a low Earth orbit at real scale (plan 380): a kerolox first stage on nine
 * Merlin-class bells and a hydrolox upper stage on a J-2-class engine, like a Falcon 9 with a
 * Centaur on top. About 12 km/s against the 9.4 km/s a low orbit costs.
 */
export function realScaleRocket(): VesselDesign {
	const chain = [
		'stock.command-pod',
		'stock.reaction-wheel',
		'stock.reaction-wheel',
		'stock.adapter-large',
		'stock.tank-wide',
		'stock.tank-wide',
		'stock.engine-vacuum-xl',
		'stock.decoupler-wide',
		'stock.adapter-2500-3750',
		'stock.tank-3750-long',
		'stock.tank-3750-long',
		'stock.engine-plate-9'
	];
	return stack('Sol 1:1 orbiter', chain, [[chain.length - 1], [7, 6]]);
}

/** Two stages to a low orbit of the rescaled Earth: a 2.5 m kerolox first stage, the LV-T30 above. */
export function rescaledRocket(): VesselDesign {
	const chain = [
		'stock.command-pod',
		'stock.reaction-wheel',
		'stock.reaction-wheel',
		'stock.tank-medium',
		'stock.engine-lv',
		'stock.decoupler',
		'stock.adapter-large',
		'stock.tank-wide',
		'stock.engine-wide'
	];
	return stack('Sol rescaled orbiter', chain, [[chain.length - 1], [5, 4]]);
}

/** A lunar orbiter: a probe core with a dish, for the link check. */
export function lunarOrbiter(): VesselDesign {
	return stack('Sol lunar orbiter', ['stock.probe-core', 'stock.dish-antenna'], []);
}

/**
 * A transfer stage, placed in the parking orbit the ascent reached: pod, wheel, tank, engine. The tank
 * is a later-tier 1.875 m one (plan 380): the early-era medium tank leaves it short of the Moon.
 */
export function transferStage(): VesselDesign {
	return stack(
		'Sol transfer stage',
		['stock.command-pod', 'stock.reaction-wheel', 'stock.tank-1875', 'stock.engine-lv'],
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
