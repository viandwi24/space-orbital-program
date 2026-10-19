/**
 * The Mission Center's model (plan 113, ADR 0118): the Tracking rows and their filters, the
 * Upcoming events with their warp-to command, the selected object's card and what Fly can do. Pure,
 * so the page and the tests share it.
 */
import { resolve } from '$app/paths';
import {
	VESSEL_TYPES,
	type AlarmKind,
	type BodyDefinition,
	type Command,
	type Snapshot,
	type Vec3,
	type VesselSnapshot,
	type VesselType
} from '@orbital/core';
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
	/** A vessel's type (plan 223). */
	type?: VesselType;
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

/** The fleet list's labels of the vessel types (plan 223). */
export const VESSEL_TYPE_LABEL: Record<VesselType, string> = {
	debris: 'Debris',
	probe: 'Probe',
	rover: 'Rover',
	lander: 'Lander',
	ship: 'Ship',
	station: 'Station',
	base: 'Base',
	plane: 'Plane',
	relay: 'Relay',
	eva: 'EVA',
	flag: 'Flag'
};

/** The list's options beyond the filter (plan 223): one vessel type, a search, the order. */
export interface TrackOptions {
	type?: VesselType | null;
	search?: string;
	sort?: 'name' | 'distance';
	/** System-frame point distances are measured from (the focused vessel, or the home body). */
	from?: Vec3 | null;
}

const vesselTypeOf = (v: VesselSnapshot): VesselType => v.type ?? 'probe';

/** How many of the player's vessels each type has, and in all (the filter's counts). */
export function typeCounts(snapshot: Snapshot | null): {
	all: number;
	byType: Record<VesselType, number>;
} {
	const byType = Object.fromEntries(VESSEL_TYPES.map((t) => [t, 0])) as Record<VesselType, number>;
	let all = 0;
	for (const v of snapshot?.vessels ?? []) {
		if (v.owner !== undefined) continue;
		byType[vesselTypeOf(v)]++;
		all++;
	}
	return { all, byType };
}

/** System-frame position of a vessel. */
function vesselWorld(snapshot: Snapshot, v: VesselSnapshot): Vec3 | null {
	const base = snapshot.bodies.find((b) => b.id === v.soi)?.position;
	return base
		? { x: base.x + v.position.x, y: base.y + v.position.y, z: base.z + v.position.z }
		: null;
}

/**
 * The rows for `filter`: bodies root first, then vessels by name (or by distance from
 * `options.from`). Relays are the vessels of type relay (plan 223); `options.type` keeps one type
 * and `options.search` the names that contain it.
 */
export function trackingRows(
	snapshot: Snapshot | null,
	bodies: readonly BodyDefinition[],
	filter: TrackFilter,
	options: TrackOptions = {}
): TrackRow[] {
	const rows: TrackRow[] = [];
	const needle = options.search?.trim().toLowerCase() ?? '';
	const matches = (label: string) => needle === '' || label.toLowerCase().includes(needle);
	if ((filter === 'all' || filter === 'bodies') && !options.type) {
		for (const b of bodies) {
			const label = bodyLabel(String(b.id));
			if (!matches(label)) continue;
			rows.push({ key: `body:${b.id}`, kind: 'body', label, sub: kindOf(b, bodies) });
		}
	}
	if (filter !== 'bodies' && snapshot) {
		const from = options.from ?? null;
		const vessels = snapshot.vessels
			.filter((v) => (filter === 'relays' ? vesselTypeOf(v) === 'relay' : true))
			.filter((v) => !options.type || vesselTypeOf(v) === options.type)
			.filter((v) => matches(vesselName(v)))
			.map((v) => {
				const at = from ? vesselWorld(snapshot, v) : null;
				const distance =
					at && from ? Math.hypot(at.x - from.x, at.y - from.y, at.z - from.z) : undefined;
				return { v, distance };
			});
		vessels.sort((a, b) =>
			options.sort === 'distance' && a.distance !== undefined && b.distance !== undefined
				? a.distance - b.distance
				: vesselName(a.v).localeCompare(vesselName(b.v))
		);
		for (const { v, distance } of vessels) {
			const type = vesselTypeOf(v);
			rows.push({
				key: `vessel:${v.id}`,
				kind: 'vessel',
				label: vesselName(v),
				sub: `${VESSEL_TYPE_LABEL[type]} · ${vesselWhere(v)}${distance !== undefined && options.sort === 'distance' ? ` · ${formatDistance(distance)}` : ''}`,
				type
			});
		}
	}
	return rows;
}

/** An Upcoming entry; `warpTime` is where warp-to stops (a node: the maneuver lead before it). */
export interface UpcomingEvent {
	key: string;
	kind: 'node' | 'soi' | 'review' | 'alarm';
	/** The alarm's id (plan 224), for edit, delete and warp-to. */
	alarm?: string;
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
	// user alarms (plan 224): the sim keeps them; a warp-to an alarm stops on it
	for (const a of snapshot.alarms ?? []) {
		if (a.time <= t) continue;
		const v = a.vessel === undefined ? undefined : snapshot.vessels.find((x) => x.id === a.vessel);
		out.push({
			key: `alarm:${a.id}`,
			kind: 'alarm',
			alarm: a.id,
			vessel: v ? Number(v.id) : null,
			time: a.time,
			warpTime: a.time,
			label: `Alarm: ${a.name}`,
			detail: [ALARM_KIND[a.kind], v ? vesselName(v) : null, a.body ? bodyLabel(a.body) : null]
				.filter(Boolean)
				.join(' · ')
		});
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

const ALARM_KIND: Record<AlarmKind, string> = {
	time: 'Time',
	apoapsis: 'Apoapsis',
	periapsis: 'Periapsis',
	soi: 'Sphere change',
	node: 'Maneuver node',
	transfer: 'Transfer window'
};

/** The command warp-to sends for an Upcoming event (the maneuver panel's factor). */
export const warpToCommand = (event: UpcomingEvent): Command =>
	event.alarm !== undefined
		? { type: 'warp-to', target: { kind: 'alarm', id: event.alarm }, factor: 100_000 }
		: { type: 'warp-to', time: event.warpTime, factor: 100_000 };

/**
 * The alarm form's command (plan 224): a new alarm, or the one with `id` replaced. `inSeconds` is
 * from `now`; a blank name takes the sim's label.
 */
export function alarmCommand(
	form: { id?: string; name: string; inSeconds: number },
	now: number
): Command | string {
	if (!Number.isFinite(form.inSeconds) || form.inSeconds <= 0) return 'Give a time in the future.';
	return {
		type: 'add-alarm',
		...(form.id !== undefined ? { id: form.id } : {}),
		name: form.name.trim(),
		kind: 'time',
		time: now + form.inSeconds
	};
}

/** "1:30:00", "45", "2h 5m", "10 min": a duration typed in the alarm form, s; null when unreadable. */
export function parseDuration(text: string): number | null {
	const t = text.trim().toLowerCase();
	if (t === '') return null;
	if (/^\d+(:\d{1,2}){1,2}$/.test(t)) {
		const parts = t.split(':').map(Number);
		return parts.reduce((acc, p) => acc * 60 + p, 0) * (parts.length === 2 ? 60 : 1);
	}
	const units: Record<string, number> = { d: 86_400, h: 3_600, m: 60, min: 60, s: 1 };
	let total = 0;
	let matched = '';
	for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(d|h|min|m|s)\b/g)) {
		total += Number(m[1]) * units[m[2]!]!;
		matched += m[0];
	}
	if (matched.replace(/\s/g, '') === t.replace(/\s/g, '')) return total > 0 ? total : null;
	const minutes = Number(t);
	return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 : null;
}

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
	/** The player's vessel (plan 223): what the fleet actions need. */
	vessel?: {
		id: number;
		name: string;
		type: VesselType;
		/** Present while it can be recovered (landed or splashed, at rest): the sim's quote. */
		recovery?: { value: number; factor: number; distance: number | null; credit: number };
	};
}

/** Fly is refused for an agency's object (plan 221: every vessel of the player has a design record). */
export const NOT_OURS = 'This vessel belongs to another agency.';

/**
 * The card for `key`, or null when the object is gone. Fly is enabled for every vessel of the
 * player (plan 221, ADR 0208 point 1, amending ADR 0118 point 5).
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
		fly: v.owner === undefined ? { enabled: true } : { enabled: false, reason: NOT_OURS },
		...(v.owner === undefined
			? {
					vessel: {
						id: Number(v.id),
						name: vesselName(v),
						type: vesselTypeOf(v),
						...(v.recovery ? { recovery: v.recovery } : {})
					}
				}
			: {})
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
