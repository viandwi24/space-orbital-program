/**
 * The player's graphics profile (plan 404, ADR 0339): a preset (Automatic, Low, Medium, High or
 * Ultra), a level for each look that the player may pin, and a resolution scale that the player may
 * pin. Saved as one versioned, validated JSON value; a profile from before it has only the preset key
 * and becomes the same preset with every look on Automatic. The governor works inside it: it may lower
 * the resolution scale and the preset's levels, never raise them, and never touches a pinned look or a
 * pinned scale. Pure; the storage functions at the end wrap `localStorage`.
 */
import {
	AUTO_LOOKS,
	LOOKS,
	LOOK_LEVELS,
	parsePreset,
	type GraphicsPreset,
	type LookChoice,
	type LookChoices,
	type LookId
} from '@orbital/renderer/presets';

/** The presets as the player picks them: `ultra` is High with every look at its highest and the full resolution. */
export type ProfilePreset = GraphicsPreset | 'auto' | 'ultra';

export interface GraphicsProfile {
	preset: ProfilePreset;
	looks: LookChoices;
	/** The resolution scale the player pinned (0.5 to 1), or null for the governor's. */
	resolutionScale: number | null;
}

export const PROFILE_VERSION = 1;
export const MIN_RESOLUTION_SCALE = 0.5;

export const DEFAULT_PROFILE: GraphicsProfile = {
	preset: 'auto',
	looks: AUTO_LOOKS,
	resolutionScale: null
};

/**
 * A player who never chose a preset starts on Low, as if chosen by hand (owner, 2026-10-25), so the
 * governor does not climb. Automatic stays one pick away in Settings.
 */
export const NEW_PLAYER_PROFILE: GraphicsProfile = { ...DEFAULT_PROFILE, preset: 'low' };

const PRESETS_ALL: readonly ProfilePreset[] = ['auto', 'low', 'medium', 'high', 'ultra'];

const parseLook = (v: unknown): LookChoice =>
	v === 'auto' || (LOOK_LEVELS as readonly unknown[]).includes(v) ? (v as LookChoice) : 'auto';

/**
 * A profile from stored text. Anything missing or invalid falls back to the default for that field; a
 * bare preset name (the key before plan 404) is a profile with that preset.
 */
export function parseProfile(value: unknown, legacyPreset?: unknown): GraphicsProfile {
	let raw: Record<string, unknown> | null = null;
	if (typeof value === 'string') {
		try {
			const parsed: unknown = JSON.parse(value);
			if (parsed && typeof parsed === 'object') raw = parsed as Record<string, unknown>;
		} catch {
			raw = null;
		}
	}
	if (!raw || raw.version !== PROFILE_VERSION) {
		// before plan 404: only the preset key; nothing stored at all is a new player (Low)
		const preset = parsePreset(legacyPreset);
		if (preset) return { ...DEFAULT_PROFILE, preset };
		return legacyPreset === 'auto' ? DEFAULT_PROFILE : NEW_PLAYER_PROFILE;
	}
	const looksRaw = (raw.looks ?? {}) as Record<string, unknown>;
	const looks = Object.fromEntries(LOOKS.map((id) => [id, parseLook(looksRaw[id])])) as LookChoices;
	const preset = PRESETS_ALL.find((p) => p === raw.preset) ?? 'auto';
	const scale = Number(raw.resolutionScale);
	const resolutionScale =
		raw.resolutionScale !== null &&
		raw.resolutionScale !== undefined &&
		Number.isFinite(scale) &&
		scale >= MIN_RESOLUTION_SCALE &&
		scale <= 1
			? Math.round(scale * 100) / 100
			: null;
	return { preset, looks, resolutionScale };
}

export const serializeProfile = (p: GraphicsProfile): string =>
	JSON.stringify({ version: PROFILE_VERSION, ...p });

/** The renderer preset a profile asks for (`ultra` is High); null for Automatic. */
export const presetOfProfile = (p: GraphicsProfile): GraphicsPreset | null =>
	p.preset === 'auto' ? null : p.preset === 'ultra' ? 'high' : p.preset;

/** The looks a profile pins: Ultra pins every look at High, the rest what the player set. */
export function effectiveLooks(p: GraphicsProfile): LookChoices {
	if (p.preset !== 'ultra') return p.looks;
	return Object.fromEntries(
		LOOKS.map((id) => [id, p.looks[id] === 'auto' ? 'high' : p.looks[id]])
	) as LookChoices;
}

/** The scale a profile pins: Ultra pins 1 unless the player chose another. */
export const effectiveScale = (p: GraphicsProfile): number | null =>
	p.resolutionScale ?? (p.preset === 'ultra' ? 1 : null);

/** What the settings dialog calls the profile: a named preset, or Custom once a look or the scale was set by hand. */
export type ProfileKind = ProfilePreset | 'custom';
export function kindOf(p: GraphicsProfile): ProfileKind {
	const touched = LOOKS.some((id) => p.looks[id] !== 'auto') || p.resolutionScale !== null;
	return touched ? 'custom' : p.preset;
}

/** Picking a named preset clears the hand-set looks and scale (Custom starts from the next change). */
export const withPreset = (preset: ProfilePreset): GraphicsProfile => ({
	...DEFAULT_PROFILE,
	preset
});

export const withLook = (p: GraphicsProfile, id: LookId, choice: LookChoice): GraphicsProfile => ({
	...p,
	looks: { ...p.looks, [id]: choice }
});

export const withScale = (p: GraphicsProfile, scale: number | null): GraphicsProfile => ({
	...p,
	resolutionScale:
		scale === null
			? null
			: Math.min(1, Math.max(MIN_RESOLUTION_SCALE, Math.round(scale * 100) / 100))
});

/** What the governor may change (ADR 0339): the scale unless pinned; looks only while on Automatic. */
export interface GovernorLimits {
	/** May lower the resolution scale. */
	scale: boolean;
	/** The looks it may lower (by lowering the preset). */
	looks: LookId[];
	/** The scale to hold when it may not lower it. */
	heldScale: number | null;
}

export function governorLimits(p: GraphicsProfile): GovernorLimits {
	const held = effectiveScale(p);
	const looks = effectiveLooks(p);
	return {
		scale: held === null,
		looks: LOOKS.filter((id) => looks[id] === 'auto'),
		heldScale: held
	};
}

const KEY = 'orbital.graphics.profile';
const LEGACY_KEY = 'orbital.graphics';

export function loadProfile(): GraphicsProfile {
	try {
		return parseProfile(localStorage.getItem(KEY), localStorage.getItem(LEGACY_KEY));
	} catch {
		return NEW_PLAYER_PROFILE;
	}
}

/** Saves the profile, and the legacy preset key beside it so older readers (the main menu) agree. */
export function saveProfile(p: GraphicsProfile): void {
	try {
		localStorage.setItem(KEY, serializeProfile(p));
		const preset = presetOfProfile(p);
		// Automatic is stored as `auto`: an absent key means a new player, who starts on Low
		localStorage.setItem(LEGACY_KEY, preset ?? 'auto');
	} catch {
		// private mode or quota: the choice applies for this session only
	}
}
