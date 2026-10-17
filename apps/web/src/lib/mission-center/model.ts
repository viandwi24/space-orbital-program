/**
 * The Mission Center's model (plan 113, ADR 0118): the Tracking rows and their filters, the
 * Upcoming events with their warp-to command, the selected object's card and what Fly can do. Pure,
 * so the page and the tests share it.
 */
import type { BodyDefinition, Command, Snapshot, VesselSnapshot } from '@orbital/core';
import { trajectoryFor, type PatchedBody } from '@orbital/kepler';
import { formatDistance, formatDuration, formatSpeed } from '../format';
import { bodyLabel } from '../hud-model';
import { WARP_LEAD_S } from '../maneuver-controller';
import { predictionHorizon } from '../map-path';
import { bodyMu, orbitInfo } from '../orbit-info';

export type TrackFilter = 'all' | 'vessels' | 'relays' | 'bodies';
export const TRACK_FILTERS: readonly { id: TrackFilter; label: string }[] = [
	{ id: 'all', label: 'All' },
	{ id: 'vessels', label: 'Vessels' },
	{ id: 'relays', label: 'Relays' },
	{ id: 'bodies', label: 'Bodies' }
];

/** A Tracking row; `key` is the map pick's key (`vessel:<id>`, `body:<id>`). */
export interface TrackRow {
	key: string;
	kind: 'vessel' | 'body';
	label: string;
	sub: string;
}

const vesselName = (v: VesselSnapshot): string => v.name ?? `Vessel ${v.id}`;

/** Where a vessel is, in two words: "Orbit · Home", "Landed · Home", "Flight · Home". */
export function vesselWhere(v: VesselSnapshot): string {
	const what = v.surface ? 'Landed' : v.mode === 'on-rails' ? 'Orbit' : 'Flight';
	return `${what} · ${bodyLabel(String(v.soi))}`;
}

/**
 * The rows for `filter`: bodies root first, then vessels by name. Relays are vessels that relay for
 * others, which only plan 117 makes: the filter is empty until then.
 */
export function trackingRows(
	snapshot: Snapshot | null,
	bodies: readonly BodyDefinition[],
	filter: TrackFilter
): TrackRow[] {
	const rows: TrackRow[] = [];
	if (filter === 'all' || filter === 'bodies') {
		for (const b of bodies) {
			rows.push({
				key: `body:${b.id}`,
				kind: 'body',
				label: bodyLabel(String(b.id)),
				sub: b.parent === undefined ? 'Planet' : `Moon of ${bodyLabel(String(b.parent))}`
			});
		}
	}
	if ((filter === 'all' || filter === 'vessels') && snapshot) {
		const vessels = [...snapshot.vessels].sort((a, b) =>
			vesselName(a).localeCompare(vesselName(b))
		);
		for (const v of vessels) {
			rows.push({ key: `vessel:${v.id}`, kind: 'vessel', label: vesselName(v), sub: vesselWhere(v) });
		}
	}
	return rows;
}

/** An Upcoming entry; `warpTime` is where warp-to stops (a node: the maneuver lead before it). */
export interface UpcomingEvent {
	key: string;
	kind: 'node' | 'soi';
	vessel: number;
	time: number;
	warpTime: number;
	label: string;
	detail: string;
}

/**
 * Every vessel's maneuver nodes and its next change of sphere of influence after `snapshot.t`, in
 * time order, at most `limit`. The prediction is the map path's (the trajectory provider, ADR 0173).
 */
export function upcomingEvents(
	snapshot: Snapshot,
	bodies: readonly BodyDefinition[],
	nodes: readonly PatchedBody[],
	limit = 12
): UpcomingEvent[] {
	const t = snapshot.t;
	const byId = new Map(bodies.map((b) => [String(b.id), b]));
	const provider = trajectoryFor(nodes);
	const out: UpcomingEvent[] = [];
	for (const v of snapshot.vessels) {
		const name = vesselName(v);
		for (const n of v.nodes ?? []) {
			if (n.time <= t) continue;
			out.push({
				key: `node:${v.id}:${n.id}`,
				kind: 'node',
				vessel: Number(v.id),
				time: n.time,
				warpTime: Math.max(t, n.time - WARP_LEAD_S),
				label: `${name}: maneuver`,
				detail: `${Math.round(n.dv)} m/s burn`
			});
		}
		if (v.surface) continue;
		const body = byId.get(String(v.soi));
		if (!body) continue;
		let segments;
		try {
			segments = provider.predict(
				{ body: String(v.soi), r: v.position, v: v.velocity, t },
				predictionHorizon(v.orbit, bodyMu(body))
			);
		} catch {
			continue; // a state the conics cannot follow (radial, or inside the body)
		}
		const change = segments.find((s) => s.end === 'transition' && s.t1 > t);
		if (change?.next) {
			const next = byId.get(change.next);
			const entering = next?.parent !== undefined && String(next.parent) === change.body;
			out.push({
				key: `soi:${v.id}`,
				kind: 'soi',
				vessel: Number(v.id),
				time: change.t1,
				warpTime: change.t1,
				label: `${name}: ${entering ? 'enters' : 'leaves for'} ${bodyLabel(change.next)}`,
				detail: entering ? 'Sphere of influence' : `Leaves ${bodyLabel(change.body)}`
			});
		}
	}
	return out.sort((a, b) => a.time - b.time || a.key.localeCompare(b.key)).slice(0, limit);
}

/** The command warp-to sends for an Upcoming event (the maneuver panel's factor). */
export const warpToCommand = (event: UpcomingEvent): Command => ({
	type: 'warp-to',
	time: event.warpTime,
	factor: 100_000
});

/** "in 4 m 12 s" from `now`. */
export const timeUntil = (time: number, now: number): string =>
	`in ${formatDuration(Math.max(0, time - now))}`;

/** The selected object's card: three facts and, for a vessel, what Fly can do. */
export interface ObjectCard {
	key: string;
	title: string;
	sub: string;
	facts: { label: string; value: string }[];
	fly: null | { enabled: true } | { enabled: false; reason: string };
}

export const NOT_FLYABLE =
	'Only the vessel this save flies can be flown from here: the others have no saved design yet.';

/**
 * The card for `key`, or null when the object is gone. Fly is enabled for the save's focus vessel
 * only (ADR 0118 point 5).
 */
export function objectCard(
	key: string | null,
	snapshot: Snapshot | null,
	bodies: readonly BodyDefinition[],
	focus: number | null
): ObjectCard | null {
	if (!key) return null;
	const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
	if (kind === 'body') {
		const b = bodies.find((x) => String(x.id) === id);
		if (!b) return null;
		const g = bodyMu(b) / (b.radius * b.radius);
		return {
			key,
			title: bodyLabel(id),
			sub: b.parent === undefined ? 'Planet' : `Moon of ${bodyLabel(String(b.parent))}`,
			facts: [
				{ label: 'Radius', value: formatDistance(b.radius) },
				{ label: 'Gravity', value: `${g.toFixed(2)} m/s²` },
				{ label: 'Orbit', value: b.orbit ? formatDistance(b.orbit.a) : '—' }
			],
			fly: null
		};
	}
	const v = snapshot?.vessels.find((x) => String(x.id) === id);
	if (!v) return null;
	const body = bodies.find((b) => String(b.id) === String(v.soi));
	const radius = body?.radius ?? 0;
	const altitude = Math.hypot(v.position.x, v.position.y, v.position.z) - radius;
	const info = v.orbit && body ? orbitInfo(v.orbit, bodyMu(body), snapshot!.t, radius) : null;
	return {
		key,
		title: vesselName(v),
		sub: vesselWhere(v),
		facts: [
			{ label: 'Altitude', value: formatDistance(altitude) },
			{ label: 'Speed', value: formatSpeed(Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z)) },
			{
				label: 'Ap / Pe',
				value:
					info && !v.surface
						? `${info.apoapsis === undefined ? '—' : formatDistance(info.apoapsis)} / ${formatDistance(info.periapsis)}`
						: '—'
			}
		],
		fly: Number(v.id) === focus ? { enabled: true } : { enabled: false, reason: NOT_FLYABLE }
	};
}

/**
 * Fly (ADR 0118 point 5): write the Mission Center's sim as the world's autosave, then open the
 * flight with it. Returns the error to show, or null when the flight opens.
 */
export async function fly(deps: {
	autosave: () => Promise<string | null>;
	go: (href: string) => void;
}): Promise<string | null> {
	const id = await deps.autosave();
	if (!id) return 'The flight could not be saved, so it was not opened.';
	deps.go(`/flight?load=${encodeURIComponent(id)}`);
	return null;
}
