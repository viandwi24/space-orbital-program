/**
 * Rate limit of the image-based light's recaptures (plan 252, ADR 0232). Each capture renders the sky
 * to a cube and prefilters it with PMREM, 5 to 6 ms in one frame (journal 048); the environment key
 * changes with every 2 degrees of sun and every half octave of altitude, in quick succession on an
 * ascent or under warp. A change of key inside `ENV_RECAPTURE_MIN_MS` of the last capture waits: the
 * old cube is lit a little off for that long, then the next frame that asks takes a capture of the key
 * it has by then. The first capture and a different graphics preset are never held back.
 */

/** Shortest time between two captures, ms. A starting value, tuned with plan 251's frame-interval numbers. */
export const ENV_RECAPTURE_MIN_MS = 1500;

export class RecaptureGate {
	private key = '';
	private preset = '';
	private at = Number.NEGATIVE_INFINITY;

	constructor(private readonly minMs = ENV_RECAPTURE_MIN_MS) {}

	/** Whether a capture for `key` under `preset` should run at `now` (ms); `have` is whether a cube exists. */
	due(key: string, preset: string, now: number, have: boolean): boolean {
		if (!have || preset !== this.preset) return true;
		if (key === this.key) return false;
		return now - this.at >= this.minMs;
	}

	/** Records that a capture for `key` under `preset` ran at `now`. */
	captured(key: string, preset: string, now: number): void {
		this.key = key;
		this.preset = preset;
		this.at = now;
	}

	/** The next capture runs whatever the time (a forced refresh). */
	reset(): void {
		this.key = '';
		this.preset = '';
		this.at = Number.NEGATIVE_INFINITY;
	}
}
