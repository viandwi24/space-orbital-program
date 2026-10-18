/**
 * Player settings that are not graphics (plan 023, ADR 0060; format 2 by plan 053, ADR 0061; format 3
 * by plan 086): display units, the first-flight tutorial, key bindings, audio volumes, the touch-controls
 * choice and the interface (UI scale, high contrast), as one versioned, validated JSON value in localStorage. The graphics preset
 * and the automatic quality switch keep their own keys (`graphics.ts`, plan 019/039) so a profile
 * from an earlier build keeps its choices. Everything read from storage is parsed, never asserted.
 */
import { defaultDock, type DockChoice } from '../dock/dock-model';
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

/** The UI scale choices, as fractions of the default size (ADR 0107 point 5: 80 to 150 %). */
export const UI_SCALES = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;
export const DEFAULT_INTERFACE = { scale: 1, highContrast: false } as const;
/** The nearest offered scale, so a hand-edited value still lands on one the dialog shows. */
export const nearestUiScale = (v: number): number =>
	UI_SCALES.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best), 1);
const interfaceSchema = z
	.object({
		scale: z.number().min(0.8).max(1.5).transform(nearestUiScale).catch(DEFAULT_INTERFACE.scale),
		highContrast: z.boolean().catch(false)
	})
	.catch({ ...DEFAULT_INTERFACE });

/** Format 2. The bindings are repaired after parsing (`repairBindings`), so here they are opaque. */
const v2Fields = {
	units: unitsSchema,
	tutorial: tutorialSchema,
	bindings: z.record(z.string(), z.unknown()).catch({}),
	audio: audioSchema,
	touch: z.enum(TOUCH_CHOICES).catch('auto')
};
const settingsV2 = z.object({ v: z.literal(2), ...v2Fields });

/** Format 3 (plan 086): format 2 plus the interface; format 2 migrates by taking its defaults. */
/** The dock's rail and open panel (plan 112, ADR 0149 point 6); absent or damaged = the default. */
const dockSchema = z
	.object({
		panels: z.array(z.string().min(1).max(80)).max(64),
		open: z.string().min(1).max(80).nullable()
	})
	.catch(defaultDock());

/** Settings → Time (plan 205): place pauses the player changed, the hidden-tab policy, the leave-flight prompt. */
export const defaultTime = (): TimeSettings => ({
	places: {},
	keepRunningHidden: false,
	askLeaveFlight: true
});
export interface TimeSettings {
	/** Only the places the player changed; the rest take `PLACE_PAUSE_DEFAULTS`. */
	places: Record<string, boolean>;
	keepRunningHidden: boolean;
	askLeaveFlight: boolean;
}
const timeSchema = z
	.object({
		places: z.record(z.string().min(1).max(40), z.boolean()).catch({}),
		keepRunningHidden: z.boolean().catch(false),
		askLeaveFlight: z.boolean().catch(true)
	})
	.catch(defaultTime())
	.default(defaultTime());

const settingsV3 = z.object({
	v: z.literal(3),
	...v2Fields,
	interface: interfaceSchema,
	dock: dockSchema,
	/** Debug mode (plan 203, ADR 0213 point 5): additive in format 3, off when absent. */
	debug: z.boolean().catch(false).default(false),
	/** Time (plan 205, ADR 0201 points 7 to 9): additive in format 3, the defaults when absent. */
	time: timeSchema
});

/** Format 1 (plan 023): units and tutorial only; migrated by taking the new fields' defaults. */
const settingsV1 = z.object({ v: z.literal(1), units: unitsSchema, tutorial: tutorialSchema });

export interface Settings {
	v: 3;
	units: 'metric' | 'imperial';
	tutorial: { status: (typeof TUTORIAL_STATUS)[number]; step: number };
	/** Only what the player changed (ADR 0061). */
	bindings: Bindings;
	audio: { master: number; effects: number; ui: number; muted: boolean };
	touch: TouchChoice;
	interface: { scale: number; highContrast: boolean };
	dock: DockChoice;
	/** Debug mode: the debug tools in worlds that need it turned on (plan 203). */
	debug: boolean;
	time: TimeSettings;
}
export type TutorialProgress = Settings['tutorial'];
export type AudioSettings = Settings['audio'];
export type InterfaceSettings = Settings['interface'];

export const defaultSettings = (): Settings => ({
	v: 3,
	units: 'metric',
	tutorial: { status: 'pending', step: 0 },
	bindings: {},
	audio: { ...DEFAULT_AUDIO },
	touch: 'auto',
	interface: { ...DEFAULT_INTERFACE },
	dock: defaultDock(),
	debug: false,
	time: defaultTime()
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
	const v3 = settingsV3.safeParse(raw);
	if (v3.success) return { ...v3.data, bindings: repairBindings(v3.data.bindings) };
	const v2 = settingsV2.safeParse(raw);
	if (v2.success)
		return {
			...v2.data,
			v: 3,
			bindings: repairBindings(v2.data.bindings),
			interface: { ...DEFAULT_INTERFACE },
			dock: defaultDock(),
			debug: false,
			time: defaultTime()
		};
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
