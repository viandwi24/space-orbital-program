/**
 * The Mission Center's model (plan 113, ADR 0118): the Tracking rows and their filters, the
 * Upcoming events with their warp-to command, the selected object's card and what Fly can do. Pure,
 * so the page and the tests share it.
 */
import { resolve } from '$app/paths';
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

/** "Star", "Planet" (orbits a star or nothing) or "Moon of X" (plan 122). */
export function kindOf(b: BodyDefinition, bodies: readonly BodyDefinition[]): string {
	if (b.star) return 'Star';
	const parent = b.parent === undefined ? undefined : bodies.find((x) => x.id === b.parent);
	return !parent || parent.star ? 'Planet' : `Moon of ${bodyLabel(String(parent.id))}`;
}

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
				sub: kindOf(b, bodies)
			});
		}
	}
	if ((filter === 'all' || filter === 'vessels') && snapshot) {
		const vessels = [...snapshot.vessels].sort((a, b) =>
			vesselName(a).localeCompare(vesselName(b))
		);
		for (const v of vessels) {
			rows.push({
				key: `vessel:${v.id}`,
				kind: 'vessel',
				label: vesselName(v),
				sub: vesselWhere(v)
			});
		}
	}
	return rows;
}

/** An Upcoming entry; `warpTime` is where warp-to stops (a node: the maneuver lead before it). */
export interface UpcomingEvent {
	key: string;
	kind: 'node' | 'soi' | 'review';
	/** The vessel it is about; null for a peer review (plan 129). */
	vessel: number | null;
	time: number;
	warpTime: number;
	label: string;
	detail: string;
}

/**
 * Every vessel's maneuver nodes and its next change of sphere of influence after `snapshot.t`, and
 * the claims in peer review (plan 129, ADR 0192 point 10), in time order, at most `limit`. The prediction is the map path's (the trajectory provider, ADR 0173).
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
	const discovery = snapshot.discovery;
	for (const c of discovery?.claims ?? []) {
		if (c.verdict !== undefined || c.due <= t) continue;
		const label = discovery!.facts.find((f) => f.fact === c.fact)?.label ?? c.fact;
		out.push({
			key: `review:${c.id}`,
			kind: 'review',
			vessel: null,
			time: c.due,
			warpTime: c.due,
			label: `Peer review: ${label} on ${bodyLabel(c.body)}`,
			detail: `Claimed at ${Math.round(c.confidence * 100)}%`
		});
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
			sub: kindOf(b, bodies),
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
 * Fly (ADR 0201 point 1, superseding ADR 0118 point 5): the flight runs on the same sim, so Fly
 * makes the vessel the focus and opens Flight; no save is written or loaded. Returns the error to
 * show, or null when the flight opens.
 */
export function fly(deps: { focus: () => boolean; go: (href: string) => void }): string | null {
	if (!deps.focus()) return 'There is no vessel to fly in this world.';
	deps.go(resolve('/(world)/flight'));
	return null;
}

/** A label over the map: an object's, or a cluster's (`members` keys, its label "N vessels"). */
export interface MapLabel {
	key: string;
	label: string;
	kind: 'vessel' | 'body' | 'cluster';
	x: number;
	y: number;
	members?: string[];
}

/**
 * Vessels whose screen points lie within `radius` px of each other share one label when there are
 * at least `min` of them (a fleet in low orbit seen from the system scope). Bodies keep their own.
 */
export function clusterLabels(labels: readonly MapLabel[], radius = 24, min = 3): MapLabel[] {
	const out: MapLabel[] = labels.filter((l) => l.kind !== 'vessel');
	const left = labels.filter((l) => l.kind === 'vessel');
	while (left.length) {
		const seed = left.shift()!;
		const group = [seed];
		for (let i = 0; i < left.length;) {
			const l = left[i]!;
			if (group.some((g) => Math.hypot(g.x - l.x, g.y - l.y) <= radius)) {
				group.push(l);
				left.splice(i, 1);
				i = 0;
			} else i++;
		}
		if (group.length < min) out.push(...group);
		else {
			const x = group.reduce((a, g) => a + g.x, 0) / group.length;
			const y = Math.min(...group.map((g) => g.y));
			out.push({
				key: `cluster:${seed.key}`,
				label: `${group.length} vessels`,
				kind: 'cluster',
				x: Math.round(x),
				y: Math.round(y),
				members: group.map((g) => g.key)
			});
		}
	}
	return out;
}
