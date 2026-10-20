/** The Hangar panel's open and closed sections, remembered between visits (plan 255). */
import { FOLD_KEY, defaultFolds, parseFolds, serialiseFolds, type FoldId } from './panel-model';

class PanelFolds {
	#state = $state(defaultFolds());
	#loaded = false;

	private load(): void {
		if (this.#loaded) return;
		this.#loaded = true;
		try {
			this.#state = parseFolds(globalThis.localStorage?.getItem(FOLD_KEY));
		} catch {
			// no storage (private window, server render): the defaults
		}
	}

	isOpen(id: FoldId): boolean {
		this.load();
		return this.#state[id];
	}

	set(id: FoldId, open: boolean): void {
		this.load();
		if (this.#state[id] === open) return;
		this.#state[id] = open;
		try {
			globalThis.localStorage?.setItem(FOLD_KEY, serialiseFolds(this.#state));
		} catch {
			// not remembered
		}
	}
}

export const panelFolds = new PanelFolds();
