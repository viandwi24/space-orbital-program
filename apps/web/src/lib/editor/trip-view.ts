/**
 * What the trip planner shows (plan 034): the destination's plan reduced to the states and rows the
 * stats strip draws. Pure, so every state is tested without a DOM.
 */
import type { DeltaVReport } from '../delta-v';
import { planTrip, type Destination, type StageBudget, type TripPlan } from './trip';

export type TripState =
	/** No parts yet. */
	| 'empty'
	/** Parts, but no stage gives delta-v. */
	| 'no-propulsion'
	| 'short'
	| 'covered';

export type LegStatus = 'idle' | 'covered' | 'partial' | 'short';

export interface TripCoverRow {
	/** "Stage 2". */
	label: string;
	dv: number;
	seaLevel: boolean;
}

export interface TripLegRow {
	id: string;
	label: string;
	dv: number;
	status: LegStatus;
	covers: TripCoverRow[];
	short: number;
}

export interface TripView {
	state: TripState;
	destination: Destination;
	needed: number;
	/** What the stages give to the legs, m/s. */
	covered: number;
	short: number;
	spare: number;
	/** 0..1, for the meter. */
	share: number;
	rows: TripLegRow[];
}

/** The stage figures of a design (`DeltaVReport`) as the planner takes them, firing order. */
export function budgetsOf(report: DeltaVReport | null): StageBudget[] {
	return (report?.stages ?? []).map((s) => ({
		stage: s.stage,
		dvSeaLevel: s.dvSeaLevel,
		dvVacuum: s.dvVacuum
	}));
}

export function tripView(
	destination: Destination,
	report: DeltaVReport | null,
	partCount: number
): TripView {
	const budgets = budgetsOf(report);
	const plan: TripPlan = planTrip(destination, budgets);
	const powered = budgets.some((b) => b.dvVacuum > 0);
	const state: TripState =
		partCount === 0 ? 'empty' : !powered ? 'no-propulsion' : plan.enough ? 'covered' : 'short';
	const idle = state === 'empty' || state === 'no-propulsion';
	const rows: TripLegRow[] = plan.legs.map((l) => ({
		id: l.leg.id,
		label: l.leg.label,
		dv: l.leg.dv,
		status: idle ? 'idle' : l.short <= 1e-9 ? 'covered' : l.covers.length > 0 ? 'partial' : 'short',
		covers: l.covers.map((c) => ({
			label: `Stage ${c.stage + 1}`,
			dv: c.dv,
			seaLevel: c.seaLevel
		})),
		short: l.short
	}));
	return {
		state,
		destination,
		needed: plan.needed,
		covered: idle ? 0 : plan.covered,
		short: idle ? plan.needed : plan.short,
		spare: idle ? 0 : plan.spare,
		share: plan.needed > 0 && !idle ? plan.covered / plan.needed : 0,
		rows
	};
}
