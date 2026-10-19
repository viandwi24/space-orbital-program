/**
 * The RCS pill (plan 211, ADR 0217): no RCS on the vessel, off, on, or on with nothing left to
 * burn. The propellant is whatever the vessel's RCS modules name (monopropellant, cold gas), counted
 * from the containers of the snapshot.
 */
import type { PartLookup, VesselSnapshot } from '@orbital/core';

export type RcsState = 'none' | 'off' | 'on' | 'dry';

export const RCS_MODULE = 'stock.rcs';

export const RCS_LABEL: Record<RcsState, string> = {
	none: 'No RCS on this vessel',
	off: 'RCS off',
	on: 'RCS on',
	dry: 'RCS: no propellant'
};

export function rcsState(
	vessel: Pick<VesselSnapshot, 'parts' | 'rcs'>,
	parts: PartLookup
): RcsState {
	const propellants = new Set<string>();
	for (const p of vessel.parts) {
		for (const [id, config] of parts.get(p.definition)?.modules ?? []) {
			if (id !== RCS_MODULE) continue;
			const name = (config as { propellant?: unknown } | undefined)?.propellant;
			if (typeof name === 'string') propellants.add(name);
		}
	}
	if (propellants.size === 0) return 'none';
	if (!vessel.rcs) return 'off';
	let amount = 0;
	for (const p of vessel.parts) {
		const c = p.modules['stock.resource-container'] as
			{ amounts?: Record<string, number> } | undefined;
		for (const r of propellants) amount += c?.amounts?.[r] ?? 0;
	}
	return amount > 1e-9 ? 'on' : 'dry';
}

/** How hard the RCS fires, 0..1: the mean of every nozzle's fraction (the hiss, the puffs). */
export function rcsFiring(vessel: Pick<VesselSnapshot, 'parts'>): number {
	let sum = 0;
	let n = 0;
	for (const p of vessel.parts) {
		const firing = (p.modules[RCS_MODULE] as { firing?: unknown } | undefined)?.firing;
		if (!Array.isArray(firing)) continue;
		for (const f of firing) {
			if (typeof f !== 'number') continue;
			sum += f;
			n += 1;
		}
	}
	return n === 0 ? 0 : sum / n;
}
