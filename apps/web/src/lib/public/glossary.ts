/**
 * The player glossary (plan 228): every term the HUD shows, in plain words. Shorter than the developer
 * glossary (`docs/product/glossary.md`); a test keeps every term the HUD's tooltips name in here, and
 * every entry's short text under `SHORT_MAX` characters. Strings are keyed by id, so translation can
 * come later.
 */

export interface GlossaryEntry {
	/** Anchor on `/glossary` (`#apoapsis`). */
	id: string;
	term: string;
	/** What the HUD shows, when it differs from `term` (`Ap`). */
	abbr?: string;
	/** One line for the tooltip, under `SHORT_MAX` characters. */
	short: string;
	/** A paragraph for the glossary page. */
	long: string;
	related?: string[];
}

export const SHORT_MAX = 140;

export const GLOSSARY: readonly GlossaryEntry[] = [
	{
		id: 'apoapsis',
		term: 'Apoapsis',
		abbr: 'Ap',
		short: 'Apoapsis: the highest point of your orbit above the body.',
		long: 'The point of an orbit farthest from the body it circles. Burning prograde at periapsis raises it; burning at apoapsis raises the periapsis instead, which is how you circularise.',
		related: ['periapsis', 'prograde', 'eccentricity']
	},
	{
		id: 'periapsis',
		term: 'Periapsis',
		abbr: 'Pe',
		short:
			'Periapsis: the lowest point of your orbit. Below the surface or the air, it is not an orbit yet.',
		long: 'The point of an orbit nearest the body. Keep it above the atmosphere (or the ground on an airless body) for a stable orbit; lower it into the air to come home.',
		related: ['apoapsis', 'retrograde']
	},
	{
		id: 'orbital-period',
		term: 'Orbital period',
		abbr: 'Period',
		short: 'Orbital period: how long one full orbit takes.',
		long: 'The time to go once around. Higher orbits are slower, which is why a rendezvous starts lower to catch up.',
		related: ['apoapsis', 'periapsis']
	},
	{
		id: 'inclination',
		term: 'Inclination',
		short: "Inclination: the tilt of your orbit against the body's equator.",
		long: "0° circles the equator eastward; 90° passes over the poles. Launching due east from the equator gives the lowest inclination and the most help from the body's spin.",
		related: ['an-dn', 'normal']
	},
	{
		id: 'eccentricity',
		term: 'Eccentricity',
		short: 'Eccentricity: how stretched an orbit is. 0 is a circle; 1 or more escapes.',
		long: 'A circular orbit has 0; an ellipse is between 0 and 1. At 1 or above the path no longer closes: you are leaving the body for good.',
		related: ['apoapsis', 'periapsis']
	},
	{
		id: 'an-dn',
		term: 'Ascending and descending nodes',
		abbr: 'AN / DN',
		short:
			'AN/DN: where your orbit crosses the reference plane, going north and south. Burn normal there to change plane.',
		long: 'The two points where your orbit crosses the equator or the target’s orbit plane. A plane change is cheapest there; the map marks both.',
		related: ['inclination', 'normal']
	},
	{
		id: 'prograde',
		term: 'Prograde',
		short:
			'Prograde: the direction you are moving. Burning prograde speeds you up and raises the far side of the orbit.',
		long: 'The direction of your velocity. The navball marks it; SAS can hold it. Its opposite is retrograde.',
		related: ['retrograde', 'normal', 'radial']
	},
	{
		id: 'retrograde',
		term: 'Retrograde',
		short:
			'Retrograde: against your motion. Burning retrograde slows you and lowers the far side of the orbit.',
		long: 'The direction opposite your velocity: the one to burn to land, to deorbit or to stop beside a target.',
		related: ['prograde', 'periapsis']
	},
	{
		id: 'normal',
		term: 'Normal and anti-normal',
		short: 'Normal: at right angles to your orbit plane. Burning normal tilts the orbit.',
		long: 'Normal points along the orbit’s spin axis, anti-normal the other way. Burns this way change inclination, best at a node.',
		related: ['an-dn', 'inclination']
	},
	{
		id: 'radial',
		term: 'Radial in and out',
		short:
			'Radial: toward or away from the body you orbit. Burning radial turns the orbit around you.',
		long: 'Radial out points away from the body, radial in toward it. Small radial burns rotate the orbit without much change of its size.',
		related: ['prograde', 'normal']
	},
	{
		id: 'delta-v',
		term: 'Delta-v',
		abbr: 'Δv',
		short:
			'Δv: how much your speed can still change with the fuel aboard. Every manoeuvre costs some.',
		long: 'The change of velocity your engines can give with the propellant left, from the rocket equation. Plans and maps of the system are budgets in Δv.',
		related: ['isp', 'twr', 'stage']
	},
	{
		id: 'twr',
		term: 'Thrust-to-weight ratio',
		abbr: 'TWR',
		short: 'TWR: engine thrust over weight. Above 1 you lift off; around 1.3–1.8 is a good launch.',
		long: 'Thrust divided by weight where you are. Below 1 the rocket cannot leave the ground; very high values waste fuel against the air.',
		related: ['delta-v', 'isp']
	},
	{
		id: 'isp',
		term: 'Specific impulse',
		abbr: 'Isp',
		short:
			'Isp: how efficiently an engine uses propellant, in seconds. Higher means more Δv from the same fuel.',
		long: 'Specific impulse. Engines have a lower Isp in thick air than in vacuum, which is why upper stages use vacuum engines.',
		related: ['delta-v', 'twr']
	},
	{
		id: 'stage',
		term: 'Stage',
		short:
			'Stage: one step of the staging sequence. Space fires the next one: engines light, decouplers separate.',
		long: 'A rocket burns and drops its stages in order. The staging stack shows what the next press of Space does and the Δv each stage holds.',
		related: ['delta-v', 'twr']
	},
	{
		id: 'soi',
		term: 'Sphere of influence',
		abbr: 'SOI',
		short:
			"SOI: the region where a body's gravity rules your path. Crossing its edge changes what you orbit.",
		long: 'Inside a body’s sphere of influence your path is an orbit around it. The map shows when your path enters or leaves one.',
		related: ['apoapsis', 'periapsis']
	},
	{
		id: 'met',
		term: 'Mission elapsed time',
		abbr: 'MET',
		short: 'MET: time since launch.',
		long: 'Counts from liftoff. Time warp runs it faster.',
		related: ['time-warp']
	},
	{
		id: 'time-warp',
		term: 'Time warp',
		short:
			'Time warp: run the clock faster. Above 10× the vessel coasts on rails and engines cannot burn.',
		long: 'Low warp keeps physics running; high warp moves vessels along their orbits only. Warp-to stops before a node, an apsis or an alarm.',
		related: ['met']
	},
	{
		id: 'altitude',
		term: 'Altitude',
		short: "Altitude: height above the body's sea level (its reference sphere).",
		long: 'Measured from the reference sphere, not the ground under you. The radar altitude gives the height above the ground.',
		related: ['radar-altitude']
	},
	{
		id: 'radar-altitude',
		term: 'Radar altitude',
		short:
			'Radar altitude: height of your lowest point above the ground right under you. Use it to land.',
		long: 'Shown when near the ground. It follows hills and craters, unlike the altitude above sea level.',
		related: ['altitude']
	},
	{
		id: 'dynamic-pressure',
		term: 'Dynamic pressure',
		abbr: 'Q',
		short:
			'Q: the push of the air against the vessel. Too high in the thick lower air and parts break or burn.',
		long: 'Half the air density times the speed squared. It peaks a minute or so after launch ("max Q"); throttling down there spares the rocket.',
		related: ['mach']
	},
	{
		id: 'mach',
		term: 'Mach number',
		abbr: 'Mach',
		short: 'Mach: your speed over the speed of sound in the air around you.',
		long: 'Above Mach 1 drag rises sharply and reentry heating starts to matter at high Mach numbers.',
		related: ['dynamic-pressure']
	},
	{
		id: 'sas',
		term: 'Stability assist',
		abbr: 'SAS',
		short:
			'SAS: holds the vessel’s attitude, or points it prograde, retrograde, at a node or a target.',
		long: 'Uses reaction wheels, control surfaces and gimbals to keep the attitude you choose. Off, the vessel drifts.',
		related: ['prograde', 'rcs']
	},
	{
		id: 'rcs',
		term: 'Reaction control system',
		abbr: 'RCS',
		short:
			'RCS: small thrusters that turn and nudge the vessel. Needed for docking. R switches them.',
		long: 'Thrusters on monopropellant or cold gas. With RCS on, the translation keys move the vessel without turning it.',
		related: ['sas']
	},
	{
		id: 'electric-charge',
		term: 'Electric charge',
		abbr: 'EC',
		short:
			'EC: stored electricity. Probes, reaction wheels and antennas need it; without it a probe cannot be controlled.',
		long: 'Batteries store it; solar panels and generators make it. Watch it during long burns and in the dark.',
		related: ['comms']
	},
	{
		id: 'comms',
		term: 'Signal',
		short:
			'Signal: the link to a ground station or relay. A probe without signal cannot be fully controlled.',
		long: 'Antennas link vessels to stations and relays in line of sight. The bars show its strength; bodies in the way cut it.',
		related: ['electric-charge']
	},
	{
		id: 'eva',
		term: 'Extravehicular activity',
		abbr: 'EVA',
		short:
			'EVA: a crew member outside in a suit. WASD walks, R the jetpack, F grabs a ladder, B boards.',
		long: 'Step out at a hatch. The suit carries its own propellant, oxygen and charge, and boards again at a hatch or ladder.',
		related: ['iva']
	},
	{
		id: 'iva',
		term: 'Intravehicular activity',
		abbr: 'IVA',
		short: 'IVA: a crew member inside the vessel, in a seat.',
		long: 'The crew panel’s chip reads IVA aboard and EVA outside.',
		related: ['eva']
	},
	{
		id: 'heat',
		term: 'Heat',
		short: 'Heat: the hottest part as a share of what it can take. At 100 % it burns up.',
		long: 'Reentry and engines heat parts. The warning tone starts at 80 %. Heat shields absorb it; a shallower path spreads it out.',
		related: ['mach']
	}
];

const byId = new Map(GLOSSARY.map((e) => [e.id, e]));

/** The entry with this id, if any. */
export const glossaryEntry = (id: string): GlossaryEntry | undefined => byId.get(id);

/** Entries whose term, abbreviation or text matches `query` (case-insensitive); all when empty. */
export function searchGlossary(query: string): GlossaryEntry[] {
	const q = query.trim().toLowerCase();
	if (!q) return [...GLOSSARY];
	const exact = GLOSSARY.filter((e) => e.abbr?.toLowerCase() === q || e.term.toLowerCase() === q);
	if (exact.length > 0) return exact;
	return GLOSSARY.filter((e) =>
		[e.term, e.abbr ?? '', e.short].some((s) => s.toLowerCase().includes(q))
	);
}

/** The attributes that give an element a term tooltip (`{...termTip('apoapsis')}`). */
export function termTip(id: string): { 'data-tip': string; 'data-tip-term': string } {
	const e = byId.get(id);
	return { 'data-tip': e?.short ?? id, 'data-tip-term': id };
}
