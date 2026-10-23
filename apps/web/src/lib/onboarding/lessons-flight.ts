/**
 * Flight (plan 344): the Guidance Computer's ascent, a transfer to the moon, landing on it, walking
 * on it, science and comms.
 */
import { blueprintDesign } from '../blueprint-registry';
import type { Lesson } from './lessons';
import {
	HOME_AIR,
	LOW,
	IN_PARKING_ORBIT,
	LIGHT,
	PARKING,
	addPanelStep,
	closedPlaces
} from './lesson-kit';
import {
	lander,
	pathfinder,
	pathfinderCapsule,
	relayProbe,
	relaySatellite
} from './lesson-vessels';

/** The comms lesson's relay altitude, m: high enough to see both the probe and the ground station. */
export const RELAY_ALTITUDE = 3_000_000;

export const FLIGHT_LESSONS: readonly Lesson[] = [
	{
		id: 'ascent-guidance',
		level: 'flight',
		title: 'Ascent with the Guidance Computer',
		summary: `Pathfinder on the pad again: add the Guidance Computer to the dock, set an ${LOW} orbit on its Ascent tab and let it fly the gravity turn, the staging and the circularisation.`,
		design: pathfinder,
		setup: [],
		blocked: { actions: {}, places: closedPlaces() },
		steps: [
			{
				...addPanelStep(
					'panel',
					'guidance.panel',
					'Guidance Computer',
					'It flies programs for you: ascent, orbit changes, rendezvous and landing.'
				),
				point: 'dock-library'
			},
			{
				id: 'open',
				point: 'dock-tab-guidance.panel',
				title: 'Open it',
				text: 'Click its icon on the rail: the panel opens with a tab per program. Ascent is the first.',
				targets: { panels: ['guidance.panel'] },
				done: (o) => o.openPanel === 'guidance.panel'
			},
			{
				id: 'engage',
				title: 'Engage Ascent',
				text: `On the Ascent tab, leave the orbit at ${LOW} and the inclination at 0°, and press Engage. The program throttles up and stages by itself.`,
				targets: { commands: ['autopilot-engage'] },
				done: (o) => o.autopilot === 'guidance.ascent'
			},
			{
				id: 'orbit',
				title: 'Watch it fly',
				text: 'It climbs straight, leans east, drops the booster, coasts to Ap and circularises. Abort hands the controls back at any moment, as does {key:programStop}.',
				actions: ['programStop'],
				done: (o) => (o.periapsis ?? -Infinity) >= HOME_AIR
			}
		],
		goal: (o) => (o.periapsis ?? -Infinity) >= HOME_AIR && o.autopilot === null,
		debrief:
			'The Guidance Computer flies what you learned by hand. Know the manual way first: a program can only do what the rocket can, and you read its log when it cannot.',
		hint: 'In your world, add the Guidance Computer once and it stays on the rail; its Orbit tab executes nodes and circularises.'
	},
	{
		id: 'transfer',
		level: 'flight',
		title: 'Transfer to Cinder',
		summary:
			'From a parking orbit: target the moon, place a node where the dashed line meets it, warp, burn, and change sphere of influence.',
		design: pathfinderCapsule,
		setup: [IN_PARKING_ORBIT, LIGHT],
		blocked: {
			actions: {
				stage:
					'Staging now would drop the service module with its engine: nothing to drop in this lesson.'
			},
			places: closedPlaces()
		},
		steps: [
			{
				id: 'map',
				point: 'nav-map',
				title: 'Open the map',
				text: 'Press {key:map} and find Cinder, the moon, on its own orbit around Home.',
				touchText: 'Tap Map and find Cinder, the moon, on its own orbit around Home.',
				actions: ['map'],
				done: (o) => o.map
			},
			{
				id: 'target',
				title: 'Target Cinder',
				text: 'Press {key:targetNext} until Cinder is the target. The Mission Center’s Upcoming list shows the next transfer window.',
				actions: ['targetNext'],
				done: (o) => o.target?.key === 'body:stock.cinder'
			},
			{
				id: 'node',
				point: 'maneuver-expand',
				title: 'Place the node',
				text: 'Click your orbit to add a node and give it about 860 m/s prograde (Edit the burn). Drag the node along your orbit until the dashed line meets Cinder’s circle and shows an encounter.',
				targets: { testids: ['maneuver-expand', 'node-*'] },
				done: (o) => o.nodes >= 1 && o.nodePrograde >= 500
			},
			{
				id: 'warp',
				point: 'maneuver-warp',
				title: 'Warp to the node',
				text: 'Press {key:warpUp} to speed up time, or Warp to the burn on the node card. Warp stops before the node.',
				actions: ['warpUp'],
				targets: { testids: ['maneuver-warp'] },
				done: (o) => o.warp > 1
			},
			{
				id: 'burn',
				point: 'maneuver-point',
				title: 'Burn',
				text: 'Point at the node with {key:sasManeuver} and burn at full throttle until the node has no Δv left.',
				actions: ['sasManeuver'],
				done: (o) => o.nodeLeft !== null && o.nodeLeft < 20
			},
			{
				id: 'soi',
				title: "Enter Cinder's sphere",
				text: 'Warp ahead. When the vessel enters Cinder’s sphere of influence, the orbit is drawn around Cinder.',
				done: (o) => o.body === 'stock.cinder'
			}
		],
		goal: (o) => o.body === 'stock.cinder',
		debrief:
			'You left Home’s sphere for Cinder’s. Every transfer is the same idea: burn at the window so your new orbit meets the destination. The planets work the same way from Home’s orbit: Ochre, the red planet, has its first window about 45 days into a new world.',
		hint: 'In your world, plan the transfer burn with a node at the window shown in Upcoming, and keep 300 m/s for the capture at Cinder. Target Ochre from a Home orbit and Upcoming shows its window too: about 1 100 m/s to leave, 650 m/s to stay.'
	},
	{
		id: 'landing',
		level: 'flight',
		title: 'Landing on Cinder',
		summary:
			'From a 30 km arc over Cinder in the Lark lander: point retrograde, burn, lower the legs and touch down under 3 m/s.',
		design: lander,
		setup: [
			{
				fn: 'setLocation',
				args: [
					{
						kind: 'air',
						body: 'stock.cinder' as never,
						latitude: 0,
						longitude: 0,
						altitude: 30_000,
						speed: 250,
						heading: Math.PI / 2,
						climb: -0.2
					}
				]
			},
			LIGHT
		],
		blocked: {
			actions: {
				map: 'This lesson is about the ground: the map stays closed. Watch the radar altitude instead.',
				warpUp: 'No time warp while landing: every second counts.'
			},
			places: closedPlaces()
		},
		steps: [
			{
				id: 'retrograde',
				point: 'sas-retrograde',
				title: 'Point retrograde',
				text: 'You are falling towards Cinder with the engine lit and the throttle closed. Press {key:sasRetrograde}: SAS turns the engine to face the way you are moving, so a burn slows you down.',
				touchText:
					'You are falling towards Cinder. Tap the retrograde button beside the navball: SAS turns the engine to face the way you are moving.',
				actions: ['sasRetrograde'],
				done: (o) => o.sasMode === 'retrograde'
			},
			{
				id: 'brake',
				title: 'Brake',
				text: 'Press {key:throttleFull} and burn. Cinder has no air, so only the engine slows you. Watch the surface speed fall.',
				touchText: 'Tap Full and burn. Cinder has no air, so only the engine slows you.',
				actions: ['throttleFull'],
				done: (o) => o.throttle > 0.5
			},
			{
				id: 'slow',
				point: 'hud-radar',
				title: 'Slow before the ground',
				text: 'Get below 50 m/s before 5 km. Ease off with {key:throttleDown} as the speed drops, and press {key:gear} to lower the legs.',
				touchText:
					'Get below 50 m/s before 5 km. Ease the throttle down as the speed drops, and lower the legs.',
				actions: ['gear', 'throttleDown'],
				done: (o) => o.surfaceSpeed < 50 && o.altitude < 5_000
			},
			{
				id: 'touchdown',
				title: 'Touch down',
				text: 'Hold a gentle descent and touch down under 3 m/s. Cut the throttle with {key:throttleCut} once you stand.',
				touchText: 'Hold a gentle descent and touch down under 3 m/s. Tap Cut once you stand.',
				actions: ['throttleCut'],
				done: (o) => o.landed
			}
		],
		goal: (o) => o.landed && o.body === 'stock.cinder' && o.surfaceSpeed < 3,
		debrief:
			'You landed. The burn that ends just as you touch the ground is called a suicide burn: it wastes the least fuel, and leaves the least room for error.',
		hint: 'In your world, fly to Cinder with a lander that has legs and a few hundred m/s to spare; the Guidance Computer’s Landing tab can set it down for you.'
	},
	{
		id: 'eva-flag',
		level: 'flight',
		title: 'EVA and a flag',
		summary:
			'The Lark lander stands on Cinder: step out from the Crew panel, walk, plant a flag and climb back in.',
		design: lander,
		setup: [
			{
				fn: 'setLocation',
				args: [{ kind: 'surface', body: 'stock.cinder' as never, latitude: 0.02, longitude: 0.02 }]
			}
		],
		blocked: {
			actions: { warpUp: 'No time warp on a walk.' },
			places: closedPlaces()
		},
		steps: [
			{
				id: 'crew',
				point: 'dock-tab-host.crew',
				title: 'Open the Crew panel',
				text: 'Open Crew on the dock’s rail: who is aboard, and the EVA button for each seat.',
				targets: { panels: ['host.crew'] },
				done: (o) => o.openPanel === 'host.crew'
			},
			{
				id: 'out',
				title: 'Step outside',
				text: 'Press EVA on the pilot’s row. The suit has its own oxygen, charge and a jetpack.',
				targets: { testids: ['crew-eva-*'], commands: ['crew-eva'] },
				done: (o) => o.eva
			},
			{
				id: 'walk',
				title: 'Walk',
				text: 'Walk with {key:evaForward}, {key:evaBack}, {key:evaLeft} and {key:evaRight}; {key:evaJump} jumps, which on Cinder goes a long way.',
				actions: ['evaForward', 'evaJump'],
				done: (o) => o.eva && o.walking
			},
			{
				id: 'flag',
				point: 'eva-flag',
				title: 'Plant a flag',
				text: 'Press Plant flag in the suit’s panel. The flag stays: it shows in the Mission Center like any vessel.',
				targets: { testids: ['eva-flag'], commands: ['plant-flag'] },
				done: (o) => o.flags >= 1
			},
			{
				id: 'board',
				point: 'eva-board',
				title: 'Climb back in',
				text: 'Walk back to the lander and press Board (or {key:evaBoard}) when you are beside it.',
				actions: ['evaBoard'],
				targets: { testids: ['eva-board'], commands: ['crew-board'] },
				done: (o) => !o.eva && o.flags >= 1
			}
		],
		debrief:
			'A footprint and a flag. On EVA the suit is a vessel of its own: watch its oxygen, and stay near the ship.',
		hint: 'In your world, land with a crew and plant a flag: it counts as a first in your world’s milestones.'
	},
	{
		id: 'science',
		level: 'flight',
		title: 'Science',
		summary:
			'The Aurora research satellite on the pad: add the Science panel, run an experiment, transmit the result home.',
		design: () => blueprintDesign('stock.aurora-satellite'),
		setup: [],
		blocked: { actions: {}, places: closedPlaces() },
		steps: [
			{
				...addPanelStep(
					'panel',
					'stock.science',
					'Science panel',
					'It lists the experiments aboard and the results you hold.'
				),
				point: 'dock-library'
			},
			{
				id: 'run',
				point: 'dock-tab-stock.science',
				title: 'Run an experiment',
				text: 'Open the Science panel and press Run the next experiment. A result is worth the most the first time, in each place: on the pad, in the air, in space, at each body.',
				targets: { panels: ['stock.science'] },
				done: (o) => o.scienceStored >= 1
			},
			{
				id: 'transmit',
				title: 'Transmit it',
				text: 'Press Transmit the best result. The antenna sends it home over the comms link; transmitting gives part of its value, bringing it home gives all of it.',
				done: (o) => o.scienceCredited > 0
			}
		],
		debrief:
			'Science is how you learn about each place, and in Career and Science worlds it pays for research. Run the same experiment again in a new situation for a new result.',
		hint: 'In your world, carry a thermometer and a barometer on your first flights and run them on the pad, in the air and in space.'
	},
	{
		id: 'comms',
		level: 'flight',
		title: 'Comms and relays',
		summary:
			'The Wren probe in a low orbit: see its link to the ground station, then warp until the planet blocks it and the link goes via the relay satellite overhead.',
		design: relayProbe,
		setup: (content) => [
			IN_PARKING_ORBIT,
			{
				fn: 'setOrbit',
				args: [
					{
						body: 'stock.home',
						apoapsis: RELAY_ALTITUDE,
						periapsis: RELAY_ALTITUDE,
						m0: Math.PI / 2
					},
					{ design: relaySatellite(content) as never }
				]
			}
		],
		blocked: {
			actions: {
				stage: 'The probe’s engine is not needed in this lesson.'
			},
			places: closedPlaces()
		},
		steps: [
			{
				id: 'panel',
				point: 'dock-tab-host.comms',
				title: 'Open the Comms panel',
				text: 'Open Comms on the dock’s rail: your probe’s link, its route and its signal. A probe without a link cannot be controlled in Career.',
				targets: { panels: ['host.comms'] },
				done: (o) => o.openPanel === 'host.comms'
			},
			{
				id: 'direct',
				title: 'A direct link',
				text: 'Right now the probe sees a ground station: the route is one hop. The Link chip on the HUD says the same.',
				done: (o) => o.linkHops === 1
			},
			{
				id: 'warp',
				title: 'Warp round the planet',
				text: 'Press {key:warpUp} a few times and watch the route while the ground station sinks below the horizon.',
				actions: ['warpUp'],
				done: (o) => o.warp > 1
			},
			{
				id: 'relay',
				title: 'Linked via the relay',
				text: 'When Home blocks the station, the link goes up to Relay One and down again: two hops. Without the relay, the link would be lost here.',
				done: (o) => o.linkHops >= 2
			}
		],
		debrief:
			'A relay is a satellite that passes your signal on. Two or three high relays keep everything around a planet linked; a dish on the relay reaches the moon.',
		hint: 'In your world, launch a relay with a relay dish (the Moonwatch Orbiter in the Library carries one) before you send probes behind the moon.'
	}
];
