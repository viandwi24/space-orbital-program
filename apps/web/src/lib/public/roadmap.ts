/**
 * The public roadmap (plan 023, ADR 0048; by phase since plan 076, ADR 0108): what comes after 1.0,
 * in the player's words, phase by phase, without dates. Every item points at a plan file under
 * `docs/plans/`; `roadmap.test.ts` checks that the file exists. Labels follow the plan files' status
 * at build time (`virtual:plan-status`): a done plan shows as shipped until it moves to `SHIPPED`.
 */
export type RoadmapPhase =
	| 'Product'
	| 'Foundation'
	| 'Worlds and Space Center'
	| 'Career'
	| 'Network and control'
	| 'Time and the real sky'
	| 'Living world';

/** The phases in order (ADR 0108 point 2; `docs/STATUS.md` "Next: foundation roadmap"). */
export const ROADMAP_PHASES: readonly RoadmapPhase[] = [
	'Product',
	'Foundation',
	'Worlds and Space Center',
	'Career',
	'Network and control',
	'Time and the real sky',
	'Living world'
];

export type RoadmapLabel = 'shipped' | 'in progress' | 'planned' | 'exploring';

export interface RoadmapItem {
	/** Plan number (`docs/plans/NNN-*.md`). */
	plan: string;
	title: string;
	/** What the player gets. */
	gives: string;
	phase: RoadmapPhase;
	/** Most risk, labelled exploring until its phase starts (ADR 0108 point 3). */
	exploring?: boolean;
}

/** The items ADR 0108 names as exploring: n-body, discovery science, comms tiers 5 and 6, bases, the living world. */
export const EXPLORING_PLANS: readonly string[] = ['125', '129', '120', '121', '128', '126'];

export const ROADMAP: readonly RoadmapItem[] = [
	// Product
	{
		plan: '066',
		title: 'Frame times on more laptops',
		gives:
			'The graphics presets are measured and tuned on Apple M1 and M2 laptops, integrated Intel graphics and a phone, so the game picks the right one for your machine.',
		phase: 'Product'
	},
	{
		plan: '073',
		title: 'Phones',
		gives:
			'A compact flight screen and hangar for phones, once the game has been tried on real phones. Tablets in landscape work today with on-screen controls; phones show a notice that says what to do.',
		phase: 'Product'
	},
	{
		plan: '065',
		title: 'Richer mod models',
		gives:
			'Mod models that fold out like landing legs, and compressed textures so bigger models stay light.',
		phase: 'Product'
	},
	// Foundation
	{
		plan: '085',
		title: 'Tilted planets',
		gives:
			'Planets can lean on their axis: launch sites, landed vessels and the navball all follow the tilt, ready for seasons later.',
		phase: 'Foundation'
	},
	// Worlds and Space Center
	{
		plan: '088',
		title: 'A new flight screen',
		gives:
			'The flight instruments in the new look: a navball module with stability assist, a staging panel, the world and the time at the top, a calm toolbar.',
		phase: 'Worlds and Space Center'
	},
	{
		plan: '089',
		title: 'New menus and pages',
		gives:
			'The home screen, settings, pause menu and these public pages in the same calm look as the flight screen.',
		phase: 'Worlds and Space Center'
	},
	{
		plan: '091',
		title: 'The Space Center',
		gives:
			'A Space Center you walk around in 3D: place buildings on a grid, see what needs attention, and open each building from it.',
		phase: 'Worlds and Space Center'
	},
	{
		plan: '093',
		title: 'A new hangar',
		gives:
			'The vehicle assembly in the new layout: parts by category on a rail, the vessel in the middle, stages and checks at hand.',
		phase: 'Worlds and Space Center'
	},
	{
		plan: '094',
		title: 'The launch screen',
		gives:
			'Choose the site, the pad or runway, the vessel and its crew before a launch, with the checks in one place.',
		phase: 'Worlds and Space Center'
	},
	{
		plan: '069',
		title: 'Catalogue groups of your own',
		gives:
			'A mod can add a group to the parts catalogue with its own name and icon, next to the stock ones, instead of choosing one of the nine that exist.',
		phase: 'Worlds and Space Center'
	},
	{
		plan: '063',
		title: 'Aeroplanes you can fly',
		gives:
			'Wheels and a runway, trim and flaps, and read-outs for angle of attack and airspeed, so a craft built with wings takes off, flies and lands.',
		phase: 'Worlds and Space Center'
	},
	// Career
	{
		plan: '096',
		title: 'Buildings that grow',
		gives:
			'Buildings cost money and time to build and upgrade, and their level sets how big a vessel, how many crew or how much data they handle.',
		phase: 'Career'
	},
	{
		plan: '099',
		title: 'Contracts',
		gives:
			'Offers from the world that pay in funds, science and reputation: reach an orbit, rescue a stranded crew member, place a satellite, build a station, dock two vessels.',
		phase: 'Career'
	},
	{
		plan: '100',
		title: 'Missions and a story',
		gives:
			'Written missions that lead from the first hop to the Moon, and mission packs that mods can add.',
		phase: 'Career'
	},
	{
		plan: '101',
		title: 'Strategies',
		gives:
			'Long-term policies in the Administration building that trade one resource for another, within limits.',
		phase: 'Career'
	},
	{
		plan: '102',
		title: 'Milestones and achievements',
		gives:
			"Firsts are recorded in your world's history, with achievements kept on your own machine.",
		phase: 'Career'
	},
	{
		plan: '103',
		title: 'Science',
		gives:
			'Experiments that depend on where you are and what you do, data to send home or carry back, and samples that need a ride.',
		phase: 'Career'
	},
	{
		plan: '104',
		title: 'Regions and body dossiers',
		gives:
			'Planets divided into regions worth visiting, and a dossier per body that fills in as you explore.',
		phase: 'Career'
	},
	{
		plan: '105',
		title: 'Tech tree and R&D',
		gives:
			'Unlock parts with science in a research building: 22 nodes over six tiers, every part in one of them, the tree shown as it grows.',
		phase: 'Career'
	},
	{
		plan: '097',
		title: 'Markets and production',
		gives:
			'Buy, sell and produce resources: one chain first, from raw material to rocket fuel, with prices that move.',
		phase: 'Career'
	},
	{
		plan: '107',
		title: 'Crew who need looking after',
		gives:
			'Life support, morale, rest and g-forces, each a world rule you can turn on, simplify or turn off.',
		phase: 'Career'
	},
	{
		plan: '108',
		title: 'The Astronaut Complex',
		gives:
			'Hire and train crew in their own building, and see who is aboard each vessel in a crew panel during flight.',
		phase: 'Career'
	},
	{
		plan: '109',
		title: 'Spacewalks',
		gives:
			'Crew step outside: climb, float with a jetpack, plant a flag and collect samples by hand.',
		phase: 'Career'
	},
	// Network and control
	{
		plan: '111',
		title: 'The vessel panel',
		gives:
			"A panel for the vessel you fly: its parts' actions, groups of switches, and its link to home.",
		phase: 'Network and control'
	},
	{
		plan: '112',
		title: 'A dock of panels',
		gives:
			'A rail of panels at the side of the screen that you choose and arrange, and mods can add their own.',
		phase: 'Network and control'
	},
	{
		plan: '113',
		title: 'Mission Center',
		gives:
			'One screen for the whole system: every vessel, its orbit, what is coming up and what needs you.',
		phase: 'Network and control'
	},
	{
		plan: '070',
		title: 'Communications',
		gives:
			'Antennas and a signal that can be lost: out of range, behind a planet or inside the glow of a re-entry, when a vessel without a link stops answering commands.',
		phase: 'Network and control'
	},
	{
		plan: '114',
		title: 'Antennas and ground stations',
		gives:
			'Probes need a link to home to be controlled: antennas, line of sight and ground stations around the planet.',
		phase: 'Network and control'
	},
	{
		plan: '116',
		title: 'Signal strength and data rates',
		gives:
			'Bigger antennas reach further and send data faster; distance and bands decide what gets through.',
		phase: 'Network and control'
	},
	{
		plan: '117',
		title: 'Relays and signal delay',
		gives:
			'Point dishes, route a signal through relays, and, if you choose, live with the delay of light across the system.',
		phase: 'Network and control'
	},
	{
		plan: '118',
		title: 'Planning a network',
		gives:
			'A contact timeline, a coverage map and a constellation planner, to place relays before you launch them.',
		phase: 'Network and control'
	},
	{
		plan: '119',
		title: 'Data that waits for a contact',
		gives: 'Vessels keep data and send it when a station comes into view.',
		phase: 'Network and control'
	},
	{
		plan: '120',
		title: 'Channels and interference',
		gives: 'Frequencies to license, interference between busy links, and encrypted channels.',
		phase: 'Network and control',
		exploring: true
	},
	{
		plan: '121',
		title: 'Voice and broadcasts',
		gives: 'Suit radios for crew outside, voice between vessels, and live broadcasts home.',
		phase: 'Network and control',
		exploring: true
	},
	// Time and the real sky
	{
		plan: '122',
		title: 'A Sun, seasons and tilt',
		gives:
			'The home planet orbits a Sun on a tilted axis: days and years that make sense, and seasons on the ground.',
		phase: 'Time and the real sky'
	},
	{
		plan: '123',
		title: 'Orbits that drift',
		gives:
			'Planets and moons follow their real slow changes over the years, and the Moon its own wobbles.',
		phase: 'Time and the real sky'
	},
	{
		plan: '124',
		title: 'The real solar system',
		gives:
			'Our solar system as a pack, at real size or rescaled for the stock rockets, on real dates and angles.',
		phase: 'Time and the real sky'
	},
	{
		plan: '125',
		title: 'Every body pulls (n-body)',
		gives:
			'A world option where every body pulls on every vessel, for Lagrange points and long, precise trajectories.',
		phase: 'Time and the real sky',
		exploring: true
	},
	// Living world
	{
		plan: '126',
		title: 'Other agencies',
		gives:
			'Other space programmes that launch real vessels, race you to firsts and compete for contracts.',
		phase: 'Living world',
		exploring: true
	},
	{
		plan: '127',
		title: 'Range safety',
		gives:
			'Safe launch directions from each site, and spent stages that must not fall on land or another site.',
		phase: 'Living world'
	},
	{
		plan: '128',
		title: 'Bases on other worlds',
		gives:
			'Land a base kit and build on another body, or leave parts on the surface as an outpost.',
		phase: 'Living world',
		exploring: true
	},
	{
		plan: '129',
		title: 'Discovery',
		gives: 'An option where what a planet holds is unknown until you find it.',
		phase: 'Living world',
		exploring: true
	},
	{
		plan: '130',
		title: 'Parts that can fail',
		gives: 'An option, off by default, where parts wear and can fail, and testing them pays off.',
		phase: 'Living world'
	},
	{
		plan: '131',
		title: 'Replays and challenges',
		gives: 'Record a flight, replay it, and share challenges as files.',
		phase: 'Living world'
	},
	{
		plan: '067',
		title: 'Floating and sinking',
		gives:
			'Lakes and the sea stop being solid: a capsule that splashes down floats, a heavy rocket sinks, and a hard landing on water hurts less than on rock.',
		phase: 'Living world'
	}
];

/** Shipped since 1.0 (curated): items leave `ROADMAP` for here when their plan is done. */
export const SHIPPED: readonly { plan: string; title: string; gives: string }[] = [
	{ plan: '074', title: 'A name', gives: 'The game is called Space Orbital Program.' },
	{
		plan: '086',
		title: 'A calmer look',
		gives: 'New colours, the Manrope typeface, a UI size setting and a high-contrast option.'
	},
	{
		plan: '087',
		title: 'Worlds',
		gives:
			'Create worlds with their own rules and start date; each keeps its own saves, and Continue takes you back to the last one.'
	},
	{
		plan: '081',
		title: 'Dates',
		gives: 'The time control shows the date in your world, and scripts can read it.'
	},
	{
		plan: '092',
		title: 'Choose where to build',
		gives:
			'Pick the Space Center site when you create a world, from templates with their trade-offs shown.'
	}
];

/** What changed on the roadmap: items moved, dropped or added, with the reason (ADR 0108 point 3). */
export const ROADMAP_NOTES: readonly { date: string; item: string; change: string }[] = [
	{
		date: '2026-10-17',
		item: 'The roadmap',
		change:
			'The plans after 1.0 are now the foundation roadmap, announced in full by phase; the old areas became phases.'
	},
	{
		date: '2026-10-18',
		item: 'The foundation roadmap',
		change:
			'Every plan of the six phases has shipped, the explored ones too (n-body gravity, bases, agencies, the comms tiers). Phones stay unsupported: the compact phone layout was closed without the device pass it needs.'
	}
];

/** The label shown for an item, from its plan file's status (`virtual:plan-status`). */
export function labelOf(
	item: Pick<RoadmapItem, 'plan' | 'exploring'>,
	status: string | undefined
): RoadmapLabel {
	if (status === 'done') return 'shipped';
	// a blocked plan has its work done and waits for a human step (roadmap §8): in progress to a reader
	if (status === 'in-progress' || status === 'blocked') return 'in progress';
	return item.exploring ? 'exploring' : 'planned';
}
