/** Stages fired per vessel, folded from the host's `stage` messages (pure, testable). */
import type { StageEvent } from './sim-client';

/** Vessel id -> number of stages fired (highest fired stage index + 1). */
export type StageProgress = Readonly<Record<number, number>>;

export const noStages: StageProgress = {};

export function reduceStages(progress: StageProgress, event: StageEvent): StageProgress {
	const fired = event.stage + 1;
	if ((progress[event.vessel] ?? 0) >= fired) return progress;
	return { ...progress, [event.vessel]: fired };
}

export const stagesFiredBy = (progress: StageProgress, vessel: number | null): number =>
	vessel === null ? 0 : (progress[vessel] ?? 0);
