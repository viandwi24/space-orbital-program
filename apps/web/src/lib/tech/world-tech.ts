/**
 * A world's tech tree on the page (plan 105, ADR 0154 point 4): whether it is on, what is
 * researched (from the newest save), and which parts of a design are locked. Pure apart from
 * `loadWorldTech`, which reads the save store.
 */
import {
	lockedParts,
	nodeOfParts,
	SCIENCE_RULES,
	type PartDefinition,
	type TechNodeDefinition,
	type VesselDesign,
	type WorldInfo
} from '@orbital/core';
import type { GameSave } from '../save/game-save';

export interface WorldTech {
	on: boolean;
	researched: string[];
}

export const NO_TREE: WorldTech = { on: false, researched: [] };

/** From the world's newest save, else its start info (no research yet). */
export function worldTechOf(save: GameSave | undefined, info: WorldInfo | undefined): WorldTech {
	const rules = save?.sim.worldInfo.rules ?? info?.rules ?? {};
	return {
		on: rules[SCIENCE_RULES.techTree] === true,
		researched: [...(save?.sim.tech?.researched ?? [])]
	};
}

export interface DesignLock {
	/** Design part indices of the locked part. */
	parts: number[];
	title: string;
	node: string;
}

/** The locked parts of `design` in a world with the tree on (one entry per part kind). */
export function designLocks(
	design: Pick<VesselDesign, 'parts'>,
	nodes: readonly TechNodeDefinition[],
	parts: { list(): PartDefinition[]; get(id: string): PartDefinition | undefined },
	tech: WorldTech
): DesignLock[] {
	if (!tech.on) return [];
	const locked = lockedParts(
		design.parts.map((p) => p.part),
		nodeOfParts(nodes, parts.list()),
		tech.researched
	);
	return locked.map(({ part, node }) => ({
		parts: design.parts.filter((p) => p.part === part).map((p) => p.index),
		title: parts.get(part)?.title ?? part,
		node: node.label
	}));
}

/** The active world's tech state from its newest save, else its start info. */
export async function loadWorldTech(
	saves: {
		refresh(): Promise<void>;
		entries: readonly ({ ok: true; meta: { id: string } } | { ok: false })[];
		read(id: string): Promise<GameSave>;
		worldStartInfo(worldId: string): Promise<WorldInfo | undefined>;
	},
	worldId: string
): Promise<WorldTech> {
	try {
		await saves.refresh();
		const newest = saves.entries.find((e) => e.ok);
		const save = newest?.ok ? await saves.read(newest.meta.id) : undefined;
		return worldTechOf(save, save ? undefined : await saves.worldStartInfo(worldId));
	} catch {
		return NO_TREE;
	}
}
