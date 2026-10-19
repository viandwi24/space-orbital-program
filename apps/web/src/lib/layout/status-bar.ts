/**
 * The Base layout's status bar and bell (plan 204, ADR 0201 point 3): what the bar shows from a
 * snapshot, the autosave age, and the bell's feed of events the player did not see. No Svelte here.
 */
import type { Snapshot } from '@orbital/core';
import { formatFunds } from '../format';

export interface StatusItems {
	/** Null with the economy off. */
	funds: string | null;
	science: string | null;
	reputation: string | null;
	/** "2 active" contracts (BASE_LAYOUT §4), or null without contracts. */
	contracts: string | null;
}

export function statusItems(snapshot: Snapshot | null): StatusItems {
	const e = snapshot?.economy;
	const c = snapshot?.contracts;
	const on = e?.enabled === true;
	return {
		funds: on ? formatFunds(e.funds) : null,
		science: e ? e.science.toFixed(1) : null,
		reputation: on ? e.reputation.toFixed(0) : null,
		contracts: c?.enabled ? `${c.used} active` : null
	};
}

/** The status bar's connection (BASE_LAYOUT §4): the dot, "Connected" and the network. */
export interface Connection {
	online: boolean;
	text: string;
	detail: string;
}

const count = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

/** The focused vessel's link when it has one in the comms network, else the network's size. */
export function connection(snapshot: Snapshot | null, focus: number | null = null): Connection {
	const net = snapshot?.network;
	if (!net) return { online: true, text: 'Connected', detail: 'Comms off' };
	const link = focus === null ? undefined : net.vessels.find((v) => v.vessel === focus);
	if (link && link.to === null)
		return { online: false, text: 'No signal', detail: link.reason ?? 'Out of range' };
	const relays = link ? Math.max(0, link.route.length - 1) : 0;
	return {
		online: true,
		text: 'Connected',
		detail: link
			? `${count(net.stations.length, 'station')} · ${count(relays, 'relay')}`
			: count(net.stations.length, 'station')
	};
}

/** "Saved 12 s ago", "Saved 3 min ago", "Not saved yet". */
export function savedAgo(savedAt: number | null, now: number): string {
	if (savedAt === null) return 'Not saved yet';
	const s = Math.max(0, Math.round((now - savedAt) / 1000));
	if (s < 60) return `Saved ${s} s ago`;
	const m = Math.round(s / 60);
	if (m < 60) return `Saved ${m} min ago`;
	return `Saved ${Math.round(m / 60)} h ago`;
}

/** One entry of the bell (ADR 0201 point 10): plan 205 adds the warp-stopping kinds. */
export interface BellEntry {
	id: number;
	/** Who wrote it: `sim`, `construction`, `contract`, ... */
	source: string;
	/** Wall clock, ms. */
	time: number;
	text: string;
	/** A page to open for it, if any. */
	href?: string;
	read: boolean;
}

export interface BellFeed {
	readonly entries: readonly BellEntry[];
	readonly unread: number;
	push(entry: Omit<BellEntry, 'id' | 'read' | 'time'> & { time?: number }): void;
	markAllRead(): void;
	subscribe(listener: () => void): () => void;
}

/** The newest `limit` entries are kept. */
export function createBellFeed(limit = 50, now: () => number = Date.now): BellFeed {
	let entries: BellEntry[] = [];
	let next = 1;
	const listeners = new Set<() => void>();
	const notify = (): void => {
		for (const l of listeners) l();
	};
	return {
		get entries() {
			return entries;
		},
		get unread() {
			return entries.filter((e) => !e.read).length;
		},
		push(entry) {
			entries = [
				{ ...entry, id: next++, time: entry.time ?? now(), read: false },
				...entries
			].slice(0, limit);
			notify();
		},
		markAllRead() {
			entries = entries.map((e) => (e.read ? e : { ...e, read: true }));
			notify();
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
	};
}
