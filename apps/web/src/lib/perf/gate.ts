/**
 * The performance gate's numbers (plan 411): what a scene run is summarised to, the budgets it is
 * held to, and the table that is printed. Pure: `scripts/perf-gate.ts` drives the browser and calls
 * this; the unit test covers the comparison.
 */

/** A device tier and the frame it is held to (ADR 0330): the M5 locks 120, the base M2 and mid-range Windows 60. */
export const TIERS = {
	m5: { label: 'M5 MacBook Pro', targetHz: 120 },
	m2: { label: 'base M2', targetHz: 60 },
	windows: { label: 'mid-range Windows', targetHz: 60 }
} as const;
export type TierId = keyof typeof TIERS;

export const SCENES = [
	'pad',
	'3km',
	'12km',
	'sea',
	'orbit',
	're-entry',
	'space-center',
	'hangar'
] as const;
export type SceneId = (typeof SCENES)[number];

/** The scenes of `--quick`, for the owner to run on a device: the three that tell most. */
export const QUICK_SCENES: readonly SceneId[] = ['pad', 'orbit', 'space-center'];

export type Backend = 'webgpu' | 'webgl';

/** What one scene run, on one backend and governor setting, measured. */
export interface SceneRun {
	scene: SceneId;
	backend: Backend;
	governor: 'off' | 'on';
	/** Frames sampled and the seconds they cover. */
	frames: number;
	seconds: number;
	/** Frame interval percentiles, ms. */
	p50: number;
	p95: number;
	/** Frames over twice the target interval, per minute. */
	longPerMinute: number;
	/** Pipelines compiled while sampling (after the load). */
	compilesInPlay: number;
	/** The JS heap over the run, MB. */
	heapMin: number;
	heapMax: number;
}

/** The limits of one scene. A field left out is not held. */
export interface SceneBudget {
	/** Frame interval p95, ms: the tier's interval; the margin lies over it. */
	p95Ms?: number;
	/** Frames over twice the interval, per minute. */
	longPerMinute?: number;
	/** Pipelines compiled in play. */
	compilesInPlay?: number;
	/** Heap max less heap min, MB. */
	heapRangeMb?: number;
}

export interface Budgets {
	/** `target`: derived from the tier's frame interval (ADR 0330); `measured`: frozen from a run with `--freeze`. */
	basis: 'target' | 'measured';
	/** Allowed excess over a time or heap budget before the gate fails, as a share (0.1 = 10 %). */
	margin: number;
	tiers: Partial<
		Record<TierId, { default: SceneBudget; scenes?: Partial<Record<SceneId, SceneBudget>> }>
	>;
}

/** The nearest-rank percentile (0..1) of `values`; 0 for none. */
export function percentile(values: readonly number[], p: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.max(0, Math.ceil(Math.min(Math.max(p, 0), 1) * sorted.length) - 1)]!;
}

/** The summary of `intervals` (ms between frames) sampled over `seconds` for a display held to `targetHz`. */
export function summarizeFrames(
	intervals: readonly number[],
	seconds: number,
	targetHz: number
): Pick<SceneRun, 'frames' | 'seconds' | 'p50' | 'p95' | 'longPerMinute'> {
	const long = (2 * 1000) / targetHz;
	const over = intervals.filter((x) => x > long).length;
	return {
		frames: intervals.length,
		seconds,
		p50: percentile(intervals, 0.5),
		p95: percentile(intervals, 0.95),
		longPerMinute: seconds > 0 ? (over * 60) / seconds : 0
	};
}

/** The budget of `scene` on `tier`: the tier's default with the scene's own limits over it. */
export function budgetFor(budgets: Budgets, tier: TierId, scene: SceneId): SceneBudget {
	const t = budgets.tiers[tier];
	return { ...(t?.default ?? {}), ...(t?.scenes?.[scene] ?? {}) };
}

/** Why `run` is over its budget, one line each; empty when it passes. */
export function failures(run: SceneRun, budget: SceneBudget, margin: number): string[] {
	const out: string[] = [];
	const slack = 1 + margin;
	if (budget.p95Ms !== undefined && run.p95 > budget.p95Ms * slack)
		out.push(`p95 ${run.p95.toFixed(1)} ms is over ${(budget.p95Ms * slack).toFixed(1)} ms`);
	if (budget.longPerMinute !== undefined && run.longPerMinute > budget.longPerMinute)
		out.push(
			`${run.longPerMinute.toFixed(1)} long frames a minute, budget ${budget.longPerMinute}`
		);
	if (budget.compilesInPlay !== undefined && run.compilesInPlay > budget.compilesInPlay)
		out.push(`${run.compilesInPlay} pipelines compiled in play, budget ${budget.compilesInPlay}`);
	if (budget.heapRangeMb !== undefined && run.heapMax - run.heapMin > budget.heapRangeMb * slack)
		out.push(
			`heap range ${(run.heapMax - run.heapMin).toFixed(0)} MB is over ${(budget.heapRangeMb * slack).toFixed(0)} MB`
		);
	return out;
}

/** The budgets a run freezes: what it measured, with the tier's interval as a floor so a lucky scene is not held to its luck. */
export function freeze(runs: readonly SceneRun[], tier: TierId, margin: number): Budgets {
	const targetMs = 1000 / TIERS[tier].targetHz;
	const scenes: Partial<Record<SceneId, SceneBudget>> = {};
	for (const r of runs) {
		const old = scenes[r.scene];
		const p95Ms = Math.max(old?.p95Ms ?? 0, r.p95, targetMs);
		scenes[r.scene] = {
			p95Ms: Math.round(p95Ms * 10) / 10,
			longPerMinute: Math.max(old?.longPerMinute ?? 0, Math.ceil(r.longPerMinute)),
			compilesInPlay: Math.max(old?.compilesInPlay ?? 0, r.compilesInPlay),
			heapRangeMb: Math.max(old?.heapRangeMb ?? 0, Math.ceil(r.heapMax - r.heapMin))
		};
	}
	return { basis: 'measured', margin, tiers: { [tier]: { default: {}, scenes } } };
}

/** The table the gate prints (and `--quick` for the owner to paste back). */
export function formatTable(
	runs: readonly SceneRun[],
	check: (run: SceneRun) => string[] = () => []
): string {
	const head = [
		'scene',
		'backend',
		'governor',
		'frames',
		'p50 ms',
		'p95 ms',
		'long/min',
		'compiles',
		'heap MB',
		'result'
	];
	const rows = runs.map((r) => {
		const bad = check(r);
		return [
			r.scene,
			r.backend,
			r.governor,
			String(r.frames),
			r.p50.toFixed(1),
			r.p95.toFixed(1),
			r.longPerMinute.toFixed(1),
			String(r.compilesInPlay),
			`${r.heapMin.toFixed(0)}-${r.heapMax.toFixed(0)}`,
			bad.length === 0 ? 'ok' : `FAIL: ${bad.join('; ')}`
		];
	});
	const width = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]!.length)));
	const line = (cells: string[]) => cells.map((c, i) => c.padEnd(width[i]!)).join(' | ');
	return [line(head), width.map((w) => '-'.repeat(w)).join('-|-'), ...rows.map(line)].join('\n');
}
