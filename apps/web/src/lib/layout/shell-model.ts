/**
 * The Base layout's bars as data (plan 233, ADR 0222 point 1; `refs/space-orbital-program-ui-v2/
 * docs/BASE_LAYOUT.md`): the sizes, the warp segments, the T+ time, the menu bar's fixed group and
 * the status bar's zones in their order. Pure.
 */

/** BASE_LAYOUT §1, px at 100 %. */
export const BASE = {
	/** The time bar's and the menu bar's distance from the edges. */
	margin: 24,
	/** Their height: capsules of radius 999. */
	bar: 44,
	/** The status bar: full width at the bottom, with a 1 px top border. */
	status: 32,
	/** The content's safe area: top 80, sides 24, bottom 56 (32 status + 24). */
	safe: { top: 80, side: 24, bottom: 56 },
	/** The bell: a 26 × 26 button, icon 14, badge 8/700. */
	bell: { size: 26, icon: 14, badge: 8 }
} as const;

/** BASE_LAYOUT §6: the menu bar's icons on the 24 grid, y 3 to 21. */
export const SHELL_ICONS = {
	vessel:
		'M12 3 C15 5.5 16 9 16 13 V16 L18.5 19 H5.5 L8 16 V13 C8 9 9 5.5 12 3 Z M10 19 V21 M14 19 V21',
	map: 'M3 6 L9 4 L15 6 L21 4 V18 L15 20 L9 18 L3 20 Z M9 4 V18 M15 6 V20',
	spaceCenter: 'M4 21 V10 L9 7.5 V21 M9 21 V3 L15 6 V21 M15 21 V11 L20 13 V21 M3 21 H21',
	vab: 'M4 21 V9 L12 3 L20 9 V21 Z M12 10 C13.6 11.4 14 13.4 14 16 V21 H10 V16 C10 13.4 10.4 11.4 12 10 Z',
	menu: 'M4 7 H20 M4 12 H20 M4 17 H20',
	missionCenter: 'M4 4 H10 V10 H4 Z M14 4 H20 V10 H14 Z M4 14 H10 V20 H4 Z M14 14 H20 V20 H14 Z',
	bell: 'M6 16 V11 A6 6 0 0 1 18 11 V16 L20 18 H4 Z M10 21 H14',
	// the Flight page actions (`Base.dc.html`, the vessel page example)
	panels: 'M4 4 H20 V20 H4 Z M9 4 V20',
	// FlightV2's Vessel info (a rocket with a port); `Base.dc.html`'s example draws an info circle
	vesselInfo:
		'M12 2 C15 5 16 9 16 13 L18 17 H6 L8 13 C8 9 9 5 12 2 Z M10 17 L9.5 21 M14 17 L14.5 21 M12 8 A1.5 1.5 0 1 1 11.99 8 Z',
	navball: 'M12 4 A8 8 0 1 1 11.99 4 Z M4 12 H20 M8.5 12 L12 15 L15.5 12',
	/** FlightV3's Staging toggle (plan 272). */
	staging: 'M5 4 H19 V8 H5 Z M5 10 H19 V14 H5 Z M5 16 H19 V20 H5 Z',
	crew: 'M9 5 A3 3 0 1 1 8.99 5 Z M3 20 C3 16 6 14 9 14 C12 14 15 16 15 20 M16 5.5 A2.5 2.5 0 1 1 15.99 5.5 Z M17 13.5 C19.5 14 21 16 21 19',
	camera: 'M3 8 H7 L9 5 H15 L17 8 H21 V19 H3 Z M12 9.5 A3.5 3.5 0 1 1 11.99 9.5 Z',
	// the status bar's small icons (`Base.dc.html`)
	autosave: 'M5 3 H17 L20 6 V21 H4 V3 Z M8 3 V8 H15 V3 M8 21 V14 H16 V21',
	// the Hangar's actions (plan 255): a new sheet, an open folder, a disk, a rocket lifting off
	new: 'M6 3 H14 L18 7 V21 H6 Z M14 3 V7 H18 M12 11 V17 M9 14 H15',
	open: 'M3 6 H9 L11 8 H19 V10 M3 6 V19 H18 L21 10 H7 L3 19',
	save: 'M5 3 H17 L20 6 V21 H4 V3 Z M8 3 V8 H15 V3 M8 21 V14 H16 V21',
	launch:
		'M12 2 C15 5 16 8 16 12 L18 15 H6 L8 12 C8 8 9 5 12 2 Z M12 8.5 A1.5 1.5 0 1 1 11.99 8.5 Z M9.5 18 C10 20 11 21 12 22 C13 21 14 20 14.5 18',
	mods: 'M4 4 H10 V10 H4 Z M14 4 H20 V10 H14 Z M4 14 H10 V20 H4 Z M17 14 V20 M14 17 H20'
} as const;

/** The multiple as the time bar writes it: `1×`, `50×`, `1k×`; `—` while paused. */
export const warpText = (factor: number, paused = false): string =>
	paused ? '—' : factor >= 1000 ? `${factor / 1000}k×` : `${factor}×`;

export interface WarpSegment {
	factor: number;
	label: string;
	/** 6 px for physics warp (the first four), 10 for rails warp. */
	width: number;
	/** `past` up to the level, `now` the level (accent), `off` the rest, all `off` while paused. */
	state: 'past' | 'now' | 'off';
	/** Above the world's limit now (plan 206): it cannot be picked. */
	locked: boolean;
}

/** BASE_LAYOUT §2: one segment per warp level. */
export function warpSegments(
	steps: readonly number[],
	index: number,
	paused: boolean,
	limit: number | null = null
): WarpSegment[] {
	return steps.map((factor, i) => ({
		factor,
		label: `Time warp ${warpText(factor)}`,
		width: i < 4 ? 6 : 10,
		state: paused ? 'off' : i < index ? 'past' : i === index ? 'now' : 'off',
		locked: limit !== null && factor > limit
	}));
}

const two = (n: number): string => String(n).padStart(2, '0');

/**
 * Elapsed time as the time bar writes it: `T+ 2y 70d 26:32` (BASE_LAYOUT §2), leading zero units
 * left out (`T+ 70d 26:32`, `T+ 26:32`), with seconds under an hour (`T+ 01:02`, the MET of a fresh
 * flight). `day` and `year` are the world calendar's lengths in s.
 */
export function elapsedText(seconds: number, day = 86_400, year = 365 * 86_400): string {
	const t = Math.max(0, Math.floor(seconds));
	const y = Math.floor(t / year);
	const d = Math.floor((t - y * year) / day);
	const rest = t - y * year - d * day;
	const h = Math.floor(rest / 3600);
	const m = Math.floor((rest % 3600) / 60);
	const s = rest % 60;
	const clock = y === 0 && d === 0 && h === 0 ? `${two(m)}:${two(s)}` : `${two(h)}:${two(m)}`;
	return `T+ ${[y > 0 ? `${y}y` : '', y > 0 || d > 0 ? `${d}d` : '', clock].filter(Boolean).join(' ')}`;
}

export type FixedId = 'vessel' | 'map' | 'spacecenter' | 'vab';

/** BASE_LAYOUT §3: the group on every page, in order. */
export const FIXED_GROUP: ReadonlyArray<{
	id: FixedId;
	label: string;
	icon: keyof typeof SHELL_ICONS;
}> = [
	{ id: 'vessel', label: 'Vessel', icon: 'vessel' },
	{ id: 'map', label: 'Map', icon: 'map' },
	{ id: 'spacecenter', label: 'Space Center', icon: 'spaceCenter' },
	{ id: 'vab', label: 'VAB', icon: 'vab' }
];

/** The fixed group's current entry for a page path and the flight's map state. */
export function activeFixed(path: string, map = false): FixedId | null {
	if (path.endsWith('/flight')) return map ? 'map' : 'vessel';
	if (path.endsWith('/space-center')) return 'spacecenter';
	if (path.endsWith('/vab')) return 'vab';
	return null;
}

/** BASE_LAYOUT §4: the status bar's zones, left to right. */
export const STATUS_ZONES = {
	left: ['world', 'mode', 'system', 'link', 'location'],
	centre: ['funds', 'science', 'reputation', 'contracts'],
	right: ['autosave', 'mods', 'bell']
} as const;

/** Pages that draw a 3D view under the bars; the others sit in the safe area. The Hangar joined them with plan 255. */
export const IMMERSIVE = ['/flight', '/space-center', '/vab'] as const;
export const isImmersive = (path: string): boolean => IMMERSIVE.some((p) => path.endsWith(p));
