/**
 * Stability read-out (ADR 0042): centre of mass against centre of pressure, from part data only.
 * The pressure model follows what the sim does: `stock.fin` gives a normal force
 * `S (liftSlope sin a cos a + crossflow sin^2 a)`, every part's drag gives a cross-flow force
 * `Cd A sin^2 a` at the part (frames.ts, ADR 0035). Both are evaluated at a reference angle of
 * attack so the centre of pressure is the mean of the normal forces' heights.
 */
import { rotateY, type PartDefinition, type VesselDesign } from '@orbital/core';
import { ModuleFin, finConfigSchema } from '@orbital/mod-stock';
import { stagingModelFromDesign, type ContentLookups } from '../delta-v';
import { layoutOf } from './state';

/** Reference angle of attack for the pressure centre, rad (6 degrees). */
export const REFERENCE_ALPHA = (6 * Math.PI) / 180;
/** The sim's drag coefficient for a part that declares none (packages/sim constants.ts). */
const DEFAULT_DRAG = 0.3;
/** Margin (body calibres) from which the design counts as stable. */
export const STABLE_MARGIN = 1;

export type StabilityState = 'none' | 'unfinned' | 'unstable' | 'marginal' | 'stable';

export interface Stability {
	state: StabilityState;
	/** Heights above the design root's origin, metres (+y up). Null for an empty design. */
	com: number | null;
	/** With every tank empty. */
	comEmpty: number | null;
	cop: number | null;
	/** Where the markers sit off the axis: [x, z] of the centre of mass and of the centre of pressure, metres. */
	comSide: [number, number];
	copSide: [number, number];
	/** `(com - cop) / calibre`, the smaller of the full and empty values; positive: pressure behind the mass. */
	margin: number | null;
	marginFull: number | null;
	marginEmpty: number | null;
	/** Widest part diameter, metres. */
	calibre: number;
	fins: number;
}

const NONE: Stability = {
	state: 'none',
	com: null,
	comEmpty: null,
	cop: null,
	comSide: [0, 0],
	copSide: [0, 0],
	margin: null,
	marginFull: null,
	marginEmpty: null,
	calibre: 0,
	fins: 0
};

function lateralArea(def: PartDefinition): number {
	const s = def.shape;
	if (!s) return 1;
	if (s.kind === 'cylinder') return 2 * s.radius * s.height;
	// The sim's x and z face areas (axisAreas); the flow direction in the plane is unknown: mean.
	return (s.size[1] * s.size[2] + s.size[0] * s.size[1]) / 2;
}

const widthOf = (def: PartDefinition): number =>
	!def.shape
		? 1
		: def.shape.kind === 'cylinder'
			? def.shape.radius * 2
			: Math.max(def.shape.size[0], def.shape.size[2]);

export function stabilityOf(design: VesselDesign, content: ContentLookups): Stability {
	if (design.parts.length === 0) return NONE;
	const placed = layoutOf(design, content.parts);
	if (!placed) return NONE;
	const model = stagingModelFromDesign(design, content);

	let mass = 0;
	let mx = 0;
	let mz = 0;
	let nx = 0;
	let nz = 0;
	let moment = 0;
	let dry = 0;
	let dryMoment = 0;
	let calibre = 0;
	let normal = 0;
	let normalMoment = 0;
	let fins = 0;
	const sin = Math.sin(REFERENCE_ALPHA);
	const cos = Math.cos(REFERENCE_ALPHA);
	for (const part of model.parts.values()) {
		const at = placed.get(part.index);
		const { x, y, z } = at?.position ?? { x: 0, y: 0, z: 0 };
		let wet = part.def.mass;
		for (const [r, a] of Object.entries(part.full))
			wet += a * (content.resources.get(r)?.density ?? 0);
		mass += wet;
		moment += wet * y;
		mx += wet * x;
		mz += wet * z;
		dry += part.def.mass;
		dryMoment += part.def.mass * y;
		calibre = Math.max(calibre, widthOf(part.def));
		const body = (part.def.dragCoefficient ?? DEFAULT_DRAG) * lateralArea(part.def) * sin * sin;
		normal += body;
		normalMoment += body * y;
		nx += body * x;
		nz += body * z;
		for (const [id, raw] of part.def.modules ?? []) {
			if (id !== ModuleFin.id) continue;
			const fin = finConfigSchema.parse(raw);
			const force = fin.area * (fin.liftSlope * sin * cos + fin.crossflow * sin * sin);
			normal += force;
			const c = rotateY([fin.centre[0], fin.centre[1], fin.centre[2]], at?.yaw ?? 0);
			normalMoment += force * (y + c.y);
			nx += force * (x + c.x);
			nz += force * (z + c.z);
			fins++;
		}
	}
	const com = moment / mass;
	const comEmpty = dry > 0 ? dryMoment / dry : com;
	const cop = normal > 0 ? normalMoment / normal : com;
	const d = calibre || 1;
	const marginFull = (com - cop) / d;
	const marginEmpty = (comEmpty - cop) / d;
	const margin = Math.min(marginFull, marginEmpty);
	const state: StabilityState =
		fins === 0
			? 'unfinned'
			: margin < 0
				? 'unstable'
				: margin < STABLE_MARGIN
					? 'marginal'
					: 'stable';
	return {
		state,
		com,
		comEmpty,
		cop,
		comSide: [mx / mass, mz / mass],
		copSide: normal > 0 ? [nx / normal, nz / normal] : [mx / mass, mz / mass],
		margin,
		marginFull,
		marginEmpty,
		calibre,
		fins
	};
}
