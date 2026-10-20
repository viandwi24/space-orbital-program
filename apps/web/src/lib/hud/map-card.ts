/** The card a map click on a vessel opens (plan 250, rancangan §6.1): its name and Switch to. */
import type { TargetChoice } from '../target-model';

export interface MapCard {
	/** The vessel's entity id. */
	vessel: number;
	label: string;
	/** Where the click was, px over the canvas. */
	x: number;
	y: number;
}

/** The card for a picked target key (`vessel:12`), or null for a body, a port or an unknown vessel. */
export function mapCardFor(
	key: string,
	choices: readonly TargetChoice[],
	at: { x: number; y: number }
): MapCard | null {
	const m = /^vessel:(\d+)$/.exec(key);
	if (!m) return null;
	const choice = choices.find((c) => c.key === key);
	return choice ? { vessel: Number(m[1]), label: choice.label, ...at } : null;
}
