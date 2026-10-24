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
	/**
	 * The systems it is designed for (plan 380, ADR 0317), with a design of its own where the
	 * system needs one; absent: stock only.
	 */
	systems?: ReadonlyArray<{
		system: string;
		variant?: string;
		build?(content: Content): VesselDesign;
	}>;
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
	/** Per-part module settings (plan 219): `fields` merged over the module's config on that part. */
	set(index: number, module: string, fields: Record<string, unknown>): void {
		const design = this.s.design;
		this.s = {
			...this.s,
			design: {
				...design,
				parts: design.parts.map((p) =>
					p.index === index
						? {
								...p,
								settings: { ...p.settings, [module]: { ...p.settings?.[module], ...fields } }
							}
						: p
				)
			}
		};
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

/**
 * A launcher for Sol 1:1 (plan 380, ADR 0317), Titan-like: a hydrolox upper stage (3.75 m tanks on
 * the RS-25-class plate) over a kerolox first stage (5 m tanks on the five-bell plate), with two
 * Shuttle-class solid boosters when `boosters`. Under a payload of `size` m; returns the first stage's
 * engine.
 */
function realLauncher(b: Build, top: number, size: 1.25 | 2.5, boosters = false): number {
	const dec = b.below(size === 1.25 ? 'stock.decoupler' : 'stock.decoupler-wide', top);
	const wide = size === 1.25 ? b.below('stock.adapter-large', dec) : dec;
	const upper = b.below('stock.tank-3750', b.below('stock.adapter-2500-3750', wide));
	const upperEngine = b.below('stock.engine-plate-8', b.below('stock.tank-3750-short', upper));
	const sep = b.below('stock.decoupler-3750', upperEngine);
	const core = b.below('stock.tank-5000-long', b.below('stock.adapter-3750-5000', sep));
	const low = b.below('stock.tank-5000-long', core);
	const engine = b.below('stock.engine-plate-5', low);
	b.side('stock.fin', low, Math.PI / 4, -0.7, 4);
	if (boosters) {
		const rd = b.side('stock.radial-decoupler', low, 0, -0.2, 2);
		b.on('stock.nose-cone-1875', b.on('stock.srb-xl', rd, 'outer'), 'top');
	}
	return engine;
}

/** The launcher for this scale: the 1.25 m one, or the real one at Sol 1:1. */
const launcherFor = (real: boolean) => (b: Build, top: number) =>
	real ? realLauncher(b, top, 1.25) : launcher125(b, top);

/**
 * Kronos V + Selene (plan 286): `real` builds it the size of the real Saturn V (plan 380, ADR 0317),
 * for Sol 1:1; otherwise the half-size stack that flies the stock and rescaled systems.
 */
function kronos(content: Content, real: boolean): VesselDesign {
	const b = new Build(content, 'Kronos V + Selene', 'stock.pod-3');
	const pod = 0;
	// the capsule's docking port (Apollo's probe) under the boost cover, the escape tower on the
	// cover (system audit D6): the tower and the cover go together, then the command ship turns
	// round and docks with the lander's port (owner, 2026-10-22)
	const neck = b.above('stock.adapter-small', pod);
	const probe = b.above('stock.docking-port-small', neck);
	const cover = b.above('stock.boost-cover', probe);
	const tower = b.above('stock.escape-tower', cover);
	// the tower's own joint stays shut: the cover's takes both off the port
	b.set(tower, 'stock.decoupler', { staged: false });
	const shield = b.below('stock.heat-shield-wide', pod);
	// the capsule leaves the service module before re-entry (Apollo's CM/SM separation)
	const cmSep = b.below('stock.decoupler-wide', shield);
	// Apollo's service module carried 18 t of propellant: the wide tank at real scale
	const sm = b.below(real ? 'stock.tank-wide' : 'stock.tank-wide-short', cmSep);
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
	// the three stages: at real scale the Saturn V's masses (S-IVB 109 t, S-II 427 t, S-IC 2 016 t
	// of propellant) on its own engines (plan 380): one hydrolox plate, five J-2, five F-1
	const sivb = b.below(real ? 'stock.tank-3750-long' : 'stock.tank-3750', petals);
	const sivbLow = real ? b.below('stock.tank-3750', sivb) : sivb;
	const sivbEngine = b.below('stock.engine-plate-8', sivbLow);
	const d2 = b.below('stock.decoupler-3750', sivbEngine);
	const adapter = b.below('stock.adapter-3750-5000', d2);
	let sii = b.below('stock.tank-5000-long', adapter);
	const siiTop = sii;
	if (real) sii = b.below('stock.tank-5000', b.below('stock.tank-5000-long', sii));
	const siiEngine = b.below(real ? 'stock.engine-plate-j2' : 'stock.engine-plate-5', sii);
	const d1 = b.below('stock.decoupler-5000', siiEngine);
	let sic = real
		? b.below('stock.tank-7500-long', b.below('stock.adapter-5000-7500', d1))
		: b.below('stock.tank-5000-long', d1);
	const sicTop = sic;
	if (real)
		sic = b.below(
			'stock.tank-7500',
			b.below('stock.tank-7500-long', b.below('stock.tank-7500-long', sic))
		);
	const sicEngine = b.below(real ? 'stock.engine-plate-f1' : 'stock.engine-plate-5', sic);
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
		[sicTop]: 'roll',
		[sic]: 'roll',
		[sicEngine]: 'foil-engines',
		[siiTop]: 'top-band',
		[sivbLow]: 'aft-band',
		[sm]: 'service',
		[pod]: 'steel'
	};
	return painted(
		paint,
		b.done([
			[sicEngine],
			[d1, siiEngine, tower, cover],
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

/** Moonwatch Orbiter; `real`: on the Sol 1:1 launcher (plan 380). */
function moonwatch(content: Content, real: boolean): VesselDesign {
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
	launcherFor(real)(b, eng);
	return b.done();
}

/** Horizon Telescope; `real`: on the Sol 1:1 launcher (plan 380). */
function telescope(content: Content, real: boolean): VesselDesign {
	const b = new Build(content, 'Horizon Telescope', 'stock.telescope');
	const bus = b.below('stock.satellite-bus', 0);
	b.side('stock.antenna-dish-fold', bus, 0, 0.2);
	const wings = b.below('stock.solar-wings', bus);
	const tank = b.below('stock.tank-small', wings);
	// RCS at both ends: round the telescope's tube and round the tank under the wings
	b.side('stock.rcs-block', 0, Math.PI / 4, -0.5, 4);
	b.side('stock.rcs-block', tank, Math.PI / 4, -0.5, 4);
	const eng = b.below('stock.engine-vacuum', tank);
	launcherFor(real)(b, eng);
	return b.done();
}

/** Aurora Research Satellite; `real`: on the Sol 1:1 launcher (plan 380). */
function aurora(content: Content, real: boolean): VesselDesign {
	const b = new Build(content, 'Aurora Research Satellite', 'stock.satellite-bus');
	b.side('stock.magnetometer-boom', 0, 0, 0);
	b.side('stock.solar-fold', 0, Math.PI / 2, 0, 2);
	b.side('stock.antenna-whip-radial', 0, Math.PI, 0.3);
	b.side('stock.barometer-radial', 0, Math.PI, -0.3);
	b.side('stock.thermometer-radial', 0, Math.PI / 4, 0.3);
	// two pairs, above and below the middle, so it turns
	b.side('stock.rcs-block', 0, (3 * Math.PI) / 4, -0.35, 2);
	b.side('stock.rcs-block', 0, (3 * Math.PI) / 4, 0.35, 2);
	launcherFor(real)(b, 0);
	return b.done();
}

/** Horizon Station; `real`: on the Sol 1:1 launcher (plan 380). */
function station(content: Content, real: boolean): VesselDesign {
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
	// at real scale the station core goes up on the Titan-like launcher with two big solids (plan 380)
	if (real) {
		realLauncher(b, berth, 2.5, true);
		return b.done();
	}
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

/**
 * Companion-1 (plan 287, BP-05; the first satellite): a small probe with four whip antennas and a
 * battery on the stock light launcher. It carries no solar panels or instruments: it beeps.
 */
function companion(content: Content, real: boolean): VesselDesign {
	const b = new Build(content, 'Companion-1', 'stock.probe-core');
	for (let i = 0; i < 4; i++)
		b.side('stock.antenna-whip-radial', 0, (i * Math.PI) / 2 + Math.PI / 4, 0.2);
	b.side('stock.battery-radial', 0, 0, -0.2, 2);
	launcherFor(real)(b, 0);
	return b.done();
}

/**
 * Semyorka-S + Union (plan 287, BP-03; Soyuz): a three-seat capsule with its heat shield and
 * parachutes, a service module and an escape tower, on a core stage with four liquid strap-on
 * boosters.
 */
function semyorka(content: Content): VesselDesign {
	const b = new Build(content, 'Semyorka-S + Union', 'stock.pod-3');
	const pod = 0;
	b.above('stock.escape-tower', pod);
	const shield = b.below('stock.heat-shield-wide', pod);
	const sep = b.below('stock.decoupler-wide', shield);
	const service = b.below('stock.tank-wide-short', sep);
	b.side('stock.rcs-block', pod, Math.PI / 4, -0.2, 4);
	b.side('stock.monoprop-radial', service, Math.PI / 2, 0, 2);
	b.side('stock.battery-radial', service, Math.PI, 0, 2);
	b.side('stock.antenna-whip-radial', service, 0, 0.3);
	const serviceEngine = b.below('stock.engine-lv', service);
	const dec = b.below('stock.decoupler-wide', serviceEngine);
	const upper = b.below('stock.tank-wide', dec);
	const upperEngine = b.below('stock.engine-wide', upper);
	const lowerDec = b.below('stock.decoupler-wide', upperEngine);
	const core = b.below('stock.tank-wide', lowerDec);
	const coreEngine = b.below('stock.engine-wide', core);
	const decouplers = b.side('stock.radial-decoupler', core, Math.PI / 4, 0, 4);
	const boosters = b.on('stock.booster-liquid', decouplers, 'outer');
	b.on('stock.nose-cone', boosters, 'top');
	b.side('stock.fin', core, 0, -0.7, 4);
	return b.done();
}

export const MISSION_BLUEPRINTS: readonly MissionBlueprint[] = [
	{
		id: 'kronos-selene',
		title: 'Kronos V + Selene',
		inspiredBy: 'Apollo 11 (Saturn V, command and service module, lunar module)',
		goal: 'moon',
		crew: 3,
		summary:
			'Three stages to the moon. The 3-seat capsule with a docking port under a boost cover and the escape tower (after they go it turns round and docks with the lander), a service module with four RCS quads, a dish and a fuel cell, and a two-stage lander in the petals.',
		build: (content) => kronos(content, false),
		systems: [
			{ system: 'stock' },
			{ system: 'sol', variant: 'rescaled' },
			// the real Saturn V's stages and engines: the real profile at real scale
			{ system: 'sol', variant: '1:1', build: (content) => kronos(content, true) }
		]
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
		// the stock system's: a Sol-scale Shuttle is draft plan 385
		systems: [{ system: 'stock' }],
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
			// landing gear (plan 361): the nose gear under the cabin, two main gear under the bay's aft
			// end; stowed for launch and re-entry, lowered with G
			const noseGear = b.side('stock.orbiter-gear-nose', 0, Math.PI / 2, -0.45);
			const mainGear = [Math.PI / 2 - 0.45, Math.PI / 2 + 0.45].map((a) =>
				b.side('stock.orbiter-gear', bay, a, -0.72)
			);
			const design = b.done([[mains, ...srbs], srbDecs, [rd, aft], [side]]);
			// the far wing (symmetry turns it half round) has its tiles on its top face, so both
			// wings show them underneath; the last stage undocks the module ("Undock on stage")
			const farWing = (p: VesselDesign['parts'][number]) =>
				p.part === 'stock.wing-delta' && Math.abs((p.parent?.radial?.angle ?? 0) - Math.PI) < 0.1;
			// radial parts sit on the 2.5 m cylinder; the belly is flat, so the gear wells move in onto
			// it (the rounded-square section's flat is 1.05 m from the axis, plan 356)
			const inward = (index: number, angle: number, by: number) => ({
				x: Math.cos(angle) * -by,
				y: 0,
				z: Math.sin(angle) * by
			});
			const gearOffset = new Map<number, { x: number; y: number; z: number }>([
				[noseGear, inward(noseGear, Math.PI / 2, 0.2)],
				[mainGear[0]!, inward(mainGear[0]!, Math.PI / 2 - 0.45, 0.1)],
				[mainGear[1]!, inward(mainGear[1]!, Math.PI / 2 + 0.45, 0.1)]
			]);
			const parts = design.parts.map((p) => {
				const offset = gearOffset.get(p.index);
				if (offset) return { ...p, offset };
				if (p.index === side)
					return { ...p, settings: { ...p.settings, 'stock.docking-port': { stageUndock: true } } };
				if (farWing(p))
					return { ...p, settings: { ...p.settings, 'stock.wing': { tilesUp: true } } };
				return p;
			});
			// the brake chute (plan 361) in a pack on the aft fuselage's top beside the fin, turned
			// over so its canopy streams aft; Parachutes (or its own Deploy) on the runway
			const chute = {
				index: Math.max(...parts.map((p) => p.index)) + 1,
				part: partId('stock.drag-chute'),
				parent: {
					index: aft,
					parentNode: 'surface',
					node: 'radial',
					surface: {
						point: [0.45, 0.7, 1.03] as [number, number, number],
						normal: [0, 0, 1] as [number, number, number]
					}
				},
				tilt: { x: 0, y: 0, z: Math.PI }
			};
			return { ...design, formatVersion: 4, parts: [...parts, chute] };
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
		build: (content) => station(content, false),
		systems: [
			{ system: 'stock' },
			{ system: 'sol', variant: 'rescaled', build: (content) => station(content, true) },
			{ system: 'sol', variant: '1:1', build: (content) => station(content, true) }
		]
	},
	{
		id: 'moonwatch-orbiter',
		title: 'Moonwatch Orbiter',
		inspiredBy: 'a planetary orbiter (a Mars or moon orbiter)',
		goal: 'moon',
		crew: 0,
		summary:
			'A probe that flies to the moon and stays in orbit: a satellite bus with a relay dish, solar wings, an RTG, instruments and its own engine.',
		build: (content) => moonwatch(content, false),
		// the stock system on the 1.25 m launcher; both Sol systems on the real one (plan 380)
		systems: [{ system: 'stock' }, { system: 'sol', build: (content) => moonwatch(content, true) }]
	},
	{
		id: 'horizon-telescope',
		title: 'Horizon Telescope',
		inspiredBy: 'a space telescope (Hubble)',
		goal: 'orbit',
		crew: 0,
		summary:
			'A telescope with an aperture door on a satellite bus with solar wings, a dish and RCS, for high orbit.',
		build: (content) => telescope(content, false),
		// the stock system on the 1.25 m launcher; both Sol systems on the real one (plan 380)
		systems: [{ system: 'stock' }, { system: 'sol', build: (content) => telescope(content, true) }]
	},
	{
		id: 'aurora-satellite',
		title: 'Aurora Research Satellite',
		inspiredBy: 'a research satellite (Explorer, Sputnik 3)',
		goal: 'orbit',
		crew: 0,
		summary:
			'A satellite bus with a magnetometer boom, a barometer and a thermometer, folding solar arrays, a whip antenna and RCS, on a light launcher.',
		build: (content) => aurora(content, false),
		// the stock system on the 1.25 m launcher; both Sol systems on the real one (plan 380)
		systems: [{ system: 'stock' }, { system: 'sol', build: (content) => aurora(content, true) }]
	},
	{
		id: 'trailblazer-rover',
		title: 'Trailblazer Rover',
		inspiredBy: 'a crewed surface rover (the lunar roving vehicle, a Mars rover)',
		goal: 'surface',
		crew: 2,
		summary:
			'A two-seat rover on a battery deck: four driven wheels, the front pair steering, a solar panel and a whip antenna. Launched lying level; W and S drive, A and D steer.',
		systems: [{ system: 'stock' }, { system: 'sol' }],
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
	},
	{
		id: 'companion-1',
		title: 'Companion-1',
		inspiredBy: 'the first artificial satellite (Sputnik 1)',
		goal: 'orbit',
		crew: 0,
		summary:
			'A small probe with four whip antennas and a battery: no instruments, no panels, it only beeps. On the stock light launcher.',
		build: (content) => companion(content, false),
		systems: [{ system: 'stock' }]
	},
	{
		id: 'semyorka-union',
		title: 'Semyorka-S + Union',
		inspiredBy: 'Soyuz (the R-7 with four strap-on boosters, the Soyuz spacecraft)',
		goal: 'orbit',
		crew: 3,
		summary:
			'A three-seat capsule under an escape tower, on a service module and two stages with four liquid strap-on boosters: the workhorse crew launcher.',
		build: (content) => semyorka(content),
		systems: [{ system: 'stock' }]
	}
];
