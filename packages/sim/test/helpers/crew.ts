/** Seats for test vessels (plan 200, ADR 0216): a pod controls only with crew aboard. */
import type { Sim } from '../../src/index.ts';

/** Hires a pilot and returns the `crew` field that seats them in part `part` at `load-vessel`. */
export function pilotFor(sim: Sim, part = 0): { crew: Array<{ member: string; part: number }> } {
	const before = new Set((sim.snapshot().crew ?? []).map((c) => c.id));
	const hired = sim.dispatch({ type: 'crew-hire', profession: 'pilot' });
	if (!hired.ok) throw new Error(hired.reason);
	const member = sim.snapshot().crew!.find((c) => !before.has(c.id))!.id;
	return { crew: [{ member, part }] };
}
