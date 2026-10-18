/**
 * Part reliability on the page (plan 130, ADR 0156 point 8): the test stand's rows and reports
 * from `Snapshot.reliability`, and a part's line in the Hangar from the world's newest save.
 */
import {
	GRADE_FACTORS,
	modelReliability,
	RELIABILITY,
	RELIABILITY_RULE,
	type FailureModeDefinition,
	type Grade,
	type ReliabilitySnapshot,
	type SaveReliability,
	type WorldInfo
} from '@orbital/core';
import type { GameSave } from '../save/game-save';

export interface ModelRow {
	part: string;
	title: string;
	experience: number;
	grade: Grade;
	/** 0..1 at the next trial. */
	reliability: number;
	/** Funds for one static fire, before the cost multiplier. */
	fireCost: number;
}

export function modelRows(
	snapshot: ReliabilitySnapshot | undefined,
	part: (id: string) => { title: string; cost?: number } | undefined
): ModelRow[] {
	return (snapshot?.models ?? [])
		.map((m) => {
			const def = part(m.part);
			return {
				part: m.part,
				title: def?.title ?? m.part,
				experience: m.experience,
				grade: m.grade,
				reliability: m.reliability,
				fireCost: (def?.cost ?? 0) * RELIABILITY.staticFire
			};
		})
		.sort((a, b) => a.title.localeCompare(b.title));
}

export interface ReportRow {
	id: string;
	title: string;
	mode: string;
	fixed: boolean;
	where: string;
	fixCost: number;
}

export function reportRows(
	snapshot: ReliabilitySnapshot | undefined,
	part: (id: string) => { title: string; cost?: number } | undefined,
	mode: (id: string) => FailureModeDefinition | undefined
): ReportRow[] {
	return [...(snapshot?.reports ?? [])].reverse().map((r) => ({
		id: r.id,
		title: part(r.part)?.title ?? r.part,
		mode: mode(r.mode)?.label ?? r.mode,
		fixed: r.fixed,
		where: r.vessel === undefined ? 'Test stand' : 'In flight',
		fixCost: (part(r.part)?.cost ?? 0) * RELIABILITY.fix
	}));
}

export const percent = (r: number): string => `${(r * 100).toFixed(1)} %`;

export const GRADE_TEXT: Record<Grade, string> = {
	economy: `Economy · cost ×${GRADE_FACTORS.economy.cost}, failures ×${GRADE_FACTORS.economy.chance}`,
	standard: 'Standard',
	proven: `Proven · cost ×${GRADE_FACTORS.proven.cost}, failures ×${GRADE_FACTORS.proven.chance}`
};

export interface WorldReliability {
	on: boolean;
	state: SaveReliability | undefined;
}

export const NO_RELIABILITY: WorldReliability = { on: false, state: undefined };

/** The rule from the newest save, else the start info (resolved values only). */
export function worldReliabilityOf(
	save: GameSave | undefined,
	info: WorldInfo | undefined
): WorldReliability {
	const rules = save?.sim.worldInfo.rules ?? info?.rules ?? {};
	return { on: rules[RELIABILITY_RULE] === true, state: save?.sim.reliability };
}

/** The Hangar's line for a part model, or null when the world has no reliability or it cannot fail. */
export function partReliabilityLine(
	world: WorldReliability,
	part: { id: string; modules?: readonly (readonly [string, unknown])[] },
	modes: readonly FailureModeDefinition[]
): string | null {
	if (!world.on) return null;
	const own = modes.filter((m) => (part.modules ?? []).some(([id]) => id === m.module));
	if (own.length === 0) return null;
	const model = world.state?.models[part.id];
	const grade = model?.grade ?? 'standard';
	return `Reliability ${percent(modelReliability(own, model))} · ${grade} · ${model?.experience ?? 0} trials`;
}

/** The active world's reliability from its newest save, else its start info. */
export async function loadWorldReliability(
	saves: {
		refresh(): Promise<void>;
		entries: readonly ({ ok: true; meta: { id: string } } | { ok: false })[];
		read(id: string): Promise<GameSave>;
		worldStartInfo(worldId: string): Promise<WorldInfo | undefined>;
	},
	worldId: string
): Promise<WorldReliability> {
	try {
		await saves.refresh();
		const newest = saves.entries.find((e) => e.ok);
		const save = newest?.ok ? await saves.read(newest.meta.id) : undefined;
		return worldReliabilityOf(save, save ? undefined : await saves.worldStartInfo(worldId));
	} catch {
		return NO_RELIABILITY;
	}
}
