/**
 * The Launch screen's model (plan 094, ADR 0150): the site's pad and runway buildings, the designs
 * each accepts, where a vessel stands, and the choice handed to the flight page.
 */
import {
	CELL_SIZE,
	defaultLaunchSpot,
	footprint,
	workingLevel,
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

/**
 * The working pads and runways of a site, in the site's order (ADR 0150 point 1); an upgrading pad
 * works at its level. With `limits` off (Sandbox, the Legacy world) no pad has a mass limit (plan
 * 096, ADR 0123 point 4).
 */
export function facilitiesOf(
	site: Pick<Site, 'buildings'>,
	buildings: BuildingLookup,
	limits = true
): Facility[] {
	const out: Facility[] = [];
	for (const b of (site.buildings ?? []) as PlacedBuilding[]) {
		if (workingLevel(b) === null) continue;
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
			massLimit: kind === 'pad' && limits ? (level?.capacity['launch-pad'] ?? null) : null,
			east,
			north
		});
	}
	return out;
}

/** Whether a facility takes a design of this wet mass, kg (ADR 0150 point 3). */
/**
 * Whether the facility takes a design: under its mass limit and, when the design says whether it is
 * an aircraft (plan 063, ADR 0161 point 3), an aircraft on a runway and anything else on a pad.
 */
export const accepts = (
	facility: Pick<Facility, 'massLimit'> & Partial<Pick<Facility, 'kind'>>,
	wetMassKg: number,
	aircraft?: boolean
): boolean =>
	(facility.massLimit === null || wetMassKg <= facility.massLimit * 1000) &&
	(aircraft === undefined ||
		facility.kind === undefined ||
		(facility.kind === 'runway') === aircraft);

/**
 * Where the vessel stands: the facility's centre at its site (ADR 0150 point 2), as a site
 * placement with the spot (plan 236, ADR 0229 point 6), so the sim takes fuel and the launch
 * charge from that site.
 */
export function placementOf(
	site: Pick<Site, 'id'>,
	facility: Pick<Facility, 'east' | 'north'>
): VesselPlacement {
	return { kind: 'site', site: site.id, at: { east: facility.east, north: facility.north } };
}

/**
 * A quick launch (Shift+Launch skips the Launch screen): the primary site's first working pad, or
 * runway for an aircraft, as the sim's default; with the buildings the running sim has (`live`).
 * Undefined without a site: the sim's own default.
 */
export function quickLaunchPlacement(
	sites: readonly Site[],
	buildings: BuildingLookup,
	aircraft: boolean,
	live?: readonly { id: string; buildings?: Site['buildings'] }[]
): VesselPlacement | undefined {
	const site = sites[0];
	if (!site) return undefined;
	const now = live?.find((x) => x.id === site.id)?.buildings ?? site.buildings;
	return placementOf(site, defaultLaunchSpot({ ...site, buildings: now }, buildings, aircraft));
}

// ---- the choice handed to the flight (ADR 0150 point 4) ----

export const LAUNCH_KEY = 'orbital.launch';

export interface LaunchChoice {
	facility: string;
	placement: VesselPlacement;
	/** Crew seated at launch (plan 108, ADR 0152 point 5): member ids by design part index. */
	crew?: { member: string; part: number }[];
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
		if (
			!c ||
			typeof c.facility !== 'string' ||
			(c.placement?.kind !== 'surface' && c.placement?.kind !== 'site')
		)
			return null;
		const crewOk =
			c.crew === undefined ||
			(Array.isArray(c.crew) &&
				c.crew.every((s) => typeof s?.member === 'string' && Number.isInteger(s?.part)));
		return crewOk ? c : { facility: c.facility, placement: c.placement };
	} catch {
		return null;
	}
}

// ---- seats (plan 108, ADR 0152 point 5) ----

export interface SeatPart {
	/** Design part index. */
	part: number;
	title: string;
	capacity: number;
}

/** The design's parts with seats, in design order. */
export function seatsOf(
	design: { parts: readonly { index: number; part: string }[] },
	parts: { get(id: string): { title: string; crewCapacity?: number } | undefined }
): SeatPart[] {
	return design.parts.flatMap((p) => {
		const def = parts.get(p.part);
		const capacity = def?.crewCapacity ?? 0;
		return capacity > 0 ? [{ part: p.index, title: def!.title, capacity }] : [];
	});
}

/**
 * Puts `member` in the first part with a free seat (or takes them out when already seated).
 * Returns the new assignment; unchanged when every seat is taken.
 */
export function toggleSeat(
	seated: readonly { member: string; part: number }[],
	seats: readonly SeatPart[],
	member: string
): { member: string; part: number }[] {
	if (seated.some((s) => s.member === member)) return seated.filter((s) => s.member !== member);
	const free = seats.find((p) => seated.filter((s) => s.part === p.part).length < p.capacity);
	return free ? [...seated, { member, part: free.part }] : [...seated];
}

/**
 * Puts `member` in a seat of `part` (plan 346: a crew row dropped on a seat). They leave any other
 * seat first; when the part is full, its last occupant makes room.
 */
export function seatIn(
	seated: readonly { member: string; part: number }[],
	seats: readonly SeatPart[],
	member: string,
	part: number
): { member: string; part: number }[] {
	const target = seats.find((p) => p.part === part);
	if (!target) return [...seated];
	const rest = seated.filter((s) => s.member !== member);
	const there = rest.filter((s) => s.part === part);
	const out = there.length >= target.capacity ? rest.filter((s) => s !== there.at(-1)) : rest;
	return [...out, { member, part }];
}
