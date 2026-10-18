/**
 * Crew radios and live broadcasts (plan 121, ADR 0193): a vessel's bars for the crew rows, the
 * suit radio's bars with what it relays through and why it is cut, and the firsts that may still be
 * broadcast. Pure: built from a snapshot.
 */
import type { Snapshot } from '@orbital/core';
import { barsForRate, rateText } from './network-model';

export interface RadioBars {
	level: number;
	offline: boolean;
	/** "via Lander", "Blocked by terrain", "No comms". */
	text: string;
}

const NO_COMMS: RadioBars = { level: 0, offline: true, text: 'No comms' };
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const nameOf = (snap: Snapshot, hop: string): string => {
	if (!hop.startsWith('vessel:')) {
		return snap.network?.stations.find((s) => s.id === hop)?.label ?? hop;
	}
	const id = Number(hop.slice('vessel:'.length));
	const v = snap.vessels.find((x) => Number(x.id) === id);
	return v?.name ?? `Vessel ${id}`;
};

/** The bars of `vessel`'s link: offline without one, with the reason. */
export function linkBars(snap: Snapshot, vessel: number): RadioBars {
	const link = snap.network?.vessels.find((v) => Number(v.vessel) === vessel);
	if (!link) return NO_COMMS;
	if (link.to === null) {
		return { level: 0, offline: true, text: capital(link.reason ?? 'no link') };
	}
	return { level: barsForRate(link.rate), offline: false, text: `via ${nameOf(snap, link.to)}` };
}

/** The suit radio of the suit vessel `suit`: relayed by a crewed vessel in sight, or cut and why. */
export const suitRadio = (snap: Snapshot, suit: number): RadioBars => linkBars(snap, suit);

export interface BroadcastOffer {
	milestone: string;
	label: string;
	/** The route has the rate now. */
	ready: boolean;
	/** "10 Mbit/s home · 58 min left" or "Needs 100 kbit/s; no link to the ground". */
	detail: string;
}

/** The firsts that may still be broadcast live (ADR 0193 point 5), oldest first. */
export function broadcastOffers(snap: Snapshot): BroadcastOffer[] {
	return (snap.network?.broadcasts ?? []).map((b) => {
		const left = Math.max(0, Math.ceil((b.until - snap.t) / 60));
		const ready = b.rate !== null && b.rate >= b.needs;
		return {
			milestone: b.milestone,
			label: b.label,
			ready,
			detail: ready
				? `${rateText(b.rate!)} home · ${left} min left`
				: `Needs ${rateText(b.needs)}; ${b.rate === null ? 'no link to the ground' : `the route has ${rateText(b.rate)}`}`
		};
	});
}
