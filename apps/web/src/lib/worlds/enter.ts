/**
 * Enter a world (plan 087, ADR 0143 point 2; plan 091, ADR 0117): it becomes the active world and
 * moves to the top of the list, then its Space Center opens (saves load from the Load dialog).
 */
import { resolve } from '$app/paths';
import type { Worlds } from './worlds';
import { setActiveWorld } from './worlds';

export async function enterWorld(
	worlds: Worlds,
	id: string,
	go: (url: string) => void | Promise<void>
): Promise<void> {
	setActiveWorld(id);
	await worlds.touch(id);
	await go(resolve('/(world)/space-center'));
}
