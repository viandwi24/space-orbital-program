/**
 * The public roadmap (plan 023, ADR 0048): what comes after 1.0, in the player's words. Every item
 * points at a plan file under `docs/plans/`; `roadmap.test.ts` checks that the file exists and is
 * not yet done, so the page cannot promise a plan that does not exist or already shipped.
 */
export type RoadmapArea = 'Flight and look' | 'Building' | 'Scripting and mods' | 'Platform';

export interface RoadmapItem {
	/** Plan number (`docs/plans/NNN-*.md`). */
	plan: string;
	title: string;
	/** What the player gets. */
	gives: string;
	area: RoadmapArea;
}

export const ROADMAP: readonly RoadmapItem[] = [
	{
		plan: '055',
		title: 'Phones and real-device testing',
		gives:
			'A compact layout for phones, and runs on real tablets and phones. Tablets in landscape work today with on-screen controls; phones show a notice.',
		area: 'Platform'
	},
	{
		plan: '067',
		title: 'Floating and sinking',
		gives:
			'Lakes and the sea stop being solid: a capsule that splashes down floats, a heavy rocket sinks, and a hard landing on water hurts less than on rock.',
		area: 'Flight and look'
	},
	{
		plan: '066',
		title: 'Frame times on more laptops',
		gives:
			'The graphics presets are measured and tuned on Apple M1 and M2 laptops, integrated Intel graphics and a phone, so the game picks the right one for your machine.',
		area: 'Platform'
	},
	{
		plan: '070',
		title: 'Communications',
		gives:
			'Antennas and a signal that can be lost: out of range, behind a planet or inside the glow of a re-entry, when a vessel without a link stops answering commands.',
		area: 'Flight and look'
	},
	{
		plan: '060',
		title: 'Stones you can land on',
		gives:
			'Boulders on the moon become solid: a landing leg that comes down on one rests on it, or the lander tips.',
		area: 'Flight and look'
	},
	{
		plan: '069',
		title: 'Catalogue groups of your own',
		gives:
			'A mod can add a group to the parts catalogue with its own name and icon, next to the stock ones, instead of choosing one of the nine that exist.',
		area: 'Building'
	},
	{
		plan: '063',
		title: 'Aeroplanes you can fly',
		gives:
			'Wheels and a runway, trim and flaps, and read-outs for angle of attack and airspeed, so a craft built with wings takes off, flies and lands.',
		area: 'Flight and look'
	},
	{
		plan: '065',
		title: 'Richer mod models',
		gives:
			'Mod models that fold out like landing legs, and compressed textures so bigger models stay light.',
		area: 'Scripting and mods'
	}
];

export const ROADMAP_AREAS: readonly RoadmapArea[] = [
	'Flight and look',
	'Building',
	'Scripting and mods',
	'Platform'
];
