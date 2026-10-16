/**
 * Stage-by-stage delta-v, thrust-to-weight and propellant for a vessel (plan 021, ADR 0026), shared
 * by the flight HUD and, later, the VAB (plan 022). Pure: no DOM, no sim.
 *
 * The model replays the staging sequence. Firing stage `k` ignites its engines and fires its
 * decouplers (the side without the root, or without the control source when only the other side
 * has one, leaves, as in the sim's `detach`); then the ignited engines burn until their propellant
 * is gone. Propellant is drawn with the sim's rule (breadth-first over attachments from the engine,
 * never entering a part with `crossfeed: false`; `flowMode` stack / vessel / none) and engine
 * arithmetic is `@orbital/mod-stock`'s own (`ispAt`, `propellantRates`). Between two events the
 * flows are constant, so each interval's delta-v is the exact `(F / mdot) ln(m0 / m1)`; one engine
 * on one tank reproduces Tsiolkovsky exactly. Thrust is assumed along the flight direction.
 *
 * It understands the stock engine and decoupler modules and any module that declares a `store`
 * (tanks, ablator); another mod's engine needs SDK module introspection (draft plan 024).
 */
import type {
	ModuleDefinition,
	PartDefinition,
	PartLookup,
	ResourceDefinition,
	VesselDesign,
	VesselSnapshot
} from '@orbital/core';
import {
	G0,
	ModuleDecoupler,
	ModuleEngine,
	SEA_LEVEL_PRESSURE,
	ispAt,
	propellantRates,
	type EngineConfigLike
} from '@orbital/mod-stock';

export interface ContentLookups {
	parts: PartLookup;
	modules: { get(id: string): ModuleDefinition | undefined };
	resources: { get(id: string): ResourceDefinition | undefined };
}

interface ModelPart {
	index: number;
	def: PartDefinition;
	/** Attached parts and the node of THIS part they hang on. */
	links: { peer: number; node: string }[];
	/** Current amount per resource id, summed over the part's stores. */
	amounts: Record<string, number>;
	/** Amount per resource when full (design state), for fuel fractions. */
	full: Record<string, number>;
	engine?: { config: EngineConfigLike; ignited: boolean; flameout: boolean };
	decoupler?: { separates: string; decoupled: boolean };
	controlSource: boolean;
}

export interface StagingModel {
	root: number;
	parts: Map<number, ModelPart>;
	stages: number[][];
	resources: ContentLookups['resources'];
	/** Parts that exist on the vessel now (all of them for a design). */
	alive: Set<number>;
}

const EPS = 1e-9;

function parse(def: ModuleDefinition, raw: unknown): unknown {
	return def.config ? def.config.parse(raw ?? {}) : raw;
}

function buildPart(
	index: number,
	def: PartDefinition,
	content: ContentLookups,
	view: (moduleId: string) => unknown
): ModelPart {
	const part: ModelPart = {
		index,
		def,
		links: [],
		amounts: {},
		full: {},
		controlSource: false
	};
	for (const [moduleId, raw] of def.modules ?? []) {
		const mod = content.modules.get(moduleId);
		if (!mod) continue;
		const config = parse(mod, raw);
		if (mod.controlSource) part.controlSource = true;
		const fresh = mod.state ? mod.state(config as never) : undefined;
		if (mod.store) {
			// The snapshot view of a store module equals its state for every stock store (container,
			// heat shield); the live path hands that view to the same accessor.
			const live = view(moduleId);
			for (const r of mod.store.resources(config as never, fresh as never)) {
				part.amounts[r] =
					(part.amounts[r] ?? 0) + mod.store.amount(config as never, (live ?? fresh) as never, r);
				part.full[r] = (part.full[r] ?? 0) + mod.store.amount(config as never, fresh as never, r);
			}
		}
		if (moduleId === ModuleEngine.id) {
			const live = view(moduleId) as { ignited?: boolean; flameout?: boolean } | undefined;
			part.engine = {
				config: config as EngineConfigLike,
				ignited: live?.ignited ?? false,
				flameout: live?.flameout ?? false
			};
		}
		if (moduleId === ModuleDecoupler.id) {
			const live = view(moduleId) as { decoupled?: boolean } | undefined;
			part.decoupler = {
				separates: (config as { separates: string }).separates,
				decoupled: live?.decoupled ?? false
			};
		}
	}
	return part;
}

function assemble(
	design: VesselDesign,
	content: ContentLookups,
	viewOf: (index: number, moduleId: string) => unknown,
	alive: Iterable<number>
): StagingModel {
	const parts = new Map<number, ModelPart>();
	for (const p of design.parts) {
		const def = content.parts.get(p.part);
		if (!def) throw new Error(`delta-v: unknown part "${p.part}" in design "${design.name}"`);
		parts.set(
			p.index,
			buildPart(p.index, def, content, (m) => viewOf(p.index, m))
		);
	}
	let root = -1;
	for (const p of design.parts) {
		if (!p.parent) {
			root = p.index;
			continue;
		}
		parts.get(p.index)!.links.push({ peer: p.parent.index, node: p.parent.node });
		parts.get(p.parent.index)!.links.push({ peer: p.index, node: p.parent.parentNode });
	}
	for (const part of parts.values()) part.links.sort((a, b) => a.peer - b.peer);
	return {
		root,
		parts,
		stages: design.stages.map((s) => [...s]),
		resources: content.resources,
		alive: new Set(alive)
	};
}

/** A design with every tank full and nothing ignited (VAB, and the HUD before liftoff). */
export function stagingModelFromDesign(
	design: VesselDesign,
	content: ContentLookups
): StagingModel {
	return assemble(
		design,
		content,
		() => undefined,
		design.parts.map((p) => p.index)
	);
}

/**
 * Maps the part entities of the vessel's first snapshot to design indices: the sim creates part
 * entities in ascending design index (`resolveVesselDesign` order), so the i-th part is the i-th
 * smallest index. Call once at load and keep the map (entities persist across splits).
 */
export function entityIndexMap(
	design: VesselDesign,
	vessel: Pick<VesselSnapshot, 'parts'>
): Map<number, number> {
	const indices = design.parts.map((p) => p.index).sort((a, b) => a - b);
	const map = new Map<number, number>();
	vessel.parts.forEach((p, i) => {
		const index = indices[i];
		if (index !== undefined) map.set(Number(p.id), index);
	});
	return map;
}

/** The vessel as it is now: parts that still exist, current amounts and engine states. */
export function stagingModelFromSnapshot(
	design: VesselDesign,
	content: ContentLookups,
	vessel: Pick<VesselSnapshot, 'parts'>,
	entityIndex: ReadonlyMap<number, number>
): StagingModel {
	const modulesOf = new Map<number, Record<string, unknown>>();
	for (const p of vessel.parts) {
		const index = entityIndex.get(Number(p.id));
		if (index !== undefined) modulesOf.set(index, p.modules);
	}
	return assemble(design, content, (i, m) => modulesOf.get(i)?.[m], new Set(modulesOf.keys()));
}

// --- simulation -----------------------------------------------------------------------------------

interface Work {
	model: StagingModel;
	alive: Set<number>;
	amounts: Map<number, Record<string, number>>;
	ignited: Set<number>;
	flameout: Set<number>;
	decoupled: Set<number>;
}

function start(model: StagingModel): Work {
	const amounts = new Map<number, Record<string, number>>();
	const ignited = new Set<number>();
	const flameout = new Set<number>();
	const decoupled = new Set<number>();
	for (const [i, p] of model.parts) {
		amounts.set(i, { ...p.amounts });
		if (p.engine?.ignited && !p.engine.flameout) ignited.add(i);
		if (p.engine?.flameout) flameout.add(i);
		if (p.decoupler?.decoupled) decoupled.add(i);
	}
	return { model, alive: new Set(model.alive), amounts, ignited, flameout, decoupled };
}

const densityOf = (w: Work, r: string): number => w.model.resources.get(r)?.density ?? 0;

function massOf(w: Work): number {
	let m = 0;
	for (const i of w.alive) {
		m += w.model.parts.get(i)!.def.mass;
		for (const [r, a] of Object.entries(w.amounts.get(i)!)) m += a * densityOf(w, r);
	}
	return m;
}

/** Connected component of `from` over alive parts, optionally ignoring one edge. */
function component(w: Work, from: number, cut: [number, number]): Set<number> {
	const seen = new Set<number>([from]);
	const queue = [from];
	for (let head = 0; head < queue.length; head++) {
		for (const l of w.model.parts.get(queue[head]!)!.links) {
			const a = queue[head]!;
			if ((a === cut[0] && l.peer === cut[1]) || (a === cut[1] && l.peer === cut[0])) continue;
			if (!w.alive.has(l.peer) || seen.has(l.peer)) continue;
			seen.add(l.peer);
			queue.push(l.peer);
		}
	}
	return seen;
}

function fireDecoupler(w: Work, index: number): void {
	const part = w.model.parts.get(index)!;
	const dec = part.decoupler;
	if (!dec || w.decoupled.has(index)) return;
	w.decoupled.add(index);
	const link = part.links.find((l) => l.node === dec.separates && w.alive.has(l.peer));
	if (!link) return;
	const cut: [number, number] = [index, link.peer];
	const sideP = component(w, index, cut);
	const sideQ = component(w, link.peer, cut);
	const rootSide = sideP.has(w.model.root) ? sideP : sideQ;
	const other = rootSide === sideP ? sideQ : sideP;
	const controlled = (s: Set<number>): boolean =>
		[...s].some((i) => w.model.parts.get(i)!.controlSource);
	const keep = !controlled(rootSide) && controlled(other) ? other : rootSide;
	const gone = keep === sideP ? sideQ : sideP;
	for (const i of gone) {
		w.alive.delete(i);
		w.ignited.delete(i);
	}
}

function fireStage(w: Work, k: number): void {
	for (const i of w.model.stages[k] ?? []) {
		if (!w.alive.has(i)) continue;
		const part = w.model.parts.get(i)!;
		if (part.engine) {
			w.ignited.add(i);
			w.flameout.delete(i);
		}
		if (part.decoupler) fireDecoupler(w, i);
	}
}

/** Parts an engine can draw `resource` from, in the sim's draw order. */
function reach(w: Work, engine: number, resource: string): number[] {
	const mode = w.model.resources.get(resource)?.flowMode ?? 'none';
	if (mode === 'none') return [];
	if (mode === 'vessel') return [...w.alive].sort((a, b) => a - b);
	const seen = new Set<number>([engine]);
	const order = [engine];
	for (let head = 0; head < order.length; head++) {
		for (const l of w.model.parts.get(order[head]!)!.links) {
			if (!w.alive.has(l.peer) || seen.has(l.peer)) continue;
			seen.add(l.peer);
			if (w.model.parts.get(l.peer)!.def.crossfeed === false) continue;
			order.push(l.peer);
		}
	}
	return order;
}

export interface BurnResult {
	/** Delta-v in vacuum / at the home body's sea-level pressure, m/s. */
	dvVacuum: number;
	dvSeaLevel: number;
	/** Seconds at full throttle. */
	burnTime: number;
	/** Thrust at the start of the burn, N (vacuum / sea level). */
	thrustVacuum: number;
	thrustSeaLevel: number;
	massStart: number;
	massEnd: number;
	/** Propellant the burn's first interval draws from, kg now / kg when full. */
	propellant: number;
	propellantCapacity: number;
	engines: number;
}

const EMPTY_BURN: BurnResult = {
	dvVacuum: 0,
	dvSeaLevel: 0,
	burnTime: 0,
	thrustVacuum: 0,
	thrustSeaLevel: 0,
	massStart: 0,
	massEnd: 0,
	propellant: 0,
	propellantCapacity: 0,
	engines: 0
};

/** Burn every ignited engine until none has propellant left. */
function burn(w: Work): BurnResult {
	const out: BurnResult = { ...EMPTY_BURN, massStart: massOf(w), massEnd: massOf(w) };
	let first = true;
	for (let guard = 0; guard < 500; guard++) {
		type Active = {
			index: number;
			rates: { resource: string; rate: number }[];
			cfg: EngineConfigLike;
			mdot: number;
		};
		const active: Active[] = [];
		for (const i of w.ignited) {
			if (!w.alive.has(i)) continue;
			const cfg = w.model.parts.get(i)!.engine!.config;
			const supplied = cfg.propellants.every(
				(p) =>
					reach(w, i, p.resource).reduce((s, j) => s + (w.amounts.get(j)![p.resource] ?? 0), 0) >
					EPS
			);
			if (!supplied) {
				w.ignited.delete(i);
				w.flameout.add(i);
				continue;
			}
			const mdot = cfg.thrust / (cfg.ispVacuum * G0);
			active.push({
				index: i,
				cfg,
				mdot,
				rates: propellantRates(cfg, mdot, (r) => densityOf(w, r))
			});
		}
		if (active.length === 0) break;
		// Draw assignment: each (engine, resource) draws from the first reachable store with some left.
		const draws = new Map<string, number>();
		const key = (part: number, r: string): string => `${part}|${r}`;
		for (const e of active) {
			for (const { resource, rate } of e.rates) {
				const src = reach(w, e.index, resource).find(
					(j) => (w.amounts.get(j)![resource] ?? 0) > EPS
				);
				if (src !== undefined)
					draws.set(key(src, resource), (draws.get(key(src, resource)) ?? 0) + rate);
			}
		}
		let dt = Infinity;
		for (const [k, rate] of draws) {
			const [part, resource] = k.split('|') as [string, string];
			dt = Math.min(dt, (w.amounts.get(Number(part))![resource] ?? 0) / rate);
		}
		if (!Number.isFinite(dt) || dt <= 0) break;
		const vac = active.reduce((s, e) => s + e.mdot * ispAt(e.cfg, 0) * G0, 0);
		const asl = active.reduce((s, e) => s + e.mdot * ispAt(e.cfg, SEA_LEVEL_PRESSURE) * G0, 0);
		const mdot = active.reduce((s, e) => s + e.mdot, 0);
		if (first) {
			first = false;
			out.thrustVacuum = vac;
			out.thrustSeaLevel = asl;
			out.engines = active.length;
			const fed = new Set<number>();
			const resources = new Set<string>();
			for (const e of active) {
				for (const p of e.cfg.propellants) {
					resources.add(p.resource);
					for (const j of reach(w, e.index, p.resource)) fed.add(j);
				}
			}
			for (const j of fed) {
				for (const r of resources) {
					out.propellant += (w.amounts.get(j)![r] ?? 0) * densityOf(w, r);
					out.propellantCapacity += (w.model.parts.get(j)!.full[r] ?? 0) * densityOf(w, r);
				}
			}
		}
		const m0 = massOf(w);
		for (const [k, rate] of draws) {
			const [part, resource] = k.split('|') as [string, string];
			const store = w.amounts.get(Number(part))!;
			const left = (store[resource] ?? 0) - rate * dt;
			store[resource] = left < EPS ? 0 : left;
		}
		const m1 = massOf(w);
		out.dvVacuum += (vac / mdot) * Math.log(m0 / m1);
		out.dvSeaLevel += (asl / mdot) * Math.log(m0 / m1);
		out.burnTime += dt;
		out.massEnd = m1;
	}
	return out;
}

export interface StageDeltaV extends BurnResult {
	/** Index into the design's `stages`; the burn that starts when this stage fires. */
	stage: number;
	/** Parts the stage fires (design indices). */
	parts: number[];
	/** True when the burn is the one in progress (engines already ignited), not a future stage. */
	current: boolean;
}

export interface DeltaVReport {
	stages: StageDeltaV[];
	totalVacuum: number;
	totalSeaLevel: number;
}

/**
 * Delta-v of the burns that remain: the engines that are lit now (attributed to `stagesFired - 1`),
 * then each stage from `stagesFired` on. `stagesFired` is 0 for a design on the pad.
 */
export function stageDeltaV(model: StagingModel, stagesFired = 0): DeltaVReport {
	const w = start(model);
	const stages: StageDeltaV[] = [];
	if (stagesFired > 0 && w.ignited.size > 0) {
		const b = burn(w);
		stages.push({
			...b,
			stage: stagesFired - 1,
			parts: model.stages[stagesFired - 1] ?? [],
			current: true
		});
	}
	for (let k = stagesFired; k < model.stages.length; k++) {
		fireStage(w, k);
		const b = burn(w);
		stages.push({
			...b,
			stage: k,
			parts: (model.stages[k] ?? []).filter((i) => i >= 0),
			current: false
		});
	}
	return {
		stages,
		totalVacuum: stages.reduce((s, x) => s + x.dvVacuum, 0),
		totalSeaLevel: stages.reduce((s, x) => s + x.dvSeaLevel, 0)
	};
}

/** Thrust-to-weight of a burn against `surfaceGravity` (m/s^2) using thrust at the given pressure. */
export const twr = (thrust: number, mass: number, surfaceGravity: number): number =>
	mass > 0 && surfaceGravity > 0 ? thrust / (mass * surfaceGravity) : 0;
