/**
 * Advanced (plan 344): meeting and docking in orbit by hand and with the autopilots, a rover,
 * robotic parts, and keeping orbit tidy from the Mission Center.
 */
import { blueprintDesign } from './designs.ts';
import type { LessonDefinition as Lesson, LessonSetupCall } from '@orbital/sdk';
import {
	HOME_RADIUS,
	IN_PARKING_ORBIT,
	LIGHT,
	PARKING,
	RENDEZVOUS_LEAD,
	TARGET_LEAD,
	addPanelStep,
	closedPlaces
} from './kit.ts';
import { DESIGNS } from './designs.generated.ts';

/** The chaser in the parking orbit, lit, and `design` `lead` metres ahead on the same orbit. */
const meet = (lead: number, design: unknown): readonly LessonSetupCall[] => [
	IN_PARKING_ORBIT,
	LIGHT,
	{
		fn: 'setOrbit',
		args: [
			{
				body: 'stock.home',
				apoapsis: PARKING,
				periapsis: PARKING,
				m0: lead / (HOME_RADIUS + PARKING)
			},
			{ design }
		]
	}
];

const NO_WARP_NEAR = 'No time warp near another vessel in this lesson: approach in real time.';

export const ADVANCED_LESSONS: readonly Lesson[] = [
	{
		id: 'rendezvous',
		level: 'advanced',
		title: 'Rendezvous',
		summary:
			'Kestrel 20 km behind Beacon Station on the same orbit: target it, read the closest approach, then let the Guidance Computer’s Rendezvous bring you within 200 m.',
		design: DESIGNS.chaser,
		setup: meet(RENDEZVOUS_LEAD, DESIGNS.beacon),
		blocked: {
			actions: {
				stage: 'Staging now would drop Kestrel’s service module: nothing to drop in this lesson.'
			},
			places: closedPlaces()
		},
		steps: [
			{
				id: 'target',
				point: 'dock-tab-host.target',
				title: 'Target the station',
				text: 'Press {key:targetNext} until the target is Beacon Station (or click it and choose Set as target). The Target panel shows its distance and relative speed.',
				actions: ['targetNext'],
				targets: { testids: ['vessel-menu-target'], panels: ['host.target'] },
				done: (o) => o.target?.key.startsWith('vessel:') === true
			},
			{
				id: 'approach',
				point: 'nav-map',
				title: 'Read the closest approach',
				text: 'Open the map with {key:map}. The two closest-approach markers show where the orbits come nearest and how far apart you will be: a burn that brings them together is a rendezvous.',
				actions: ['map'],
				done: (o) => o.map
			},
			{
				...addPanelStep(
					'panel',
					'guidance.panel',
					'Guidance Computer',
					'Its Rendezvous tab plans the phasing burns for you.'
				),
				point: 'dock-library'
			},
			{
				id: 'engage',
				point: 'dock-tab-guidance.panel',
				title: 'Engage Rendezvous',
				text: 'Open the Guidance Computer, go to its Rendezvous tab and press Engage. It drops to a lower, faster orbit to catch up, climbs back and brakes near the station. Warp through coasts is on: it warps the long waits.',
				targets: { commands: ['autopilot-engage'] },
				done: (o) => o.autopilot === 'guidance.rendezvous'
			},
			{
				id: 'hold',
				title: 'Hold near the station',
				text: 'Wait for it: it ends holding about 150 m from the station at under half a metre per second.',
				done: (o) => o.target !== null && o.target.distance < 300 && o.target.relativeSpeed < 1
			}
		],
		debrief:
			'Rendezvous is two orbits brought together: lower is faster, so you drop to catch up and climb to stop. The program does the sums; the idea is the same by hand.',
		hint: 'In your world, launch a target first, then a second vessel; target it in orbit and engage the Rendezvous tab. With Dock when close on and a port targeted, it hands over to Auto Dock.'
	},
	{
		id: 'docking',
		level: 'advanced',
		title: 'Docking by hand',
		summary:
			'Kestrel 200 m behind Beacon Station: target its port, switch on RCS, point at it and translate in at under half a metre per second until the ports capture.',
		design: DESIGNS.chaser,
		setup: meet(TARGET_LEAD, DESIGNS.beacon),
		blocked: {
			actions: {
				warpUp: NO_WARP_NEAR,
				stage: 'Staging now would drop Kestrel’s service module: nothing to drop in this lesson.'
			},
			places: closedPlaces()
		},
		steps: [
			{
				id: 'target',
				title: 'Target the port',
				text: 'Click Beacon Station, choose Target a docking port and pick its port. The target marker sits on the port now, with its alignment.',
				targets: { testids: ['vessel-menu-ports', 'vessel-menu-port-*'] },
				done: (o) => o.targetPort
			},
			{
				id: 'rcs',
				point: 'hud-rcs',
				title: 'Switch on RCS',
				text: 'Press {key:rcsToggle}. The four RCS blocks push Kestrel without turning it, on monopropellant, for the last metres.',
				actions: ['rcsToggle'],
				done: (o) => o.rcs
			},
			{
				id: 'point',
				point: 'sas-target',
				title: 'Point at the port',
				text: 'Press {key:sasTarget}: SAS turns the nose, and the docking port on it, towards the target port.',
				actions: ['sasTarget'],
				done: (o) => o.sasMode === 'target'
			},
			{
				id: 'close',
				title: 'Close in',
				text: 'Translate forward with {key:translateForward} and back with {key:translateBack}; {key:translateLeft}, {key:translateRight}, {key:translateUp} and {key:translateDown} line you up. Keep the closing speed under 1 m/s until 20 m.',
				actions: ['translateForward', 'translateBack'],
				done: (o) => o.target !== null && o.target.distance < 20
			},
			{
				id: 'dock',
				title: 'Dock',
				text: 'Drift in at 0.2 to 0.5 m/s with the ports in line. They capture on contact.',
				done: (o) => o.docked
			}
		],
		goal: (o) => o.docked,
		debrief:
			'Docked. The last metres are always slow and straight: line up first, then close, and brake with the opposite key before contact if you come in fast.',
		hint: 'In your world, give every docking ship a port, RCS blocks and monopropellant; the Auto Dock panel can fly the last metres for you.'
	},
	{
		id: 'autodock',
		level: 'advanced',
		title: 'Auto Dock',
		summary:
			'The same scene, flown by the Auto Dock panel: target the station’s port, engage, and watch it line up, fly round if it must, and dock.',
		design: DESIGNS.chaser,
		setup: meet(TARGET_LEAD, DESIGNS.beacon),
		blocked: {
			actions: {
				warpUp: NO_WARP_NEAR,
				stage: 'Staging now would drop Kestrel’s service module: nothing to drop in this lesson.'
			},
			places: closedPlaces()
		},
		steps: [
			{
				...addPanelStep(
					'panel',
					'autodock.panel',
					'Auto Dock panel',
					'It flies the last few hundred metres on RCS.'
				),
				point: 'dock-library'
			},
			{
				id: 'target',
				title: 'Target the port',
				text: 'Click Beacon Station, choose Target a docking port and pick its port. Auto Dock needs a port to aim at.',
				targets: { testids: ['vessel-menu-ports', 'vessel-menu-port-*'] },
				done: (o) => o.targetPort
			},
			{
				id: 'control',
				point: 'dock-tab-host.parts',
				title: 'Control from your port',
				text: 'Open Parts on the dock’s rail, find Kestrel’s docking port and press Control from here (the navball icon on its row): the navball and the autopilot now look out of the port.',
				targets: { panels: ['host.parts'], testids: ['part-*'], commands: ['set-control-part'] },
				done: (o) => o.controlPort
			},
			{
				id: 'engage',
				point: 'dock-tab-autodock.panel',
				title: 'Engage',
				text: 'Open Auto Dock and press Engage. It switches on RCS, lines up on the station’s port axis and approaches.',
				targets: { panels: ['autodock.panel'], commands: ['autopilot-engage'] },
				done: (o) => o.autopilot === 'autodock.dock'
			},
			{
				id: 'dock',
				title: 'Docked',
				text: 'Watch its log in the panel. Abort or {key:programStop} gives you the controls back.',
				actions: ['programStop'],
				done: (o) => o.docked
			}
		],
		goal: (o) => o.docked,
		debrief:
			'Auto Dock flies what you did by hand: line up, close slowly, capture. Rendezvous and Auto Dock together take a ship from anywhere in orbit to docked.',
		hint: 'In your world, turn on Dock when close on the Rendezvous tab and target a port: the rendezvous hands over to Auto Dock by itself.'
	},
	{
		id: 'rover',
		level: 'advanced',
		title: 'Driving a rover',
		summary:
			'The Trailblazer rover on the pad: drive mode, throttle the wheels, steer, and brake to a stop.',
		design: blueprintDesign('stock.trailblazer-rover'),
		setup: [],
		blocked: { actions: { stage: 'A rover has no stages.' }, places: closedPlaces() },
		steps: [
			{
				id: 'drive',
				title: 'Drive mode',
				text: 'The Drive chip on the HUD is on: near the ground with motor wheels, the pitch keys drive instead of pitching. {key:driveMode} switches it.',
				actions: ['driveMode'],
				done: (o) => o.drive
			},
			{
				id: 'go',
				title: 'Drive off',
				text: 'Hold {key:pitchMinus} to drive forward and {key:pitchPlus} to reverse; {key:yawMinus} and {key:yawPlus} steer the front wheels. The motors draw electric charge: the solar panel refills it. Keep it slow in turns: a rover rolls over like a car.',
				actions: ['pitchMinus', 'yawMinus', 'yawPlus'],
				done: (o) => o.drive && o.surfaceSpeed > 4
			},
			{
				id: 'stop',
				title: 'Brake',
				text: 'Hold {key:brakesHold} to brake, and stop.',
				actions: ['brakesHold'],
				done: (o) => o.drive && o.surfaceSpeed < 0.5
			}
		],
		debrief:
			'A rover is a vessel on wheels: the same controls, a different job. Slow is safe; low gravity on Cinder makes every bump a jump.',
		hint: 'In your world, carry a rover to Cinder in a lander, or start from the Trailblazer Rover in the Library.'
	},
	{
		id: 'robotics',
		level: 'advanced',
		title: 'Robotic parts',
		summary:
			'The Heron arm on the pad: two hinges. Swing each from the Parts panel and watch the arm move.',
		design: DESIGNS.arm,
		setup: [],
		blocked: { actions: { stage: 'The arm has no stages.' }, places: closedPlaces() },
		steps: [
			{
				id: 'parts',
				point: 'dock-tab-host.parts',
				title: 'Open Parts',
				text: 'Open Parts on the dock’s rail: every part with something to do, and its controls.',
				targets: { panels: ['host.parts'] },
				done: (o) => o.openPanel === 'host.parts'
			},
			{
				id: 'shoulder',
				title: 'Swing a hinge',
				text: 'Find the first hinge (OrbitX RH-1 "Knuckle") and set its Angle to 45°. It turns at its own speed and uses electric charge.',
				done: (o) => o.joint >= 30
			},
			{
				id: 'elbow',
				title: 'Both hinges',
				text: 'Now the second hinge. Swing turns a hinge to its far end; Lock holds it against loads.',
				done: (o) => o.jointsMoved >= 2
			}
		],
		debrief:
			'Hinges, servos, rotors and pistons move the parts beyond them. Put them in an action group to move them with one key.',
		hint: 'In your world, hinges fold solar panels, arms and landing gear; robotics need research in Career.'
	},
	{
		id: 'mission-center',
		level: 'advanced',
		title: 'The Mission Center and debris',
		summary:
			'In orbit beside a spent stage: open the Mission Center, terminate the debris, and come back to your ship.',
		design: DESIGNS.pathfinderCapsule,
		setup: [
			IN_PARKING_ORBIT,
			{
				fn: 'setOrbit',
				args: [
					{
						body: 'stock.home',
						apoapsis: PARKING,
						periapsis: PARKING,
						m0: 2_000 / (HOME_RADIUS + PARKING)
					},
					{ design: DESIGNS.spentStage }
				]
			}
		],
		blocked: { actions: {}, places: closedPlaces() },
		steps: [
			{
				id: 'open',
				title: 'Open the Mission Center',
				text: 'Open the Mission Center from the menu bar at the top: every vessel in flight, with the debris marked.',
				done: (o) => o.place === 'mission-center'
			},
			{
				id: 'terminate',
				title: 'Terminate the debris',
				text: 'Select the spent stage and press Terminate, then confirm. Clear debris removes every piece at once.',
				targets: {
					testids: ['mc-terminate', 'mc-terminate-confirm', 'mc-clear-go'],
					commands: ['terminate-vessel']
				},
				done: (o) => o.debris === 0 && o.vessels >= 1
			},
			{
				id: 'back',
				title: 'Back to your ship',
				text: 'Return to Flight from the menu bar.',
				done: (o) => o.place === 'flight'
			}
		],
		debrief:
			'A tidy orbit. Recover brings a landed vessel home for its value; Terminate removes what you no longer need. When the pad is taken, the launch asks the same: recover, terminate or wait.',
		hint: 'In your world, clear old stages from the Mission Center now and then: fewer vessels, fewer warp stops.'
	},
	{
		id: 'moon-base',
		level: 'advanced',
		title: 'A base on the Moon',
		summary:
			'A lander with a base kit stands on flat ground on the Moon: read the base card, found a base, and see it in the Space Center.',
		design: DESIGNS.moonBase,
		setup: [
			{
				fn: 'setLocation',
				args: [{ kind: 'surface', body: 'stock.cinder', latitude: 0.02, longitude: 0.03 }]
			}
		],
		blocked: {
			actions: { stage: 'The kit lander has nothing to stage: it founds a base where it stands.' },
			places: closedPlaces()
		},
		steps: [
			{
				id: 'card',
				point: 'base-card',
				title: 'Read the base card',
				text: 'The kit lander stands on the Moon. The base card, under the vessel panel, lists what you can do here with a base kit: Found a base here, with the body and the spot.',
				targets: { testids: ['base-card'] },
				done: (o) => o.baseOffers.includes('found')
			},
			{
				id: 'found',
				title: 'Found the base',
				text: 'Press Found a base here…, give it a name and press Found it. The kit and the lander are used up: the base is where they stood.',
				targets: { testids: ['base-found-confirm'], commands: ['deploy-base'] },
				done: (o) => o.bases >= 1
			},
			{
				id: 'see',
				title: 'See it in the Space Center',
				text: 'Open the Space Center from the menu bar: the site switcher lists the new base beside the home center.',
				done: (o) => o.place === 'space-center' && o.bases >= 1
			}
		],
		debrief:
			'A base is a site of its own: its hub stores what the drills of vessels standing in its flat zone dig up (Join), an ISRU plant turns ice into propellant, and a landed vessel of the base can Refuel from that storage.',
		hint: 'In your world, carry a base kit to the Moon with a drill rig: found the base, build an ISRU plant in the Space Center, and refuel the lander for the flight home.'
	}
];
