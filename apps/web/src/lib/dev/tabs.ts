/** The developer tools' tabs (plan 375): one per page under `/developer`. */
export interface DevTab {
	id: 'overview' | 'parts' | 'crew' | 'hangar' | 'blueprints' | 'mods';
	label: string;
	path: '/developer' | `/developer/${'parts' | 'crew' | 'hangar' | 'blueprints' | 'mods'}`;
	/** A 3D tool that fills the page under the bar (no scrolling column). */
	full: boolean;
	/** Not built yet: left out of the bar. */
	soon?: boolean;
}

export const DEV_TABS: readonly DevTab[] = [
	{ id: 'overview', label: 'Overview', path: '/developer', full: false },
	{ id: 'parts', label: 'Parts', path: '/developer/parts', full: true },
	{ id: 'crew', label: 'Crew', path: '/developer/crew', full: true },
	{ id: 'hangar', label: 'Hangar', path: '/developer/hangar', full: true },
	{ id: 'blueprints', label: 'Blueprints', path: '/developer/blueprints', full: false },
	{ id: 'mods', label: 'Mods', path: '/developer/mods', full: false }
];

/** The tabs the bar shows. */
export const shownTabs = (): DevTab[] => DEV_TABS.filter((t) => !t.soon);

/** The tab of a pathname (with or without the app's base path and a trailing slash). */
export function devTabOf(pathname: string): DevTab | undefined {
	const at = pathname.indexOf('/developer');
	if (at < 0) return undefined;
	const rest = pathname.slice(at).replace(/\/+$/, '');
	return DEV_TABS.find((t) => t.path === rest);
}

/**
 * The viewer for a kind of content, as the Mods page names them (`parts`, `crew`, `blueprints`,
 * `programs`, `panels`, `overlays`, `mods`): kinds without a viewer of their own open the loader log.
 */
export function devTabForKind(kind: string): DevTab['path'] {
	switch (kind) {
		case 'parts':
		case 'part':
			return '/developer/parts';
		case 'crew':
			return '/developer/crew';
		case 'blueprints':
		case 'blueprint':
			return '/developer/blueprints';
		case 'hangar':
			return '/developer/hangar';
		default:
			return '/developer/mods';
	}
}
