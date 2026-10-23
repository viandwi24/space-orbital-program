/**
 * The Library's completeness checklist (plan 312, ADR 0263): what a blueprint carries for the trip it
 * is for (RCS, an antenna, power, parachutes, life support, a heat shield), read from the modules of
 * its parts. An item is `expected` when the card's goal and crew call for it; a missing expected item
 * is a gap the card says so. Pure.
 */
import type { PartLookup, VesselDesign } from '@orbital/core';
import type { BlueprintCard } from './blueprints';

export type ChecklistId =
	'rcs' | 'antenna' | 'power' | 'parachute' | 'life-support' | 'heat-shield';

export interface ChecklistItem {
	id: ChecklistId;
	label: string;
	/** The design has a part with the module. */
	present: boolean;
	/** The card's goal and crew call for it. */
	expected: boolean;
	/** Why it matters, for the missing case. */
	why: string;
}

/** The modules that give each capability. */
const MODULES: Readonly<Record<ChecklistId, readonly string[]>> = {
	rcs: ['stock.rcs'],
	antenna: ['stock.antenna'],
	power: ['stock.solar-panel', 'stock.fuel-cell', 'stock.rtg'],
	parachute: ['stock.parachute'],
	'life-support': ['stock.scrubber'],
	'heat-shield': ['stock.heat-shield']
};

const LABEL: Readonly<Record<ChecklistId, string>> = {
	rcs: 'RCS',
	antenna: 'Antenna',
	power: 'Power',
	parachute: 'Parachutes',
	'life-support': 'Life support',
	'heat-shield': 'Heat shield'
};

const WHY: Readonly<Record<ChecklistId, string>> = {
	rcs: 'Docking and fine pointing need thrusters.',
	antenna: 'Without an antenna the vessel cannot report or be commanded beyond the pad.',
	power: 'Probes and long trips need a source beyond the batteries.',
	parachute: 'A crewed capsule needs parachutes to come home.',
	'life-support': 'Crew on a long trip need their air scrubbed.',
	'heat-shield': 'A return from orbit or beyond needs a shield.'
};

/** Which items a card's trip calls for. */
export function expectedItems(card: Pick<BlueprintCard, 'goal' | 'crew'>): ChecklistId[] {
	const out: ChecklistId[] = [];
	const crewed = card.crew > 0;
	const far = card.goal === 'moon' || card.goal === 'planet' || card.goal === 'deep-space';
	if (card.goal === 'station' || card.goal === 'surface' || far) out.push('rcs');
	if (far || card.goal === 'station' || !crewed) out.push('antenna');
	if (far || card.goal === 'station' || !crewed) out.push('power');
	if (crewed && card.goal !== 'station') out.push('parachute');
	if (crewed && (far || card.goal === 'station')) out.push('life-support');
	if (crewed && (far || card.goal === 'orbit')) out.push('heat-shield');
	return out;
}

export function checklistOf(
	design: Pick<VesselDesign, 'parts'>,
	parts: PartLookup,
	card: Pick<BlueprintCard, 'goal' | 'crew'>
): ChecklistItem[] {
	const have = new Set<string>();
	for (const p of design.parts) {
		for (const [id] of parts.get(p.part)?.modules ?? []) have.add(id);
	}
	const expected = new Set(expectedItems(card));
	return (Object.keys(MODULES) as ChecklistId[]).map((id) => ({
		id,
		label: LABEL[id],
		present: MODULES[id].some((m) => have.has(m)),
		expected: expected.has(id),
		why: WHY[id]
	}));
}

/** The expected items the design lacks: what the card should warn about. */
export const gapsOf = (items: readonly ChecklistItem[]): ChecklistItem[] =>
	items.filter((i) => i.expected && !i.present);
