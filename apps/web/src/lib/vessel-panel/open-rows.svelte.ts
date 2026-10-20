/** The vessel panel's open rows, per vessel, for as long as the page lives (plan 256). */
import { isOpenRow, withRow, type OpenRows } from './part-summary';

class OpenRowStore {
	#state = $state.raw<OpenRows>(new Map());

	isOpen(vessel: string, key: string, fallback: boolean): boolean {
		return isOpenRow(this.#state, vessel, key, fallback);
	}

	set(vessel: string, key: string, open: boolean): void {
		// the player's choice is stored even when it equals the default, so a later default change does not undo it
		if (this.#state.get(vessel)?.has(`${open ? '+' : '-'}${key}`)) return;
		this.#state = withRow(this.#state, vessel, key, open);
	}
}

export const openRows = new OpenRowStore();
