/**
 * The map pick of a panel's `pick` node (plan 366, ADR 0307): pressing the node arms it; the
 * flight loop gives the next map click on a body to it (and opens the map if it is not); a click
 * off every body, Escape or a second press cancels. One pick at a time.
 */
import type { MapPick } from '@orbital/core';

export interface ArmedPick {
	/** Which node armed it: `<panel id>/<node path>`. */
	key: string;
	hint: string;
	run(pick: MapPick): void;
}

class PickTool {
	armed = $state<ArmedPick | null>(null);
	#onArm = new Set<() => void>();

	/** Arm `pick`, or cancel when the same node is pressed again. */
	toggle(pick: ArmedPick): void {
		if (this.armed?.key === pick.key) {
			this.armed = null;
			return;
		}
		this.armed = pick;
		for (const f of this.#onArm) f();
	}

	cancel(): void {
		this.armed = null;
	}

	/** Give a map click to the armed pick: true when it took it (a body was hit or it was cancelled). */
	take(hit: MapPick | null): boolean {
		const a = this.armed;
		if (!a) return false;
		this.armed = null;
		if (hit) a.run(hit);
		return true;
	}

	/** Called when a pick is armed (the flight loop opens the map); returns the unsubscribe. */
	onArm(f: () => void): () => void {
		this.#onArm.add(f);
		return () => this.#onArm.delete(f);
	}
}

export const pickTool = new PickTool();
