/**
 * The world's load report (plan 370, ADR 0308): how long each loading step took, which renderer
 * and GPU drew, whether the browser had compiled these shaders before, and what the compile cost:
 * the renderer's `CompileReport`, summarised. The loading screen and Debug → Info copy it as text
 * for the owner (a player on Windows pastes it into an issue or a message).
 *
 * Pure but `readEnvironment` and the storage helpers, which read the browser.
 */
import type { CompileSummary, ModuleEntry } from '@orbital/renderer/compile-report';

export type LoadStepName = 'sim' | 'device' | 'programs' | 'views' | 'frame';

export interface LoadEnvironment {
	userAgent: string;
	/** `navigator.userAgentData.platform` where the browser has it, else ''. */
	platform: string;
	cores: number | null;
	memoryGB: number | null;
	/** WebGL's unmasked renderer string: on Windows it names ANGLE's D3D11 backend. */
	angle: string | null;
	/** The JS chunk this code came from: a build's identity. */
	build: string;
	origin: string;
}

/** What the previous loads in this browser left (`localStorage`). */
export interface LoadMemory {
	/** Shader-set hash → loads seen and the last load's total, ms. */
	sets: Record<string, { loads: number; lastMs: number }>;
	/** Per renderer and preset: the module hashes of the last load. */
	modules: Record<string, string[]>;
}

export interface LoadReportData {
	when: string;
	env: LoadEnvironment;
	backend: string;
	gpu: string;
	/** The preset the world started with, and the one drawn now (the governor may have moved). */
	preset: string;
	presetNow: string;
	/** Plan 370: the cheap preset drawn first while `preset` compiled in the background, and when it was swapped. */
	boot?: { preset: string | null; booting: boolean; swappedAfterMs: number | null; lowered: boolean } | null;
	warmPresets: string[];
	/** Each step's time, ms, in order; `totalMs` from the world's start to the first frame. */
	steps: { step: LoadStepName; ms: number }[];
	totalMs: number | null;
	/** `first`: these shaders were not compiled in this browser before; `cached`: they were. */
	cache: 'first' | 'cached';
	seenBefore: { loads: number; lastMs: number } | null;
	/** Modules whose source the last load of this renderer and preset did not have. */
	changedModules: number | null;
	compile: CompileSummary;
}

const STEP_LABELS: Record<LoadStepName, string> = {
	sim: 'world',
	device: 'graphics start',
	programs: 'compiling',
	views: 'views',
	frame: 'first frame'
};

const s1 = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;
const kb = (bytes: number): string =>
	bytes >= 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : `${Math.round(bytes / 1024)} KB`;

/** Times of each step from the moments it started (`marks`, ms) and the moment the world was ready. */
export function stepTimes(
	marks: Partial<Record<LoadStepName, number>>,
	readyAt: number | null
): { steps: { step: LoadStepName; ms: number }[]; totalMs: number | null } {
	const order: LoadStepName[] = ['sim', 'device', 'programs', 'views', 'frame'];
	const seen = order.filter((s) => marks[s] !== undefined);
	const steps = seen.map((step, i) => {
		const from = marks[step]!;
		const next = seen[i + 1];
		const to = next !== undefined ? marks[next]! : (readyAt ?? from);
		return { step, ms: Math.max(0, Math.round(to - from)) };
	});
	const start = seen.length ? marks[seen[0]!]! : null;
	return { steps, totalMs: start !== null && readyAt !== null ? Math.round(readyAt - start) : null };
}

/** The key of the last load's module list: one per renderer and preset. */
export const moduleKey = (backend: string, preset: string): string => `${backend}:${preset}`;

/** Modules of `now` whose hash the previous list did not have; null without a previous list. */
export function changedSince(
	now: readonly ModuleEntry[],
	previous: readonly string[] | undefined
): number | null {
	if (!previous) return null;
	const had = new Set(previous);
	return now.filter((m) => !had.has(m.hash)).length;
}

/** The memory after this load (pure): the set counted, the module list kept, at most 20 sets. */
export function remember(
	memory: LoadMemory,
	setHash: string,
	totalMs: number,
	key: string,
	modules: readonly ModuleEntry[]
): LoadMemory {
	const sets = { ...memory.sets };
	sets[setHash] = { loads: (sets[setHash]?.loads ?? 0) + 1, lastMs: totalMs };
	const names = Object.keys(sets);
	for (const n of names.slice(0, Math.max(0, names.length - 20))) delete sets[n];
	return {
		sets,
		modules: { ...memory.modules, [key]: [...new Set(modules.map((m) => m.hash))] }
	};
}

/** The report as text, for the clipboard. */
export function formatLoadReport(r: LoadReportData): string {
	const c = r.compile;
	const lines = [
		`Space Orbital Program: load report (${r.when})`,
		`Build ${r.env.build} · ${r.env.origin}`,
		`Browser: ${r.env.userAgent}${r.env.platform ? ` · ${r.env.platform}` : ''}${
			r.env.cores ? ` · ${r.env.cores} threads` : ''
		}${r.env.memoryGB ? ` · ${r.env.memoryGB} GB` : ''}`,
		`Renderer: ${r.backend} · ${r.gpu}`,
		`WebGL: ${r.env.angle ?? 'not shown'}`,
		`Preset: started ${r.preset}, now ${r.presetNow}${r.warmPresets.length ? ` (next, built after loading: ${r.warmPresets.join(', ')})` : ''}`,
		...(r.boot?.preset
			? [
					`Boot: drew ${r.boot.preset} first; ${
						r.boot.swappedAfterMs !== null
							? `${r.preset} swapped in ${(r.boot.swappedAfterMs / 1000).toFixed(1)} s after the loading screen`
							: r.boot.lowered
								? 'the player stayed on it (lower quality)'
								: `${r.preset} still compiling`
					}`
				]
			: []),
		`Load: ${
			r.cache === 'first'
				? 'first time these shaders were compiled in this browser'
				: `shaders seen before (${r.seenBefore?.loads ?? 0}×, last load ${s1(r.seenBefore?.lastMs ?? 0)})`
		}`,
		`Steps: ${r.steps.map((s) => `${STEP_LABELS[s.step]} ${s1(s.ms)}`).join(' · ')}${
			r.totalMs !== null ? ` · total ${s1(r.totalMs)}` : ''
		}`,
		`Pipelines: ${c.pipelines} (async ${c.async}, sync ${c.sync}${c.pending ? `, ${c.pending} still compiling` : ''}) · modules ${c.modules}, ${kb(c.moduleBytes)} of shader source · timed compiles add up to ${s1(c.timedMs)}`,
		`By phase: ${c.phases
			.map((p) => `${p.phase} ${p.pipelines} pipelines, ${s1(p.spanMs)} span, ${s1(p.timedMs)} summed`)
			.join(' · ')}`,
		`Changed since the last load: ${
			r.changedModules === null ? 'no earlier load to compare' : `${r.changedModules} of ${c.modules} modules`
		}`,
		'Slowest compiles:',
		...c.slowest.map(
			(p, i) => `  ${i + 1}. ${p.label || '(no label)'} ${s1(p.ms ?? 0)} · ${kb(p.bytes)} · ${p.phase}`
		),
		'Largest shaders:',
		...c.largest.map((m, i) => `  ${i + 1}. ${m.stage} ${m.label || '(no label)'} ${kb(m.bytes)}`),
		`Shader set ${c.setHash}`
	];
	return lines.join('\n');
}

// ---- the browser half

const MEMORY_KEY = 'orbital.loadReport';

export function loadMemory(): LoadMemory {
	try {
		const raw = localStorage.getItem(MEMORY_KEY);
		const m = raw ? (JSON.parse(raw) as Partial<LoadMemory>) : {};
		return { sets: m.sets ?? {}, modules: m.modules ?? {} };
	} catch {
		return { sets: {}, modules: {} };
	}
}

export function saveMemory(m: LoadMemory): void {
	try {
		localStorage.setItem(MEMORY_KEY, JSON.stringify(m));
	} catch {
		// private mode or full: the next report says "first" again
	}
}

let angleName: string | null | undefined;
/** The WebGL renderer string from a throwaway context, asked once (it names ANGLE's backend). */
function angle(): string | null {
	if (angleName !== undefined) return angleName;
	angleName = null;
	try {
		const gl = document.createElement('canvas').getContext('webgl2');
		const ext = gl?.getExtension('WEBGL_debug_renderer_info');
		if (gl && ext) angleName = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
		else if (gl) angleName = String(gl.getParameter(gl.RENDERER));
		gl?.getExtension('WEBGL_lose_context')?.loseContext();
	} catch {
		angleName = null;
	}
	return angleName;
}

export function readEnvironment(): LoadEnvironment {
	const nav = navigator as Navigator & {
		userAgentData?: { platform?: string };
		deviceMemory?: number;
	};
	return {
		userAgent: nav.userAgent,
		platform: nav.userAgentData?.platform ?? '',
		cores: nav.hardwareConcurrency ?? null,
		memoryGB: nav.deviceMemory ?? null,
		angle: angle(),
		build: new URL(import.meta.url).pathname.split('/').pop() ?? '',
		origin: location.origin
	};
}
