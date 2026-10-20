/**
 * The Hangar's right panel as data (plan 255, ADR 0240): which sections fold, how they start, how a
 * saved state is read back, and the Trip block as one line. Pure. KSP's Δv readout and the Engineer's
 * Report keep the figures in one header and fold the detail; so does this.
 */
import type { TripView } from '../editor/trip-view';

/** A foldable section of the right panel and whether it starts open. */
export const FOLD_DEFAULTS = {
	/** The trip's picker, meter and legs under the one-line summary. */
	trip: false,
	staging: true,
	checks: true,
	power: false,
	crew: false
} as const;
export type FoldId = keyof typeof FOLD_DEFAULTS;
export type FoldState = Record<FoldId, boolean>;

export const FOLD_KEY = 'orbital.vab.folds';

export const defaultFolds = (): FoldState => ({ ...FOLD_DEFAULTS });

/** A saved state, with anything missing or of the wrong type taken from the defaults. */
export function parseFolds(text: string | null | undefined): FoldState {
	const out = defaultFolds();
	if (!text) return out;
	try {
		const raw = JSON.parse(text) as unknown;
		if (typeof raw !== 'object' || raw === null) return out;
		for (const id of Object.keys(out) as FoldId[]) {
			const v = (raw as Record<string, unknown>)[id];
			if (typeof v === 'boolean') out[id] = v;
		}
	} catch {
		// a damaged value is the defaults
	}
	return out;
}

export const serialiseFolds = (state: FoldState): string => JSON.stringify(state);

export interface TripSummary {
	/** `Low orbit (80 km): 3,343 of 3,343 m/s`, or what is missing. */
	text: string;
	tone: 'good' | 'warn' | 'idle';
}

/** The trip as one line: the destination, the delta-v the stages give against the delta-v it needs. */
export function tripSummary(
	trip: TripView,
	format: (dv: number) => string,
	unit: string
): TripSummary {
	const label = trip.destination.label;
	switch (trip.state) {
		case 'empty':
			return { text: `${label}: add parts`, tone: 'idle' };
		case 'no-propulsion':
			return { text: `${label}: no stage gives Δv yet`, tone: 'idle' };
		case 'covered':
			return {
				text: `${label}: ${format(trip.covered)} of ${format(trip.needed)} ${unit}`,
				tone: 'good'
			};
		default:
			return {
				text: `${label}: short by ${format(trip.short)} ${unit}`,
				tone: 'warn'
			};
	}
}
