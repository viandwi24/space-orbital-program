/**
 * What the flight page shows while the renderer compiles its shader programs in the background
 * (plan 038, ADR 0074): a small badge with a label and a percentage. The renderer owns the counting
 * (`PrecompileTracker`); this turns its progress into the badge's text and decides when to show it.
 */
import { precompileLabel, type PrecompileProgress } from '@orbital/renderer/precompile-progress';

export interface GraphicsBadge {
	label: string;
	/** Whole percent, 0 to 99 while working. */
	percent: number;
	/** 0 to 1, for the bar. */
	fraction: number;
}

/** The badge for a progress report, or `null` when there is nothing to show (not started, or done). */
export function graphicsBadge(progress: PrecompileProgress | null): GraphicsBadge | null {
	if (!progress || progress.stage === 'done' || progress.total === 0) return null;
	const fraction = Math.min(Math.max(progress.fraction, 0), 0.999);
	return {
		label: precompileLabel(progress.stage),
		percent: Math.floor(fraction * 100),
		fraction
	};
}
