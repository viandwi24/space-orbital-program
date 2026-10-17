/**
 * Player settings that are not graphics (plan 023, ADR 0060; format 2 by plan 053, ADR 0061):
 * display units, the first-flight tutorial, key bindings, audio volumes and the touch-controls
 * choice, as one versioned, validated JSON value in localStorage. The graphics preset
 * and the automatic quality switch keep their own keys (`graphics.ts`, plan 019/039) so a profile
 * from an earlier build keeps its choices. Everything read from storage is parsed, never asserted.
 */
import { z } from 'zod';
import { repairBindings, type Bindings } from '../keybindings';

export const SETTINGS_KEY = 'orbital.settings';

export const TUTORIAL_STATUS = ['pending', 'active', 'done', 'skipped'] as const;

const unitsSchema = z.enum(['metric', 'imperial']).catch('metric');
const tutorialSchema = z
	.object({
		status: z.enum(TUTORIAL_STATUS).catch('pending'),
		step: z.number().int().min(0).max(99).catch(0)
	})
	.catch({ status: 'pending', step: 0 });

export const TOUCH_CHOICES = ['auto', 'on', 'off'] as const;
export type TouchChoice = (typeof TOUCH_CHOICES)[number];

const volume = (fallback: number) => z.number().min(0).max(1).catch(fallback);
export const DEFAULT_AUDIO = { master: 0.7, effects: 0.8, ui: 0.6, muted: false } as const;
const audioSchema = z
	.object({
		master: volume(DEFAULT_AUDIO.master),
		effects: volume(DEFAULT_AUDIO.effects),
		ui: volume(DEFAULT_AUDIO.ui),
		muted: z.boolean().catch(false)
	})
	.catch({ ...DEFAULT_AUDIO });

/** Format 2. The bindings are repaired after parsing (`repairBindings`), so here they are opaque. */
const settingsV2 = z.object({
	v: z.literal(2),
	units: unitsSchema,
	tutorial: tutorialSchema,
	bindings: z.record(z.string(), z.unknown()).catch({}),
	audio: audioSchema,
	touch: z.enum(TOUCH_CHOICES).catch('auto')
});

/** Format 1 (plan 023): units and tutorial only; migrated by taking the new fields' defaults. */
const settingsV1 = z.object({ v: z.literal(1), units: unitsSchema, tutorial: tutorialSchema });

export interface Settings {
	v: 2;
	units: 'metric' | 'imperial';
	tutorial: { status: (typeof TUTORIAL_STATUS)[number]; step: number };
	/** Only what the player changed (ADR 0061). */
	bindings: Bindings;
	audio: { master: number; effects: number; ui: number; muted: boolean };
	touch: TouchChoice;
}
export type TutorialProgress = Settings['tutorial'];
export type AudioSettings = Settings['audio'];

export const defaultSettings = (): Settings => ({
	v: 2,
	units: 'metric',
	tutorial: { status: 'pending', step: 0 },
	bindings: {},
	audio: { ...DEFAULT_AUDIO },
	touch: 'auto'
});

/** Settings from stored text: anything that is not a valid settings object gives the defaults. */
export function parseSettings(text: string | null): Settings {
	if (text === null) return defaultSettings();
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return defaultSettings();
	}
	const v2 = settingsV2.safeParse(raw);
	if (v2.success) return { ...v2.data, bindings: repairBindings(v2.data.bindings) };
	const v1 = settingsV1.safeParse(raw);
	return v1.success
		? { ...defaultSettings(), units: v1.data.units, tutorial: v1.data.tutorial }
		: defaultSettings();
}

export const serialiseSettings = (settings: Settings): string => JSON.stringify(settings);

export function loadSettings(): Settings {
	try {
		return parseSettings(localStorage.getItem(SETTINGS_KEY));
	} catch {
		return defaultSettings();
	}
}

export function saveSettings(settings: Settings): void {
	try {
		localStorage.setItem(SETTINGS_KEY, serialiseSettings(settings));
	} catch {
		// private mode or quota: the choice applies for this session only
	}
}
