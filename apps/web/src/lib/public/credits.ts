/**
 * Who made what the game stands on (plan 023). Licences are read from each package's own
 * `package.json`. The game's own licence is Apache-2.0 (ADR 0106, plan 075).
 */
export interface Credit {
	name: string;
	what: string;
	licence: string;
	url: string;
	/**
	 * Copyright line the licence asks to travel with the work. The fonts' OFL 1.1 (condition 2)
	 * requires it with the font files, which ship with this page.
	 */
	copyright?: string;
}

/** SPDX id of the game's licence (ADR 0106). */
export const GAME_LICENCE = 'Apache-2.0';
/** Full text of the game's licence; the repository's `LICENSE` is the same text. */
export const GAME_LICENCE_URL = 'https://www.apache.org/licenses/LICENSE-2.0';
/** Full text of the fonts' licence. */
export const OFL_URL = 'https://openfontlicense.org/open-font-license-official-text/';

export const CREDITS: readonly Credit[] = [
	{
		name: 'Three.js',
		what: '3D rendering',
		licence: 'MIT',
		url: 'https://threejs.org'
	},
	{
		name: 'Rapier',
		what: 'Rigid-body physics (WebAssembly)',
		licence: 'Apache-2.0',
		url: 'https://rapier.rs'
	},
	{
		name: 'QuickJS (quickjs-emscripten)',
		what: 'The sandbox that runs your scripts',
		licence: 'MIT',
		url: 'https://github.com/justjake/quickjs-emscripten'
	},
	{
		name: 'Svelte and SvelteKit',
		what: 'The interface',
		licence: 'MIT',
		url: 'https://svelte.dev'
	},
	{
		name: 'Zod',
		what: 'Validation of saves, mods and settings',
		licence: 'MIT',
		url: 'https://zod.dev'
	},
	{
		name: 'Barlow Semi Condensed',
		what: 'Interface font',
		licence: 'SIL Open Font License 1.1',
		url: 'https://github.com/jpt/barlow',
		copyright: 'Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow)'
	},
	{
		name: 'IBM Plex Mono',
		what: 'Numbers font',
		licence: 'SIL Open Font License 1.1',
		url: 'https://github.com/IBM/plex',
		copyright: 'Copyright 2017 IBM Corp. All rights reserved.'
	}
];
