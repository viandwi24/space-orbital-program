/**
 * The Space Center's view model (plan 091, ADR 0117): rows for the overlay and the building list,
 * what each building opens, the ghost of build mode and its check with core's `canPlace` (the
 * function the sim runs for `place-building`), and keyboard selection. Pure, so vitest covers it.
 */
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
import type { SiteBuildingView } from '@orbital/renderer';

export interface BuildingLookup {
	get(id: string): BuildingDefinition | undefined;
	list(): BuildingDefinition[];
}

/** What a building's label opens. */
export type BuildingAction =
	{ kind: 'link'; href: string; label: string } | { kind: 'none'; reason: string };

export interface BuildingRow {
	id: string;
	kind: string;
	label: string;
	status: 'active' | 'planned';
	statusText: string;
	provides: string[];
	action: BuildingAction;
	/** Where the label sits: site metres east, north and up. */
	anchor: { east: number; north: number; up: number };
}

export type SiteState = NonNullable<Snapshot['sites']>[number];

/** What a building of these capabilities opens (ADR 0117 consequences). */
export function actionOf(provides: readonly string[]): BuildingAction {
	if (provides.includes('hangar')) return { kind: 'link', href: '/vab', label: 'Open the Hangar' };
	if (provides.includes('launch-pad'))
		return { kind: 'none', reason: 'Build a rocket in the Hangar; it launches from this pad.' };
	if (provides.includes('crew'))
		return { kind: 'link', href: '/astronauts', label: 'Open the Astronaut Complex' };
	if (provides.includes('mission-control'))
		return { kind: 'link', href: '/mission-center', label: 'Open the Mission Center' };
	if (provides.includes('lab')) return { kind: 'link', href: '/rnd', label: 'Open R&D' };
	return { kind: 'none', reason: 'Nothing to open here yet.' };
}

const HEIGHTS: Record<string, number> = {
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

export function buildingRows(site: SiteState | undefined, registry: BuildingLookup): BuildingRow[] {
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
				statusText: b.state === 'active' ? `Level ${b.level + 1} · running` : 'Planned',
				provides: [...def.provides],
				action: actionOf(def.provides),
				anchor: { ...c, up: (HEIGHTS[generator] ?? 10) + 4 }
			}
		];
	});
}

/** The renderer's building list for a site. */
export function siteViews(
	site: SiteState | undefined,
	registry: BuildingLookup
): SiteBuildingView[] {
	if (!site) return [];
	return site.buildings.flatMap((b) => {
		const def = registry.get(b.kind);
		if (!def) return [];
		return [
			{
				id: b.id,
				generator: def.visual.kind === 'generator' ? def.visual.generator : 'block',
				size: { ...def.size },
				cell: { ...b.cell },
				rotation: b.rotation
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
	site: Pick<Site, 'body' | 'flatRadius'>,
	state: SiteState | undefined,
	registry: BuildingLookup,
	kind: string,
	cell: Cell,
	rotation: Rotation
): GhostCheck {
	const r = canPlace(
		{
			body: site.body,
			flatRadius: site.flatRadius,
			buildings: state?.buildings ?? [],
			roads: state?.roads ?? []
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
	dispatch: (c: Command) => Promise<CommandResult>
): Promise<CommandResult | null> {
	if (!ghost.check.valid) return null;
	return dispatch({
		type: 'place-building',
		site,
		kind: ghost.kind,
		cell: { ...ghost.cell },
		rotation: ghost.rotation,
		id: newId()
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
