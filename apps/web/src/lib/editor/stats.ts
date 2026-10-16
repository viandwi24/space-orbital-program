/**
 * Readouts of the design being edited: mass, size, and per-stage delta-v and TWR. The numbers are
 * `lib/delta-v.ts` unchanged (the same function the flight HUD uses), so the VAB and the HUD agree
 * by construction; this file only arranges them for the stage editor.
 */
import type { PartDefinition, PartLookup, VesselDesign } from '@orbital/core';
import {
	stageDeltaV,
	stagingModelFromDesign,
	twr,
	type ContentLookups,
	type DeltaVReport
} from '../delta-v';
import { positionsOf } from './state';

export type Environment = 'vacuum' | 'sea-level';

export interface StageEditRow {
	/** Index into `design.stages` (0 fires first). */
	stage: number;
	/** Parts the stage fires, in the order of the design. */
	parts: number[];
	dv: number;
	burnTime: number;
	twr: number;
	thrust: number;
	/** Propellant mass of the stage's first burn interval, kg. */
	propellant: number;
	engines: number;
	empty: boolean;
}

export interface DesignStats {
	report: DeltaVReport | null;
	rows: StageEditRow[];
	totalDv: number;
	/** Mass with full tanks, kg. */
	wetMass: number;
	/** Mass of the parts alone, kg. */
	dryMass: number;
	/** Metres from the lowest to the highest point of the parts' shapes. */
	height: number;
	partCount: number;
	/** Thrust-to-weight at liftoff (first stage with thrust, sea level), null without an engine stage. */
	liftoffTwr: number | null;
}

const heightOf = (def: PartDefinition | undefined): number =>
	!def?.shape ? 1 : def.shape.kind === 'cylinder' ? def.shape.height : def.shape.size[1];

export function designStats(
	design: VesselDesign,
	content: ContentLookups,
	environment: Environment,
	gravity: number
): DesignStats {
	const count = design.parts.length;
	if (count === 0) {
		return {
			report: null,
			rows: [],
			totalDv: 0,
			wetMass: 0,
			dryMass: 0,
			height: 0,
			partCount: 0,
			liftoffTwr: null
		};
	}
	const model = stagingModelFromDesign(design, content);
	const report = stageDeltaV(model);
	let wet = 0;
	let dry = 0;
	for (const part of model.parts.values()) {
		dry += part.def.mass;
		wet += part.def.mass;
		for (const [r, a] of Object.entries(part.full)) {
			wet += a * (content.resources.get(r)?.density ?? 0);
		}
	}
	const rows: StageEditRow[] = report.stages.map((s) => {
		const thrust = environment === 'vacuum' ? s.thrustVacuum : s.thrustSeaLevel;
		return {
			stage: s.stage,
			parts: s.parts,
			dv: environment === 'vacuum' ? s.dvVacuum : s.dvSeaLevel,
			burnTime: s.burnTime,
			twr: twr(thrust, s.massStart, gravity),
			thrust,
			propellant: s.propellant,
			engines: s.engines,
			empty: (design.stages[s.stage] ?? []).length === 0
		};
	});
	const lift = report.stages.find((s) => s.thrustSeaLevel > 0);
	return {
		report,
		rows,
		totalDv: environment === 'vacuum' ? report.totalVacuum : report.totalSeaLevel,
		wetMass: wet,
		dryMass: dry,
		height: heightOfDesign(design, content.parts),
		partCount: count,
		liftoffTwr: lift ? twr(lift.thrustSeaLevel, lift.massStart, gravity) : null
	};
}

/**
 * Delta-v available for a launch from the pad: the first stage burns through the atmosphere (sea
 * level figure), later stages in near vacuum. Compared with `tripDeltaV` in the stats strip.
 */
export function ascentDeltaV(report: DeltaVReport | null): number {
	if (!report) return 0;
	return report.stages.reduce((sum, s, k) => sum + (k === 0 ? s.dvSeaLevel : s.dvVacuum), 0);
}

export function heightOfDesign(design: VesselDesign, parts: PartLookup): number {
	const placed = positionsOf(design, parts);
	if (!placed || placed.size === 0) return 0;
	let lo = Infinity;
	let hi = -Infinity;
	for (const p of design.parts) {
		const y = placed.get(p.index)?.y ?? 0;
		const h = heightOf(parts.get(p.part));
		lo = Math.min(lo, y - h / 2);
		hi = Math.max(hi, y + h / 2);
	}
	return hi - lo;
}

// --- trip estimate -------------------------------------------------------------------------------

export interface TripTarget {
	id: string;
	label: string;
	/** Altitude of the circular orbit to reach, m. */
	altitude: number;
}

export const TRIP_TARGETS: readonly TripTarget[] = [
	{ id: 'low-orbit', label: 'Low orbit (80 km)', altitude: 80_000 }
];

/**
 * Delta-v from the pad to a circular orbit, as an estimate: the orbital speed at `altitude`, plus
 * an allowance for gravity and drag losses, minus the speed the launch site already has from the
 * body's rotation (equator, eastward). The allowance is a rule of thumb for a one-body launch
 * with this atmosphere (about 1.3 km/s: the roughly 3.4 km/s that journal 006 budgets for this body), not a solver result.
 */
export const LOSS_ALLOWANCE = 1_300;

export function tripDeltaV(
	body: { radius: number; mu: number; rotationPeriod: number },
	altitude: number
): number {
	const speed = Math.sqrt(body.mu / (body.radius + altitude));
	const rotation = (2 * Math.PI * body.radius) / body.rotationPeriod;
	return speed + LOSS_ALLOWANCE - rotation;
}
