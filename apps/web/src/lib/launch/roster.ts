/**
 * The crew who can fly: the available members of the active world's newest save (plan 108, ADR
 * 0152 point 5). The Launch screen and, since plan 218, the Hangar's seats read it.
 */
import type { GameSave } from '../save/game-save';

export interface RosterMember {
	id: string;
	name: string;
	profession: string;
}

export async function loadRoster(saves: {
	refresh(): Promise<void>;
	entries: readonly ({ ok: true; meta: { id: string } } | { ok: false })[];
	read(id: string): Promise<GameSave>;
}): Promise<RosterMember[]> {
	try {
		await saves.refresh();
		const newest = saves.entries.find((e) => e.ok);
		if (!newest?.ok) return [];
		const save = await saves.read(newest.meta.id);
		return (save.sim.crew?.members ?? [])
			.filter((m) => m.status === 'available')
			.map((m) => ({ id: m.id, name: m.name, profession: m.profession }));
	} catch {
		return [];
	}
}
