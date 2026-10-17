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
		plan: '038',
		title: 'Lakes, rivers and a living launch site',
		gives:
			'Lakes in the lowlands, rivers that flow, waves that break on shores, and a launch site with moving machinery. Also frame-time measurements on more kinds of laptop.',
		area: 'Flight and look'
	},
	{
		plan: '050',
		title: 'Smoother on slower graphics hardware',
		gives:
			'A cheaper way to draw the planet so older laptops keep the frame rate on Medium, plus cloud shadows on Medium.',
		area: 'Flight and look'
	},
	{
		plan: '040',
		title: 'Wreckage, plasma and trails',
		gives:
			'Debris that stays on the ground after a crash, re-entry plasma that wraps your vessel, a trail that hangs in the air and engines with more than one nozzle.',
		area: 'Flight and look'
	},
	{
		plan: '052',
		title: 'Moon shadows and stones',
		gives:
			'Long shadows from crater rims, stones you can land next to, and room for more airless bodies.',
		area: 'Flight and look'
	},
	{
		plan: '034',
		title: 'More help while building',
		gives:
			'Mods can add their own part categories, a real trip planner replaces the rule-of-thumb delta-v estimate, and the stability read-out counts mod wings from the first day.',
		area: 'Building'
	},
	{
		plan: '041',
		title: 'Struts, fuel lines, wings',
		gives:
			'Struts to stiffen a rocket, fuel lines between side boosters, tilted parts and wings with lift for aircraft.',
		area: 'Building'
	},
	{
		plan: '057',
		title: 'Target markers and rendezvous aids',
		gives:
			'The target shown on the navball and the map, a closest approach that follows you across spheres of influence, and helpers to plan the burn that meets it.',
		area: 'Flight and look'
	},
	{
		plan: '036',
		title: 'A friendlier script editor',
		gives: 'Tab indentation, auto-indent, bracket matching and a pop-up API reference.',
		area: 'Scripting and mods'
	},
	{
		plan: '051',
		title: 'Mods with their own models',
		gives:
			'A mod can ship new part shapes or glTF models inside its package instead of reusing the stock shapes with new colours.',
		area: 'Scripting and mods'
	}
];

export const ROADMAP_AREAS: readonly RoadmapArea[] = [
	'Flight and look',
	'Building',
	'Scripting and mods',
	'Platform'
];
