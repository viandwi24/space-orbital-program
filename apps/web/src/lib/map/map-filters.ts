/**
 * What the flight map shows (plan 258, ADR 0242): KSP's map filters as data. Layers (orbit lines,
 * comms links, ground stations, labels) and one switch per vessel type, remembered per player. Pure.
 */
import { VESSEL_TYPES, type VesselType } from '@orbital/core';

export const LAYERS = ['orbits', 'links', 'stations', 'labels'] as const;
export type MapLayer = (typeof LAYERS)[number];

export interface MapFilters {
	orbits: boolean;
	/** Comms links between vessels, relays and ground stations. */
	links: boolean;
	stations: boolean;
	/** The names and times at the apsides and nodes. */
	labels: boolean;
	/** A vessel of a type that is off has neither icon nor orbit. */
	types: Record<VesselType, boolean>;
}

export const MAP_FILTERS_KEY = 'orbital.map.filters';

export const defaultFilters = (): MapFilters => ({
	orbits: true,
	links: true,
	stations: true,
	labels: true,
	types: Object.fromEntries(VESSEL_TYPES.map((t) => [t, true])) as Record<VesselType, boolean>
});

/** A saved value; anything missing or of the wrong type takes its default. */
export function parseFilters(text: string | null | undefined): MapFilters {
	const out = defaultFilters();
	if (!text) return out;
	try {
		const raw = JSON.parse(text) as Record<string, unknown> | null;
		if (typeof raw !== 'object' || raw === null) return out;
		for (const k of LAYERS) if (typeof raw[k] === 'boolean') out[k] = raw[k];
		const types = raw.types;
		if (typeof types === 'object' && types !== null) {
			for (const t of VESSEL_TYPES) {
				const v = (types as Record<string, unknown>)[t];
				if (typeof v === 'boolean') out.types[t] = v;
			}
		}
	} catch {
		// a damaged value is the defaults
	}
	return out;
}

export const serialiseFilters = (f: MapFilters): string => JSON.stringify(f);

export const withLayer = (f: MapFilters, layer: MapLayer, on: boolean): MapFilters => ({
	...f,
	[layer]: on
});

export const withType = (f: MapFilters, type: VesselType, on: boolean): MapFilters => ({
	...f,
	types: { ...f.types, [type]: on }
});

/** The types that are off. */
export const hiddenTypes = (f: MapFilters): VesselType[] => VESSEL_TYPES.filter((t) => !f.types[t]);

/**
 * The vessels the map hides: those of a type that is off. The vessel being flown is never hidden
 * (it would vanish from its own map).
 */
export function hiddenVessels(
	f: MapFilters,
	vessels: ReadonlyArray<{ id: number; type?: VesselType }>,
	active: number | null
): Set<number> {
	const out = new Set<number>();
	for (const v of vessels) {
		if (v.id !== active && v.type !== undefined && !f.types[v.type]) out.add(v.id);
	}
	return out;
}

/** How many layers and types are on, of all: the bar's summary. */
export const shownCount = (f: MapFilters): { on: number; of: number } => {
	const on = LAYERS.filter((l) => f[l]).length + VESSEL_TYPES.filter((t) => f.types[t]).length;
	return { on, of: LAYERS.length + VESSEL_TYPES.length };
};
