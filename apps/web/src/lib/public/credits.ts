/**
 * Who made what the game stands on (plan 023). Licences are read from each package's own
 * `package.json`; the game's own licence is the human's decision and reads "to be decided".
 */
export interface Credit {
	name: string;
	what: string;
	licence: string;
	url: string;
}

export const GAME_LICENCE = 'To be decided before the public release';

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
		url: 'https://github.com/jpt/barlow'
	},
	{
		name: 'IBM Plex Mono',
		what: 'Numbers font',
		licence: 'SIL Open Font License 1.1',
		url: 'https://github.com/IBM/plex'
	}
];
