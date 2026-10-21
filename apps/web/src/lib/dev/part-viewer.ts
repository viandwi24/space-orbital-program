/**
 * The pure half of the part model viewer (`/dev/parts`, plan 301): the address's query string and
 * how the part list is grouped. The page and the renderer's `PartViewer` do the rest.
 */
import type { GraphicsPreset } from '@orbital/renderer/presets';

/** What the address says about the view. Absent keys keep the defaults below. */
export interface ViewerQuery {
	/** The part shown alone (and selected in the list). */
	part: string | null;
	/** Parts shown side by side; when non-empty the row is drawn instead of `part` alone. */
	compare: string[];
	detail: GraphicsPreset;
	nodes: boolean;
	shape: boolean;
	wire: boolean;
	/** Deploy progress, 0..1. */
	deploy: number;
	/** Articulation, -1..1 (gimbal tilt, hinge angle, extend length, visible). */
	art: number;
	fire: boolean;
	bg: 'dark' | 'light';
}

export const DEFAULT_QUERY: ViewerQuery = {
	part: null,
	compare: [],
	detail: 'high',
	nodes: false,
	shape: false,
	wire: false,
	deploy: 0,
	art: 0,
	fire: false,
	bg: 'dark'
};

const DETAILS: readonly GraphicsPreset[] = ['low', 'medium', 'high'];

const flag = (v: string | null, fallback: boolean): boolean =>
	v === null ? fallback : v === '1' || v === 'true' || v === 'on' || v === '';

const number = (v: string | null, fallback: number, min: number, max: number): number => {
	if (v === null || v.trim() === '') return fallback;
	const n = Number(v);
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Part ids of a comma list, trimmed, empty entries and repeats dropped, order kept. */
export function idList(value: string | null): string[] {
	if (!value) return [];
	const out: string[] = [];
	for (const raw of value.split(',')) {
		const id = raw.trim();
		if (id !== '' && !out.includes(id)) out.push(id);
	}
	return out;
}

/** Reads a `location.search` (with or without `?`); unknown keys are ignored, bad values fall back. */
export function parseViewerQuery(search: string): ViewerQuery {
	const q = new URLSearchParams(search);
	const detail = q.get('detail');
	return {
		part: q.get('part')?.trim() || null,
		compare: idList(q.get('compare')),
		detail: DETAILS.find((d) => d === detail) ?? DEFAULT_QUERY.detail,
		nodes: flag(q.get('nodes'), DEFAULT_QUERY.nodes),
		shape: flag(q.get('shape'), DEFAULT_QUERY.shape),
		wire: flag(q.get('wire'), DEFAULT_QUERY.wire),
		deploy: number(q.get('deploy'), DEFAULT_QUERY.deploy, 0, 1),
		art: number(q.get('art'), DEFAULT_QUERY.art, -1, 1),
		fire: flag(q.get('fire'), DEFAULT_QUERY.fire),
		bg: q.get('bg') === 'light' ? 'light' : 'dark'
	};
}

/**
 * The query string for a view (without `?`), only the keys that differ from the defaults, in a
 * fixed order. `keep` carries keys the viewer does not own (`renderer`) through unchanged.
 */
export function viewerQueryString(view: ViewerQuery, keep: Record<string, string> = {}): string {
	const q = new URLSearchParams();
	if (view.part) q.set('part', view.part);
	if (view.compare.length > 0) q.set('compare', view.compare.join(','));
	if (view.detail !== DEFAULT_QUERY.detail) q.set('detail', view.detail);
	if (view.nodes) q.set('nodes', '1');
	if (view.shape) q.set('shape', '1');
	if (view.wire) q.set('wire', '1');
	if (view.deploy !== 0) q.set('deploy', String(round(view.deploy)));
	if (view.art !== 0) q.set('art', String(round(view.art)));
	if (view.fire) q.set('fire', '1');
	if (view.bg !== 'dark') q.set('bg', view.bg);
	for (const [k, v] of Object.entries(keep)) q.set(k, v);
	// commas and dots read better unescaped in a link
	return q.toString().replaceAll('%2C', ',');
}

const round = (v: number): number => Math.round(v * 100) / 100;

/** The parts the canvas shows for a view: the compare row, else the one part, else nothing. */
export function shownParts(view: Pick<ViewerQuery, 'part' | 'compare'>): string[] {
	if (view.compare.length > 0) return view.compare;
	return view.part ? [view.part] : [];
}

/**
 * The family of a part id: its name without the namespace and without a trailing size or variant
 * word (`stock.tank-small` → `tank`, `stock.rcs-block-5` → `rcs`). Parts of one family are compared
 * in a row by the page's "Family" button.
 */
export function familyOf(id: string): string {
	const name = id.includes('.') ? id.slice(id.indexOf('.') + 1) : id;
	return name.split('-')[0] ?? name;
}

/** Ids of every part of the same family as `id`, in the given order (always including `id`). */
export function familyMembers(id: string, ids: readonly string[]): string[] {
	const family = familyOf(id);
	const ns = id.includes('.') ? id.slice(0, id.indexOf('.')) : '';
	const members = ids.filter(
		(other) =>
			familyOf(other) === family &&
			(other.includes('.') ? other.slice(0, other.indexOf('.')) : '') === ns
	);
	return members.includes(id) ? members : [id, ...members];
}

export interface PartGroup<T> {
	id: string;
	label: string;
	parts: T[];
}

/**
 * Parts grouped by category in the categories' order; categories with no part are left out, and
 * parts in a category that is not in the list come last under its id.
 */
export function groupByCategory<T>(
	parts: readonly T[],
	categoryOf: (part: T) => string,
	categories: readonly { id: string; label: string }[]
): PartGroup<T>[] {
	const groups = new Map<string, PartGroup<T>>();
	for (const c of categories) groups.set(c.id, { id: c.id, label: c.label, parts: [] });
	for (const p of parts) {
		const id = categoryOf(p);
		let g = groups.get(id);
		if (!g) {
			g = { id, label: id, parts: [] };
			groups.set(id, g);
		}
		g.parts.push(p);
	}
	return [...groups.values()].filter((g) => g.parts.length > 0);
}
