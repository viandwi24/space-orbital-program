/**
 * Enter a world (plan 087, ADR 0143 point 2): it becomes the active world and moves to the top of the
 * list, then its newest save opens, or the VAB when it has none (its first launch flies in it).
 */
import type { Worlds } from './worlds';
import { setActiveWorld } from './worlds';

export async function enterWorld(
	worlds: Worlds,
	id: string,
	go: (url: string) => void | Promise<void>
): Promise<void> {
	setActiveWorld(id);
	await worlds.touch(id);
	const newest = (await worlds.saves(id))[0];
	await go(newest ? `/flight?load=${encodeURIComponent(newest.id)}` : '/vab');
}
