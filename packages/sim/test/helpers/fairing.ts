/** Plan 219 test helpers: a probe in a closed 1.25 m fairing on a tank, and its masses. */
import { partId, type VesselDesign } from '@orbital/core';
import { fairingMass, fairingConfigSchema } from '@orbital/mod-stock';

export const SECTIONS = [
	{ height: 0.6, radius: 0.8 },
	{ height: 0.4, radius: 0.8 }
];

/** Tank (root), fairing base on it, probe core on the base; with `sections`, a closed shell. */
export function fairingStack(sections = SECTIONS, closed = true): VesselDesign {
	return {
		formatVersion: 3,
		name: 'Faired probe',
		parts: [
			{ index: 0, part: partId('stock.tank-small'), parent: null },
			{
				index: 1,
				part: partId('stock.fairing-base'),
				parent: { index: 0, parentNode: 'top', node: 'bottom' },
				...(sections.length > 0 ? { settings: { 'stock.fairing': { sections, closed } } } : {})
			},
			{
				index: 2,
				part: partId('stock.probe-core'),
				parent: { index: 1, parentNode: 'top', node: 'bottom' }
			}
		],
		stages: [[1]]
	} as VesselDesign;
}

/** The shell's mass for these sections on the 1.25 m base, kg. */
export const shellMass = (sections = SECTIONS, closed = true): number =>
	fairingMass(fairingConfigSchema.parse({ size: 1.25, baseTop: 0.1, sections, closed }));

/**
 * Tank (root), an interstage on it with a probe core inside and a second tank on its top node
 * (plan 243, ADR 0238).
 */
export function interstageStack(sections = SECTIONS): VesselDesign {
	const d = fairingStack(sections, false);
	const parts = d.parts.map((p) =>
		p.index === 1
			? { ...p, settings: { 'stock.fairing': { sections, closed: false, interstage: true } } }
			: p
	);
	return {
		...d,
		name: 'Interstage',
		parts: [
			...parts,
			{
				index: 3,
				part: partId('stock.tank-small'),
				parent: { index: 1, parentNode: 'interstage', node: 'bottom' }
			}
		]
	} as VesselDesign;
}
