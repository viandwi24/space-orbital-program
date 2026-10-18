/**
 * Comms tier 1 on the page (plan 115, ADR 0158): the link badge with the reason a link is down,
 * the vessel panel's Comms tab, and the Network layer's lines and stations, from `Snapshot.network`.
 */
import type { Snapshot, Vec3 } from '@orbital/core';
import { bodyLabel } from '../hud-model';

type Network = NonNullable<Snapshot['network']>;
type VesselLink = Network['vessels'][number];

/** The player's words for a link reason (every broken link names its cause). */
export function linkText(reason: string): string {
	if (reason === 'blocked by terrain') return 'Blocked by terrain';
	if (reason.startsWith('blocked by ')) return `Occluded by ${bodyLabel(reason.slice(11))}`;
	switch (reason) {
		case 'no antenna':
			return 'No antenna';
		case 'antennas off':
			return 'Antenna off';
		case 'plasma blackout':
			return 'Plasma blackout';
		case 'out of range':
			return 'Out of range';
		default:
			return reason.charAt(0).toUpperCase() + reason.slice(1);
	}
}

/** What a link reaches: a station's label, or another vessel's name. */
export function endpointLabel(snapshot: Pick<Snapshot, 'network' | 'vessels'>, to: string): string {
	if (to.startsWith('vessel:')) {
		const id = Number(to.slice(7));
		return snapshot.vessels.find((v) => Number(v.id) === id)?.name ?? `Vessel ${id}`;
	}
	return snapshot.network?.stations.find((s) => s.id === to)?.label ?? to;
}

export interface LinkBadge {
	state: 'linked' | 'partial' | 'lost';
	/** "Linked to …" or the reason the link is down. */
	text: string;
	/** Signal bars, 0..4 (link budget numbers come with plan 116). */
	bars: number;
	blackout: number;
}

const linkOf = (snapshot: Pick<Snapshot, 'network'>, vessel: number): VesselLink | undefined =>
	snapshot.network?.vessels.find((n) => Number(n.vessel) === vessel);

/** The HUD's link badge for `vessel`, or null when the world has no comms network. */
export function linkBadge(
	snapshot: Pick<Snapshot, 'network' | 'vessels'> | null,
	vessel: number
): LinkBadge | null {
	const link = snapshot && linkOf(snapshot, vessel);
	if (!snapshot || !link) return null;
	if (link.to === null)
		return {
			state: 'lost',
			text: linkText(link.reason ?? 'out of range'),
			bars: 0,
			blackout: link.blackout
		};
	const partial = link.control === 'partial';
	return {
		state: partial ? 'partial' : 'linked',
		text: `Linked to ${endpointLabel(snapshot, link.to)}`,
		bars: partial ? 2 : 4,
		blackout: link.blackout
	};
}

export interface CommsTab {
	route: 'auto';
	/** The hops from the vessel: itself, then what it reaches (one hop in tier 1). */
	path: string[];
	linked: boolean;
	reason: string | null;
	control: 'full' | 'partial' | 'none';
	/** Stations of the network, nearest first by label order of the snapshot. */
	endpoints: Array<{ id: string; label: string; body: string; current: boolean }>;
}

/** The vessel panel's Comms tab (Auto route; Manual comes with plan 117). */
export function commsTab(
	snapshot: Pick<Snapshot, 'network' | 'vessels'> | null,
	vessel: number,
	name: string
): CommsTab | null {
	const link = snapshot && linkOf(snapshot, vessel);
	if (!snapshot?.network || !link) return null;
	return {
		route: 'auto',
		path: link.to === null ? [name] : [name, endpointLabel(snapshot, link.to)],
		linked: link.to !== null,
		reason: link.to === null ? linkText(link.reason ?? 'out of range') : null,
		control: link.control,
		endpoints: snapshot.network.stations.map((s) => ({
			id: s.id,
			label: s.label,
			body: bodyLabel(s.body),
			current: link.to === s.id
		}))
	};
}

export interface NetworkLine {
	key: string;
	/** System-frame ends of the line. */
	from: Vec3;
	to: Vec3;
	state: 'full' | 'partial';
}

/** The Network layer's lines: one per vessel with a link, in the system frame. */
export function networkLines(
	snapshot: Pick<Snapshot, 'network' | 'vessels' | 'bodies'> | null
): NetworkLine[] {
	if (!snapshot?.network) return [];
	const where = (id: number): Vec3 | null => {
		const v = snapshot.vessels.find((x) => Number(x.id) === id);
		const base = v && snapshot.bodies.find((b) => b.id === v.soi)?.position;
		return v && base
			? { x: base.x + v.position.x, y: base.y + v.position.y, z: base.z + v.position.z }
			: null;
	};
	const out: NetworkLine[] = [];
	for (const n of snapshot.network.vessels) {
		if (n.to === null) continue;
		const from = where(Number(n.vessel));
		const to = n.to.startsWith('vessel:')
			? where(Number(n.to.slice(7)))
			: (snapshot.network.stations.find((s) => s.id === n.to)?.position ?? null);
		if (!from || !to) continue;
		out.push({ key: `${n.vessel}`, from, to, state: n.control === 'partial' ? 'partial' : 'full' });
	}
	return out;
}

/** The Network layer's station markers, in the system frame. */
export const networkStations = (snapshot: Pick<Snapshot, 'network'> | null) =>
	(snapshot?.network?.stations ?? []).map((s) => ({
		id: s.id,
		label: s.label,
		position: s.position
	}));

export interface ScreenNetwork {
	lines: Array<{
		key: string;
		x1: number;
		y1: number;
		x2: number;
		y2: number;
		state: 'full' | 'partial';
	}>;
	stations: Array<{ id: string; label: string; x: number; y: number }>;
}

/** The Network layer in CSS pixels: lines whose ends are on screen, and the visible stations. */
export function projectNetwork(
	snapshot: Pick<Snapshot, 'network' | 'vessels' | 'bodies'> | null,
	project: (system: Vec3) => { x: number; y: number; hidden?: boolean } | null
): ScreenNetwork {
	const lines: ScreenNetwork['lines'] = [];
	for (const l of networkLines(snapshot)) {
		const a = project(l.from);
		const b = project(l.to);
		if (a && b && !a.hidden)
			lines.push({
				key: l.key,
				x1: Math.round(a.x),
				y1: Math.round(a.y),
				x2: Math.round(b.x),
				y2: Math.round(b.y),
				state: l.state
			});
	}
	const stations: ScreenNetwork['stations'] = [];
	for (const s of networkStations(snapshot)) {
		const p = project(s.position);
		if (p && !p.hidden)
			stations.push({ id: s.id, label: s.label, x: Math.round(p.x), y: Math.round(p.y) });
	}
	return { lines, stations };
}
