/**
 * Famous-mission blueprints (plan 286, ADRs 0255, 0263), built through the editor operations so
 * they are valid by construction. Each carries what its mission needs: control, crew or a probe
 * core, RCS, power, antennas, parachutes and a heat shield where it comes home. Names are
 * fictional (ADR 0255); `inspiredBy` says which real mission they recall.
 */
import { partId, type VesselDesign } from '@orbital/core';
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
	goal: 'orbit' | 'moon' | 'station' | 'deep-space';
	crew: number;
	summary: string;
	build(content: Content): VesselDesign;
}

/** A small builder over the editor's operations: stack below or above, hang on a side. */
class Build {
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
	/** Attach `part` to `node` of `parent` (the child's matching node is found by the editor). */
	on(part: string, parent: number, node: string): number {
		const t = attachTargets(this.s.design, singlePart(part, this.s.nextIndex), this.content.parts).find(
			(x) => x.parent?.index === parent && x.parent.parentNode === node
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
		const t = radialTarget(this.s.design, singlePart(part, this.s.nextIndex), this.content.parts, parent, angle, y);
		if (!t) throw new Error(`no radial site on part ${parent} for ${part}`);
		this.s = attachNew(this.s, this.content, part, t, n);
		return this.last(part);
	}
	/** A fuel line from `from` (its surface at `fromAngle`, `fromY`) to `to` (ADR 0071). */
	line(from: number, fromAngle: number, fromY: number, to: number, toAngle: number, toY: number): void {
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
			'Three stages to the moon. The 3-seat capsule under its escape tower, a service module with four RCS quads, a dish and a fuel cell, and a two-stage lander in the petals.',
		build(content) {
			const b = new Build(content, 'Kronos V + Selene', 'stock.pod-3');
			const pod = 0;
			b.above('stock.escape-tower', pod);
			const shield = b.below('stock.heat-shield-wide', pod);
			const sm = b.below('stock.tank-wide-short', shield);
			b.side('stock.rcs-block-5', sm, Math.PI / 4, 0.3, 4);
			b.side('stock.antenna-dish-fold', sm, 0, -0.3);
			b.side('stock.fuel-cell', sm, Math.PI, -0.3);
			const smEngine = b.below('stock.engine-wide', sm);
			const smDec = b.below('stock.decoupler-wide', smEngine);
			const petals = b.below('stock.payload-petals', smDec);
			const descent = b.on('stock.lander-descent', petals, 'inner');
			b.side('stock.landing-leg-single', descent, Math.PI / 4, -0.2, 4);
			const ascent = b.above('stock.lander-ascent', descent);
			b.side('stock.rcs-block', ascent, Math.PI / 4, 0.4, 4);
			b.above('stock.docking-port-small', ascent);
			const sivb = b.below('stock.tank-3750', petals);
			const sivbEngine = b.below('stock.engine-plate-8', sivb);
			const d2 = b.below('stock.decoupler-3750', sivbEngine);
			const adapter = b.below('stock.adapter-3750-5000', d2);
			const sii = b.below('stock.tank-5000-long', adapter);
			const siiEngine = b.below('stock.engine-plate-5', sii);
			const d1 = b.below('stock.decoupler-5000', siiEngine);
			const sic = b.below('stock.tank-5000-long', d1);
			b.below('stock.engine-plate-5', sic);
			b.side('stock.fin', sic, Math.PI / 4, -0.7, 4);
			return b.done();
		}
	},
	{
		id: 'ulang-alik',
		title: 'Ulang-Alik',
		inspiredBy: 'the Space Shuttle (orbiter, external tank, solid boosters, payload bay)',
		goal: 'orbit',
		crew: 4,
		summary:
			'A winged orbiter with a satellite in its cargo bay, on a foam-covered external tank between two solid boosters.',
		build(content) {
			const b = new Build(content, 'Ulang-Alik', 'stock.orbiter-nose');
			const bay = b.below('stock.cargo-bay', 0);
			const sat = b.on('stock.satellite-bus', bay, 'inner');
			b.above('stock.antenna-relay', sat);
			b.side('stock.solar-flat', sat, 0, 0, 4);
			const aft = b.below('stock.orbiter-aft', bay);
			b.side('stock.wing-delta', bay, Math.PI / 2, -0.4, 2);
			b.side('stock.rcs-block', bay, Math.PI / 4, 0.8, 4);
			const rd = b.side('stock.radial-decoupler', bay, Math.PI, 0);
			const et = b.on('stock.external-tank', rd, 'outer');
			b.side('stock.radial-decoupler', et, Math.PI / 2, -0.2, 2);
			const srbDecs = b.s.design.parts.filter((p) => p.part === 'stock.radial-decoupler' && p.parent?.index === et).map((p) => p.index);
			// one attach: the decouplers' symmetry puts a booster on each
			b.on('stock.nose-cone-1875', b.on('stock.srb-xl', srbDecs.at(-1)!, 'outer'), 'top');
			const srbs = b.s.design.parts.filter((p) => p.part === 'stock.srb-xl').map((p) => p.index);
			// the main engines burn the external tank's propellant through a feed line
			b.line(et, -Math.PI / 2, -0.8, aft, Math.PI, 0);
			// main engines and boosters light together; the boosters drop, then the tank
			return b.done([[aft, ...srbs], srbDecs, [rd]]);
		}
	},
	{
		id: 'stasiun-cakrawala',
		title: 'Stasiun Cakrawala',
		inspiredBy: 'a modular space station (ISS, Mir)',
		goal: 'station',
		crew: 0,
		summary:
			'The station core: a habitat under a six-port hub with a docking port, two big tracking arrays and radiators, flown up uncrewed on a heavy launcher.',
		build(content) {
			const b = new Build(content, 'Stasiun Cakrawala', 'stock.hub');
			b.above('stock.docking-port', 0);
			const hab = b.below('stock.hab-module', 0);
			b.side('stock.solar-array-xl', hab, Math.PI / 2, 0.5, 2);
			b.side('stock.radiator', hab, 0, -0.3, 2);
			b.side('stock.rcs-block', hab, Math.PI / 4, 0.8, 4);
			b.side('stock.antenna-dish-fold', hab, Math.PI, -0.6);
			const bus = b.below('stock.service-bay-wide', hab);
			const core = b.on('stock.satellite-bus', bus, 'bottom');
			const dec = b.below('stock.decoupler', core);
			const adapter = b.below('stock.adapter-large', dec);
			const tank = b.below('stock.tank-wide', adapter);
			const tank2 = b.below('stock.tank-wide', tank);
			b.below('stock.engine-wide', tank2);
			b.side('stock.fin', tank2, Math.PI / 4, -0.7, 4);
			return b.done();
		}
	},
	{
		id: 'pengorbit',
		title: 'Pengorbit',
		inspiredBy: 'a planetary orbiter (a Mars or moon orbiter)',
		goal: 'moon',
		crew: 0,
		summary:
			'A probe that flies to the moon and stays in orbit: a satellite bus with a relay dish, solar wings, an RTG, instruments and its own engine.',
		build(content) {
			const b = new Build(content, 'Pengorbit', 'stock.antenna-relay');
			const bus = b.below('stock.satellite-bus', 0);
			b.side('stock.rtg-radial', bus, 0, 0);
			b.side('stock.thermometer-radial', bus, Math.PI / 2, 0.3);
			b.side('stock.magnetometer-boom', bus, Math.PI, 0);
			const wings = b.below('stock.solar-wings', bus);
			const tank = b.below('stock.tank-small', wings);
			b.side('stock.rcs-block', tank, Math.PI / 4, 0.5, 4);
			const eng = b.below('stock.engine-vacuum', tank);
			launcher125(b, eng);
			return b.done();
		}
	},
	{
		id: 'teleskop-cakrawala',
		title: 'Teleskop Cakrawala',
		inspiredBy: 'a space telescope (Hubble)',
		goal: 'orbit',
		crew: 0,
		summary:
			'A telescope with an aperture door on a satellite bus with solar wings, a dish and RCS, for high orbit.',
		build(content) {
			const b = new Build(content, 'Teleskop Cakrawala', 'stock.telescope');
			const bus = b.below('stock.satellite-bus', 0);
			b.side('stock.antenna-dish-fold', bus, 0, 0.2);
			b.side('stock.rcs-block', bus, Math.PI / 4, 0, 4);
			const wings = b.below('stock.solar-wings', bus);
			const tank = b.below('stock.tank-small', wings);
			const eng = b.below('stock.engine-vacuum', tank);
			launcher125(b, eng);
			return b.done();
		}
	},
	{
		id: 'satelit-peneliti',
		title: 'Satelit Peneliti',
		inspiredBy: 'a research satellite (Explorer, Sputnik 3)',
		goal: 'orbit',
		crew: 0,
		summary:
			'A satellite bus with a magnetometer boom, a barometer and a thermometer, folding solar arrays, a whip antenna and RCS, on a light launcher.',
		build(content) {
			const b = new Build(content, 'Satelit Peneliti', 'stock.satellite-bus');
			b.side('stock.magnetometer-boom', 0, 0, 0);
			b.side('stock.solar-fold', 0, Math.PI / 2, 0, 2);
			b.side('stock.antenna-whip-radial', 0, Math.PI, 0.3);
			b.side('stock.barometer-radial', 0, Math.PI, -0.3);
			b.side('stock.thermometer-radial', 0, Math.PI / 4, 0.3);
			b.side('stock.rcs-block', 0, (3 * Math.PI) / 4, -0.3, 2);
			launcher125(b, 0);
			return b.done();
		}
	}
];
