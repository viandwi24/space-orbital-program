/**
 * The predicted path across spheres of influence for the map view (plan 044): `kepler`'s patched
 * conics sampled into polylines, one per body the path passes through. The renderer draws them
 * (`Renderer.setMapPath`); it never imports kepler. Plan 045 reuses `bodyNodes` to plan burns.
 */
import {
	GRAVITATIONAL_CONSTANT,
	type BodyDefinition,
	type Snapshot,
	type Vec3
} from '@orbital/core';
import {
	predictPatchedConics,
	propagateUniversal,
	soiRadius,
	type PatchedBody,
	type PatchedSegment
} from '@orbital/kepler';

/** What a body contributes to the prediction, from its definition. */
export function bodyNodes(bodies: readonly BodyDefinition[]): PatchedBody[] {
	const byId = new Map(bodies.map((b) => [b.id, b]));
	return bodies.map((b) => {
		const parent = b.parent === undefined ? undefined : byId.get(b.parent);
		return {
			id: b.id,
			mu: GRAVITATIONAL_CONSTANT * b.mass,
			soi: parent && b.orbit ? soiRadius(b.orbit.a, b.mass, parent.mass) : Number.POSITIVE_INFINITY,
			radius: b.radius,
			...(parent && b.orbit ? { parent: parent.id, orbit: b.orbit } : {})
		};
	});
}

export interface MapPath {
	body: string;
	/** Where the body's centre is when the stretch starts, system frame, m. */
	offset: Vec3;
	points: Vec3[];
	/** Start and end of the stretch, s of sim time. */
	t0: number;
	t1: number;
	end: PatchedSegment['end'];
	/** Periapsis radius of the stretch's conic, m from the body's centre, when it has one. */
	periapsis?: number;
}

/** Samples per stretch. */
const SAMPLES = 160;

/**
 * Predicted path of `vessel` for `horizon` seconds from `snapshot`, or `[]` for a vessel fixed to the
 * ground or one that never leaves its sphere (the vessel's own orbit line already shows that).
 */
export function predictMapPath(
	snapshot: Snapshot,
	vessel: number,
	nodes: readonly PatchedBody[],
	horizon: number
): MapPath[] {
	const v = snapshot.vessels.find((s) => Number(s.id) === vessel);
	if (!v || v.surface) return [];
	// The root part's origin, not the centre of mass: metres of difference at the scale of a map.
	const segments = predictPatchedConics(
		nodes,
		{ body: String(v.soi), r: v.position, v: v.velocity, t: snapshot.t },
		horizon
	);
	if (segments.length < 2) return [];
	return segments.map((s) => {
		const node = nodes.find((n) => n.id === s.body)!;
		const points: Vec3[] = [];
		const span = Math.max(s.t1 - s.t0, 0);
		for (let k = 0; k <= SAMPLES; k++) {
			points.push(propagateUniversal(s.entry.r, s.entry.v, node.mu, (span * k) / SAMPLES).r);
		}
		const out: MapPath = {
			body: s.body,
			offset: s.bodyOffset,
			points,
			t0: s.t0,
			t1: s.t1,
			end: s.end
		};
		if (s.elements && s.elements.e < 1) out.periapsis = s.elements.a * (1 - s.elements.e);
		else if (s.elements) out.periapsis = Math.abs(s.elements.a) * (s.elements.e - 1);
		return out;
	});
}

/** A look-ahead long enough to cross a sphere: 1.5 periods of a bound orbit, a day of sim time for an escape. */
export function predictionHorizon(orbit: Snapshot['vessels'][number]['orbit'], mu: number): number {
	if (!orbit || orbit.e >= 1 || orbit.a <= 0) return 3 * 86_400;
	const period = 2 * Math.PI * Math.sqrt((orbit.a * orbit.a * orbit.a) / mu);
	return Math.min(Math.max(1.5 * period, 6_000), 4 * 86_400);
}
