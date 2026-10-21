/**
 * Progress of the shader precompile (plan 038, ADR 0074): a counter of units of work that the host
 * shows as a badge. Pure, tested in Bun; `renderer.ts` feeds it.
 */

/** In order; `warm` (plan 340) draws the session's views once, after which the world is ready to show. */
export type PrecompileStage = 'programs' | 'warm' | 'maps' | 'vegetation' | 'done';

export interface PrecompileProgress {
	/** Units finished and expected so far; `total` can still grow while a stage is being planned. */
	done: number;
	total: number;
	stage: PrecompileStage;
	/** Share of the work finished, 0 to 1; 1 only when `stage` is `done`. */
	fraction: number;
}

const LABELS: Record<PrecompileStage, string> = {
	programs: 'Compiling graphics programs',
	warm: 'Preparing views',
	maps: 'Preparing terrain maps',
	vegetation: 'Preparing scenery',
	done: 'Graphics ready'
};

/** What the badge says for a stage. */
export const precompileLabel = (stage: PrecompileStage): string => LABELS[stage];

/** Counts units of work and tells listeners after every change. */
export class PrecompileTracker {
	private done = 0;
	private total = 0;
	private stage: PrecompileStage = 'programs';
	private finished = false;
	private readonly listeners = new Set<(p: PrecompileProgress) => void>();

	/** The state now. `fraction` stays under 1 until `complete`. */
	progress(): PrecompileProgress {
		const fraction = this.finished
			? 1
			: this.total === 0
				? 0
				: Math.min(this.done / this.total, 0.999);
		return { done: this.done, total: this.total, stage: this.stage, fraction };
	}

	/** Calls `listener` now and after every change; returns the way to stop. */
	subscribe(listener: (p: PrecompileProgress) => void): () => void {
		this.listeners.add(listener);
		listener(this.progress());
		return () => this.listeners.delete(listener);
	}

	/** `n` more units are expected. */
	expect(n: number): void {
		if (this.finished) return;
		this.total += n;
		this.emit();
	}

	/** `n` units are finished. */
	finish(n = 1): void {
		if (this.finished) return;
		this.done = Math.min(this.done + n, this.total);
		this.emit();
	}

	setStage(stage: PrecompileStage): void {
		if (this.finished) return;
		this.stage = stage;
		this.emit();
	}

	/** Everything is done: `done` equals `total` and the stage is `done`. */
	complete(): void {
		if (this.finished) return;
		this.finished = true;
		this.done = this.total;
		this.stage = 'done';
		this.emit();
	}

	get isComplete(): boolean {
		return this.finished;
	}

	private emit(): void {
		const p = this.progress();
		for (const l of this.listeners) l(p);
	}
}
