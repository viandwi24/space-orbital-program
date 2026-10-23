/**
 * Buildings as data and the placement rules (plan 090, ADRs 0097 and 0115): pure functions the
 * UI previews and the sim validates with. Site metres east and north of the site centre; 10 m
 * cells centred on multiples of 10 m.
 */
import * as z from 'zod';
import { DEFINITION_ID_PATTERN } from './ids.ts';
import type { ChargeDefinition } from './economy.ts';

// Not `schemas.ts`'s `definitionIdSchema`: schemas imports sites, which imports this module.
const definitionIdSchema = z
	.string()
	.regex(DEFINITION_ID_PATTERN, 'expected "<plugin>.<name>" in lower-case kebab-case');

export const CELL_SIZE = 10;
export const ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = (typeof ROTATIONS)[number];
export const SIDES = ['east', 'north', 'west', 'south'] as const;
export type Side = (typeof SIDES)[number];

export interface Cell {
	i: number;
	j: number;
}

export interface BuildingLevel {
	/** Funds to build or upgrade to this level (096). */
	cost: number;
	buildDays: number;
	/** Funds per 30 days (096). */
	upkeep: number;
	/** kW drawn (positive) or supplied (negative). */
	power: number;
	/** Capability id to amount (`launch-pad` mass limit t, `hangar` part count, ...). */
	capacity: Record<string, number>;
}

export interface BuildingDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	label: string;
	/** Cells east (w) by north (d) at rotation 0. */
	size: { w: number; d: number };
	/** Footprint-edge cells at rotation 0 and the side each opens to. */
	entrances: Array<{ i: number; j: number; side: Side }>;
	levels: BuildingLevel[];
	provides: string[];
	/** Allowed body ids; absent = any. */
	bodies?: string[];
	/**
	 * The home body only, or other bodies only (plan 128, ADR 0125 point 3); `hq`: the home
	 * Space Center only, never a branch, for a building whose capacity the agency reads there
	 * (player-journey audit Q7, ADR 0327); absent = anywhere.
	 */
	placement?: 'home' | 'hq' | 'off-world';
	/** Metres from the footprint centre that no other building may enter. */
	hazardRadius?: number;
	visual: { kind: 'generator'; generator: string } | { kind: 'asset'; path: string };
	/** The build menu's category, a buildings-scope category id (plan 235, ADR 0227); absent = Other. */
	category?: string;
	/** One line for the build menu's card details. */
	description?: string;
}

const nonNegative = z.number().nonnegative();
export const buildingDefinitionSchema = z
	.object({
		id: definitionIdSchema,
		label: z.string().min(1),
		size: z.object({ w: z.int().positive(), d: z.int().positive() }),
		entrances: z
			.array(z.object({ i: z.int().nonnegative(), j: z.int().nonnegative(), side: z.enum(SIDES) }))
			.min(1),
		levels: z
			.array(
				z.object({
					cost: nonNegative,
					buildDays: nonNegative,
					upkeep: nonNegative,
					power: z.number().refine(Number.isFinite, 'expected a finite number'),
					capacity: z.record(z.string(), z.number())
				})
			)
			.min(1),
		provides: z.array(z.string().min(1)),
		bodies: z.array(z.string().min(1)).optional(),
		placement: z.enum(['home', 'hq', 'off-world']).optional(),
		hazardRadius: z.number().positive().optional(),
		category: definitionIdSchema.optional(),
		description: z.string().optional(),
		visual: z.discriminatedUnion('kind', [
			z.object({ kind: z.literal('generator'), generator: z.string().min(1) }),
			z.object({ kind: z.literal('asset'), path: z.string().min(1) })
		])
	})
	.superRefine((b, ctx) => {
		b.entrances.forEach((e, k) => {
			const onEdge =
				e.i < b.size.w &&
				e.j < b.size.d &&
				((e.side === 'east' && e.i === b.size.w - 1) ||
					(e.side === 'west' && e.i === 0) ||
					(e.side === 'north' && e.j === b.size.d - 1) ||
					(e.side === 'south' && e.j === 0));
			if (!onEdge) {
				ctx.addIssue({
					code: 'custom',
					path: ['entrances', k],
					message: 'an entrance must be a footprint edge cell facing out on its side'
				});
			}
		});
	});

export interface PlacedBuilding {
	/** Host UUID. */
	id: string;
	kind: string;
	cell: Cell;
	rotation: Rotation;
	level: number;
	/** `building` provides nothing; `upgrading` works at `level` until done (ADR 0123 point 2). */
	state: BuildingState;
	/** Tick day on which `building` or `upgrading` is done (ADR 0123 point 1). */
	readyDay?: number;
	/** Funds paid for a tour building and its upgrades, given back on removal (ADR 0314 point 4). */
	refund?: number;
}

export const BUILDING_STATES = ['active', 'planned', 'building', 'upgrading'] as const;
export type BuildingState = (typeof BUILDING_STATES)[number];

const cellSchema = z.object({ i: z.int(), j: z.int() });
export const placedBuildingSchema = z.object({
	id: z.string().min(1),
	kind: z.string().min(1),
	cell: cellSchema,
	rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
	level: z.int().nonnegative(),
	state: z.enum(BUILDING_STATES),
	readyDay: z.int().optional(),
	refund: z.number().nonnegative().optional()
});
export const roadsSchema = z.array(cellSchema);

const key = (c: Cell): string => `${c.i},${c.j}`;

/** Footprint cells of a building placed at `cell` with `rotation` (ADR 0115 point 1). */
export function footprint(size: { w: number; d: number }, cell: Cell, rotation: Rotation): Cell[] {
	const turned = rotation === 90 || rotation === 270;
	const w = turned ? size.d : size.w;
	const d = turned ? size.w : size.d;
	const out: Cell[] = [];
	for (let a = 0; a < w; a++)
		for (let b = 0; b < d; b++) out.push({ i: cell.i + a, j: cell.j + b });
	return out;
}

const SIDE_STEP: Record<Side, Cell> = {
	east: { i: 1, j: 0 },
	north: { i: 0, j: 1 },
	west: { i: -1, j: 0 },
	south: { i: 0, j: -1 }
};
const turnSide = (side: Side, rotation: Rotation): Side =>
	SIDES[(SIDES.indexOf(side) + rotation / 90) % 4]!;

/** Local (rotation-0) cell to its offset from the corner after a counter-clockwise turn. */
function turnLocal(c: Cell, size: { w: number; d: number }, rotation: Rotation): Cell {
	switch (rotation) {
		case 0:
			return c;
		case 90:
			return { i: size.d - 1 - c.j, j: c.i };
		case 180:
			return { i: size.w - 1 - c.i, j: size.d - 1 - c.j };
		case 270:
			return { i: c.j, j: size.w - 1 - c.i };
	}
}

/** The cells right outside each entrance, in site cells. */
export function entranceFronts(def: BuildingDefinition, cell: Cell, rotation: Rotation): Cell[] {
	return def.entrances.map((e) => {
		const at = turnLocal(e, def.size, rotation);
		const step = SIDE_STEP[turnSide(e.side, rotation)];
		return { i: cell.i + at.i + step.i, j: cell.j + at.j + step.j };
	});
}

/** Centre of a cell in site metres (east, north). */
export const cellCentre = (c: Cell): { east: number; north: number } => ({
	east: c.i * CELL_SIZE,
	north: c.j * CELL_SIZE
});

function footprintCentre(cells: readonly Cell[]): { east: number; north: number } {
	const e = cells.reduce((s, c) => s + c.i, 0) / cells.length;
	const n = cells.reduce((s, c) => s + c.j, 0) / cells.length;
	return { east: e * CELL_SIZE, north: n * CELL_SIZE };
}

export interface PlacementSite {
	body: string;
	/** Whether `body` is the world's home body (plan 128, ADR 0125 point 3); absent = yes. */
	home?: boolean;
	flatRadius: number;
	buildings: readonly PlacedBuilding[];
	roads: readonly Cell[];
	/** A branch builds nothing until its HQ is done (plan 236, ADR 0229 point 3); absent = not a branch. */
	branch?: boolean;
}

/** The capability of a branch HQ (plan 236, ADR 0229): founding a branch places it; the player cannot. */
export const BRANCH_HQ = 'branch-hq';

/** The branch HQ kind of a registry: the first building that provides `branch-hq`. */
export const branchHqOf = (registry: { list(): readonly BuildingDefinition[] }) =>
	registry.list().find((b) => b.provides.includes(BRANCH_HQ));

/** The site's HQ is built (a branch's work may start). */
export const hqReady = (
	buildings: readonly PlacedBuilding[],
	registry: { get(id: string): BuildingDefinition | undefined }
): boolean =>
	buildings.some(
		(b) =>
			(b.state === 'active' || b.state === 'upgrading') &&
			(registry.get(b.kind)?.provides.includes(BRANCH_HQ) ?? false)
	);

export type PlaceReason =
	| { code: 'unknown-kind'; message: string }
	| { code: 'body'; message: string }
	| { code: 'placement'; message: string }
	| { code: 'hq'; message: string }
	| { code: 'outside-zone'; message: string }
	| { code: 'overlap'; message: string; with: string }
	| { code: 'hazard'; message: string; with: string }
	| { code: 'no-road'; message: string };

export type PlaceResult = { ok: true; roads: Cell[] } | { ok: false; reasons: PlaceReason[] };

interface Lookup {
	get(id: string): BuildingDefinition | undefined;
}

/** Cells taken by buildings, with the building id. */
function occupied(site: PlacementSite, registry: Lookup, except?: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const b of site.buildings) {
		if (b.id === except) continue;
		const def = registry.get(b.kind);
		if (!def) continue;
		for (const c of footprint(def.size, b.cell, b.rotation)) out.set(key(c), b.id);
	}
	return out;
}

/** Shortest 4-neighbour path over free cells from `from` to any road cell (ADR 0115 point 2). */
export function pathToRoad(
	from: Cell,
	roads: ReadonlySet<string>,
	blocked: ReadonlySet<string>,
	inZone: (c: Cell) => boolean,
	limit = 4_000
): Cell[] | null {
	if (roads.has(key(from))) return [];
	if (blocked.has(key(from)) || !inZone(from)) return null;
	const prev = new Map<string, string | null>([[key(from), null]]);
	const queue: Cell[] = [from];
	for (let head = 0; head < queue.length && head < limit; head++) {
		const here = queue[head]!;
		for (const side of SIDES) {
			const s = SIDE_STEP[side];
			const next = { i: here.i + s.i, j: here.j + s.j };
			const k = key(next);
			if (prev.has(k)) continue;
			if (roads.has(k)) {
				const path: Cell[] = [];
				for (let at: string | null = key(here); at !== null; at = prev.get(at)!) {
					const [i, j] = at.split(',').map(Number);
					path.push({ i: i!, j: j! });
				}
				return path.reverse();
			}
			if (blocked.has(k) || !inZone(next)) continue;
			prev.set(k, key(here));
			queue.push(next);
		}
	}
	return null;
}

/**
 * Whether `kind` may be placed at `cell` with `rotation` on `site`, and the road cells that would
 * connect it (ADR 0115 points 2 and 3). `except` ignores one placed building (a move).
 */
export function canPlace(
	site: PlacementSite,
	registry: Lookup,
	kind: string,
	cell: Cell,
	rotation: Rotation,
	except?: string
): PlaceResult {
	const def = registry.get(kind);
	if (!def)
		return {
			ok: false,
			reasons: [{ code: 'unknown-kind', message: `unknown building "${kind}"` }]
		};
	const reasons: PlaceReason[] = [];
	if (def.bodies && !def.bodies.includes(site.body)) {
		reasons.push({ code: 'body', message: `${def.label} cannot be built on ${site.body}` });
	}
	const home = site.home ?? true;
	if (def.placement === 'home' && !home) {
		reasons.push({ code: 'placement', message: `${def.label} is built on the home planet only` });
	} else if (def.placement === 'hq' && (!home || site.branch === true)) {
		reasons.push({
			code: 'placement',
			message: `${def.label} is built at the home Space Center only: the agency reads its capacity there`
		});
	} else if (def.placement === 'off-world' && home) {
		reasons.push({ code: 'placement', message: `${def.label} is built on other bodies only` });
	}
	if (def.provides.includes(BRANCH_HQ)) {
		reasons.push({ code: 'hq', message: `${def.label} comes with a new branch` });
	} else if (site.branch && !hqReady(site.buildings, registry)) {
		reasons.push({ code: 'hq', message: 'The branch HQ is still under construction' });
	}
	const cells = footprint(def.size, cell, rotation);
	const inZone = (c: Cell): boolean => {
		const m = cellCentre(c);
		return Math.hypot(m.east, m.north) <= site.flatRadius;
	};
	if (!cells.every(inZone)) {
		reasons.push({ code: 'outside-zone', message: `${def.label} reaches outside the flat zone` });
	}
	const taken = occupied(site, registry, except);
	const roadSet = new Set(site.roads.map(key));
	const hit = cells.map((c) => taken.get(key(c))).find((id) => id !== undefined);
	if (hit !== undefined) {
		reasons.push({ code: 'overlap', message: `${def.label} overlaps building ${hit}`, with: hit });
	} else if (cells.some((c) => roadSet.has(key(c)))) {
		reasons.push({ code: 'overlap', message: `${def.label} is on a road`, with: 'road' });
	}
	const centre = footprintCentre(cells);
	for (const other of site.buildings) {
		if (other.id === except) continue;
		const odef = registry.get(other.kind);
		if (!odef) continue;
		const ocells = footprint(odef.size, other.cell, other.rotation);
		const ocentre = footprintCentre(ocells);
		const near = (from: { east: number; north: number }, list: Cell[], radius: number) =>
			list.some((c) => {
				const m = cellCentre(c);
				return Math.hypot(m.east - from.east, m.north - from.north) < radius;
			});
		if (
			(odef.hazardRadius && near(ocentre, cells, odef.hazardRadius)) ||
			(def.hazardRadius && near(centre, ocells, def.hazardRadius))
		) {
			reasons.push({
				code: 'hazard',
				message: `${def.label} is inside the hazard clearance of building ${other.id}`,
				with: other.id
			});
			break;
		}
	}
	let roads: Cell[] = [];
	if (site.roads.length > 0 && reasons.length === 0) {
		const blocked = new Set([...taken.keys(), ...cells.map(key)]);
		const added = new Set<string>();
		for (const front of entranceFronts(def, cell, rotation)) {
			const path = pathToRoad(front, roadSet, blocked, inZone);
			if (path === null) {
				reasons.push({
					code: 'no-road',
					message: `${def.label} has an entrance with no way to a road`
				});
				break;
			}
			for (const c of path) {
				if (!added.has(key(c))) {
					added.add(key(c));
					roads.push(c);
				}
			}
		}
	}
	if (reasons.length > 0) return { ok: false, reasons };
	return { ok: true, roads };
}

/** Rasterise a straight road between two cells (axis-aligned). */
export function roadLine(a: Cell, b: Cell): Cell[] {
	const out: Cell[] = [];
	const di = Math.sign(b.i - a.i);
	const dj = Math.sign(b.j - a.j);
	for (let c = { ...a }; ; c = { i: c.i + di, j: c.j + dj }) {
		out.push(c);
		if (c.i === b.i && c.j === b.j) break;
	}
	return out;
}

const uniqueCells = (cells: Cell[]): Cell[] => {
	const seen = new Set<string>();
	return cells.filter((c) => (seen.has(key(c)) ? false : (seen.add(key(c)), true)));
};

/**
 * Today's launch site on the grid (ADR 0115 point 5): `packages/renderer/src/site.ts` snapped to
 * 10 m cells (east, north = −z there). Names stock building ids, like `LEGACY_SITE` names stock's
 * home body.
 */
export const LEGACY_LAYOUT: { buildings: PlacedBuilding[]; roads: Cell[] } = {
	buildings: [
		{
			id: 'legacy-pad',
			kind: 'stock.launchpad-s',
			cell: { i: -1, j: -1 },
			rotation: 0,
			level: 0,
			state: 'active'
		},
		{
			id: 'legacy-hangar',
			kind: 'stock.hangar',
			cell: { i: -10, j: 12 },
			rotation: 0,
			level: 0,
			state: 'active'
		},
		{
			id: 'legacy-mission-center',
			kind: 'stock.mission-center',
			cell: { i: 2, j: 5 },
			rotation: 0,
			level: 0,
			state: 'active'
		},
		{
			id: 'legacy-administration',
			kind: 'stock.administration',
			cell: { i: 5, j: 9 },
			rotation: 0,
			level: 0,
			state: 'active'
		}
	],
	roads: uniqueCells([
		...roadLine({ i: 0, j: 2 }, { i: 0, j: 8 }),
		...roadLine({ i: -10, j: 8 }, { i: 14, j: 8 }),
		...roadLine({ i: -7, j: 9 }, { i: -7, j: 11 }),
		...roadLine({ i: 14, j: -4 }, { i: 14, j: 7 }),
		...roadLine({ i: -2, j: 0 }, { i: -6, j: 0 }),
		...roadLine({ i: -6, j: -1 }, { i: -6, j: -5 })
	])
};

// ---- capacity (plan 096, ADR 0123) ----

/** The capacity keys a building level may raise, with their unit (ADR 0123 point 3). */
export const CAPACITY = {
	hangar: { unit: 'parts', meaning: 'parts in a design' },
	'launch-pad': { unit: 't', meaning: 'launch mass' },
	runway: { unit: 'm', meaning: 'runway length' },
	crew: { unit: 'crew', meaning: 'roster size' },
	'mission-control': { unit: 'contracts', meaning: 'active contracts' },
	'comms-node': { unit: 'tier', meaning: 'station tier' },
	lab: { unit: 'labs', meaning: 'research slots' },
	admin: { unit: 'strategies', meaning: 'strategy slots' },
	storage: { unit: 'u', meaning: 'commodity units held at the site (plan 097)' },
	production: { unit: 'recipes', meaning: 'recipes at once' },
	'test-stand': { unit: 'grade', meaning: 'static-fire grade (plan 130)' }
} as const;
export type CapacityKey = keyof typeof CAPACITY;
export const CAPACITY_KEYS = Object.keys(CAPACITY) as CapacityKey[];

/** Whether a placed building works, and at which level index; null while it provides nothing. */
export function workingLevel(b: Pick<PlacedBuilding, 'state' | 'level'>): number | null {
	return b.state === 'active' || b.state === 'upgrading' ? b.level : null;
}

/**
 * A site's capacity for `key`: the highest value over its working buildings, or null when no
 * building there provides it (no limit, ADR 0123 point 3).
 */
export function siteCapacity(
	site: { buildings?: readonly PlacedBuilding[] },
	registry: Lookup,
	key: string
): number | null {
	let best: number | null = null;
	for (const b of site.buildings ?? []) {
		const at = workingLevel(b);
		if (at === null) continue;
		const levels = registry.get(b.kind)?.levels;
		const value = levels?.[Math.min(at, levels.length - 1)]?.capacity[key];
		if (value !== undefined && (best === null || value > best)) best = value;
	}
	return best;
}

export interface CapacityUpgrade {
	kind: string;
	label: string;
	/** Level index (0-based); the text says `level + 1`. */
	level: number;
	value: number;
	cost: number;
	/** "Hangar level 2: 120 parts". */
	text: string;
}

/** The cheapest registered building level whose `key` capacity is at least `need`, or null. */
export function capacityUpgrade(
	registry: { list(): readonly BuildingDefinition[] },
	key: string,
	need: number
): CapacityUpgrade | null {
	let best: CapacityUpgrade | null = null;
	const unit = (CAPACITY as Record<string, { unit: string }>)[key]?.unit ?? '';
	for (const def of registry.list()) {
		def.levels.forEach((level, k) => {
			const value = level.capacity[key];
			if (value === undefined || value < need) return;
			// the cost of reaching this level from nothing
			const cost = def.levels.slice(0, k + 1).reduce((s, l) => s + l.cost, 0);
			if (best && (cost > best.cost || (cost === best.cost && value >= best.value))) return;
			best = {
				kind: def.id,
				label: def.label,
				level: k,
				value,
				cost,
				text: `${def.label} level ${k + 1}: ${value.toLocaleString('en-US')} ${unit}`
			};
		});
	}
	return best;
}

/** Upkeep of the working buildings per 30 days, funds, before the cost multiplier (ADR 0123 point 5). */
export const UPKEEP_EVERY_DAYS = 30;

export function upkeepOf(
	sites: ReadonlyArray<{ buildings?: readonly PlacedBuilding[] }>,
	registry: Lookup
): Array<{ id: string; kind: string; amount: number }> {
	const out: Array<{ id: string; kind: string; amount: number }> = [];
	for (const site of sites)
		for (const b of site.buildings ?? []) {
			const at = workingLevel(b);
			if (at === null) continue;
			const levels = registry.get(b.kind)?.levels;
			const upkeep = levels?.[Math.min(at, levels.length - 1)]?.upkeep ?? 0;
			if (upkeep > 0) out.push({ id: b.id, kind: b.kind, amount: upkeep });
		}
	return out;
}

/**
 * The buildings' upkeep as charges, for `projectBalances` (plan 101, ADR 0187 point 4): what
 * `buildingsTick` books every `UPKEEP_EVERY_DAYS` days, scaled by `stock.cost-multiplier`.
 */
export function buildingUpkeepCharges(
	sites: ReadonlyArray<{ buildings?: readonly PlacedBuilding[] }>,
	registry: Lookup
): ChargeDefinition[] {
	return upkeepOf(sites, registry).map((u) => ({
		id: u.id,
		label: `${u.kind} upkeep`,
		currency: 'funds',
		amount: -u.amount,
		everyDays: UPKEEP_EVERY_DAYS,
		scaleBy: ['stock.cost-multiplier']
	}));
}
