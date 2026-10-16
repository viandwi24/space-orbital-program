/** Facts about a catalogue part for the info card: mass, size, and what its modules do. */
import type { PartDefinition } from '@orbital/core';
import { ModuleEngine, ModuleResourceContainer } from '@orbital/mod-stock';
import type { ContentLookups } from '../delta-v';
import { formatForce, formatMass } from '../format';

export interface PartFact {
	label: string;
	value: string;
}

export function partFacts(def: PartDefinition, content: ContentLookups): PartFact[] {
	const facts: PartFact[] = [{ label: 'Mass', value: formatMass(def.mass) }];
	const s = def.shape;
	if (s?.kind === 'cylinder') {
		facts.push({
			label: 'Size',
			value: `${(s.radius * 2).toFixed(2)} m wide, ${s.height.toFixed(1)} m tall`
		});
	}
	for (const [id, raw] of def.modules ?? []) {
		const mod = content.modules.get(id);
		if (!mod) continue;
		const config = (mod.config ? mod.config.parse(raw ?? {}) : raw) as Record<string, unknown>;
		if (id === ModuleEngine.id) {
			facts.push({ label: 'Thrust', value: formatForce(Number(config.thrust)) });
			facts.push({
				label: 'Isp',
				value: `${Number(config.ispSeaLevel).toFixed(0)} s sea level, ${Number(config.ispVacuum).toFixed(0)} s vacuum`
			});
		}
		if (id === ModuleResourceContainer.id) {
			const contents = (config.contents ?? {}) as Record<string, { capacity: number }>;
			let propellant = 0;
			for (const [r, c] of Object.entries(contents)) {
				const res = content.resources.get(r);
				if (res && res.flowMode !== 'none') propellant += c.capacity * res.density;
			}
			if (propellant >= 1) facts.push({ label: 'Propellant', value: formatMass(propellant) });
		}
		if (mod.controlSource) facts.push({ label: 'Control', value: 'Steers the vessel' });
		if (mod.onStage && id !== ModuleEngine.id)
			facts.push({ label: 'Staging', value: 'Fires when staged' });
	}
	return facts;
}
