import { defineMission } from '@orbital/sdk';

/**
 * The stock main line (plan 100, ADR 0151 point 2): from the first hop to a return from the Moon.
 * Each mission starts the next when it is done. Written for this game's bodies.
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
		briefing: 'Climb above the atmosphere: 70 km over Home.',
		debriefing: 'Above the air, the sky turns black.',
		objectives: { objective: 'stock.reach-altitude', params: { body: 'stock.home', min: 70_000 } },
		prerequisites: ['stock.first-launch'],
		reward: [{ currency: 'reputation', amount: 10 }],
		next: ['stock.orbit']
	}),
	defineMission({
		id: 'stock.orbit',
		title: 'Orbit',
		line: LINE,
		briefing:
			'Go fast enough sideways that you never come down: a periapsis above 70 km. Raise the apoapsis, then burn at it.',
		debriefing: 'An orbit of Home. From here, every other place is a few burns away.',
		objectives: {
			objective: 'stock.reach-orbit',
			params: { body: 'stock.home', minPeriapsis: 70_000 }
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
			"Reach Cinder's sphere of influence. Plan a maneuver at the right moment of the orbit; the map shows the encounter.",
		debriefing: 'Cinder up close: the first flight beyond Home.',
		objectives: { objective: 'stock.flyby', params: { body: 'stock.cinder' } },
		prerequisites: ['stock.orbit'],
		reward: [{ currency: 'reputation', amount: 30 }],
		next: ['stock.moon-landing']
	}),
	defineMission({
		id: 'stock.moon-landing',
		title: 'Landing on the Moon',
		line: LINE,
		briefing: 'Set a vessel down on Cinder in one piece. Legs help; so does slowing down early.',
		debriefing: 'A vessel stands on another world.',
		objectives: { objective: 'stock.land', params: { body: 'stock.cinder' } },
		prerequisites: ['stock.moon-flyby'],
		reward: [{ currency: 'reputation', amount: 50 }],
		next: ['stock.moon-return']
	}),
	defineMission({
		id: 'stock.moon-return',
		title: 'Home from the Moon',
		line: LINE,
		briefing: 'Land on Cinder, lift off again and bring the vessel home safely.',
		debriefing: 'There and back. The main line is complete; the system is yours.',
		objectives: {
			sequence: [
				{ objective: 'stock.land', params: { body: 'stock.cinder' } },
				{ objective: 'stock.return-home' }
			]
		},
		prerequisites: ['stock.moon-landing'],
		reward: [{ currency: 'reputation', amount: 80 }]
	})
];
