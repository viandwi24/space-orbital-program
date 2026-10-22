/**
 * The lessons' vessels (plan 344, ADR 0293 point 6), built with the mission blueprints' `Build`
 * helper over the editor's operations so they are valid by construction. Each carries what its
 * lesson needs and nothing odd: matching sizes, a decoupler between stages, a reaction wheel for
 * SAS, a parachute and a heat shield where a crew comes home, RCS and monopropellant where it
 * docks, an antenna and power on a probe. The headless tests fly each through its goal.
 */
import type { VesselDesign } from '@orbital/core';
import { Build } from '../editor/missions';
import type { Content } from '../editor/state';

/** Four copies round a part, a quarter turn apart. */
const QUARTER = Math.PI / 4;

/**
 * The capsule a crew comes home in: a parachute on top, the pod, a heat shield under it and a
 * decoupler. Returns the decoupler, for the stage below.
 */
function capsule(b: Build): { chute: number; pod: number; release: number } {
	const pod = 0;
	const chute = b.above('stock.parachute', pod);
	const shield = b.below('stock.heat-shield', pod);
	const release = b.below('stock.decoupler', shield);
	return { chute, pod, release };
}

/**
 * First launch: a one-crew hop. The pod with its parachute and heat shield on a single liquid
 * stage with fins and a reaction wheel: up to about 20 km, drop the stage, come down under the
 * parachute.
 */
export function skylark(content: Content): VesselDesign {
	const b = new Build(content, 'Skylark', 'stock.command-pod');
	const { chute, release } = capsule(b);
	const wheel = b.below('stock.reaction-wheel', release);
	const tank = b.below('stock.tank-small', wheel);
	const engine = b.below('stock.engine-lv', tank);
	b.side('stock.fin', tank, QUARTER, -0.7, 4);
	return b.done([[engine], [release], [chute]]);
}

/**
 * The service module under a capsule: a reaction wheel, batteries, a small tank and the LV-T30
 * (about 2.7 km/s under the capsule, and thrust enough to circularise in a short burn). Returns
 * the engine.
 */
function serviceModule(b: Build, release: number): number {
	const wheel = b.below('stock.reaction-wheel', release);
	b.side('stock.battery-radial', wheel, 0, 0, 2);
	const tank = b.below('stock.tank-small', wheel);
	return b.below('stock.engine-lv', tank);
}

/**
 * The orbit lessons' capsule ship, as it flies in orbit: the capsule on its service module
 * Stage once to light the engine, once to drop the service module,
 * once for the parachute.
 */
export function pathfinderCapsule(content: Content): VesselDesign {
	const b = new Build(content, 'Pathfinder', 'stock.command-pod');
	const { chute, release } = capsule(b);
	const engine = serviceModule(b, release);
	return b.done([[engine], [release], [chute]]);
}

/**
 * The capsule ship on its launcher, for the orbit lessons from the pad: a 2.5 m first stage with
 * fins under the service module, an adapter between them.
 */
export function pathfinder(content: Content): VesselDesign {
	const b = new Build(content, 'Pathfinder', 'stock.command-pod');
	const { chute, release } = capsule(b);
	const engine = serviceModule(b, release);
	const sep = b.below('stock.decoupler', engine);
	const adapter = b.below('stock.adapter-large', sep);
	const core = b.below('stock.tank-wide', adapter);
	const booster = b.below('stock.engine-wide', core);
	b.side('stock.fin', core, QUARTER, -0.7, 4);
	return b.done([[booster], [sep, engine], [release], [chute]]);
}

/**
 * The moon lander: a one-crew can on a reaction wheel and batteries, a small tank, the vacuum
 * engine and four legs. Stage once to light the engine.
 */
export function lander(content: Content): VesselDesign {
	const b = new Build(content, 'Lark Lander', 'stock.lander-can');
	const wheel = b.below('stock.reaction-wheel', 0);
	b.side('stock.battery-radial', wheel, 0, 0, 2);
	const tank = b.below('stock.tank-small', wheel);
	const engine = b.below('stock.engine-vacuum', tank);
	b.side('stock.landing-leg-single', tank, QUARTER, -0.6, 4);
	b.side('stock.light-spot', 0, 0, 0);
	return b.done([[engine]]);
}

/**
 * The docking chaser: a small docking port on the pod's collar, two radial parachutes, the heat
 * shield, and a service module with monopropellant and four RCS blocks round its middle.
 */
export function chaser(content: Content): VesselDesign {
	const b = new Build(content, 'Kestrel', 'stock.command-pod');
	b.above('stock.docking-port-small', 0);
	const chutes = b.side('stock.radial-parachute', 0, 0, 0, 2);
	const shield = b.below('stock.heat-shield', 0);
	const release = b.below('stock.decoupler', shield);
	const wheel = b.below('stock.reaction-wheel', release);
	b.side('stock.battery-radial', wheel, 0, 0, 2);
	const mono = b.below('stock.monoprop-tank', wheel);
	b.side('stock.rcs-block', mono, QUARTER, 0, 4);
	const tank = b.below('stock.tank-small', mono);
	const engine = b.below('stock.engine-vacuum', tank);
	const chuteIds = b.s.design.parts
		.filter((p) => p.part === 'stock.radial-parachute')
		.map((p) => p.index);
	void chutes;
	return b.done([[engine], [release], chuteIds]);
}

/**
 * The docking target: a small station module. A probe core flies it; a small port on an adapter,
 * a reaction wheel, batteries, solar panels and an antenna.
 */
export function beacon(content: Content): VesselDesign {
	const b = new Build(content, 'Beacon Station', 'stock.probe-core');
	const neck = b.above('stock.adapter-small', 0);
	b.above('stock.docking-port-small', neck);
	const wheel = b.below('stock.reaction-wheel', 0);
	const body = b.below('stock.tank-small', wheel);
	b.side('stock.solar-fold', body, 0, 0.2, 2);
	b.side('stock.antenna-whip-radial', body, Math.PI / 2, 0.5);
	b.side('stock.battery-radial', body, Math.PI / 2, -0.5, 2);
	return b.done([]);
}

/**
 * The comms lesson's probe: a satellite bus with a whip antenna, solar panels and a small engine
 * stage, no crew. It needs a link to be flown.
 */
export function relayProbe(content: Content): VesselDesign {
	const b = new Build(content, 'Wren Probe', 'stock.satellite-bus');
	b.side('stock.antenna-whip-radial', 0, 0, 0.3);
	b.side('stock.solar-fold', 0, Math.PI / 2, 0, 2);
	const tank = b.below('stock.tank-small', 0);
	const engine = b.below('stock.engine-vacuum', tank);
	return b.done([[engine]]);
}

/** A relay satellite high above: the relay dish on a satellite bus with solar wings. */
export function relaySatellite(content: Content): VesselDesign {
	const b = new Build(content, 'Relay One', 'stock.antenna-relay');
	const bus = b.below('stock.satellite-bus', 0);
	b.below('stock.solar-wings', bus);
	return b.done([]);
}

/**
 * The robotics lesson's arm on the pad: a probe core on batteries, a hinge, an arm segment, a
 * second hinge and a light at the tip.
 */
export function arm(content: Content): VesselDesign {
	const b = new Build(content, 'Heron Arm', 'stock.probe-core');
	const base = b.below('stock.battery-medium', 0);
	b.side('stock.solar-flat', base, 0, 0, 2);
	b.side('stock.antenna-whip-radial', base, Math.PI / 2, 0);
	const shoulder = b.above('stock.hinge-s', 0);
	const segment = b.above('stock.tank-0625', shoulder);
	const elbow = b.above('stock.hinge-s', segment);
	b.above('stock.docking-port-small', elbow);
	return b.done([]);
}

/** A spent upper stage left in orbit: the Mission Center lesson's debris. */
export function spentStage(content: Content): VesselDesign {
	const b = new Build(content, 'Spent stage', 'stock.decoupler');
	const tank = b.below('stock.tank-small', 0);
	b.below('stock.engine-vacuum', tank);
	return b.done([]);
}
