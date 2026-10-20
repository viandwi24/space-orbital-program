/**
 * The crew of one part for the inspector (plan 254): who sits in it, how many seats it has, and the
 * other seats of the vessel a member may move to (`crew-transfer`, capacity checked by the sim).
 */
import type { EntityId, PartDefinition, VesselSnapshot } from '@orbital/core';

export interface SeatMember {
	member: string;
	name: string;
}
export interface TransferTarget {
	part: EntityId;
	title: string;
	/** Free seats there. */
	free: number;
}
export interface CrewSeats {
	capacity: number;
	aboard: SeatMember[];
	targets: TransferTarget[];
}

/** The seats of `part`, or null for a part without any (the inspector shows no crew section). */
export function crewSeats(
	vessel: Pick<VesselSnapshot, 'parts' | 'crew'>,
	roster: ReadonlyArray<{ id: string; name: string }> | undefined,
	parts: { get(id: string): Pick<PartDefinition, 'crewCapacity' | 'title'> | undefined },
	part: EntityId
): CrewSeats | null {
	const here = vessel.parts.find((p) => p.id === part);
	const capacity = here ? (parts.get(here.definition)?.crewCapacity ?? 0) : 0;
	if (capacity <= 0) return null;
	const nameOf = (id: string): string => roster?.find((r) => r.id === id)?.name ?? id;
	const seated = (id: EntityId) => (vessel.crew ?? []).filter((c) => c.part === id);
	const targets: TransferTarget[] = [];
	for (const p of vessel.parts) {
		if (p.id === part) continue;
		const def = parts.get(p.definition);
		const room = (def?.crewCapacity ?? 0) - seated(p.id).length;
		if (def && room > 0) targets.push({ part: p.id, title: def.title, free: room });
	}
	return {
		capacity,
		aboard: seated(part).map((c) => ({ member: c.member, name: nameOf(c.member) })),
		targets
	};
}
