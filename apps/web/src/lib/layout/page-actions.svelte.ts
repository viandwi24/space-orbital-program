/**
 * The menu bar's page actions slot (plan 204, rancangan §2.4): the page that is shown puts its
 * actions here (the Hangar: New · Open · Save · Launch) and takes them away when it goes.
 */
import type { Snippet } from 'svelte';

class PageActions {
	current = $state.raw<Snippet | null>(null);
}

export const pageActions = new PageActions();
