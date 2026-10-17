/**
 * Where the target is drawn (plan 057, ADR 0084), plain TypeScript outside Svelte like the rest of
 * the flight engine room. It owns what the sim does not: the closest approach across spheres and the
 * rendezvous aids (recomputed about once a second, not per frame), and the screen positions of the
 * target marker, the closest-approach pair and the target's orbit in the map, or of the label and the
 * edge arrow in the flight view. A click on the map is resolved to a target here too.
 */
import {
	GRAVITATIONAL_CONSTANT,
	type BodyDefinition,
	type Command,
	type Snapshot,
	type Vec3,
	type VesselSnapshot
} from '@orbital/core';
import { propagate, type OrbitalElements } from '@orbital/kepler';
import type { ScreenPoint } from '@orbital/renderer';
import { formatDistance, formatDuration } from './format';
import { pickTarget, type PickCandidate, type PickPoint } from './map-pick';
import { bodyNodes } from './map-path';
import {
	aidCommand,
	patchedApproach,
	rendezvousAids,
	type Aid,
	type AidId,
	type ApproachInfo
} from './rendezvous-aids';
import { targetIndicator, type Indicator } from './target-indicator';
import { targetKey } from './target-model';
import { bodyLabel } from './hud-model';

/** What the Target card shows beyond the sim's numbers. */
export interface RendezvousInfo {
	/** Closest approach across spheres (nodes applied), or null. */
	approach: {
		in: number;
		distance: number;
		relativeSpeed: number;
		body: string;
		/** The path includes the vessel's maneuver nodes. */
		withNodes: boolean;
	} | null;
	aids: Aid[];
}

export interface MapTargetFrame {
	/** The target's marker; null when it cannot be placed (behind the camera). */
	target: { point: ScreenPoint; name: string } | null;
	/** Vessel and target at the closest approach, and the label for the pair. */
	approach: { vessel: ScreenPoint | null; target: ScreenPoint | null; text: string } | null;
	/** The target's orbit as runs of visible pixels. */
	orbit: PickPoint[][];
	/** Other vessels, as small dots (a click on one targets it). */
	others: Array<{ key: string; name: string; point: ScreenPoint }>;
}

export interface FlightTargetFrame {
	name: string;
	/** Distance to the target, m. */
	distance: number;
	indicator: Indicator;
}

export interface TargetViewFrame {
	map: MapTargetFrame | null;
	flight: FlightTargetFrame | null;
}

export interface TargetViewOptions {
	bodies: readonly BodyDefinition[];
	/** `Renderer.project` (ADR 0033). */
	project(world: Vec3): ScreenPoint | null;
	snapshot(): Snapshot | null;
	vessel(): number | null;
	mapOn(): boolean;
	/** The canvas box in CSS px, and what the interface panels cover of it. */
	size(): {
		width: number;
		height: number;
		insets?: { top: number; right: number; bottom: number; left: number };
	};
}

export interface TargetView {
	/** Per render frame (wall clock, ms): refreshes the approach and aids about once a second. */
	update(now: number): void;
	frame(): TargetViewFrame;
	readonly info: RendezvousInfo | null;
	/** The key a click at (x, y) px on the map means, or null; `lines` false looks at bodies and vessels only. */
	pick(x: number, y: number, lines?: boolean): string | null;
	/** The `node-set` command for an aid, or null when it has no node. */
	aidCommand(id: AidId): Command | null;
}

const REFRESH_MS = 1000;
const ORBIT_SAMPLES = 120;
/** A click may land this far from a vessel dot, px. */
const DOT_PICK = 12;

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const bodyMuOf = (b: BodyDefinition): number => GRAVITATIONAL_CONSTANT * b.mass;

/** A closed orbit sampled once around, relative to its primary. Undefined for an open one. */
function sampleClosed(el: OrbitalElements, mu: number): Vec3[] | undefined {
	if (el.e >= 1 || el.a <= 0) return undefined;
	const out: Vec3[] = [];
	for (let k = 0; k <= ORBIT_SAMPLES; k++) {
		const m0 = el.m0 + (2 * Math.PI * k) / ORBIT_SAMPLES;
		out.push(propagate({ ...el, m0 }, mu, el.epoch).r);
	}
	return out;
}

/** Runs of consecutive points that are on screen and not behind a body. */
function visibleRuns(points: Array<ScreenPoint | null>): PickPoint[][] {
	const runs: PickPoint[][] = [];
	let run: PickPoint[] = [];
	for (const p of points) {
		if (p && !p.hidden) run.push({ x: p.x, y: p.y });
		else {
			if (run.length > 1) runs.push(run);
			run = [];
		}
	}
	if (run.length > 1) runs.push(run);
	return runs;
}

export function createTargetView(options: TargetViewOptions): TargetView {
	const patched = bodyNodes(options.bodies);
	let info: RendezvousInfo | null = null;
	let approach: ApproachInfo | null = null;
	let aids: Aid[] = [];
	let signature = '';
	let refreshedAt = Number.NEGATIVE_INFINITY;
	/** Sampled orbits by an elements key, so a still orbit is sampled once. */
	const orbitCache = new Map<string, Vec3[] | undefined>();

	const own = (): VesselSnapshot | undefined => {
		const snap = options.snapshot();
		const id = options.vessel();
		return snap && id !== null ? snap.vessels.find((v) => Number(v.id) === id) : undefined;
	};
	const centreOf = (snap: Snapshot, id: string): Vec3 | undefined =>
		snap.bodies.find((b) => String(b.id) === id)?.position;

	const sig = (v: VesselSnapshot): string =>
		`${v.target ? targetKey(v.target) : ''}|${String(v.soi)}|${v.surface ? 's' : ''}|${(
			v.nodes ?? []
		)
			.map((n) => `${n.id}:${n.time}:${n.prograde}:${n.normal}:${n.radial}`)
			.join(',')}`;

	function refresh(now: number): void {
		const snap = options.snapshot();
		const v = own();
		if (!snap || !v || !v.target) {
			info = null;
			approach = null;
			aids = [];
			signature = '';
			return;
		}
		approach = patchedApproach(snap, v, patched);
		aids = rendezvousAids(snap, v, patched, approach);
		info = {
			approach: approach
				? {
						in: Math.max(0, approach.time - snap.t),
						distance: approach.distance,
						relativeSpeed: approach.relativeSpeed,
						body: approach.body,
						withNodes: approach.withNodes
					}
				: null,
			aids
		};
		signature = sig(v);
		refreshedAt = now;
	}

	/** The target's orbit relative to its primary and where the primary is, or undefined. */
	function targetOrbit(
		snap: Snapshot,
		v: VesselSnapshot
	): { points: Vec3[]; centre: Vec3 } | undefined {
		const ref = v.target;
		if (!ref) return undefined;
		let el: OrbitalElements | undefined;
		let primary: string | undefined;
		if (ref.kind === 'body') {
			const def = options.bodies.find((b) => b.id === String(ref.id));
			el = def?.orbit;
			primary = def?.parent;
		} else {
			const other = snap.vessels.find((x) => x.id === ref.id);
			if (other && !other.surface) {
				el = other.orbit;
				primary = String(other.soi);
			}
		}
		const parent = primary ? options.bodies.find((b) => b.id === primary) : undefined;
		const centre = primary ? centreOf(snap, primary) : undefined;
		if (!el || !parent || !centre) return undefined;
		const key = `${primary}|${el.a},${el.e},${el.i},${el.raan},${el.argp},${el.m0},${el.epoch}`;
		if (!orbitCache.has(key)) {
			if (orbitCache.size > 32) orbitCache.clear();
			orbitCache.set(key, sampleClosed(el, bodyMuOf(parent)));
		}
		const points = orbitCache.get(key);
		return points ? { points, centre } : undefined;
	}

	function mapFrame(snap: Snapshot, v: VesselSnapshot): MapTargetFrame | null {
		const ref = v.target;
		const vesselCentre = centreOf(snap, String(v.soi));
		if (!vesselCentre) return null;
		const others = snap.vessels
			.filter((o) => o.id !== v.id && !o.surface)
			.flatMap((o) => {
				const c = centreOf(snap, String(o.soi));
				const p = c ? options.project(add(c, o.position)) : null;
				if (!p || (ref?.kind === 'vessel' && ref.id === o.id)) return [];
				return [
					{ key: `vessel:${Number(o.id)}`, name: o.name ?? `Vessel ${Number(o.id)}`, point: p }
				];
			});
		if (!ref || !v.target) return { target: null, approach: null, orbit: [], others };
		const world = add(add(vesselCentre, v.position), v.target.position);
		const point = options.project(world);
		const orbit = targetOrbit(snap, v);
		const runs = orbit
			? visibleRuns(orbit.points.map((p) => options.project(add(orbit.centre, p))))
			: [];
		let pair: MapTargetFrame['approach'] = null;
		if (approach && info?.approach) {
			pair = {
				vessel: options.project(approach.vessel),
				target: options.project(approach.target),
				text: `${formatDistance(approach.distance)} in ${formatDuration(info.approach.in)}`
			};
		}
		return {
			target: point
				? { point, name: v.target.kind === 'body' ? bodyLabel(v.target.name) : v.target.name }
				: null,
			approach: pair,
			orbit: runs,
			others
		};
	}

	function flightFrame(snap: Snapshot, v: VesselSnapshot): FlightTargetFrame | null {
		const t = v.target;
		const centre = centreOf(snap, String(v.soi));
		if (!t || !centre) return null;
		const { width, height, insets } = options.size();
		const vessel = add(centre, v.position);
		const indicator = targetIndicator({
			project: options.project,
			vessel,
			target: add(vessel, t.position),
			width,
			height,
			...(insets ? { insets } : {})
		});
		return indicator
			? {
					name: t.kind === 'body' ? bodyLabel(t.name) : t.name,
					distance: t.distance,
					indicator
				}
			: null;
	}

	return {
		update(now) {
			const v = own();
			if (!v) return;
			if (!v.target) {
				if (info) refresh(now);
				return;
			}
			if (now - refreshedAt >= REFRESH_MS || sig(v) !== signature) refresh(now);
		},
		frame() {
			const snap = options.snapshot();
			const v = own();
			if (!snap || !v) return { map: null, flight: null };
			if (options.mapOn()) return { map: mapFrame(snap, v), flight: null };
			return { map: null, flight: flightFrame(snap, v) };
		},
		get info() {
			return info;
		},
		pick(x, y, lines = true) {
			const snap = options.snapshot();
			const v = own();
			if (!snap || !v) return null;
			const candidates: PickCandidate[] = [];
			for (const def of options.bodies) {
				const centre = centreOf(snap, def.id);
				if (!centre) continue;
				const marks: PickCandidate['marks'] = [];
				const at = options.project(centre);
				// The disc of the sphere the vessel is in is the background of the map, not a button.
				if (at && def.id !== String(v.soi)) {
					let radius = 12;
					for (const axis of [
						{ x: def.radius, y: 0, z: 0 },
						{ x: 0, y: def.radius, z: 0 },
						{ x: 0, y: 0, z: def.radius }
					]) {
						const edge = options.project(add(centre, axis));
						if (edge) radius = Math.max(radius, Math.hypot(edge.x - at.x, edge.y - at.y));
					}
					marks.push({ x: at.x, y: at.y, radius });
				}
				const lines: PickPoint[][] = [];
				const parent = def.parent ? options.bodies.find((b) => b.id === def.parent) : undefined;
				const parentCentre = def.parent ? centreOf(snap, def.parent) : undefined;
				if (def.orbit && parent && parentCentre) {
					const points = sampleClosed(def.orbit, bodyMuOf(parent));
					if (points) {
						lines.push(...visibleRuns(points.map((p) => options.project(add(parentCentre, p)))));
					}
				}
				candidates.push({ key: `body:${def.id}`, marks, lines });
			}
			for (const o of snap.vessels) {
				if (o.id === v.id || o.surface) continue;
				const c = centreOf(snap, String(o.soi));
				const p = c ? options.project(add(c, o.position)) : null;
				if (!p) continue;
				candidates.push({
					key: `vessel:${Number(o.id)}`,
					marks: [{ x: p.x, y: p.y, radius: DOT_PICK }],
					lines: []
				});
			}
			return pickTarget(candidates, x, y, lines ? 8 : 0);
		},
		aidCommand(id) {
			const vessel = options.vessel();
			if (vessel === null) return null;
			return aidCommand(
				vessel,
				aids.find((a) => a.id === id)
			);
		}
	};
}
