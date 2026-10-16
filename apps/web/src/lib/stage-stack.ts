/** The stage stack panel's model (plan 021): one row per remaining stage, or an honest empty state. */
import type { VesselDesign } from '@orbital/core';
import { twr, type ContentLookups, type DeltaVReport } from './delta-v';

export interface StageRow {
	/** Index into the design's stages (0 fires first); the label is 1-based. */
	stage: number;
	label: string;
	/** `stagingIcon` of each part the stage fires (icon names, in design order). */
	icons: string[];
	/** Delta-v at the chosen pressure, m/s. */
	dv: number;
	burnTime: number;
	twr: number;
	/** Propellant left in the tanks that feed the stage, 0..1; null when it has no engine. */
	fuel: number | null;
	/** The burn in progress. */
	current: boolean;
	/** The stage the next press of Space fires. */
	next: boolean;
}

export type StageStackEmpty = 'no-staging' | 'spent' | null;

export interface StageStackModel {
	rows: StageRow[];
	total: number;
	empty: StageStackEmpty;
}

export type Environment = 'vacuum' | 'sea-level';

export function stageStackModel(input: {
	report: DeltaVReport;
	design: Pick<VesselDesign, 'parts' | 'stages'>;
	content: Pick<ContentLookups, 'parts'>;
	environment: Environment;
	stagesFired: number;
	/** Surface gravity of the body being left, m/s^2, for the TWR column. */
	gravity: number;
}): StageStackModel {
	const { report, design, content, environment, stagesFired, gravity } = input;
	if (design.stages.length === 0) return { rows: [], total: 0, empty: 'no-staging' };
	const partOf = new Map(design.parts.map((p) => [p.index, p.part]));
	const rows: StageRow[] = report.stages.map((s) => {
		const thrust = environment === 'vacuum' ? s.thrustVacuum : s.thrustSeaLevel;
		return {
			stage: s.stage,
			label: `${s.stage + 1}`,
			icons: s.parts.map((i) => content.parts.get(partOf.get(i) ?? '')?.stagingIcon ?? 'part'),
			dv: environment === 'vacuum' ? s.dvVacuum : s.dvSeaLevel,
			burnTime: s.burnTime,
			twr: twr(thrust, s.massStart, gravity),
			fuel:
				s.engines === 0 || s.propellantCapacity <= 0 ? null : s.propellant / s.propellantCapacity,
			current: s.current,
			next: !s.current && s.stage === stagesFired
		};
	});
	return {
		rows,
		total: environment === 'vacuum' ? report.totalVacuum : report.totalSeaLevel,
		empty: rows.length === 0 ? 'spent' : null
	};
}
