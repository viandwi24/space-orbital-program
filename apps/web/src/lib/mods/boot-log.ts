/**
 * The mod loader log (plan 375, ADR 0311 point 3): what one page load booted and why the rest did
 * not. Built from the mod runtime's evaluation:
 * - the boot order;
 * - each plugin's outcome, with the problem's kind and the thrown error's stack;
 * - every data patch and what it changed;
 * - each plugin's registrations, counted per kind;
 * - asset failures found later (a model or a portrait that would not load).
 *
 * The last boot's log is kept in `localStorage` for `/developer/mods`.
 * Pure but `storeBootLog`, `readBootLog` and `noteAssetProblem`, which touch storage.
 */
import type {
	LoadReport,
	ModProblemCode,
	PatchReport,
	Plugin,
	RegistryKind
} from '@orbital/core';
import type { ModRecord } from './store';

export const BOOT_LOG_KEY = 'orbital.modBootLog';

export type BootProblemCode = ModProblemCode | 'untrusted' | 'boot';

export interface BootProblem {
	code: BootProblemCode;
	message: string;
	stack?: string;
}

export interface BootLogMod {
	id: string;
	title: string;
	version: string;
	/** The mod API range it asks for. */
	api: string;
	source: 'builtin' | 'installed';
	state: 'loaded' | 'disabled' | 'failed' | 'untrusted';
	/** Its place in the boot order, 0 first; absent when it did not boot. */
	index?: number;
	problem?: BootProblem;
	/** Registrations per registry kind (only kinds with at least one). */
	counts: Partial<Record<RegistryKind, number>>;
	/** Its patches: how many applied and how many were disabled. */
	patches: { applied: number; failed: number };
	warnings: string[];
}

export interface AssetProblem {
	mod: string;
	/** The asset path, or the part or portrait id that names it. */
	what: string;
	message: string;
}

export interface ModBootLog {
	/** When the page booted, ISO time. */
	at: string;
	/** The game's mod API version. */
	api: string;
	/** Booted plugin ids in boot order. */
	order: string[];
	mods: BootLogMod[];
	patches: PatchReport[];
	assets: AssetProblem[];
	/** The boot itself threw (the game then runs the built-ins alone). */
	error?: BootProblem;
}

/** What the runtime decided for one installed record. */
export type RecordState =
	| { kind: 'loaded' }
	| { kind: 'disabled' }
	| { kind: 'failed'; reason: string; code?: ModProblemCode; stack?: string }
	| { kind: 'untrusted'; reason: string };

export interface BootLogInput {
	api: string;
	builtin: readonly Plugin[];
	records: readonly ModRecord[];
	states: ReadonlyMap<string, RecordState>;
	/** The report of the booted set; absent when the boot threw. */
	report?: LoadReport;
	error?: unknown;
	at?: Date;
}

/** Registrations per plugin and kind from a load report. */
export function countsByPlugin(
	report: LoadReport
): Map<string, Partial<Record<RegistryKind, number>>> {
	const out = new Map<string, Partial<Record<RegistryKind, number>>>();
	for (const [kind, entries] of Object.entries(report.registered) as [
		RegistryKind,
		Array<{ id: string; by: string }>
	][]) {
		for (const e of entries) {
			const counts = out.get(e.by) ?? {};
			counts[kind] = (counts[kind] ?? 0) + 1;
			out.set(e.by, counts);
		}
	}
	return out;
}

const errorProblem = (e: unknown): BootProblem => ({
	code: 'boot',
	message: e instanceof Error ? e.message : String(e),
	...(e instanceof Error && e.stack ? { stack: e.stack } : {})
});

export function buildBootLog(input: BootLogInput): ModBootLog {
	const report = input.report;
	const counts = report ? countsByPlugin(report) : new Map();
	const order = report?.order ?? [];
	const patches = report?.patches ?? [];
	const patchesOf = (id: string) => ({
		applied: patches.filter((p) => p.by === id && !p.disabled).length,
		failed: patches.filter((p) => p.by === id && p.disabled).length
	});
	const warningsOf = (id: string, loaded: boolean): string[] => {
		if (!loaded) return [];
		const out: string[] = [];
		const mine = counts.get(id) ?? {};
		if (Object.keys(mine).length === 0) out.push('it registers nothing');
		for (const p of patches) {
			if (p.by !== id) continue;
			if (p.disabled) out.push(`patch "${p.id}" did not apply: ${p.disabled}`);
			else if (p.applied.length === 0) out.push(`patch "${p.id}" matched nothing`);
		}
		return out;
	};
	const disabled = new Map((report?.disabled ?? []).map((d) => [d.id, d.reason]));
	const mods: BootLogMod[] = [];
	for (const p of input.builtin) {
		const index = order.indexOf(p.meta.id);
		const off = disabled.get(p.meta.id);
		mods.push({
			id: p.meta.id,
			title: p.meta.title ?? p.meta.id,
			version: p.meta.version,
			api: p.meta.api,
			source: 'builtin',
			state: index >= 0 ? 'loaded' : 'failed',
			...(index >= 0 ? { index } : {}),
			...(off
				? {
						problem: {
							code: /mod API/.test(off) ? ('api' as const) : ('dependency' as const),
							message: off
						}
					}
				: {}),
			counts: counts.get(p.meta.id) ?? {},
			patches: patchesOf(p.meta.id),
			warnings: warningsOf(p.meta.id, index >= 0)
		});
	}
	for (const r of input.records) {
		const state = input.states.get(r.id) ?? {
			kind: 'failed',
			reason: 'it was not loaded'
		};
		const index = order.indexOf(r.id);
		const loaded = state.kind === 'loaded' && index >= 0;
		const problem: BootProblem | undefined =
			state.kind === 'failed'
				? {
						code: state.code ?? 'content',
						message: state.reason,
						...(state.stack ? { stack: state.stack } : {})
					}
				: state.kind === 'untrusted'
					? { code: 'untrusted', message: state.reason }
					: state.kind === 'loaded' && index < 0
						? {
								code: 'boot',
								message: input.error
									? 'the mods could not boot together; the game runs the built-ins alone'
									: 'it was accepted but did not boot'
							}
						: undefined;
		mods.push({
			id: r.id,
			title: r.manifest.title ?? r.id,
			version: r.manifest.version,
			api: r.manifest.api,
			source: 'installed',
			state: loaded ? 'loaded' : state.kind === 'loaded' ? 'failed' : state.kind,
			...(loaded ? { index } : {}),
			...(problem ? { problem } : {}),
			counts: counts.get(r.id) ?? {},
			patches: patchesOf(r.id),
			warnings: warningsOf(r.id, loaded)
		});
	}
	return {
		at: (input.at ?? new Date()).toISOString(),
		api: input.api,
		order,
		mods,
		patches,
		assets: [],
		...(input.error !== undefined ? { error: errorProblem(input.error) } : {})
	};
}

const PROBLEM_LABEL: Record<BootProblemCode, string> = {
	api: 'API version',
	dependency: 'dependency',
	duplicate: 'duplicate id',
	manifest: 'manifest',
	import: 'code',
	setup: 'setup threw',
	content: 'invalid content',
	assets: 'assets',
	cycle: 'dependency cycle',
	untrusted: 'not trusted',
	boot: 'boot'
};
export const problemLabel = (code: BootProblemCode): string => PROBLEM_LABEL[code];

/** One line of counts: "12 part, 3 module". */
export const countsLine = (counts: Partial<Record<RegistryKind, number>>): string =>
	Object.entries(counts)
		.sort((a, b) => b[1] - a[1])
		.map(([k, n]) => `${n} ${k}`)
		.join(', ');

/** The log as plain text, for Copy and for a bug report. */
export function formatBootLog(log: ModBootLog): string {
	const lines: string[] = [
		`Mod loader log · ${log.at} · mod API ${log.api}`,
		`Boot order: ${log.order.join(' → ') || '(none)'}`
	];
	if (log.error) lines.push(`BOOT FAILED: ${log.error.message}`, ...(log.error.stack ? [log.error.stack] : []));
	lines.push('');
	for (const m of log.mods) {
		const head = `${m.state.toUpperCase().padEnd(9)} ${m.id} ${m.version} (${m.source}, api ${m.api})`;
		lines.push(m.index === undefined ? head : `${head} #${m.index + 1}`);
		if (m.problem) {
			lines.push(`  ${problemLabel(m.problem.code)}: ${m.problem.message}`);
			if (m.problem.stack) lines.push(...m.problem.stack.split('\n').map((l) => `    ${l}`));
		}
		const c = countsLine(m.counts);
		if (c) lines.push(`  registers: ${c}`);
		if (m.patches.applied || m.patches.failed)
			lines.push(`  patches: ${m.patches.applied} applied, ${m.patches.failed} failed`);
		for (const w of m.warnings) lines.push(`  warning: ${w}`);
	}
	if (log.patches.length > 0) {
		lines.push('', 'Patches (apply order):');
		for (const p of log.patches) {
			lines.push(
				p.disabled
					? `  FAILED ${p.id} (${p.by}) → ${p.target}: ${p.disabled}`
					: `  ok     ${p.id} (${p.by}) → ${p.target}: ${p.applied.length} changed${p.applied.length ? ` (${p.applied.slice(0, 6).join(', ')}${p.applied.length > 6 ? ', …' : ''})` : ''}`
			);
		}
	}
	if (log.assets.length > 0) {
		lines.push('', 'Asset problems:');
		for (const a of log.assets) lines.push(`  ${a.mod}: ${a.what}: ${a.message}`);
	}
	return lines.join('\n');
}

/** A short summary: "5 loaded · 1 failed · 2 warnings". */
export function bootSummary(log: ModBootLog): {
	loaded: number;
	failed: number;
	disabled: number;
	warnings: number;
} {
	return {
		loaded: log.mods.filter((m) => m.state === 'loaded').length,
		failed: log.mods.filter((m) => m.state === 'failed' || m.state === 'untrusted').length,
		disabled: log.mods.filter((m) => m.state === 'disabled').length,
		warnings:
			log.mods.reduce((n, m) => n + m.warnings.length, 0) + log.assets.length
	};
}

// --- storage -----------------------------------------------------------------------------------------

let current: ModBootLog | null = null;

/** This page load's log (null before the mod runtime has run). */
export const modBootLog = (): ModBootLog | null => current;

type KeyValue = Pick<Storage, 'getItem' | 'setItem'>;
const browserStorage = (): KeyValue | undefined => globalThis.localStorage;

export function storeBootLog(log: ModBootLog, storage: KeyValue | undefined = browserStorage()): void {
	current = log;
	try {
		storage?.setItem(BOOT_LOG_KEY, JSON.stringify(log));
	} catch {
		// private mode or a full storage: the page still has its own copy
	}
}

/** The last stored boot's log, or null. */
export function readBootLog(storage: KeyValue | undefined = browserStorage()): ModBootLog | null {
	try {
		const raw = storage?.getItem(BOOT_LOG_KEY);
		if (!raw) return null;
		const log = JSON.parse(raw) as ModBootLog;
		return Array.isArray(log?.mods) ? log : null;
	} catch {
		return null;
	}
}

/** An asset that failed after the boot (a model, a portrait): added to this load's log and stored. */
export function noteAssetProblem(problem: AssetProblem): void {
	if (!current) return;
	storeBootLog({ ...current, assets: [...current.assets, problem] });
}
