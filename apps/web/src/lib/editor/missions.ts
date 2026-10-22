/**
 * Famous-mission blueprints (plan 286, ADRs 0255, 0263), built through the editor operations so
 * they are valid by construction. Each carries what its mission needs: control, crew or a probe
 * core, RCS, power, antennas, parachutes and a heat shield where it comes home. Names are
 * fictional (ADR 0255); `inspiredBy` says which real mission they recall.
 */
import { partId, type VesselDesign } from '@orbital/core';
import type { Paint } from '@orbital/mod-stock';
import {
	attachConnector,
	attachNew,
	attachTargets,
	createEditor,
	radialTarget,
	singlePart,
	type Content,
	type EditorState
} from './state';
import { autoStages } from './staging';

export interface MissionBlueprint {
	id: string;
	title: string;
	inspiredBy: string;
	/** `surface`: it drives where it is launched, lying level (plan 307: a rover). */
	goal: 'orbit' | 'moon' | 'station' | 'deep-space' | 'surface';
	crew: number;
	summary: string;
	build(content: Content): VesselDesign;
}

/** A small builder over the editor's operations: stack below or above, hang on a side (also the lessons' vessels, plan 344). */
export class Build {
	s: EditorState;
	constructor(
		private readonly content: Content,
		name: string,
		root: string
	) {
		this.s = createEditor(
			{
				formatVersion: 3,
				name,
				parts: [{ index: 0, part: partId(root), parent: null }],
				stages: []
			},
			content
		);
	}
	private last(part: string): number {
		return this.s.design.parts.filter((p) => p.part === part).at(-1)!.index;
	}
	/**
	 * Attach `part` to `node` of `parent`; the child's matching node is found by the editor, or is
	 * `childNode`. A sideways node (a hub's side port) turns the part onto it (plan 308).
	 */
	on(part: string, parent: number, node: string, childNode?: string): number {
		const t = attachTargets(
			this.s.design,
			singlePart(part, this.s.nextIndex),
			this.content.parts
		).find(
			(x) =>
				x.parent?.index === parent &&
				x.parent.parentNode === node &&
				(childNode === undefined || x.node === childNode)
		);
		if (!t)
			throw new Error(
				`no ${node} node on part ${parent} for ${part}: ${JSON.stringify(this.s.design.parts.map((p) => [p.index, p.part]))} targets ${JSON.stringify(attachTargets(this.s.design, singlePart(part, this.s.nextIndex), this.content.parts).map((x) => [x.parent?.index, x.parent?.parentNode, x.node]))}`
			);
		this.s = attachNew(this.s, this.content, part, t);
		return this.last(part);
	}
	below(part: string, parent: number): number {
		return this.on(part, parent, 'bottom');
	}
	above(part: string, parent: number): number {
		return this.on(part, parent, 'top');
	}
	/** `n` copies round `parent` from `angle` at height `y` (fraction of its half height). */
	side(part: string, parent: number, angle: number, y: number, n = 1): number {
		const t = radialTarget(
			this.s.design,
			singlePart(part, this.s.nextIndex),
			this.content.parts,
			parent,
			angle,
			y
		);
		if (!t) throw new Error(`no radial site on part ${parent} for ${part}`);
		this.s = attachNew(this.s, this.content, part, t, n);
		return this.last(part);
	}
	/** A fuel line from `from` (its surface at `fromAngle`, `fromY`) to `to` (ADR 0071). */
	line(
		from: number,
		fromAngle: number,
		fromY: number,
		to: number,
		toAngle: number,
		toY: number
	): void {
		this.s = attachConnector(
			this.s,
			this.content,
			'stock.fuel-line',
			{ index: from, angle: fromAngle, y: fromY },
			{ index: to, angle: toAngle, y: toY }
		);
	}
	done(stages?: number[][]): VesselDesign {
		const design = this.s.design;
		return { ...design, stages: stages ?? autoStages(design, this.content) };
	}
}

/** `design` with each listed part painted (plan 355: the Hangar's Paint setting, `stock.paint`). */
function painted(paint: Readonly<Record<number, Paint>>, design: VesselDesign): VesselDesign {
	return {
		...design,
		parts: design.parts.map((p) =>
			paint[p.index]
				? { ...p, settings: { ...p.settings, 'stock.paint': { paint: paint[p.index] } } }
				: p
		)
	};
}

/**
 * A launcher under a 1.25 m payload: an upper stage (medium tank, engine) and a 2.5 m core stage
 * (adapter, wide tank, wide engine) with fins.
 */
function launcher125(b: Build, top: number): number {
	const dec = b.below('stock.decoupler', top);
	const upper = b.below('stock.tank-medium', dec);
	const upperEngine = b.below('stock.engine-lv', upper);
	const lower = b.below('stock.decoupler', upperEngine);
	const adapter = b.below('stock.adapter-large', lower);
	const core = b.below('stock.tank-wide', adapter);
	const coreEngine = b.below('stock.engine-wide', core);
	b.side('stock.fin', core, Math.PI / 4, -0.7, 4);
	return coreEngine;
}

export const MISSION_BLUEPRINTS: readonly MissionBlueprint[] = [
	{
		id: 'kronos-selene',
		title: 'Kronos V + Selene',
		inspiredBy: 'Apollo 11 (Saturn V, command and service module, lunar module)',
		goal: 'moon',
		crew: 3,
		summary:
			'Three stages to the moon. The 3-seat capsule with a docking port under its escape tower (after the tower goes it turns round and docks with the lander), a service module with four RCS quads, a dish and a fuel cell, and a two-stage lander in the petals.',
		build(content) {
			const b = new Build(content, 'Kronos V + Selene', 'stock.pod-3');
			const pod = 0;
			// the capsule's docking port (Apollo's probe) under the escape tower: after the tower goes,
			// the command ship turns round and docks with the lander's port (owner, 2026-10-22)
			const neck = b.above('stock.adapter-small', pod);
			const probe = b.above('stock.docking-port-small', neck);
			const tower = b.above('stock.escape-tower', probe);
			const shield = b.below('stock.heat-shield-wide', pod);
			// the capsule leaves the service module before re-entry (Apollo's CM/SM separation)
			const cmSep = b.below('stock.decoupler-wide', shield);
			const sm = b.below('stock.tank-wide-short', cmSep);
			b.side('stock.rcs-block-5', sm, Math.PI / 4, 0.3, 4);
			// and on the capsule, ahead of them: thrusters at both ends turn the ship (owner, 2026-10-22)
			b.side('stock.rcs-block', pod, Math.PI / 4, -0.2, 4);
			// the quads' monopropellant (owner, 2026-10-21: RCS said "no propellant")
			b.side('stock.monoprop-radial', sm, Math.PI / 2, 0, 2);
			b.side('stock.antenna-dish-fold', sm, 0, -0.3);
			b.side('stock.fuel-cell', sm, Math.PI, -0.3);
			const smEngine = b.below('stock.engine-wide', sm);
			const smDec = b.below('stock.decoupler-wide', smEngine);
			const petals = b.below('stock.payload-petals', smDec);
			// the lander sits on a decoupler in the petals: released once the capsule has docked with it
			const lmRelease = b.on('stock.decoupler', petals, 'inner');
			const descent = b.above('stock.lander-descent', lmRelease);
			b.side('stock.landing-leg-single', descent, Math.PI / 4, -0.2, 4);
			// the ascent stage lifts off the descent stage, as Apollo's did
			const lmStage = b.above('stock.decoupler', descent);
			const ascent = b.above('stock.lander-ascent', lmStage);
			b.side('stock.rcs-block', ascent, Math.PI / 4, 0.4, 4);
			b.side('stock.rcs-block', descent, Math.PI / 4, 0.3, 4);
			b.side('stock.antenna-whip-radial', ascent, Math.PI / 2, -0.3);
			b.above('stock.docking-port-small', ascent);
			const sivb = b.below('stock.tank-3750', petals);
			const sivbEngine = b.below('stock.engine-plate-8', sivb);
			const d2 = b.below('stock.decoupler-3750', sivbEngine);
			const adapter = b.below('stock.adapter-3750-5000', d2);
			const sii = b.below('stock.tank-5000-long', adapter);
			const siiEngine = b.below('stock.engine-plate-5', sii);
			const d1 = b.below('stock.decoupler-5000', siiEngine);
			const sic = b.below('stock.tank-5000-long', d1);
			const sicEngine = b.below('stock.engine-plate-5', sic);
			b.side('stock.fin', sic, Math.PI / 4, -0.7, 4);
			// the Apollo sequence, one press each (owner, 2026-10-22: the lander engines lit at launch):
			// S-IC; S-II and the tower; S-IVB (orbit, then the burn to the moon); the command ship
			// leaves the S-IVB and the petals are thrown off, with no engine burning (owner, 2026-10-21:
			// the payload looked flung away when the service engine lit in the same press); the
			// service engine (turn round, dock with the lander); the lander is released; the descent
			// engine; the ascent stage leaves the descent stage; the capsule leaves the service
			// module; the parachutes
			// the Apollo stack's paint (plan 355): the first stage's roll pattern and foil-wrapped
			// engines, the second stage's black top, the third stage's black aft band, a silver
			// command module on a radiator-striped service module
			const paint: Record<number, Paint> = {
				[sic]: 'roll',
				[sicEngine]: 'foil-engines',
				[sii]: 'top-band',
				[sivb]: 'aft-band',
				[sm]: 'service',
				[pod]: 'steel'
			};
			return painted(
				paint,
				b.done([
					[sicEngine],
					[d1, siiEngine, tower],
					[d2, sivbEngine],
					[smDec, petals],
					[smEngine],
					[lmRelease],
					[descent],
					[lmStage, ascent],
					[cmSep],
					[pod]
				])
			);
		}
	},
	{
		id: 'wayfarer-shuttle',
		title: 'Wayfarer Shuttle',
		inspiredBy:
			'the Space Shuttle and Energia-Buran (winged orbiter, solid boosters, main engines under the tank)',
		goal: 'orbit',
		crew: 4,
		summary:
			'A winged orbiter on a foam-covered tank between two solid boosters, a station module docked in its cargo bay. The main engines are under the tank, so the thrust runs through the stack. In orbit the orbiter burns on its own engines; open the bay doors, then Undock the module (or stage) and it drifts out of the bay.',
		build(content) {
			const b = new Build(content, 'Wayfarer Shuttle', 'stock.orbiter-nose');
			// the orbiter (plan 356): nose, cargo bay, engine section; the OMS propellant is in the aft
			const bay = b.below('stock.orbiter-bay', 0);
			const aft = b.below('stock.orbiter-aft', bay);
			// the payload, docked: a port on the bay's keel, the module's side port face to face on it
			// (ADR 0300), the module lying along the bay
			const keel = b.on('stock.docking-port', bay, 'keel', 'bottom');
			const side = b.on('stock.docking-port-side', keel, 'top', 'side');
			const cabin = b.on('stock.crew-cabin', side, 'bottom');
			const core = b.on('stock.probe-core', side, 'top');
			// a berth at the far end for whatever docks with it later
			b.above('stock.docking-port-small', b.above('stock.airlock', core));
			// two more berths on the bay's inner bulkheads, fore and aft (owner, 2026-10-22): a module
			// brought back, or a second payload, docks there
			b.on('stock.docking-port', bay, 'fore', 'bottom');
			b.on('stock.docking-port', bay, 'aft', 'bottom');
			b.side('stock.solar-flat', cabin, Math.PI / 2, 0, 2);
			// the wings far aft, behind the centre of mass, on the bay's aft end, either side (±X);
			// the tank on the belly (-Z, an angle of pi/2), the bay doors (+Z) away from it
			b.side('stock.wing-delta', bay, 0, -0.7, 2);
			// RCS at both ends, so it turns as well as it moves (owner, 2026-10-22): four round the nose,
			// a pair on the aft sides (the OMS pods' thrusters); none on the bay's top corners, the doors
			b.side('stock.rcs-block-5', 0, Math.PI / 4, -0.55, 4);
			b.side('stock.rcs-block-5', bay, 0, -0.9, 2);
			const rd = b.side('stock.radial-decoupler', bay, Math.PI / 2, -0.2);
			const et = b.on('stock.external-tank', rd, 'outer');
			b.side('stock.radial-decoupler', et, Math.PI / 2, -0.2, 2);
			const srbDecs = b.s.design.parts
				.filter((p) => p.part === 'stock.radial-decoupler' && p.parent?.index === et)
				.map((p) => p.index);
			// one attach: the decouplers' symmetry puts a booster on each
			b.on('stock.nose-cone-1875', b.on('stock.srb-xl', srbDecs.at(-1)!, 'outer'), 'top');
			const srbs = b.s.design.parts.filter((p) => p.part === 'stock.srb-xl').map((p) => p.index);
			// the main engines sit under the tank, on the stack's axis (as Energia under Buran): the
			// orbiter's own engines, 3 m off the centre of mass, would turn the stack over (plan 309)
			const mains = b.below('stock.engine-plate-8', et);
			// core engines and boosters light together; the boosters drop; the tank drops and the
			// orbiter's own engines light for the orbit burn; the module undocks from the open bay
			const design = b.done([[mains, ...srbs], srbDecs, [rd, aft], [side]]);
			// the far wing (symmetry turns it half round) has its tiles on its top face, so both
			// wings show them underneath; the last stage undocks the module ("Undock on stage")
			const farWing = (p: VesselDesign['parts'][number]) =>
				p.part === 'stock.wing-delta' && Math.abs((p.parent?.radial?.angle ?? 0) - Math.PI) < 0.1;
			return {
				...design,
				parts: design.parts.map((p) =>
					p.index === side
						? { ...p, settings: { ...p.settings, 'stock.docking-port': { stageUndock: true } } }
						: farWing(p)
							? { ...p, settings: { ...p.settings, 'stock.wing': { tilesUp: true } } }
							: p
				)
			};
		}
	},
	{
		id: 'horizon-station',
		title: 'Horizon Station',
		inspiredBy: 'a modular space station (ISS, Mir)',
		goal: 'station',
		crew: 0,
		summary:
			'The station core: a habitat under a six-port hub. Five docking berths: 1.25 m ports on top, north (on the control module) and south, a small port on the airlock, and a 2.5 m port under the habitat that is free once the launcher drops. A cupola, two big tracking arrays, radiators, RCS and a dish; flown up uncrewed on a core stage with four solid boosters.',
		build(content) {
			const b = new Build(content, 'Horizon Station', 'stock.hub');
			b.above('stock.docking-port', 0);
			// the hub's side ports (plan 308): an airlock with a small port, and a cupola
			const airlock = b.on('stock.airlock', 0, 'east', 'bottom');
			b.above('stock.docking-port-small', airlock);
			b.on('stock.cupola', 0, 'west', 'bottom');
			// the control module on the north port (it flies the station up uncrewed), with a port of
			// its own, and a port on the south side: four 1.25 m berths for ferries and modules
			const control = b.on('stock.satellite-bus', 0, 'north', 'bottom');
			b.above('stock.docking-port', control);
			b.on('stock.docking-port', 0, 'south', 'bottom');
			// the hub's 1.25 m bottom widens to the 2.5 m habitat (they met without an adapter)
			const neck = b.below('stock.adapter-large', 0);
			const hab = b.below('stock.hab-module', neck);
			b.side('stock.solar-array-xl', hab, Math.PI / 2, 0.5, 2);
			b.side('stock.radiator', hab, 0, -0.3, 2);
			// RCS at both ends of the habitat, so the station turns as well as it moves
			b.side('stock.rcs-block', hab, Math.PI / 4, 0.8, 4);
			b.side('stock.rcs-block', hab, Math.PI / 4, -0.8, 4);
			// the station's RCS propellant (owner, 2026-10-21: RCS said "no propellant")
			b.side('stock.monoprop-radial', hab, (3 * Math.PI) / 4, -1, 2);
			b.side('stock.antenna-dish-fold', hab, Math.PI, -0.6);
			// a 2.5 m berth under the habitat, free once the launcher drops (owner, 2026-10-22)
			const berth = b.below('stock.docking-port-large', hab);
			const dec = b.below('stock.decoupler-wide', berth);
			const tank = b.below('stock.tank-wide', dec);
			const tank2 = b.below('stock.tank-wide', tank);
			const engine = b.below('stock.engine-wide', tank2);
			b.side('stock.fin', tank2, Math.PI / 4, -0.7, 4);
			// four solid boosters: liftoff thrust-to-weight was 1.16 and the core alone barely made orbit
			const boosterDecs = b.side('stock.radial-decoupler', tank2, 0, 0, 4);
			b.on('stock.srb-large', boosterDecs, 'outer');
			const decs = b.s.design.parts
				.filter((p) => p.part === 'stock.radial-decoupler')
				.map((p) => p.index);
			const srbs = b.s.design.parts.filter((p) => p.part === 'stock.srb-large').map((p) => p.index);
			return b.done([[engine, ...srbs], decs, [dec]]);
		}
	},
	{
		id: 'moonwatch-orbiter',
		title: 'Moonwatch Orbiter',
		inspiredBy: 'a planetary orbiter (a Mars or moon orbiter)',
		goal: 'moon',
		crew: 0,
		summary:
			'A probe that flies to the moon and stays in orbit: a satellite bus with a relay dish, solar wings, an RTG, instruments and its own engine.',
		build(content) {
			const b = new Build(content, 'Moonwatch Orbiter', 'stock.antenna-relay');
			const bus = b.below('stock.satellite-bus', 0);
			b.side('stock.rtg-radial', bus, 0, 0);
			b.side('stock.thermometer-radial', bus, Math.PI / 2, 0.3);
			b.side('stock.magnetometer-boom', bus, Math.PI, 0);
			const wings = b.below('stock.solar-wings', bus);
			const tank = b.below('stock.tank-small', wings);
			// RCS at both ends: on the bus above the wings and on the tank below them
			b.side('stock.rcs-block', bus, Math.PI / 4, 0.3, 4);
			b.side('stock.rcs-block', tank, Math.PI / 4, -0.5, 4);
			const eng = b.below('stock.engine-vacuum', tank);
			launcher125(b, eng);
			return b.done();
		}
	},
	{
		id: 'horizon-telescope',
		title: 'Horizon Telescope',
		inspiredBy: 'a space telescope (Hubble)',
		goal: 'orbit',
		crew: 0,
		summary:
			'A telescope with an aperture door on a satellite bus with solar wings, a dish and RCS, for high orbit.',
		build(content) {
			const b = new Build(content, 'Horizon Telescope', 'stock.telescope');
			const bus = b.below('stock.satellite-bus', 0);
			b.side('stock.antenna-dish-fold', bus, 0, 0.2);
			const wings = b.below('stock.solar-wings', bus);
			const tank = b.below('stock.tank-small', wings);
			// RCS at both ends: round the telescope's tube and round the tank under the wings
			b.side('stock.rcs-block', 0, Math.PI / 4, -0.5, 4);
			b.side('stock.rcs-block', tank, Math.PI / 4, -0.5, 4);
			const eng = b.below('stock.engine-vacuum', tank);
			launcher125(b, eng);
			return b.done();
		}
	},
	{
		id: 'aurora-satellite',
		title: 'Aurora Research Satellite',
		inspiredBy: 'a research satellite (Explorer, Sputnik 3)',
		goal: 'orbit',
		crew: 0,
		summary:
			'A satellite bus with a magnetometer boom, a barometer and a thermometer, folding solar arrays, a whip antenna and RCS, on a light launcher.',
		build(content) {
			const b = new Build(content, 'Aurora Research Satellite', 'stock.satellite-bus');
			b.side('stock.magnetometer-boom', 0, 0, 0);
			b.side('stock.solar-fold', 0, Math.PI / 2, 0, 2);
			b.side('stock.antenna-whip-radial', 0, Math.PI, 0.3);
			b.side('stock.barometer-radial', 0, Math.PI, -0.3);
			b.side('stock.thermometer-radial', 0, Math.PI / 4, 0.3);
			// two pairs, above and below the middle, so it turns
			b.side('stock.rcs-block', 0, (3 * Math.PI) / 4, -0.35, 2);
			b.side('stock.rcs-block', 0, (3 * Math.PI) / 4, 0.35, 2);
			launcher125(b, 0);
			return b.done();
		}
	},
	{
		id: 'trailblazer-rover',
		title: 'Trailblazer Rover',
		inspiredBy: 'a crewed surface rover (the lunar roving vehicle, a Mars rover)',
		goal: 'surface',
		crew: 2,
		summary:
			'A two-seat rover on a battery deck: four driven wheels, the front pair steering, a solar panel and a whip antenna. Launched lying level; W and S drive, A and D steer.',
		build(content) {
			const b = new Build(content, 'Trailblazer Rover', 'stock.rover-chassis');
			// the cab stands on the deck, turned onto its upward node (plan 308)
			b.on('stock.rover-cab', 0, 'deck', 'bottom');
			// under the deck, 0.6 m either side of the middle (its bottom face at angle pi/2)
			const side = Math.atan2(0.175, 0.6);
			for (const angle of [side, Math.PI - side]) {
				b.side('stock.rover-wheel-m-steer', 0, angle, 0.9);
				b.side('stock.rover-wheel-m', 0, angle, -0.9);
			}
			b.side('stock.solar-flat', 0, -Math.PI / 2, -0.8);
			b.side('stock.antenna-whip-radial', 0, 0, -1);
			return { ...b.done([]), aircraft: true };
		}
	}
];
