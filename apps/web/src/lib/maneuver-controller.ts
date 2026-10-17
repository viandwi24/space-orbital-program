/**
 * The map view's maneuver planner (plan 045, ADR 0056), plain TypeScript outside Svelte like the
 * rest of the flight engine room. It owns what the sim does not: which node is selected, a drag
 * draft, the predicted path drawn with the nodes applied, and the screen positions of the node
 * markers and handles. The nodes themselves live in the sim; every change is a command.
 */
import {
	entityId,
	type BodyDefinition,
	type Command,
	type CommandResult,
	type ManeuverNodeSnapshot,
	type Snapshot,
	type Vec3,
	type VesselSnapshot
} from '@orbital/core';
import type { MapPathSegment, ScreenPoint } from '@orbital/renderer';
import {
	HANDLES,
	KEY_STEP,
	NODE_KEYS,
	dvFromDrag,
	modifierScale,
	pickTime,
	type HandleSpec,
	type Modifiers,
	type NodeAxis,
	type TimedPoint
} from './maneuver';
import {
	bodyNodes,
	predictManeuvers,
	predictMapPath,
	predictionHorizon,
	type ManeuverPrediction,
	type MapPath,
	type NodeInput
} from './map-path';
import { formatDistance } from './format';
import { bodyMu } from './orbit-info';

export interface HandleDraw {
	kind: HandleSpec['kind'];
	/** Screen position in px inside the canvas box; null when it cannot be placed. */
	point: ScreenPoint | null;
}

export interface NodeDraw {
	id: number;
	selected: boolean;
	point: ScreenPoint | null;
	/** Only the selected node has handles. */
	handles: HandleDraw[];
}

/** The closest approach of the predicted path to a body it is not orbiting now (plan 045). */
export interface EncounterDraw {
	/** Index of the path stretch, a stable key. */
	key: number;
	text: string;
	impact: boolean;
	point: ScreenPoint | null;
}

export interface ManeuverFrame {
	nodes: NodeDraw[];
	encounters: EncounterDraw[];
}

export interface ManeuverControllerOptions {
	bodies: readonly BodyDefinition[];
	dispatch(command: Command): Promise<CommandResult>;
	/** `Renderer.project` (ADR 0033). */
	project(world: Vec3): ScreenPoint | null;
	/** `Renderer.setMapPath`. */
	setPath(path: readonly MapPathSegment[] | null): void;
	mapOn(): boolean;
	vessel(): number | null;
	snapshot(): Snapshot | null;
	/** Full-throttle burn time of `dv` m/s with the current stages, or null when unknown. */
	burnTime(dv: number): number | null;
	/** Tell the player something (a refusal). */
	notice(title: string, detail?: string): void;
}

export interface ManeuverController {
	/** Per render frame: keeps the drawn path up to date while the map is open. */
	update(now: number): void;
	/** Per render frame: node markers and handles in screen pixels; null when there is nothing to draw. */
	frame(): ManeuverFrame | null;
	readonly selected: number | null;
	select(id: number | null): void;
	/** A click on the map canvas at (x, y) px: add a node on the path under it, or deselect. */
	click(x: number, y: number): void;
	/** Whether the predicted path passes within the click radius of (x, y) px (a click there places a node). */
	onPath(x: number, y: number): boolean;
	/** Start dragging a handle (or the node's own marker when `handle` is null) from (x, y). */
	beginDrag(id: number, handle: HandleSpec['kind'] | null, x: number, y: number): void;
	drag(x: number, y: number, modifiers: Modifiers): void;
	endDrag(): void;
	readonly dragging: boolean;
	/** Keyboard on the selected node; true when the key was used. */
	key(action: string, modifiers: Modifiers): boolean;
	remove(id: number): void;
	/** Time warp to the burn of the earliest node. */
	warpToNode(): void;
}

const SEND_PERIOD_MS = 60;
const PREDICT_PERIOD_MS = 750;
const DRAG_PREDICT_MS = 33;
/** A draft the snapshot never confirms is dropped after this long, ms. */
const DRAFT_MAX_MS = 1500;
/** On-screen distance of a handle from its node, px. */
const HANDLE_PX = 56;
/** A click this close to the path (px) puts a node on it. */
const PICK_RADIUS = 14;
/** Earliest a new node may be, s after the snapshot. */
const MIN_AHEAD = 5;
/** Lead before the burn the warp stops at, s. */
export const WARP_LEAD_S = 30;

interface Draft {
	id: number;
	time: number;
	prograde: number;
	normal: number;
	radial: number;
}

type DragMode =
	{ kind: 'handle'; handle: HandleSpec; screen: { x: number; y: number } } | { kind: 'time' };

export function createManeuverController(options: ManeuverControllerOptions): ManeuverController {
	const patched = bodyNodes(options.bodies);
	let selected: number | null = null;
	let draft: Draft | null = null;
	let prediction: ManeuverPrediction | null = null;
	let predictedAt = Number.NEGATIVE_INFINITY;
	let dirty = true;
	let shown = false;
	/** The path as it is without nodes, for picking a time (refreshed when a drag starts). */
	let basePaths: MapPath[] = [];
	let dragMode: DragMode | null = null;
	let dragStart = { x: 0, y: 0 };
	let dragFrom: Draft | null = null;
	let inflight = false;
	let queued: Draft | null = null;
	let lastSent = 0;
	/** Wall time of the last frame and of the last change of the draft, ms. */
	let lastNow = 0;
	let draftAt = 0;
	/** Last placed handle directions in px, by node and kind, so a drag keeps the direction it started with. */
	const handleDirs = new Map<string, { x: number; y: number }>();

	const vesselSnapshot = (): VesselSnapshot | undefined => {
		const snap = options.snapshot();
		const id = options.vessel();
		return snap && id !== null ? snap.vessels.find((v) => Number(v.id) === id) : undefined;
	};

	/** The sim's nodes with the draft laid over its node. */
	function currentNodes(): NodeInput[] {
		const v = vesselSnapshot();
		if (!v || v.surface) return [];
		const list: NodeInput[] = (v.nodes ?? []).map((n: ManeuverNodeSnapshot) =>
			draft && draft.id === n.id
				? {
						id: n.id,
						time: draft.time,
						prograde: draft.prograde,
						normal: draft.normal,
						radial: draft.radial
					}
				: { id: n.id, time: n.time, prograde: n.prograde, normal: n.normal, radial: n.radial }
		);
		return list.sort((a, b) => a.time - b.time);
	}

	function recompute(now: number): void {
		const snap = options.snapshot();
		const id = options.vessel();
		const v = vesselSnapshot();
		if (!snap || id === null || !v) return;
		const body = options.bodies.find((b) => b.id === v.soi);
		if (!body) return;
		const horizon = predictionHorizon(v.orbit, bodyMu(body));
		const nodes = currentNodes();
		if (nodes.length === 0) {
			const path = predictMapPath(snap, id, patched, horizon);
			prediction = { paths: path, nodes: [], unreachable: [] };
		} else {
			prediction = predictManeuvers(snap, id, patched, nodes, horizon);
		}
		options.setPath(prediction.paths);
		shown = prediction.paths.length > 0;
		predictedAt = now;
		dirty = false;
	}

	function samplesOf(paths: readonly MapPath[]): TimedPoint[][] {
		return paths.map((p) => {
			const out: TimedPoint[] = [];
			const span = p.t1 - p.t0;
			p.points.forEach((pt, k) => {
				const s = options.project({
					x: p.offset.x + pt.x,
					y: p.offset.y + pt.y,
					z: p.offset.z + pt.z
				});
				if (s && !s.hidden)
					out.push({ x: s.x, y: s.y, t: p.t0 + (span * k) / (p.points.length - 1) });
			});
			return out;
		});
	}

	function refreshBase(): void {
		const snap = options.snapshot();
		const id = options.vessel();
		const v = vesselSnapshot();
		const body = v && options.bodies.find((b) => b.id === v.soi);
		if (!snap || id === null || !v || !body) return;
		basePaths = predictMapPath(snap, id, patched, predictionHorizon(v.orbit, bodyMu(body)), true);
	}

	/** Nearest point of the orbit (and of the planned stretches) to a pixel: its time. */
	function timeAt(x: number, y: number, radius: number): number | null {
		const planned = (prediction?.paths ?? []).filter((p) => p.planned);
		const hits: Array<{ t: number; distance: number }> = [];
		for (const run of samplesOf([...basePaths, ...planned])) {
			const hit = pickTime(run, x, y, radius);
			if (hit) hits.push(hit);
		}
		if (hits.length === 0) return null;
		// Passes of an orbit lie over each other: of the hits within a pixel of the best, the earliest.
		const nearest = Math.min(...hits.map((h) => h.distance));
		return Math.min(...hits.filter((h) => h.distance <= nearest + 1).map((h) => h.t));
	}

	function flush(now: number): void {
		if (inflight || !queued || now - lastSent < SEND_PERIOD_MS) return;
		const d = queued;
		queued = null;
		const id = options.vessel();
		if (id === null) return;
		inflight = true;
		lastSent = now;
		void options
			.dispatch({
				type: 'node-set',
				vessel: entityId(id),
				id: d.id,
				time: d.time,
				prograde: d.prograde,
				normal: d.normal,
				radial: d.radial
			})
			.then((r) => {
				if (!r.ok) options.notice('Maneuver not changed', r.reason);
			})
			.finally(() => {
				inflight = false;
				dirty = true;
			});
	}

	const setDraft = (d: Draft): void => {
		draft = d;
		queued = d;
		draftAt = lastNow;
		dirty = true;
	};

	/** The draft is dropped once the sim's snapshot shows it (or after a while, if the sim never did). */
	function settleDraft(now: number): void {
		if (!draft || dragMode !== null || inflight || queued) return;
		const n = vesselSnapshot()?.nodes?.find((x) => x.id === draft!.id);
		const same =
			n !== undefined &&
			Math.abs(n.time - draft.time) < 1e-6 &&
			Math.abs(n.prograde - draft.prograde) < 1e-3 &&
			Math.abs(n.normal - draft.normal) < 1e-3 &&
			Math.abs(n.radial - draft.radial) < 1e-3;
		if (same || now - draftAt > DRAFT_MAX_MS) draft = null;
	}

	const nodeView = (id: number): Draft | undefined => {
		const n = currentNodes().find((x) => x.id === id);
		return n
			? { id: n.id, time: n.time, prograde: n.prograde, normal: n.normal, radial: n.radial }
			: undefined;
	};

	function create(time: number): void {
		const vessel = options.vessel();
		const snap = options.snapshot();
		if (vessel === null || !snap) return;
		void options
			.dispatch({
				type: 'node-set',
				vessel: entityId(vessel),
				time: Math.max(time, snap.t + MIN_AHEAD),
				prograde: 0,
				normal: 0,
				radial: 0
			})
			.then((r) => {
				if (r.ok && r.node !== undefined) selected = r.node;
				else if (!r.ok) options.notice('No maneuver node placed', r.reason);
				dirty = true;
			});
	}

	/** Closest approach in every stretch that lies in another body's sphere than the first. */
	function encountersOf(paths: readonly MapPath[]): EncounterDraw[] {
		const first = paths[0]?.body;
		const out: EncounterDraw[] = [];
		paths.forEach((p, key) => {
			if (key === 0 || p.body === first) return;
			const def = options.bodies.find((b) => b.id === p.body);
			if (!def) return;
			let best = p.points[0];
			for (const pt of p.points) {
				if (
					best === undefined ||
					Math.hypot(pt.x, pt.y, pt.z) < Math.hypot(best.x, best.y, best.z)
				) {
					best = pt;
				}
			}
			if (!best) return;
			const impact = p.end === 'impact';
			const altitude = Math.hypot(best.x, best.y, best.z) - def.radius;
			const name = def.id.slice(def.id.lastIndexOf('.') + 1);
			out.push({
				key,
				impact,
				text: impact ? `${name}: impact` : `${name} Pe ${formatDistance(Math.max(altitude, 0))}`,
				point: options.project({
					x: p.offset.x + best.x,
					y: p.offset.y + best.y,
					z: p.offset.z + best.z
				})
			});
		});
		return out;
	}

	return {
		update(now) {
			lastNow = now;
			settleDraft(now);
			if (!options.mapOn()) {
				if (shown) options.setPath(null);
				shown = false;
				prediction = null;
				predictedAt = Number.NEGATIVE_INFINITY;
				return;
			}
			flush(now);
			const period = draft ? DRAG_PREDICT_MS : PREDICT_PERIOD_MS;
			if (dirty ? now - predictedAt >= DRAG_PREDICT_MS : now - predictedAt >= period)
				recompute(now);
		},
		frame() {
			if (!options.mapOn() || !prediction) return null;
			const encounters = encountersOf(prediction.paths);
			if (prediction.nodes.length === 0 && encounters.length === 0) return null;
			const nodes: NodeDraw[] = prediction.nodes.map((n) => {
				const point = options.project(n.world);
				const isSelected = n.id === selected;
				const handles: HandleDraw[] = [];
				if (isSelected && point) {
					const reach = Math.hypot(n.world.x, n.world.y, n.world.z) * 0.05 + 1_000;
					for (const h of HANDLES) {
						const dirWorld = n.axes[h.axis];
						const sign = h.sign;
						const far = options.project({
							x: n.world.x + dirWorld.x * sign * reach,
							y: n.world.y + dirWorld.y * sign * reach,
							z: n.world.z + dirWorld.z * sign * reach
						});
						let placed: ScreenPoint | null = null;
						if (far) {
							const dx = far.x - point.x;
							const dy = far.y - point.y;
							const len = Math.hypot(dx, dy);
							if (len > 0.5) {
								const dir = { x: dx / len, y: dy / len };
								handleDirs.set(`${n.id}:${h.kind}`, dir);
								placed = {
									x: point.x + dir.x * HANDLE_PX,
									y: point.y + dir.y * HANDLE_PX,
									hidden: point.hidden
								};
							}
						}
						handles.push({ kind: h.kind, point: placed });
					}
				}
				return { id: n.id, selected: isSelected, point, handles };
			});
			return { nodes, encounters };
		},
		get selected() {
			return selected;
		},
		select(id) {
			selected = id;
		},
		onPath(x, y) {
			if (!options.mapOn()) return false;
			refreshBase();
			return timeAt(x, y, PICK_RADIUS) !== null;
		},
		click(x, y) {
			if (!options.mapOn()) return;
			refreshBase();
			const t = timeAt(x, y, PICK_RADIUS);
			if (t === null) {
				selected = null;
				return;
			}
			create(t);
		},
		beginDrag(id, handle, x, y) {
			const node = nodeView(id);
			if (!node) return;
			selected = id;
			dragStart = { x, y };
			dragFrom = node;
			if (handle === null) {
				refreshBase();
				dragMode = { kind: 'time' };
				return;
			}
			const spec = HANDLES.find((h) => h.kind === handle)!;
			dragMode = {
				kind: 'handle',
				handle: spec,
				screen: handleDirs.get(`${id}:${handle}`) ?? { x: 0, y: -1 }
			};
		},
		drag(x, y, modifiers) {
			if (!dragMode || !dragFrom) return;
			if (dragMode.kind === 'time') {
				const t = timeAt(x, y, 60);
				if (t !== null)
					setDraft({ ...dragFrom, time: Math.max(t, (options.snapshot()?.t ?? 0) + MIN_AHEAD) });
				return;
			}
			const placement = prediction?.nodes.find((n) => n.id === dragFrom!.id);
			const speed = placement?.speed ?? 2000;
			const delta = dvFromDrag(
				dragMode.handle,
				dragMode.screen,
				x - dragStart.x,
				y - dragStart.y,
				speed,
				modifiers
			);
			const axis: NodeAxis = dragMode.handle.axis;
			setDraft({ ...dragFrom, [axis]: dragFrom[axis] + delta });
		},
		endDrag() {
			dragMode = null;
			dragFrom = null;
			lastSent = Number.NEGATIVE_INFINITY;
			flush(performance.now());
			dirty = true;
		},
		get dragging() {
			return dragMode !== null;
		},
		key(action, modifiers) {
			if (!options.mapOn() || selected === null) return false;
			if (action === 'nodeDelete') {
				this.remove(selected);
				return true;
			}
			const k = NODE_KEYS[action];
			if (!k) return false;
			const node = draft && draft.id === selected ? draft : nodeView(selected);
			if (!node) return false;
			const [axis, sign] = k;
			setDraft({ ...node, [axis]: node[axis] + sign * KEY_STEP * modifierScale(modifiers) });
			lastSent = Number.NEGATIVE_INFINITY;
			return true;
		},
		remove(id) {
			const vessel = options.vessel();
			if (vessel === null) return;
			if (selected === id) selected = null;
			void options.dispatch({ type: 'node-remove', vessel: entityId(vessel), id }).then((r) => {
				if (!r.ok) options.notice('Maneuver not removed', r.reason);
				dirty = true;
			});
		},
		warpToNode() {
			const snap = options.snapshot();
			const v = vesselSnapshot();
			const first = v?.nodes?.[0];
			if (!snap || !first) {
				options.notice('No maneuver node', 'Click the orbit in map view to place one');
				return;
			}
			const burn = options.burnTime(first.dv) ?? 0;
			const target = first.time - burn / 2 - WARP_LEAD_S;
			if (target <= snap.t + 1) {
				options.notice('Already at the burn', 'The burn starts within half a minute');
				return;
			}
			void options.dispatch({ type: 'warp-to', time: target, factor: 100_000 }).then((r) => {
				if (!r.ok) options.notice('Time warp refused', r.reason);
			});
		}
	};
}
