/**
 * Stage-by-stage delta-v, thrust-to-weight and propellant for a vessel (plan 021, ADR 0026), shared
 * by the flight HUD and, later, the VAB (plan 022). Pure: no DOM, no sim.
 *
 * The model replays the staging sequence. Firing stage `k` ignites its engines and fires its
 * decouplers (the side without the root, or without the control source when only the other side
 * has one, leaves, as in the sim's `detach`); then the ignited engines burn until their propellant
 * is gone. Propellant is drawn with the sim's rule (breadth-first over attachments from the engine,
 * never entering a part with `crossfeed: false`; `flowMode` stack / vessel / none; a fuel line adds
 * the part it hangs on, and what that reaches, ahead of the part it ends on, ADR 0071). Between two
 * events the flows are constant, so each interval's delta-v is the exact `(F / mdot) ln(m0 / m1)`;
 * one engine on one tank reproduces Tsiolkovsky exactly. Thrust is assumed along the flight
 * direction.
 *
 * It knows no module by id (plan 024, ADR 0033). What an engine or a separator does comes from the
 * module's `describe` descriptor (mass flow, thrust curve over pressure, propellants; the node a
 * separator severs), and what a part holds from its `store`; so a mod's own engines, decouplers and
 * tanks count the same as stock ones.
 */
import {
	SEA_LEVEL_PRESSURE,
	describeModule,
	mat3OfQuat,
	resolveVesselDesign,
	thrustAtPressure,
	type EngineInfo,
	type ModuleDefinition,
	type PartDefinition,
	type PartLookup,
	type ResourceDefinition,
	type VesselDesign,
	type VesselSnapshot,
	type DossierEntryDefinition
} from '@orbital/core';

export interface ContentLookups {
	parts: PartLookup;
	modules: { get(id: string): ModuleDefinition | undefined };
	resources: { get(id: string): ResourceDefinition | undefined };
	/** Science content for the dossier (plan 104): entries, and labels of situations and experiments. */
	science?: { dossierEntries: readonly DossierEntryDefinition[]; labelOf(id: string): string };
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
	engine?: EngineInfo;
	/** Share of the engine's thrust that acts along the vessel's axis: the cosine of a tilted engine (ADR 0071). */
	thrustFactor: number;
	/** Fuel lines that end on this part: the part each hangs on and the line itself, by ascending line index. */
	feeders: { source: number; line: number }[];
	separator?: { node: string; done: boolean };
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
		thrustFactor: 1,
		feeders: [],
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
			// The snapshot view of a store module equals its state for the stores in use (container,
			// heat shield); the live path hands that view to the same accessor.
			const live = view(moduleId);
			for (const r of mod.store.resources(config as never, fresh as never)) {
				part.amounts[r] =
					(part.amounts[r] ?? 0) + mod.store.amount(config as never, (live ?? fresh) as never, r);
				part.full[r] = (part.full[r] ?? 0) + mod.store.amount(config as never, fresh as never, r);
			}
		}
		const info = describeModule(mod, raw, view(moduleId));
		if (info?.engine) part.engine = info.engine;
		if (info?.separator) part.separator = info.separator;
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
	// Fuel lines (ADR 0071): the line hangs on its source and ends on the part that draws through it.
	for (const p of [...design.parts].sort((a, b) => a.index - b.index)) {
		if (!p.link || !p.parent || !parts.get(p.index)?.def.connector?.feeds) continue;
		parts.get(p.link.index)?.feeders.push({ source: p.parent.index, line: p.index });
	}
	// A tilted engine pushes along its tilted axis: only its component along the vessel counts.
	if (design.parts.some((p) => p.tilt !== undefined)) {
		const resolved = resolveVesselDesign(design, content.parts);
		if (resolved.ok) {
			for (const r of resolved.parts) {
				const part = parts.get(r.index);
				if (!part?.engine || !r.tilted) continue;
				const m = mat3OfQuat(r.rotation);
				const [ax, ay, az] = part.engine.axis ?? [0, 1, 0];
				const length = Math.hypot(ax, ay, az) || 1;
				part.thrustFactor = Math.max(0, (m[3] * ax + m[4] * ay + m[5] * az) / length);
			}
		}
	}
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
		if (p.separator?.done) decoupled.add(i);
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

/** Connected component of `from` over alive parts, not crossing the `cuts` edges. */
function component(w: Work, from: number, cuts: readonly [number, number][]): Set<number> {
	const seen = new Set<number>([from]);
	const queue = [from];
	const cut = (a: number, b: number): boolean =>
		cuts.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
	for (let head = 0; head < queue.length; head++) {
		for (const l of w.model.parts.get(queue[head]!)!.links) {
			if (cut(queue[head]!, l.peer)) continue;
			if (!w.alive.has(l.peer) || seen.has(l.peer)) continue;
			seen.add(l.peer);
			queue.push(l.peer);
		}
	}
	return seen;
}

/**
 * The parts that leave when the separator `index` fires: every link on its node is cut (a part
 * can have several on one node, ADR 0034), the side with the root stays unless only another side
 * has a control source, as in the sim's `splitVessel`. Empty when the separator is spent or has
 * nothing attached.
 */
function separated(w: Work, index: number): Set<number> {
	const part = w.model.parts.get(index)!;
	const sep = part.separator;
	if (!sep || w.decoupled.has(index)) return new Set();
	const links = part.links.filter((l) => l.node === sep.node && w.alive.has(l.peer));
	if (links.length === 0) return new Set();
	const cuts = links.map((l): [number, number] => [index, l.peer]);
	const sides = [index, ...links.map((l) => l.peer)].map((from) => component(w, from, cuts));
	const controlled = (s: Set<number>): boolean =>
		[...s].some((i) => w.model.parts.get(i)!.controlSource);
	const rootSide = sides.find((s) => s.has(w.model.root)) ?? sides[0]!;
	const other = sides.find((s) => s !== rootSide && controlled(s));
	const keep = !controlled(rootSide) && other ? other : rootSide;
	const gone = new Set<number>();
	for (const side of sides) if (side !== keep) for (const i of side) gone.add(i);
	return gone;
}

function fireDecoupler(w: Work, index: number): void {
	const gone = separated(w, index);
	w.decoupled.add(index);
	for (const i of gone) {
		w.alive.delete(i);
		w.ignited.delete(i);
	}
}

/** Parts the separators of stage `k` would drop right now (what a burn must not outlive, see `burn`). */
function shedBy(w: Work, k: number): Set<number> {
	const out = new Set<number>();
	for (const i of w.model.stages[k] ?? []) {
		if (!w.alive.has(i)) continue;
		for (const g of separated(w, i)) out.add(g);
	}
	return out;
}

function fireStage(w: Work, k: number): void {
	for (const i of w.model.stages[k] ?? []) {
		if (!w.alive.has(i)) continue;
		const part = w.model.parts.get(i)!;
		if (part.engine) {
			w.ignited.add(i);
			w.flameout.delete(i);
		}
		if (part.separator) fireDecoupler(w, i);
	}
}

/** Per-resource volume rates (units/s): the mass flow split by volume ratio, as the sim draws it. */
function volumeRates(
	engine: EngineInfo,
	densityOf: (resource: string) => number
): { resource: string; rate: number }[] {
	const massPerUnitMix = engine.propellants.reduce(
		(sum, p) => sum + p.ratio * densityOf(p.resource),
		0
	);
	return engine.propellants.map((p) => ({
		resource: p.resource,
		rate: (engine.massFlow * p.ratio) / massPerUnitMix
	}));
}

/** Parts an engine can draw `resource` from, in the sim's draw order. */
function reach(w: Work, engine: number, resource: string): number[] {
	const mode = w.model.resources.get(resource)?.flowMode ?? 'none';
	if (mode === 'none') return [];
	if (mode === 'vessel') return [...w.alive].sort((a, b) => a - b);
	const seen = new Set<number>([engine]);
	const order: number[] = [];
	// The sim's `reachableParts`: breadth-first from an origin over the attachments, the sources of
	// the fuel lines that end on a part walked first (each as its own origin, whatever its crossfeed).
	const walk = (origin: number): void => {
		const queue = [origin];
		for (let head = 0; head < queue.length; head++) {
			const here = queue[head]!;
			const part = w.model.parts.get(here)!;
			for (const f of part.feeders) {
				if (!w.alive.has(f.source) || !w.alive.has(f.line) || seen.has(f.source)) continue;
				seen.add(f.source);
				walk(f.source);
			}
			order.push(here);
			for (const l of part.links) {
				if (!w.alive.has(l.peer) || seen.has(l.peer)) continue;
				seen.add(l.peer);
				if (w.model.parts.get(l.peer)!.def.crossfeed === false) continue;
				queue.push(l.peer);
			}
		}
	};
	walk(engine);
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

/**
 * Burn every ignited engine until none has propellant left, or until an engine that the next stage
 * is about to drop (`shed`: a booster) runs dry while others still burn: that is where the stage
 * ends, so booster burnout is a stage boundary (ADR 0034) and the rest of the burn is attributed
 * to the stage that drops it.
 */
function burn(w: Work, shed: ReadonlySet<number> = new Set()): BurnResult {
	const out: BurnResult = { ...EMPTY_BURN, massStart: massOf(w), massEnd: massOf(w) };
	let first = true;
	for (let guard = 0; guard < 500; guard++) {
		type Active = {
			index: number;
			rates: { resource: string; rate: number }[];
			engine: EngineInfo;
			mdot: number;
			factor: number;
		};
		const active: Active[] = [];
		let dryShed = false;
		for (const i of w.ignited) {
			if (!w.alive.has(i)) continue;
			const engine = w.model.parts.get(i)!.engine!;
			const supplied = engine.propellants.every(
				(p) =>
					reach(w, i, p.resource).reduce((s, j) => s + (w.amounts.get(j)![p.resource] ?? 0), 0) >
					EPS
			);
			if (!supplied) {
				if (shed.has(i)) {
					dryShed = true;
					continue;
				}
				w.ignited.delete(i);
				w.flameout.add(i);
				continue;
			}
			const mdot = engine.massFlow;
			active.push({
				index: i,
				engine,
				factor: w.model.parts.get(i)!.thrustFactor,
				mdot,
				rates: volumeRates(engine, (r) => densityOf(w, r))
			});
		}
		if (active.length === 0) break;
		if (dryShed) break;
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
		const vac = active.reduce((s, e) => s + thrustAtPressure(e.engine.thrust, 0) * e.factor, 0);
		const asl = active.reduce(
			(s, e) => s + thrustAtPressure(e.engine.thrust, SEA_LEVEL_PRESSURE) * e.factor,
			0
		);
		const mdot = active.reduce((s, e) => s + e.mdot, 0);
		if (first) {
			first = false;
			out.thrustVacuum = vac;
			out.thrustSeaLevel = asl;
			out.engines = active.length;
			const fed = new Set<number>();
			const resources = new Set<string>();
			for (const e of active) {
				for (const p of e.engine.propellants) {
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
		const b = burn(w, shedBy(w, stagesFired));
		stages.push({
			...b,
			stage: stagesFired - 1,
			parts: model.stages[stagesFired - 1] ?? [],
			current: true
		});
	}
	for (let k = stagesFired; k < model.stages.length; k++) {
		fireStage(w, k);
		const b = burn(w, shedBy(w, k + 1));
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
