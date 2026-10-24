/**
 * What the Debug panel shows about the renderer's pipelines and looks (plans 410, 411): the pipelines
 * compiled after the load (in play, where a compile is a hitch) and each look's cost and relevance level.
 * Pure: the panel reads them from the world renderer.
 */

/** The fields of a compile-report pipeline this reads. */
export interface PipelineLine {
	label: string;
	phase: string;
	/** `performance.now()` when it was asked for. */
	at: number;
}

export interface PlayCompiles {
	/** Pipelines asked for after the load (phase `play`). */
	count: number;
	/** Labels of the latest few, newest last. */
	last: string[];
}

/** The pipelines compiled in play, and the labels of the last `lastCount` of them by time asked. */
export function compilesInPlay(pipelines: readonly PipelineLine[], lastCount = 5): PlayCompiles {
	const play = pipelines.filter((p) => p.phase === 'play');
	const latest = [...play].sort((a, b) => a.at - b.at).slice(-lastCount);
	return { count: play.length, last: latest.map((p) => p.label || '(no label)') };
}

/** The text of the Debug row: "none" or the count and the latest labels. */
export function playCompilesText(c: PlayCompiles): string {
	if (c.count === 0) return 'none: every pipeline was built at the load';
	return `${c.count}: ${c.last.join(', ')}`;
}

/** One look's cost this frame and its relevance level (0 off or a baked stand-in, 1 cheap, 2 full). */
export interface LookCost {
	look: string;
	ms: number;
	level: 0 | 1 | 2;
}

const LEVEL_WORDS = ['off', 'cheap', 'full'] as const;

/** The lines of the per-look readout, the costliest first; empty before the renderer reports any. */
export function lookCostLines(costs: readonly LookCost[]): string[] {
	return [...costs]
		.sort((a, b) => b.ms - a.ms)
		.map(
			(c) => `${c.look} ${c.ms > 0 ? `${c.ms.toFixed(2)} ms` : '– ms'} · ${LEVEL_WORDS[c.level]}`
		);
}

/** The total of the looks' costs, ms. */
export const lookCostTotal = (costs: readonly LookCost[]): number =>
	costs.reduce((sum, c) => sum + c.ms, 0);
