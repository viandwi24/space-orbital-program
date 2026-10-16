/**
 * Player settings that are not graphics (plan 023, ADR 0059): display units and the state of the
 * first-flight tutorial, as one versioned, validated JSON value in localStorage. The graphics preset
 * and the automatic quality switch keep their own keys (`graphics.ts`, plan 019/039) so a profile
 * from an earlier build keeps its choices. Everything read from storage is parsed, never asserted.
 */
import { z } from 'zod';

export const SETTINGS_KEY = 'orbital.settings';

export const TUTORIAL_STATUS = ['pending', 'active', 'done', 'skipped'] as const;

const settingsSchema = z.object({
	v: z.literal(1),
	units: z.enum(['metric', 'imperial']).catch('metric'),
	tutorial: z
		.object({
			status: z.enum(TUTORIAL_STATUS).catch('pending'),
			step: z.number().int().min(0).max(99).catch(0)
		})
		.catch({ status: 'pending', step: 0 })
});

export type Settings = z.output<typeof settingsSchema>;
export type TutorialProgress = Settings['tutorial'];

export const defaultSettings = (): Settings => ({
	v: 1,
	units: 'metric',
	tutorial: { status: 'pending', step: 0 }
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
	const parsed = settingsSchema.safeParse(raw);
	return parsed.success ? parsed.data : defaultSettings();
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
