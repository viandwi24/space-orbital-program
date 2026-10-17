/**
 * The Launch screen's model (plan 094, ADR 0150): the site's pad and runway buildings, the designs
 * each accepts, where a vessel stands, and the choice handed to the flight page.
 */
import {
	CELL_SIZE,
	footprint,
	padLatLon,
	type BuildingDefinition,
	type PlacedBuilding,
	type Site,
	type VesselPlacement
} from '@orbital/core';

export interface Facility {
	/** The placed building's id. */
	id: string;
	label: string;
	kind: 'pad' | 'runway';
	/** Mass limit at the building's level, t; null for a runway. */
	massLimit: number | null;
	/** The footprint's centre in site metres. */
	east: number;
	north: number;
}

export interface BuildingLookup {
	get(id: string): Pick<BuildingDefinition, 'label' | 'size' | 'provides' | 'levels'> | undefined;
}

/** The active pads and runways of a site, in the site's order (ADR 0150 point 1). */
export function facilitiesOf(site: Pick<Site, 'buildings'>, buildings: BuildingLookup): Facility[] {
	const out: Facility[] = [];
	for (const b of (site.buildings ?? []) as PlacedBuilding[]) {
		if (b.state !== 'active') continue;
		const def = buildings.get(b.kind);
		if (!def) continue;
		const kind = def.provides.includes('launch-pad')
			? 'pad'
			: def.provides.includes('runway')
				? 'runway'
				: null;
		if (!kind) continue;
		const cells = footprint(def.size, b.cell, b.rotation);
		const east = (cells.reduce((s, c) => s + c.i, 0) / cells.length) * CELL_SIZE;
		const north = (cells.reduce((s, c) => s + c.j, 0) / cells.length) * CELL_SIZE;
		const level = def.levels[Math.min(b.level, def.levels.length - 1)];
		out.push({
			id: b.id,
			label: def.label,
			kind,
			massLimit: kind === 'pad' ? (level?.capacity['launch-pad'] ?? null) : null,
			east,
			north
		});
	}
	return out;
}

/** Whether a facility takes a design of this wet mass, kg (ADR 0150 point 3). */
export const accepts = (facility: Pick<Facility, 'massLimit'>, wetMassKg: number): boolean =>
	facility.massLimit === null || wetMassKg <= facility.massLimit * 1000;

/** Where the vessel stands: the facility's centre on the site's body (ADR 0150 point 2). */
export function placementOf(
	site: Pick<Site, 'body' | 'latitude' | 'longitude'>,
	facility: Pick<Facility, 'east' | 'north'>,
	radius: number
): VesselPlacement {
	const [latitude, longitude] = padLatLon(
		site as Site,
		{ east: facility.east, north: facility.north },
		radius
	);
	return { kind: 'surface', body: site.body as never, latitude, longitude };
}

// ---- the choice handed to the flight (ADR 0150 point 4) ----

export const LAUNCH_KEY = 'orbital.launch';

export interface LaunchChoice {
	facility: string;
	placement: VesselPlacement;
}

export function saveLaunchChoice(
	choice: LaunchChoice,
	storage: Pick<Storage, 'setItem'> = localStorage
): void {
	try {
		storage.setItem(LAUNCH_KEY, JSON.stringify(choice));
	} catch {
		// no storage: the flight starts at the site's default spot
	}
}

/** Reads and removes the choice: it applies to the next flight only. */
export function takeLaunchChoice(
	storage: Pick<Storage, 'getItem' | 'removeItem'> = localStorage
): LaunchChoice | null {
	try {
		const raw = storage.getItem(LAUNCH_KEY);
		storage.removeItem(LAUNCH_KEY);
		if (!raw) return null;
		const c = JSON.parse(raw) as LaunchChoice;
		return c && typeof c.facility === 'string' && c.placement?.kind === 'surface' ? c : null;
	} catch {
		return null;
	}
}
