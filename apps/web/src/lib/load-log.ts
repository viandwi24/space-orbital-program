/**
 * Every world load's log, kept in the browser (plan 370, the owner's request of 2026-10-22): the
 * last 20 loads in `localStorage`, each with its steps, renderer, cache state, every pipeline's
 * compile time and how it ended. The main menu's Developer page lists them; Debug → Info shows the
 * current one. A load that never finished (the tab closed on the loading screen) is kept too, with
 * the step it was stuck at.
 *
 * Pure but `readLoadLogs`, `writeLoadLog` and `clearLoadLogs`, which touch storage.
 */
import type { PipelineEntry } from '@orbital/renderer/compile-report';
import { formatLoadReport, type LoadReportData } from './load-report';

export const LOAD_LOG_KEY = 'orbital.loadLogs';
export const LOAD_LOG_LIMIT = 20;
/** Stored text above this (characters) drops the pipeline lists of the oldest entries first. */
export const LOAD_LOG_MAX_CHARS = 1_500_000;
/** Pipelines kept per entry, slowest first. */
const PIPELINES_KEPT = 200;

export type LoadOutcome = 'loading' | 'ready' | 'error' | 'left';

export interface LoadLogEntry {
	id: string;
	worldId: string | null;
	outcome: LoadOutcome;
	/** The loading step it was at when last written. */
	step: string;
	/** The player chose "Continue with lower quality". */
	lowered: boolean;
	error: string | null;
	report: LoadReportData;
	pipelines: Pick<PipelineEntry, 'label' | 'mode' | 'bytes' | 'ms' | 'phase' | 'failed'>[];
}

/** Keeps the slowest `PIPELINES_KEPT` pipelines, without their bookkeeping fields. */
export function pipelineList(pipes: readonly PipelineEntry[]): LoadLogEntry['pipelines'] {
	return [...pipes]
		.sort((a, b) => (b.ms ?? -1) - (a.ms ?? -1))
		.slice(0, PIPELINES_KEPT)
		.map((p) => ({
			label: p.label,
			mode: p.mode,
			bytes: p.bytes,
			ms: p.ms,
			phase: p.phase,
			...(p.failed ? { failed: true } : {})
		}));
}

/** The list with `entry` in its place (same id) or added last, at most `LOAD_LOG_LIMIT`, within the size cap. */
export function upsertLog(list: readonly LoadLogEntry[], entry: LoadLogEntry): LoadLogEntry[] {
	const out = list.filter((e) => e.id !== entry.id);
	const at = list.findIndex((e) => e.id === entry.id);
	if (at >= 0) out.splice(Math.min(at, out.length), 0, entry);
	else out.push(entry);
	while (out.length > LOAD_LOG_LIMIT) out.shift();
	for (let i = 0; i < out.length - 1 && JSON.stringify(out).length > LOAD_LOG_MAX_CHARS; i++)
		out[i] = { ...out[i]!, pipelines: [] };
	return out;
}

const OUTCOME_TEXT: Record<LoadOutcome, string> = {
	loading: 'still loading',
	ready: 'ready',
	error: 'failed',
	left: 'left while loading'
};

/** One entry as text (the report and every kept pipeline). */
export function formatLoadLog(e: LoadLogEntry): string {
	return [
		formatLoadReport(e.report),
		`World: ${e.worldId ?? '–'} · outcome: ${OUTCOME_TEXT[e.outcome]} at step ${e.step}${
			e.lowered ? ' · continued with lower quality' : ''
		}${e.error ? ` · error: ${e.error}` : ''}`,
		`Every pipeline (${e.pipelines.length}, slowest first):`,
		...e.pipelines.map(
			(p) =>
				`  ${p.ms === null ? (p.failed ? 'failed' : 'pending') : `${Math.round(p.ms)} ms`} · ${p.mode} · ${Math.round(p.bytes / 1024)} KB · ${p.phase} · ${p.label || '(no label)'}`
		)
	].join('\n');
}

/** A short line for the list: when, renderer, total and the slowest pipeline. */
export function summaryLine(e: LoadLogEntry): {
	when: string;
	backend: string;
	total: string;
	slowest: string;
} {
	const s = e.report.compile.slowest[0];
	return {
		when: new Date(e.report.when).toLocaleString(),
		backend: e.report.backend,
		total:
			e.report.totalMs !== null
				? `${(e.report.totalMs / 1000).toFixed(1)} s`
				: OUTCOME_TEXT[e.outcome],
		slowest: s ? `${s.label || '(no label)'} ${((s.ms ?? 0) / 1000).toFixed(1)} s` : '–'
	};
}

// ---- storage

export function readLoadLogs(): LoadLogEntry[] {
	try {
		const raw = localStorage.getItem(LOAD_LOG_KEY);
		const list = raw ? (JSON.parse(raw) as unknown) : [];
		return Array.isArray(list) ? (list as LoadLogEntry[]) : [];
	} catch {
		return [];
	}
}

export function writeLoadLog(entry: LoadLogEntry): void {
	try {
		localStorage.setItem(LOAD_LOG_KEY, JSON.stringify(upsertLog(readLoadLogs(), entry)));
	} catch {
		// storage full or blocked: the log is lost, the game is not
	}
}

export function clearLoadLogs(): void {
	try {
		localStorage.removeItem(LOAD_LOG_KEY);
	} catch {
		// nothing to do
	}
}

/**
 * The preset to draw first (plan 370, ADR 0308): `low` while the player's preset compiles in the
 * background, when the browser compiles shaders slowly (Windows: HLSL through DXC or FXC) and this
 * build has not finished a world load on this renderer here yet (Chrome's shader cache is cold).
 * `override` is `orbital.graphics.boot`: `low` always, `off` never, else automatic. Pure.
 */
export function bootPresetFor(o: {
	backend: string;
	preset: string;
	userAgent: string;
	platform: string;
	build: string;
	logs: readonly LoadLogEntry[];
	override: string | null;
}): 'low' | undefined {
	if (o.preset === 'low' || o.backend === 'webgl' || o.override === 'off') return undefined;
	if (o.override === 'low') return 'low';
	const windows = o.platform === 'Windows' || /Windows/.test(o.userAgent);
	if (!windows) return undefined;
	const loadedBefore = o.logs.some(
		(e) => e.outcome === 'ready' && e.report.env.build === o.build && e.report.backend === o.backend
	);
	return loadedBefore ? undefined : 'low';
}
