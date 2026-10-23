import { defineMission } from '@orbital/sdk';

/**
 * The stock main line (plan 100, ADR 0151 point 2): from the first hop to a return from the Moon,
 * then Ochre and Tempest (plan 381).
 * Each mission starts the next when it is done. The first six name `home` and `moon` and the air's
 * top, with `{home}`, `{moon}` and `{air}` in their text, so they fly in any system (system audit
 * D3); the planet missions name stock's planets and are not offered where those are missing.
 */
const LINE = 'stock.main';

export const STOCK_MISSIONS = [
	defineMission({
		id: 'stock.first-launch',
		title: 'First launch',
		line: LINE,
		briefing:
			'Build anything with a command pod and an engine, launch it and climb past one kilometre. The guide on the screen shows each step.',
		debriefing: 'The first vessel of the programme has left the ground.',
		objectives: { objective: 'stock.reach-altitude', params: { min: 1_000 } },
		reward: [{ currency: 'reputation', amount: 5 }],
		next: ['stock.space']
	}),
	defineMission({
		id: 'stock.space',
		title: 'Into space',
		line: LINE,
		briefing: 'Climb above the atmosphere: {air} over {home}.',
		debriefing: 'Above the air, the sky turns black.',
		objectives: { objective: 'stock.reach-altitude', params: { body: 'home', aboveAir: 0 } },
		prerequisites: ['stock.first-launch'],
		reward: [{ currency: 'reputation', amount: 10 }],
		next: ['stock.orbit']
	}),
	defineMission({
		id: 'stock.orbit',
		title: 'Orbit',
		line: LINE,
		briefing:
			'Go fast enough sideways that you never come down: a periapsis above {air}. Raise the apoapsis, then burn at it.',
		debriefing: 'An orbit of {home}. From here, every other place is a few burns away.',
		objectives: {
			objective: 'stock.reach-orbit',
			params: { body: 'home', periapsisAboveAir: 0 }
		},
		prerequisites: ['stock.space'],
		reward: [{ currency: 'reputation', amount: 20 }],
		next: ['stock.moon-flyby']
	}),
	defineMission({
		id: 'stock.moon-flyby',
		title: 'To the Moon',
		line: LINE,
		briefing:
			"Reach {moon}'s sphere of influence. Plan a maneuver at the right moment of the orbit; the map shows the encounter.",
		debriefing: '{moon} up close: the first flight beyond {home}.',
		objectives: { objective: 'stock.flyby', params: { body: 'moon' } },
		prerequisites: ['stock.orbit'],
		reward: [{ currency: 'reputation', amount: 30 }],
		next: ['stock.moon-landing']
	}),
	defineMission({
		id: 'stock.moon-landing',
		title: 'Landing on the Moon',
		line: LINE,
		briefing: 'Set a vessel down on {moon} in one piece. Legs help; so does slowing down early.',
		debriefing: 'A vessel stands on another world.',
		objectives: { objective: 'stock.land', params: { body: 'moon' } },
		prerequisites: ['stock.moon-flyby'],
		reward: [{ currency: 'reputation', amount: 50 }],
		next: ['stock.moon-return']
	}),
	defineMission({
		id: 'stock.moon-return',
		title: 'Home from the Moon',
		line: LINE,
		briefing: 'Land on {moon}, lift off again and bring the vessel home safely.',
		debriefing: 'There and back. Beyond the Moon, the planets wait for their windows.',
		objectives: {
			sequence: [
				{ objective: 'stock.land', params: { body: 'moon' } },
				{ objective: 'stock.return-home' }
			]
		},
		prerequisites: ['stock.moon-landing'],
		reward: [{ currency: 'reputation', amount: 80 }],
		next: ['stock.ochre-flyby']
	}),
	// beyond the Moon (plan 381, ADR 0318): the red planet, then the giant
	defineMission({
		id: 'stock.ochre-flyby',
		title: 'To the red planet',
		line: LINE,
		briefing:
			"Reach Ochre's sphere of influence. Leave Home at a transfer window (the Mission Center's Upcoming list finds it, about 45 days into a new world, then every 855 days): about 1 100 m/s from low orbit.",
		debriefing: 'Ochre fills the window: rust plains, white caps and two tiny moons.',
		objectives: { objective: 'stock.flyby', params: { body: 'stock.ochre' } },
		prerequisites: ['stock.moon-return'],
		reward: [{ currency: 'reputation', amount: 100 }],
		next: ['stock.ochre-landing']
	}),
	defineMission({
		id: 'stock.ochre-landing',
		title: 'Landing on Ochre',
		line: LINE,
		briefing:
			'Set a vessel down on Ochre. Its air is thin: it slows you from orbital speed but not to a landing; wide parachutes and a last burn do the rest.',
		debriefing: 'Footprints in red dust, a planet away from Home.',
		objectives: { objective: 'stock.land', params: { body: 'stock.ochre' } },
		prerequisites: ['stock.ochre-flyby'],
		reward: [{ currency: 'reputation', amount: 150 }],
		next: ['stock.tempest-flyby']
	}),
	defineMission({
		id: 'stock.tempest-flyby',
		title: 'The ringed giant',
		line: LINE,
		briefing:
			"Reach Tempest's sphere of influence: about 2 000 m/s from low orbit and three years of coast. Its four moons are cheap to reach once you are there.",
		debriefing: 'Tempest and its rings. The main line is complete; the system is yours.',
		objectives: { objective: 'stock.flyby', params: { body: 'stock.tempest' } },
		prerequisites: ['stock.ochre-landing'],
		reward: [{ currency: 'reputation', amount: 200 }]
	})
];
