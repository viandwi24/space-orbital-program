/**
 * The Space Center's view model (plan 091, ADR 0117): rows for the overlay and the building list,
 * what each building opens, the ghost of build mode and its check with core's `canPlace` (the
 * function the sim runs for `place-building`), and keyboard selection. Pure, so vitest covers it.
 */
import { resolve } from '$app/paths';
import {
	canPlace,
	footprint,
	type BuildingDefinition,
	type Cell,
	type Command,
	type CommandResult,
	type Rotation,
	type Site,
	type Snapshot
} from '@orbital/core';

import type { BuildingLookup } from './site-views';

export { siteViews, type BuildingLookup } from './site-views';

/** What a building's label opens. */
export type BuildingAction =
	{ kind: 'link'; href: string; label: string } | { kind: 'none'; reason: string };

export interface BuildingRow {
	id: string;
	kind: string;
	label: string;
	status: 'active' | 'planned' | 'building' | 'upgrading';
	statusText: string;
	/** The next level's upgrade, or null at the top level or while work runs (plan 096). */
	upgrade: { level: number; cost: number; days: number } | null;
	provides: string[];
	action: BuildingAction;
	/** The level it runs at, from 1, and the top level (plan 259). */
	level: number;
	maxLevel: number;
	/** One line of what it is for, from the definition (plan 259). */
	description: string;
	/** Funds per 30 days at this level (plan 259). */
	upkeep: number;
	/** What this level provides, as "Part count 120" lines (plan 259). */
	capacity: readonly string[];
	/** Where the label sits: site metres east, north and up. */
	anchor: { east: number; north: number; up: number };
	/** How far construction or the upgrade has come, 0..1, or null while nothing is built (plan 349). */
	progress: number | null;
	/** The thumbnail's generator and footprint (plan 349, as the build cards'); null for an asset visual. */
	generator: string | null;
	size: { w: number; d: number };
}

/** Construction or upgrade progress from the days left and the level's build time (plan 349). */
export function progressOf(
	b: { state: BuildingRow['status']; level: number; readyDay?: number },
	levels: readonly { buildDays: number }[],
	today: number | undefined
): number | null {
	if (b.state !== 'building' && b.state !== 'upgrading') return null;
	const total = levels[b.state === 'building' ? 0 : b.level + 1]?.buildDays ?? 0;
	if (b.readyDay === undefined || today === undefined || total <= 0) return 0;
	return Math.min(1, Math.max(0, 1 - (b.readyDay - today) / total));
}

export type SiteState = NonNullable<Snapshot['sites']>[number];

/** What a building of these capabilities opens (ADR 0117 consequences). */
export function actionOf(provides: readonly string[]): BuildingAction {
	if (provides.includes('hangar'))
		return { kind: 'link', href: resolve('/(world)/vab'), label: 'Open the Hangar' };
	if (provides.includes('launch-pad'))
		return { kind: 'none', reason: 'Build a rocket in the Hangar; it launches from this pad.' };
	if (provides.includes('crew'))
		return {
			kind: 'link',
			href: resolve('/(world)/astronauts'),
			label: 'Open the Astronaut Complex'
		};
	if (provides.includes('mission-control'))
		return {
			kind: 'link',
			href: resolve('/(world)/mission-center'),
			label: 'Open the Mission Center'
		};
	if (provides.includes('lab'))
		return { kind: 'link', href: resolve('/(world)/rnd'), label: 'Open R&D' };
	if (provides.includes('admin'))
		return { kind: 'link', href: resolve('/(world)/administration'), label: 'Open Administration' };
	if (provides.includes('test-stand'))
		return { kind: 'link', href: resolve('/(world)/test-stand'), label: 'Open the test stand' };
	return { kind: 'none', reason: 'Nothing to open here yet.' };
}

export const HEIGHTS: Record<string, number> = {
	hangar: 32,
	control: 12,
	office: 13,
	'launch-pad': 30,
	runway: 2,
	dish: 12,
	tanks: 14
};

/** Centre of a placed footprint in site metres. */
export function footprintCentreMetres(cells: readonly Cell[]): { east: number; north: number } {
	const i = cells.reduce((s, c) => s + c.i, 0) / cells.length;
	const j = cells.reduce((s, c) => s + c.j, 0) / cells.length;
	return { east: i * 10, north: j * 10 };
}

/** "launch-pad" → "Launch pad": a capability id as a label. */
const capacityLabel = (id: string): string => {
	const words = id.replace(/^[^.]*\./, '').replace(/[-_]/g, ' ');
	return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The capacity of a level as "Hangar 120" lines (plan 259). */
export function capacityLines(capacity: Readonly<Record<string, number>> | undefined): string[] {
	return Object.entries(capacity ?? {}).map(
		([id, n]) => `${capacityLabel(id)} ${n.toLocaleString('en-US')}`
	);
}

/** What a building is doing, as the player reads it (plan 096, ADR 0123 point 1). */
export function statusTextOf(
	b: { state: BuildingRow['status']; level: number; readyDay?: number },
	today: number | undefined
): string {
	const left =
		b.readyDay === undefined || today === undefined
			? ''
			: ` · ready in ${Math.max(0, b.readyDay - today)} ${b.readyDay - today === 1 ? 'day' : 'days'}`;
	switch (b.state) {
		case 'active':
			return `Level ${b.level + 1} · running`;
		case 'building':
			return `Under construction${left}`;
		case 'upgrading':
			return `Level ${b.level + 1} · upgrading to ${b.level + 2}${left}`;
		default:
			return 'Planned';
	}
}

export function buildingRows(
	site: SiteState | undefined,
	registry: BuildingLookup,
	today?: number
): BuildingRow[] {
	if (!site) return [];
	return site.buildings.flatMap((b) => {
		const def = registry.get(b.kind);
		if (!def) return [];
		const c = footprintCentreMetres(footprint(def.size, b.cell, b.rotation));
		const generator = def.visual.kind === 'generator' ? def.visual.generator : 'asset';
		return [
			{
				id: b.id,
				kind: b.kind,
				label: def.label,
				status: b.state,
				statusText: statusTextOf(b, today),
				upgrade:
					b.state === 'active' && def.levels[b.level + 1]
						? {
								level: b.level + 1,
								cost: def.levels[b.level + 1]!.cost,
								days: def.levels[b.level + 1]!.buildDays
							}
						: null,
				provides: [...def.provides],
				action: actionOf(def.provides),
				level: Math.min(b.level, def.levels.length - 1) + 1,
				maxLevel: def.levels.length,
				description: def.description ?? '',
				upkeep: def.levels[Math.min(b.level, def.levels.length - 1)]?.upkeep ?? 0,
				capacity: capacityLines(def.levels[Math.min(b.level, def.levels.length - 1)]?.capacity),
				anchor: { ...c, up: (HEIGHTS[generator] ?? 10) + 4 },
				progress: progressOf(b, def.levels, today),
				generator: def.visual.kind === 'generator' ? def.visual.generator : null,
				size: { w: def.size.w, d: def.size.d }
			}
		];
	});
}

/** The corner cell that centres a footprint of `def` at rotation `rotation` under a site point. */
export function ghostCell(
	at: { east: number; north: number },
	def: BuildingDefinition,
	rotation: Rotation
): Cell {
	const turned = rotation === 90 || rotation === 270;
	const w = turned ? def.size.d : def.size.w;
	const d = turned ? def.size.w : def.size.d;
	return { i: Math.round(at.east / 10 - (w - 1) / 2), j: Math.round(at.north / 10 - (d - 1) / 2) };
}

export interface GhostCheck {
	valid: boolean;
	/** The reasons `canPlace` gives, as the player reads them. */
	reasons: string[];
	roads: Cell[];
}

/** The same check the sim runs for `place-building` (ADR 0115). */
export function checkGhost(
	site: Pick<Site, 'body' | 'flatRadius'> & { kind?: Site['kind'] },
	state: SiteState | undefined,
	registry: BuildingLookup,
	kind: string,
	cell: Cell,
	rotation: Rotation,
	/** Whether the site is on the home body (plan 128, ADR 0125 point 3). */
	home = true
): GhostCheck {
	const r = canPlace(
		{
			body: site.body,
			home,
			flatRadius: site.flatRadius,
			buildings: state?.buildings ?? [],
			roads: state?.roads ?? [],
			branch: site.kind === 'branch'
		},
		registry,
		kind,
		cell,
		rotation
	);
	return r.ok
		? { valid: true, reasons: [], roads: r.roads }
		: { valid: false, reasons: r.reasons.map((x) => x.message), roads: [] };
}

/** Confirm a ghost: dispatches `place-building` only when the check passes. */
export async function confirmPlacement(
	ghost: { kind: string; cell: Cell; rotation: Rotation; check: GhostCheck },
	site: string,
	newId: () => string,
	dispatch: (c: Command) => Promise<CommandResult>,
	/** The Space Center tour's building (ADR 0314 point 4). */
	tour = false
): Promise<CommandResult | null> {
	if (!ghost.check.valid) return null;
	return dispatch({
		type: 'place-building',
		site,
		kind: ghost.kind,
		cell: { ...ghost.cell },
		rotation: ghost.rotation,
		id: newId(),
		...(tour ? { tour: true } : {})
	});
}

/** The next rotation step (R key). */
export const nextRotation = (r: Rotation): Rotation => ((r + 90) % 360) as Rotation;

/** Keyboard selection in the building list: arrows move, Home/End jump; returns the new index. */
export function moveSelection(count: number, current: number, key: string): number {
	if (count === 0) return -1;
	switch (key) {
		case 'ArrowDown':
		case 'ArrowRight':
			return current < 0 ? 0 : (current + 1) % count;
		case 'ArrowUp':
		case 'ArrowLeft':
			return current < 0 ? count - 1 : (current - 1 + count) % count;
		case 'Home':
			return 0;
		case 'End':
			return count - 1;
		default:
			return current;
	}
}

/**
 * Labels that would overlap on screen are stacked upwards, nearest the camera (lowest on screen)
 * kept in place; `w` and `h` are a label's box in CSS pixels.
 */
export function spreadLabels(
	points: Readonly<Record<string, { x: number; y: number } | null>>,
	w = 132,
	h = 40
): Record<string, { x: number; y: number } | null> {
	const out: Record<string, { x: number; y: number } | null> = {};
	const placed: Array<{ x: number; y: number }> = [];
	const order = Object.entries(points)
		.filter((e): e is [string, { x: number; y: number }] => e[1] !== null)
		.sort((a, b) => b[1].y - a[1].y);
	for (const [id, p] of order) {
		let y = p.y;
		for (let guard = 0; guard < 8; guard++) {
			const hit = placed.find((q) => Math.abs(q.x - p.x) < w && Math.abs(q.y - y) < h);
			if (!hit) break;
			y = hit.y - h;
		}
		placed.push({ x: p.x, y });
		out[id] = { x: p.x, y };
	}
	for (const [id, p] of Object.entries(points)) if (p === null) out[id] = null;
	return out;
}

/** Whole pixels, and the previous position kept while a label moves less than a pixel (no shimmer). */
export function steadyLabels(
	next: Readonly<Record<string, { x: number; y: number } | null>>,
	prev: Readonly<Record<string, { x: number; y: number } | null>>
): Record<string, { x: number; y: number } | null> {
	const out: Record<string, { x: number; y: number } | null> = {};
	for (const [id, p] of Object.entries(next)) {
		const q = prev[id];
		if (!p) out[id] = null;
		else if (q && Math.abs(q.x - p.x) < 1 && Math.abs(q.y - p.y) < 1) out[id] = q;
		else out[id] = { x: Math.round(p.x), y: Math.round(p.y) };
	}
	return out;
}

/**
 * Where each building's pin sits (plan 267, ADR 0251): on its anchor's screen point, never moved
 * off it to make room for a neighbour (that was the old labels' spreading, which left the pins
 * hanging over the buildings when a zoom out brought them together), and steady as `steadyLabels`.
 */
export function pinPositions(
	rows: readonly { id: string; anchor: { east: number; north: number; up?: number } }[],
	project: (p: { east: number; north: number; up?: number }) => { x: number; y: number } | null,
	prev: Readonly<Record<string, { x: number; y: number } | null>>
): Record<string, { x: number; y: number } | null> {
	const next: Record<string, { x: number; y: number } | null> = {};
	for (const r of rows) next[r.id] = project(r.anchor);
	return steadyLabels(next, prev);
}

/**
 * "Needs attention" lines beyond the building rows (plan 096, ADR 0123 point 6): the next upkeep
 * when it is more than the funds. `upkeep` is the total per 30 days after the cost multiplier.
 */
export function upkeepWarning(
	funds: number | undefined,
	upkeep: number,
	today: number | undefined,
	every = 30
): string | null {
	if (funds === undefined || upkeep <= 0 || funds >= upkeep) return null;
	const due = today === undefined ? '' : ` in ${every - (today % every)} days`;
	return `Upkeep of ${Math.ceil(upkeep).toLocaleString('en-US')} due${due} is more than the funds`;
}

export interface MarketRow {
	id: string;
	label: string;
	/** "0.76 / u", or "30,000 / launch" for a fixed service. */
	price: string;
	/** Change against the base price, "−5 %"; null for a fixed price at its base. */
	trend: string | null;
	/** Units at the site, when it holds any. */
	held: number | null;
}

type EconomyView = NonNullable<Snapshot['economy']>;

/** The read-only Market panel (plan 097, ADR 0124 point 8): price, trend against base, site stock. */
export function marketRows(
	economy: EconomyView | undefined,
	site: string | undefined
): MarketRow[] {
	if (!economy?.enabled || !economy.markets) return [];
	const held = economy.storage?.find((s) => s.site === site)?.items ?? {};
	return economy.markets.map((m) => {
		const change = m.base > 0 ? m.price / m.base - 1 : 0;
		const digits = m.price < 10 ? 2 : 0;
		return {
			id: m.id,
			label: m.label,
			price: `${m.price.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })} / ${m.unit}`,
			trend:
				Math.abs(change) < 0.005
					? null
					: `${change > 0 ? '+' : '−'}${Math.round(Math.abs(change) * 100)} %`,
			held: held[m.id] === undefined ? null : Math.floor(held[m.id]!)
		};
	});
}

/** "Needs attention" when production stands still because the world is in debt (ADR 0124 point 5). */
export function productionNote(
	economy: EconomyView | undefined,
	site: SiteState | undefined,
	producers: ReadonlySet<string>
): string | null {
	if (!economy?.enabled || economy.funds >= 0 || !site) return null;
	const working = site.buildings.some(
		(b) => producers.has(b.kind) && (b.state === 'active' || b.state === 'upgrading')
	);
	return working ? 'Production stopped: funds are below zero' : null;
}

// ---- off-world bases (plan 128, ADR 0125) ----

interface RecipeLike {
	label: string;
	building: string;
	inputs: Record<string, number>;
	outputs: Record<string, number>;
}

const amountText = (v: number): string => Math.round(v).toLocaleString('en-US');

/**
 * The Flows panel of a site (ADR 0125 point 7): each working recipe's rate, the outposts' drills,
 * the routes in and out, and the storage. `label` names commodities and sites.
 */
export function flowRows(
	site: SiteState | undefined,
	options: {
		buildings: BuildingLookup;
		recipes: readonly RecipeLike[];
		vessels: Snapshot['vessels'];
		/** Ice per day of one drill part (its module config). */
		drillPerDay: number;
		economy: EconomyView | undefined;
		today: number | undefined;
		label: (id: string) => string;
	}
): string[] {
	if (!site) return [];
	const out: string[] = [];
	const { buildings, recipes, label } = options;
	for (const b of site.buildings) {
		if (b.state !== 'active' && b.state !== 'upgrading') continue;
		const def = buildings.get(b.kind);
		const factor =
			def?.levels[Math.min(b.level, (def?.levels.length ?? 1) - 1)]?.capacity.production ?? 1;
		for (const r of recipes) {
			if (r.building !== b.kind) continue;
			const side = (m: Record<string, number>) =>
				Object.entries(m)
					.filter(([id]) => id !== 'power')
					.map(([id, v]) => `${amountText(v * factor)} ${label(id)}`)
					.join(' + ');
			const inputs = side(r.inputs);
			out.push(`${def?.label ?? b.kind}: ${inputs ? `${inputs} → ` : ''}${side(r.outputs)} a day`);
		}
	}
	const members = new Set((site.members ?? []).map(Number));
	const drills = options.vessels
		.filter((v) => members.has(Number(v.id)))
		.reduce((n, v) => n + v.parts.filter((p) => p.definition === 'stock.drill').length, 0);
	if (drills > 0)
		out.push(
			`Drills (${drills} on ${members.size} ${members.size === 1 ? 'outpost' : 'outposts'}): +${amountText(drills * options.drillPerDay)} ${label('stock.ice')} a day`
		);
	for (const r of options.economy?.routes ?? []) {
		if (r.from !== site.id && r.to !== site.id) continue;
		const inbound = r.to === site.id;
		const days =
			options.today === undefined ? '' : ` in ${Math.max(0, r.nextDay - options.today)} days`;
		out.push(
			`Route ${r.id}: ${amountText(r.amount)} ${label(r.commodity)} ${inbound ? `from ${label(r.from)}` : `to ${label(r.to)}`}, next${days}`
		);
	}
	const storage = options.economy?.storage?.find((x) => x.site === site.id);
	if (storage) {
		const used = Object.values(storage.items).reduce((a, b) => a + b, 0);
		out.push(`Storage: ${amountText(used)} / ${amountText(storage.capacity)} u`);
	}
	return out;
}

/** The building kinds a site's body allows (ADR 0125 point 3). */
export const kindsFor = (
	kinds: readonly BuildingDefinition[],
	home: boolean
): BuildingDefinition[] => kinds.filter((k) => !k.placement || (k.placement === 'home') === home);

/**
 * The first valid cell for `kind` near a site's centre (a base has no 3D view yet, ADR 0125 point 7):
 * a square spiral of up to `reach` cells.
 */
export function firstFreeCell(
	site: Pick<Site, 'body' | 'flatRadius'> & { kind?: Site['kind'] },
	state: SiteState | undefined,
	registry: BuildingLookup,
	kind: string,
	home: boolean,
	reach = 30
): Cell | null {
	for (let ring = 0; ring <= reach; ring++) {
		for (let i = -ring; i <= ring; i++)
			for (let j = -ring; j <= ring; j++) {
				if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
				if (checkGhost(site, state, registry, kind, { i, j }, 0, home).valid) return { i, j };
			}
	}
	return null;
}
