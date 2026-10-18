/**
 * The power budget of a design or vessel (plan 208, ADR 0213): EC produced and drawn per second by
 * day (in full sun at the home planet's distance) and by night, and the EC its batteries store,
 * from each module's `power` descriptor. Pure; the Hangar shows it (plan 218).
 */
import type { ModuleDefinition, PartDefinition } from './definitions.ts';
import { parseModuleConfig } from './plugin.ts';

export interface PowerBudget {
	/** Net EC/s in full sun. */
	day: number;
	/** Net EC/s without the star. */
	night: number;
	/** EC the stores hold when full. */
	capacity: number;
	/** EC/s produced by day and at night, and drawn. */
	produced: { day: number; night: number };
	drawn: number;
	/** Seconds the full stores last at night with a negative net, else null. */
	nightReserve: number | null;
}

export interface PowerLookup {
	parts: { get(id: string): PartDefinition | undefined };
	modules: { get(id: string): ModuleDefinition | undefined };
}

/** The budget of the parts `definitions` (part definition ids, one entry per part). */
export function powerBudget(definitions: readonly string[], lookup: PowerLookup): PowerBudget {
	let sun = 0;
	let steady = 0;
	let drawn = 0;
	let capacity = 0;
	for (const id of definitions) {
		for (const [moduleId, raw] of lookup.parts.get(id)?.modules ?? []) {
			const def = lookup.modules.get(moduleId);
			if (!def?.power) continue;
			const parsed = parseModuleConfig(def, raw);
			if (!parsed.ok) continue;
			const info = def.power(parsed.value);
			const rate = info.rate ?? 0;
			if (rate < 0) drawn += -rate;
			else if (info.sun) sun += rate;
			else steady += rate;
			capacity += info.capacity ?? 0;
		}
	}
	const night = steady - drawn;
	return {
		day: sun + steady - drawn,
		night,
		capacity,
		produced: { day: sun + steady, night: steady },
		drawn,
		nightReserve: night < 0 ? capacity / -night : null
	};
}
