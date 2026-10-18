/**
 * Comms tier 1 on the page (plan 115, ADR 0158): the link badge with the reason a link is down,
 * the vessel panel's Comms tab, and the Network layer's lines and stations, from `Snapshot.network`.
 * Tier 2 (plan 116, ADR 0185): signal bars from the rate, and the link inspector's terms.
 */
import type { LinkBudget, Snapshot, Vec3 } from '@orbital/core';
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
	/** Signal bars, 0..4: from the rate (ADR 0185 point 9), else 4 for a link. */
	bars: number;
	blackout: number;
}

/** Bars for a link's rate: 1 below 10 kbit/s, 2 below 1 Mbit/s, 3 below 100 Mbit/s, else 4. */
export function barsForRate(rate: number | null | undefined): number {
	if (rate === null || rate === undefined) return 4;
	if (rate < 1e4) return 1;
	if (rate < 1e6) return 2;
	if (rate < 1e8) return 3;
	return 4;
}

/** A rate for the player: "1 kbit/s" … "1 Gbit/s"; 0 is "Commands only". */
export function rateText(rate: number): string {
	if (rate <= 0) return 'Commands only';
	const units: Array<[number, string]> = [
		[1e9, 'Gbit/s'],
		[1e6, 'Mbit/s'],
		[1e3, 'kbit/s']
	];
	for (const [k, unit] of units) if (rate >= k) return `${trim(rate / k)} ${unit}`;
	return `${trim(rate)} bit/s`;
}

const trim = (x: number): string => String(Number(x.toPrecision(3)));

/** A distance for the inspector: m below 10 km, else km with thousands spaced. */
function distanceText(m: number): string {
	if (m < 1e4) return `${Math.round(m)} m`;
	return `${Math.round(m / 1000)
		.toLocaleString('en-US')
		.replace(/,/g, ' ')} km`;
}

const dB = (x: number, unit: string): string => `${x.toFixed(1)} ${unit}`;

export interface BudgetTerm {
	id: keyof LinkBudget;
	label: string;
	value: string;
}

/** Every term of a link budget, named, in the inspector's order (ADR 0185 point 5). */
export function budgetTerms(b: LinkBudget, bandLabel = b.band): BudgetTerm[] {
	return [
		{ id: 'band', label: 'Band', value: `${bandLabel} · ${frequencyText(b.frequency)}` },
		{ id: 'txPower', label: 'Transmit power', value: dB(b.txPower, 'dBW') },
		{ id: 'txGain', label: 'Transmit gain', value: dB(b.txGain, 'dBi') },
		{ id: 'distance', label: 'Distance', value: distanceText(b.distance) },
		{ id: 'scale', label: 'Comms scale', value: `× ${trim(b.scale)}` },
		{
			id: 'effectiveDistance',
			label: 'Effective distance',
			value: distanceText(b.effectiveDistance)
		},
		{ id: 'pathLoss', label: 'Free-space loss', value: dB(-b.pathLoss, 'dB') },
		{ id: 'rxGain', label: 'Receive gain', value: dB(b.rxGain, 'dBi') },
		{ id: 'received', label: 'Received power', value: dB(b.received, 'dBW') },
		{ id: 'noiseTemperature', label: 'Noise temperature', value: `${trim(b.noiseTemperature)} K` },
		{ id: 'noiseDensity', label: 'Noise density', value: dB(b.noiseDensity, 'dBW/Hz') },
		{ id: 'cn0', label: 'Carrier to noise (C/N0)', value: dB(b.cn0, 'dB-Hz') },
		{ id: 'ebN0', label: 'Required Eb/N0', value: dB(b.ebN0, 'dB') },
		{ id: 'margin', label: 'Margin at 1 kbit/s', value: dB(b.margin, 'dB') },
		{ id: 'rate', label: 'Data rate', value: rateText(b.rate) }
	];
}

function frequencyText(hz: number): string {
	if (hz >= 1e12) return `${trim(hz / 1e12)} THz`;
	if (hz >= 1e9) return `${trim(hz / 1e9)} GHz`;
	return `${trim(hz / 1e6)} MHz`;
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
		bars: partial ? 2 : barsForRate(link.rate),
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
	/** Signal bars, 0..4. */
	bars: number;
	/** The link's rate in words ("Commands only" below the ladder); null without a budget. */
	rate: string | null;
	/**
	 * The link inspector (ADR 0185 point 9): every term, once the snapshot carries this vessel's
	 * budget (`comms-inspect`); null before that, or without a budget.
	 */
	budget: BudgetTerm[] | null;
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
	const linked = link.to !== null;
	const inspector = snapshot.network.inspector;
	const budget =
		linked && inspector && Number(inspector.vessel) === vessel ? inspector.budget : null;
	return {
		route: 'auto',
		path: linked ? [name, endpointLabel(snapshot, link.to!)] : [name],
		linked,
		reason: linked ? null : linkText(link.reason ?? 'out of range'),
		control: link.control,
		bars: !linked ? 0 : link.control === 'partial' ? 2 : barsForRate(link.rate),
		rate: linked && link.rate !== null && link.rate !== undefined ? rateText(link.rate) : null,
		budget: budget ? budgetTerms(budget, bandLabel(budget.band)) : null,
		endpoints: snapshot.network.stations.map((s) => ({
			id: s.id,
			label: s.label,
			body: bodyLabel(s.body),
			current: link.to === s.id
		}))
	};
}

/** A band's label from its id (`stock.x` → "X band"); other mods' ids show as they are. */
export function bandLabel(id: string): string {
	const stock: Record<string, string> = {
		'stock.uhf': 'UHF',
		'stock.s': 'S band',
		'stock.x': 'X band',
		'stock.ka': 'Ka band',
		'stock.optical': 'Optical'
	};
	return stock[id] ?? id;
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
