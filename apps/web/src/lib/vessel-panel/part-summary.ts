/**
 * The vessel panel's collapsed part row (plan 256, ADR 0241): one line of what matters about a part
 * and the panel's open-and-closed memory. KSP's Part Action Window opens on one part at a time and
 * KSP2's parts manager lists parts collapsed; both keep the figures in the header. Pure.
 */
import { resourceLabel } from '../format';
import type { PartRow } from './vessel-model';

export interface PartSummary {
	text: string;
	tone: 'idle' | 'warn' | 'danger';
}

/**
 * What a collapsed part row says: the heat while the part is hot, else its fullest store as a
 * percentage, else its first readout, else the number of controls.
 */
export function partSummary(p: PartRow): PartSummary {
	if (p.heat) {
		const f = p.heat.temperature / p.heat.max;
		if (f >= 0.5) {
			return {
				text: `Hot ${Math.round(p.heat.temperature)} K of ${p.heat.max} K`,
				tone: f >= 0.8 ? 'danger' : 'warn'
			};
		}
	}
	const store = p.resources.find((r) => r.capacity > 0);
	if (store) {
		const share = Math.round((100 * store.amount) / store.capacity);
		const more = p.resources.filter((r) => r.capacity > 0).length - 1;
		return {
			text: `${resourceLabel(store.resource)} ${share} %${more > 0 ? ` · +${more}` : ''}`,
			tone: 'idle'
		};
	}
	const read = p.readouts[0];
	if (read) return { text: `${read.label} ${read.value}`, tone: 'idle' };
	const n = p.controls.length;
	return { text: n === 0 ? 'No controls' : `${n} control${n === 1 ? '' : 's'}`, tone: 'idle' };
}

/** Which rows of one vessel's panel are open: part entities and category names. */
export type OpenRows = ReadonlyMap<string, ReadonlySet<string>>;

export const partKey = (entity: number): string => `part:${entity}`;
export const categoryKey = (category: string): string => `cat:${category}`;

/** Whether `key` is open for `vessel`; `fallback` while the player has not touched it. */
export function isOpenRow(
	state: OpenRows,
	vessel: string,
	key: string,
	fallback: boolean
): boolean {
	const set = state.get(vessel);
	if (!set) return fallback;
	if (set.has(`+${key}`)) return true;
	if (set.has(`-${key}`)) return false;
	return fallback;
}

/** The state with `key` opened or closed for `vessel`: what the player chose is remembered. */
export function withRow(state: OpenRows, vessel: string, key: string, open: boolean): OpenRows {
	const next = new Map(state);
	const set = new Set(state.get(vessel) ?? []);
	set.delete(`+${key}`);
	set.delete(`-${key}`);
	set.add(`${open ? '+' : '-'}${key}`);
	next.set(vessel, set);
	return next;
}
