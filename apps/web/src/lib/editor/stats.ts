/**
 * Readouts of the design being edited: mass, size, and per-stage delta-v and TWR. The numbers are
 * `lib/delta-v.ts` unchanged (the same function the flight HUD uses), so the VAB and the HUD agree
 * by construction; this file only arranges them for the stage editor.
 */
import {
	SEA_LEVEL_PRESSURE,
	type BodyDefinition,
	type PartDefinition,
	type PartLookup,
	type VesselDesign
} from '@orbital/core';
import {
	stageDeltaV,
	stagingModelFromDesign,
	twr,
	type ContentLookups,
	type DeltaVReport
} from '../delta-v';
import { bodyMu } from '../orbit-info';
import { positionsOf } from './state';

export type Environment = 'vacuum' | 'sea-level';

/**
 * Where the Hangar evaluates Δv and TWR (plan 218): a body and a situation, at its surface, at an
 * altitude above it (m), or in vacuum.
 */
export interface Situation {
	kind: 'sea-level' | 'altitude' | 'vacuum';
	/** m above the surface, for `altitude`. */
	altitude?: number;
}

/** The pressure (Pa) and gravity (m/s²) of `situation` at `body`: exp(−h/H), none above the air. */
export function situationAt(
	body: Pick<BodyDefinition, 'radius' | 'atmosphere' | 'mass'>,
	situation: Situation
): { environment: Environment; pressure: number; gravity: number } {
	const h = situation.kind === 'altitude' ? Math.max(0, situation.altitude ?? 0) : 0;
	const r = body.radius + h;
	const gravity = bodyMu(body) / (r * r);
	const air = body.atmosphere;
	if (situation.kind === 'vacuum' || !air || h >= air.height)
		return { environment: 'vacuum', pressure: 0, gravity };
	return {
		environment: 'sea-level',
		pressure: air.surfacePressure * Math.exp(-h / air.scaleHeight),
		gravity
	};
}

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
	gravity: number,
	/** The "sea level" pressure, Pa (plan 218's body and situation); the home sea level by default. */
	pressure = SEA_LEVEL_PRESSURE
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
	const report = stageDeltaV(model, 0, pressure);
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
