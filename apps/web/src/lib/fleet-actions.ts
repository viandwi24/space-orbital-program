/**
 * Terminate, Recover and Clear debris across the game (plan 318, ADR 0274): which vessels a pick
 * holds, what to ask before ending them, who stands on a pad before a launch, and which vessel the
 * player flies once the flown one is gone. Pure: snapshots in, plain values out.
 */
import { PAD_CLEAR_RADIUS, type EntityId, type Snapshot, type VesselSnapshot } from '@orbital/core';
import { formatFunds } from './format';

const nameOf = (v: VesselSnapshot): string => v.name ?? `Vessel ${v.id}`;
const crewOf = (v: VesselSnapshot): number => v.crew?.length ?? 0;

/** A debris vessel of the player, as the sim's `clear-debris` counts it (the sim always sets `type`). */
export const isDebrisVessel = (v: VesselSnapshot): boolean =>
	v.owner === undefined && v.type === 'debris';

/** The player's vessels among `ids`, what can be recovered, and the crew aboard. */
export interface FleetPick {
	vessels: VesselSnapshot[];
	/** The ones landed or splashed at rest: `recover-vessel` takes them. */
	recoverable: VesselSnapshot[];
	crew: number;
	/** Sum of the recoverable ones' credit. */
	credit: number;
}

export function fleetPick(snapshot: Snapshot, ids: Iterable<EntityId | number>): FleetPick {
	const want = new Set([...ids].map(Number));
	const vessels = snapshot.vessels.filter((v) => want.has(Number(v.id)) && v.owner === undefined);
	const recoverable = vessels.filter((v) => v.recovery !== undefined);
	return {
		vessels,
		recoverable,
		crew: vessels.reduce((n, v) => n + crewOf(v), 0),
		credit: recoverable.reduce((n, v) => n + (v.recovery?.credit ?? 0), 0)
	};
}

/** What to ask before terminating `pick`: null when no one is aboard (debris goes at once). */
export function terminateQuestion(pick: FleetPick): string | null {
	if (pick.crew === 0) return null;
	const who = pick.crew === 1 ? '1 crew member is' : `${pick.crew} crew members are`;
	const what =
		pick.vessels.length === 1 ? nameOf(pick.vessels[0]!) : `${pick.vessels.length} vessels`;
	return `Terminate ${what}? ${who} aboard; they follow the world's crew rule, as in a crash.`;
}

/**
 * The player's vessels on a launch spot (plan 318, ADR 0274): the sim's `atSite` within
 * `PAD_CLEAR_RADIUS` of the spot, east and north metres of the site's centre.
 */
export function spotOccupants(
	snapshot: Snapshot,
	site: string,
	spot: { east: number; north: number }
): VesselSnapshot[] {
	return snapshot.vessels.filter(
		(v) =>
			v.owner === undefined &&
			v.atSite?.site === site &&
			Math.hypot(v.atSite.east - spot.east, v.atSite.north - spot.north) < PAD_CLEAR_RADIUS
	);
}

/** KSP's "launch site occupied" dialog: who is there and which ways out there are. */
export interface OccupiedPrompt {
	title: string;
	/** Names, joined for the sentence. */
	names: string;
	ids: EntityId[];
	/** Every occupant can be recovered. */
	canRecover: boolean;
	/** The credit for recovering them all, formatted; null when the economy gives none. */
	credit: string | null;
	/** Said under Terminate when crew are aboard; null otherwise. */
	crewWarning: string | null;
}

export function occupiedPrompt(occupants: readonly VesselSnapshot[]): OccupiedPrompt | null {
	if (occupants.length === 0) return null;
	const names = occupants.map(nameOf);
	const shown =
		names.length <= 3
			? names.join(', ')
			: `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
	const canRecover = occupants.every((v) => v.recovery !== undefined);
	const credit = occupants.reduce((n, v) => n + (v.recovery?.credit ?? 0), 0);
	const crew = occupants.reduce((n, v) => n + crewOf(v), 0);
	return {
		title: 'Launch site is occupied',
		names: shown,
		ids: occupants.map((v) => v.id),
		canRecover,
		credit: canRecover && credit > 0 ? formatFunds(credit) : null,
		crewWarning:
			crew === 0
				? null
				: `${crew === 1 ? '1 crew member is' : `${crew} crew members are`} aboard: Terminate follows the world's crew rule.`
	};
}

/**
 * The vessel to fly after `removed` leave the world: the focus when it stays, else the first of the
 * player's other vessels that has a control source, else null (back to the Space Center).
 */
export function focusAfterRemoval(
	snapshot: Snapshot,
	focus: EntityId | number | null,
	removed: Iterable<EntityId | number>
): EntityId | null {
	const gone = new Set([...removed].map(Number));
	if (focus !== null && !gone.has(Number(focus))) {
		const still = snapshot.vessels.find((v) => Number(v.id) === Number(focus));
		if (still) return still.id;
	}
	const next = snapshot.vessels.find(
		(v) =>
			!gone.has(Number(v.id)) &&
			v.owner === undefined &&
			v.uncontrolled !== 'no-source' &&
			v.type !== 'debris' &&
			v.type !== 'flag'
	);
	return next?.id ?? null;
}
