/**
 * Rival agencies in the Mission Center (plan 126, ADR 0190): the agency strip and the news feed,
 * from `Snapshot.agencies`. Pure.
 */
import type { Snapshot } from '@orbital/core';

export interface RivalRow {
	id: string;
	name: string;
	/** "2 objects in orbit · next launch on day 140". */
	sub: string;
}

export interface NewsRow {
	key: string;
	text: string;
	/** "3 days ago". */
	when: string;
}

export function rivalRows(snapshot: Pick<Snapshot, 'agencies'> | null): RivalRow[] {
	return (snapshot?.agencies?.agencies ?? []).map((a) => {
		const n = a.objects.length;
		const rented = a.objects.filter((o) => o.rented).length;
		return {
			id: a.id,
			name: a.name,
			sub: `${n === 1 ? '1 object' : `${n} objects`} in orbit${rented ? ` · ${rented} rented to you` : ''} · next launch on day ${a.nextDay}`
		};
	});
}

/** The newest `limit` news items; `day` is the world-tick day length, s. */
export function newsRows(
	snapshot: Pick<Snapshot, 'agencies' | 't'> | null,
	day: number,
	limit = 8
): NewsRow[] {
	const now = snapshot?.t ?? 0;
	return (snapshot?.agencies?.news ?? []).slice(0, limit).map((n, i) => {
		const days = Math.floor((now - n.time) / day);
		return {
			key: `${n.time}:${i}`,
			text: n.text,
			when: days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
		};
	});
}
