/**
 * Basics (plan 344): the first launch, the Hangar, reaching orbit by hand, changing it with nodes,
 * coming home, and the Space Center.
 */
import type { Lesson } from './lessons';
import { HOME_AIR, IN_PARKING_ORBIT, LIGHT, RAISED_ORBIT, closedPlaces } from './lesson-kit';
import { pathfinder, pathfinderCapsule, skylark } from './lesson-vessels';

export const BASIC_LESSONS: readonly Lesson[] = [
	{
		id: 'first-launch',
		level: 'basics',
		title: 'First launch',
		summary:
			'A one-seat hop from the pad: throttle, stage, hold the nose up with SAS, cut the engine at 20 km, drop the stage and come down under the parachute.',
		design: skylark,
		setup: [],
		blocked: {
			actions: { map: 'Stay with the rocket in this lesson: the map is for orbits.' },
			places: closedPlaces()
		},
		steps: [
			{
				id: 'throttle',
				point: 'hud-throttle',
				title: 'Throttle up',
				text: 'Skylark stands on the pad: a capsule with its parachute on top, a fuel tank and an engine below. Press {key:throttleFull} for full throttle; {key:throttleUp} and {key:throttleDown} change it gradually.',
				touchText:
					'Skylark stands on the pad: a capsule with its parachute on top, a fuel tank and an engine below. Drag the throttle up, or tap Full.',
				actions: ['throttleFull'],
				done: (o) => o.throttle > 0.5
			},
			{
				id: 'stage',
				point: 'stage-go',
				title: 'Light the engine',
				text: 'Press {key:stage}. Each press fires the next stage in the stage stack at the bottom right: the first lights the engine.',
				touchText:
					'Tap Stage. Each tap fires the next stage in the stage stack at the bottom right: the first lights the engine.',
				actions: ['stage'],
				done: (o) => o.stagesFired >= 1
			},
			{
				id: 'sas',
				point: 'hud-sas',
				title: 'Hold it straight',
				text: 'Press {key:sasToggle} to switch on SAS, the stability assist: the reaction wheel and the engine’s gimbal hold the nose where it points. Climb past 1 km.',
				touchText:
					'Tap SAS to switch on the stability assist: the reaction wheel and the engine’s gimbal hold the nose where it points. Climb past 1 km.',
				actions: ['sasToggle'],
				done: (o) => o.sasMode !== 'off' && o.altitude > 1_000
			},
			{
				id: 'cut',
				point: 'dock-tab-host.orbit',
				title: 'Cut at 20 km',
				text: 'Watch Ap, the top of your flight, in the Orbit panel on the left. When it passes 20 km, cut the engine with {key:throttleCut}: the rocket coasts up the rest of the way.',
				touchText:
					'Watch Ap, the top of your flight, in the Orbit panel on the left. When it passes 20 km, tap Cut: the rocket coasts up the rest of the way.',
				actions: ['throttleCut'],
				targets: { panels: ['host.orbit'] },
				done: (o) => (o.apoapsis ?? 0) >= 18_000 && o.throttle < 0.05
			},
			{
				id: 'drop',
				point: 'stage-go',
				title: 'Drop the stage',
				text: 'Press {key:stage} again: the decoupler under the heat shield lets the tank and engine go. Only the capsule comes home.',
				touchText:
					'Tap Stage again: the decoupler under the heat shield lets the tank and engine go. Only the capsule comes home.',
				actions: ['stage'],
				done: (o) => o.stagesFired >= 2
			},
			{
				id: 'chute',
				point: 'stage-go',
				title: 'Open the parachute',
				text: 'Press {key:stage} once more to arm the parachute. It opens by itself when the air is thick enough and the capsule slow enough.',
				touchText:
					'Tap Stage once more to arm the parachute. It opens by itself when the air is thick enough and the capsule slow enough.',
				actions: ['stage'],
				done: (o) => o.parachute
			},
			{
				id: 'touchdown',
				title: 'Touch down',
				text: 'Ride it down. Under the open canopy the capsule lands at a few metres per second.',
				done: (o) => (o.landed || o.splashed) && o.stagesFired >= 3
			}
		],
		debrief:
			'You flew a whole flight: throttle, stages, SAS, the parachute. Every rocket after this one is the same few controls, with more stages.',
		hint: 'In your world, open the Hangar, load the "Two-stage starter" from the Library and fly it the same way.'
	},
	{
		id: 'hangar',
		level: 'basics',
		title: 'Building in the Hangar',
		summary:
			'Start from an empty Hangar: look at the Blueprint Library, then build your own rocket with a pod, a tank, an engine, fins in symmetry and a parachute, until the pre-flight checks are clear.',
		start: 'vab',
		setup: [],
		blocked: { actions: {}, places: closedPlaces('vab') },
		steps: [
			{
				id: 'library',
				point: 'vab-open-library',
				title: 'Open the Library',
				text: 'The Hangar is empty. Press Open the Library: finished rockets, from a two-stage starter to famous missions. Load one any time; for now, close it and build your own.',
				targets: { testids: ['vab-open-library'] },
				done: (o) => o.vab?.library === true
			},
			{
				id: 'pod',
				title: 'Place a command pod',
				text: 'Pick the Command Pod in the parts list on the left (Command), then click the glowing ring on the platform. Every vessel needs something that controls it: a pod with crew, or a probe core.',
				done: (o) => o.vab !== null && !o.vab.library && o.vab.command
			},
			{
				id: 'stack',
				title: 'A tank and an engine',
				text: 'Attach a fuel tank under the pod and an engine under the tank: click a part, then the ring where it goes. Sizes should match: the ring shows the node’s size.',
				done: (o) => o.vab?.tank === true && o.vab.engine
			},
			{
				id: 'fins',
				title: 'Fins in symmetry',
				text: 'Set Sym to ×4 in the tool bar at the bottom (or press {key:symmetry}), pick a fin and click the side of the tank near the bottom: four fins at once keep the rocket pointing ahead. Free lets you place a part anywhere on a surface.',
				actions: ['symmetry'],
				targets: { testids: ['tool-free'] },
				done: (o) => (o.vab?.fins ?? 0) >= 3 && o.vab?.symmetry === true
			},
			{
				id: 'chute',
				title: 'A parachute on top',
				text: 'Put a parachute on the pod’s top ring: without one the checks warn that the crew cannot come home.',
				done: (o) => o.vab?.parachute === true
			},
			{
				id: 'checks',
				point: 'preflight-verdict',
				title: 'Clear the checks',
				text: 'The Pre-flight checks on the right list what blocks a launch in red. Fix each one (staging, a part that does not fit) until they read Ready for launch.',
				targets: { testids: ['preflight-verdict', 'menu-launch'] },
				done: (o) => o.vab?.checksClear === true && (o.vab?.parts ?? 0) >= 5
			}
		],
		debrief:
			'Your rocket is ready to fly: a pod, a stack, fins and a parachute, staged and checked. Launch sits above the vessel stats on the right; the Launch screen then puts it on the pad.',
		hint: 'In your world, build this rocket again and launch it, or start from a blueprint in the Library and change it.'
	},
	{
		id: 'orbit',
		level: 'basics',
		title: 'Orbit by hand',
		summary:
			'Pathfinder on the pad: lift off, turn east early, drop the booster, push the apoapsis to 80 km, then circularise at the top.',
		design: pathfinder,
		setup: [],
		blocked: { actions: {}, places: closedPlaces() },
		steps: [
			{
				id: 'liftoff',
				point: 'stage-go',
				title: 'Lift off',
				text: 'Press {key:throttleFull}, then {key:stage} to light the 2.5 m booster. Switch SAS on with {key:sasToggle}.',
				touchText: 'Tap Full, then Stage to light the 2.5 m booster. Switch SAS on.',
				actions: ['throttleFull', 'stage', 'sasToggle'],
				done: (o) => o.stagesFired >= 1 && o.throttle > 0.5 && o.sasMode !== 'off'
			},
			{
				id: 'turn',
				point: 'sas-prograde',
				title: 'Lean east',
				text: 'Past 1 km, tip the nose about 10° towards heading 090 with {key:pitchPlus}, {key:pitchMinus}, {key:yawMinus} and {key:yawPlus}. Then press {key:sasPrograde}: SAS follows the prograde marker and the rocket bends its own arc, the gravity turn.',
				touchText:
					'Past 1 km, tip the nose about 10° towards heading 090 with the steering pad, then tap the prograde button beside the navball: SAS follows the prograde marker and the rocket bends its own arc.',
				actions: ['sasPrograde'],
				done: (o) => o.sasMode === 'prograde' && o.altitude > 1_000
			},
			{
				id: 'booster',
				point: 'stage-go',
				title: 'Drop the booster',
				text: 'When the booster runs dry, press {key:stage}: it falls away and the service module’s engine lights in one press.',
				touchText:
					'When the booster runs dry, tap Stage: it falls away and the service module’s engine lights in one press.',
				actions: ['stage'],
				done: (o) => o.stagesFired >= 2
			},
			{
				id: 'apoapsis',
				point: 'dock-tab-host.orbit',
				title: 'Apoapsis to 80 km',
				text: 'Burn until Ap in the Orbit panel passes 80 km, then cut with {key:throttleCut}. Above 70 km there is no air to slow you.',
				touchText:
					'Burn until Ap in the Orbit panel passes 80 km, then tap Cut. Above 70 km there is no air to slow you.',
				actions: ['throttleCut'],
				targets: { panels: ['host.orbit'] },
				done: (o) => (o.apoapsis ?? 0) >= 78_000 && o.throttle < 0.05
			},
			{
				id: 'circularise',
				point: 'hud-warp',
				title: 'Circularise',
				text: 'Coast to the top: {key:warpUp} speeds up time and {key:warpDown} slows it again. A few seconds before Ap, point prograde and burn until Pe is above 70 km too.',
				touchText:
					'Coast to the top (the warp buttons speed up time). A few seconds before Ap, point prograde and burn until Pe is above 70 km too.',
				actions: ['warpUp', 'sasPrograde'],
				done: (o) => (o.periapsis ?? -Infinity) >= HOME_AIR
			}
		],
		goal: (o) => (o.periapsis ?? -Infinity) >= HOME_AIR,
		debrief:
			'In orbit: you fall round Home faster than you fall towards it. The early, gentle turn is what saves fuel; turning late spends it climbing straight up.',
		hint: 'In your world, fly the same arc with any rocket of 3.4 km/s or more; the Guidance Computer’s Ascent tab can fly it for you (Flight lessons).'
	},
	{
		id: 'nodes',
		level: 'basics',
		title: 'Maneuver nodes',
		summary:
			'From a 100 km orbit: plan a burn with a node, set its Δv, raise the apoapsis and circularise at 250 km.',
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
				text: 'Press {key:map}. Your orbit is the line around Home, with its Ap and Pe markers.',
				touchText: 'Tap Map. Your orbit is the line around Home, with its Ap and Pe markers.',
				actions: ['map'],
				done: (o) => o.map
			},
			{
				id: 'node',
				title: 'Add a node',
				text: 'Click your orbit line a quarter of the way ahead of the vessel: a node appears there. A node is a burn you plan before you fly it.',
				done: (o) => o.nodes >= 1
			},
			{
				id: 'dv',
				point: 'maneuver-expand',
				title: 'Set the Δv',
				text: 'In the node card, press Edit the burn and type a prograde Δv of about 85 m/s (or drag the green handle on the map). The dashed line is the orbit after the burn: its Ap rises to about 250 km.',
				targets: { testids: ['maneuver-expand', 'node-*'] },
				done: (o) => o.nodePrograde >= 50
			},
			{
				id: 'burn',
				point: 'maneuver-point',
				title: 'Fly the node',
				text: 'Press {key:sasManeuver} to point at the node and warp up to it with {key:warpUp}. Start at full throttle when the countdown reaches half the burn time, and cut when the node has no Δv left.',
				actions: ['sasManeuver', 'warpUp'],
				targets: { testids: ['maneuver-warp', 'maneuver-point'] },
				done: (o) => (o.apoapsis ?? 0) >= RAISED_ORBIT - 10_000
			},
			{
				id: 'circularise',
				title: 'Circularise',
				text: 'At the new Ap, add a second node and type the prograde Δv that lifts Pe to the same height (about 80 m/s). Fly it the same way.',
				done: (o) => (o.periapsis ?? -Infinity) >= RAISED_ORBIT - 10_000
			}
		],
		goal: (o) =>
			(o.periapsis ?? -Infinity) >= RAISED_ORBIT - 10_000 &&
			(o.apoapsis ?? Infinity) <= RAISED_ORBIT + 60_000,
		debrief:
			'Two burns half an orbit apart move you from one circle to another: a Hohmann transfer. A node lets you see the result before you spend the fuel.',
		hint: 'In your world, plan every orbit change with a node; the Guidance Computer’s Orbit tab can fly a node for you (Execute node).'
	},
	{
		id: 'reentry',
		level: 'basics',
		title: 'Coming home',
		summary:
			'From a 100 km orbit: burn retrograde to bring the periapsis into the air, drop the service module, keep the heat shield first and land under the parachute.',
		design: pathfinderCapsule,
		setup: [IN_PARKING_ORBIT, LIGHT],
		blocked: { actions: {}, places: closedPlaces() },
		steps: [
			{
				id: 'retrograde',
				point: 'sas-retrograde',
				title: 'Point retrograde',
				text: 'Press {key:sasRetrograde}: SAS turns the engine to face along your motion, so a burn slows you.',
				touchText:
					'Tap the retrograde button beside the navball: SAS turns the engine to face along your motion.',
				actions: ['sasRetrograde'],
				done: (o) => o.sasMode === 'retrograde'
			},
			{
				id: 'deorbit',
				point: 'dock-tab-host.orbit',
				title: 'Lower the periapsis',
				text: 'Burn with {key:throttleFull} until Pe in the Orbit panel is below 30 km, then cut with {key:throttleCut}. The air at 30 km will do the rest of the braking.',
				touchText:
					'Burn until Pe in the Orbit panel is below 30 km, then tap Cut. The air at 30 km will do the rest of the braking.',
				actions: ['throttleFull', 'throttleCut'],
				targets: { panels: ['host.orbit'] },
				done: (o) => o.periapsis !== null && o.periapsis < 30_000 && o.throttle < 0.05
			},
			{
				id: 'separate',
				point: 'stage-go',
				title: 'Drop the service module',
				text: 'Press {key:stage}: the decoupler lets the service module go. The heat shield is now the capsule’s bottom.',
				touchText:
					'Tap Stage: the decoupler lets the service module go. The heat shield is now the capsule’s bottom.',
				actions: ['stage'],
				done: (o) => o.stagesFired >= 2
			},
			{
				id: 'shield',
				point: 'sas-retrograde',
				title: 'Shield first',
				text: 'Keep SAS on retrograde ({key:sasRetrograde}) so the shield faces the air. Below 50 km the capsule glows: that heat is speed turning into fire on the shield.',
				actions: ['sasRetrograde'],
				done: (o) => o.altitude < 50_000 && o.sasMode === 'retrograde'
			},
			{
				id: 'chute',
				point: 'stage-go',
				title: 'Arm the parachute',
				text: 'Press {key:stage} to arm the parachute. It waits until the capsule is slow enough, then opens.',
				touchText: 'Tap Stage to arm the parachute. It waits until the capsule is slow enough.',
				actions: ['stage'],
				done: (o) => o.parachute
			},
			{
				id: 'touchdown',
				title: 'Splash or land',
				text: 'Ride it down. Land or water: either is a safe end for a capsule.',
				done: (o) => o.landed || o.splashed
			}
		],
		debrief:
			'Home safe. A capsule comes back with a retrograde burn, a shield first into the air and a parachute at the end: that is why every crewed ship carries all three.',
		hint: 'In your world, check every crewed design for a heat shield and a parachute before you launch; the pre-flight checks warn when the chute is missing.'
	},
	{
		id: 'space-center',
		level: 'basics',
		title: 'The Space Center',
		summary:
			'A walk round the Space Center: Administration, Research, the Astronaut Complex with its crew, the Mission Center and the Hangar.',
		start: 'space-center',
		setup: [],
		blocked: { actions: {}, places: closedPlaces('vab', 'rnd', 'administration', 'astronauts') },
		steps: [
			{
				id: 'administration',
				title: 'Administration',
				text: 'Click Administration on the Space Center. In a Career world this is where funds, contracts and strategies live: contracts pay for the rockets that fulfil them. A Sandbox world, like this one, has no money to count.',
				done: (o) => o.place === 'administration'
			},
			{
				id: 'rnd',
				title: 'Research',
				text: 'Back to the Space Center (the menu bar at the top), then Research and Development. Science you bring home or transmit buys new parts here in Career and Science worlds.',
				done: (o) => o.place === 'rnd'
			},
			{
				id: 'astronauts',
				title: 'The Astronaut Complex',
				text: 'Open the Astronaut Complex: your crew, their levels and who flies what. A pod launched with an empty seat takes the next available astronaut.',
				done: (o) => o.place === 'astronauts'
			},
			{
				id: 'mission-center',
				title: 'The Mission Center',
				text: 'Open the Mission Center: every vessel in flight, where it is, and what to do with it: switch to it, recover it from the ground, or terminate what you no longer need.',
				done: (o) => o.place === 'mission-center'
			},
			{
				id: 'hangar',
				title: 'The Hangar',
				text: 'Last, the Hangar: where every rocket starts. Upgrading a building (on its card in the Space Center) raises its limits, such as the parts per vessel.',
				done: (o) => o.place === 'vab'
			}
		],
		debrief:
			'That is the whole base: build in the Hangar, fly from the pad, follow your fleet in the Mission Center, and in Career pay for it all through contracts in Administration.',
		hint: 'In your world, start a Career game to see funds, contracts and the tech tree at work.'
	}
];
