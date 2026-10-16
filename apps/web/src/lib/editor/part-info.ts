/** Facts about a catalogue part for the info card: mass, size, and what its modules do. */
import {
	SEA_LEVEL_PRESSURE,
	STANDARD_GRAVITY,
	describeModule,
	thrustAtPressure,
	type PartDefinition
} from '@orbital/core';
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
		const info = describeModule(mod, raw);
		const engine = info?.engine;
		if (engine) {
			const vacuum = thrustAtPressure(engine.thrust, 0);
			const isp = (pressure: number): number =>
				thrustAtPressure(engine.thrust, pressure) / (engine.massFlow * STANDARD_GRAVITY);
			facts.push({ label: 'Thrust', value: formatForce(vacuum) });
			facts.push({
				label: 'Isp',
				value: `${isp(SEA_LEVEL_PRESSURE).toFixed(0)} s sea level, ${isp(0).toFixed(0)} s vacuum`
			});
		}
		if (mod.store) {
			// Propellant a tank starts with: stores of resources that flow to engines.
			const config = mod.config ? mod.config.parse(raw ?? {}) : raw;
			const fresh = mod.state ? mod.state(config) : undefined;
			let propellant = 0;
			for (const r of mod.store.resources(config, fresh)) {
				const res = content.resources.get(r);
				if (res && res.flowMode !== 'none') {
					propellant += mod.store.amount(config, fresh, r) * res.density;
				}
			}
			if (propellant >= 1) facts.push({ label: 'Propellant', value: formatMass(propellant) });
		}
		if (mod.controlSource) facts.push({ label: 'Control', value: 'Steers the vessel' });
		if (mod.onStage && !engine) facts.push({ label: 'Staging', value: 'Fires when staged' });
	}
	return facts;
}
