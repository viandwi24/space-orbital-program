/**
 * Example vessels built through the editor operations, so they are valid by construction and show
 * what the tools can do. The booster rocket is the 23-part vessel of plan 026 (journal 026) and
 * the budget vessel of plan 029's renderer test.
 */
import { partId, type VesselDesign } from '@orbital/core';
import { referenceTwoStage } from '../design';
import {
	attachConnector,
	attachNew,
	attachTargets,
	createEditor,
	radialTarget,
	setTilt,
	singlePart,
	type Content,
	type EditorState
} from './state';

/** Two-stage core, four radial decouplers each carrying a booster with a nose cone, and four fins. */
export function boosterRocket(content: Content): VesselDesign {
	let s: EditorState = createEditor(referenceTwoStage(), content);
	const lowerTank = 5;
	const side = (part: string, parent: number, y: number, n: number): EditorState => {
		const t = radialTarget(s.design, singlePart(part, s.nextIndex), content.parts, parent, 0, y);
		if (!t) throw new Error(`no radial site for ${part}`);
		return attachNew(s, content, part, t, n);
	};
	const on = (part: string, parent: number, node: string): EditorState => {
		const t = attachTargets(s.design, singlePart(part, s.nextIndex), content.parts).find(
			(x) => x.parent?.index === parent && x.parent.parentNode === node
		);
		if (!t) throw new Error(`no ${node} node on part ${parent} for ${part}`);
		return attachNew(s, content, part, t);
	};
	s = side('stock.radial-decoupler', lowerTank, 0, 4);
	const decoupler = s.design.parts.find((p) => p.part === 'stock.radial-decoupler')!.index;
	s = on('stock.booster', decoupler, 'outer');
	const booster = s.design.parts.find((p) => p.part === 'stock.booster')!.index;
	s = on('stock.nose-cone', booster, 'top');
	// Fins between the boosters, low on the core: 45 degrees off the decouplers.
	const fin = radialTarget(
		s.design,
		singlePart('stock.fin', s.nextIndex),
		content.parts,
		lowerTank,
		Math.PI / 4,
		-0.45
	);
	if (!fin) throw new Error('no radial site for the fins');
	s = attachNew(s, content, 'stock.fin', fin, 4);
	return { ...s.design, name: 'Booster rocket' };
}

/**
 * The booster rocket with an asparagus feed (ADR 0071): a fuel line from each booster to the core
 * tank, so the core engine drains the boosters first, and a strut from each booster's foot to the
 * tank. The lines and struts are made by one pick each with the boosters' symmetry.
 */
export function asparagusRocket(content: Content): VesselDesign {
	let s: EditorState = createEditor(boosterRocket(content), content);
	const lowerTank = 5;
	const booster = s.design.parts.find((p) => p.part === 'stock.booster')!.index;
	s = attachConnector(
		s,
		content,
		'stock.fuel-line',
		{ index: booster, angle: Math.PI, y: 0.5 },
		{ index: lowerTank, angle: 0, y: 0.5 }
	);
	s = attachConnector(
		s,
		content,
		'stock.strut',
		{ index: booster, angle: Math.PI, y: -0.5 },
		{ index: lowerTank, angle: 0, y: -0.5 }
	);
	return { ...s.design, name: 'Asparagus rocket' };
}

/**
 * A winged craft that glides (ADR 0075): a pod on a tank, two wings at the tank's middle with 0.15
 * rad of incidence (a tilt about the parent's X axis) and two tail wings at its foot with none.
 * About 4.9:1 at 190 m/s; it has no engine, so it is for the glide test and the editor.
 */
export function glider(content: Content): VesselDesign {
	const reference = referenceTwoStage();
	// The pod alone: the reference vessel is a rocket.
	let s: EditorState = createEditor(
		{ ...reference, parts: reference.parts.slice(0, 1), stages: [] },
		content
	);
	const stack = (part: string, parent: number): void => {
		const t = attachTargets(s.design, singlePart(part, s.nextIndex), content.parts).find(
			(x) => x.parent?.index === parent && x.parent.parentNode === 'bottom'
		);
		if (!t) throw new Error(`no bottom node on part ${parent} for ${part}`);
		s = attachNew(s, content, part, t);
	};
	stack('stock.tank-small', 0);
	const tank = 1;
	const pair = (y: number, incidence: number): void => {
		const t = radialTarget(
			s.design,
			singlePart('stock.wing', s.nextIndex),
			content.parts,
			tank,
			0,
			y
		);
		if (!t) throw new Error('no radial site for the wings');
		s = attachNew(s, content, 'stock.wing', t, 2);
		const first = s.design.parts.at(-1)!.index;
		if (incidence !== 0) s = setTilt(s, content, first, { x: incidence, y: 0, z: 0 });
	};
	pair(0, 0.15);
	pair(-0.8, 0);
	return { ...s.design, name: 'Glider' };
}

/**
 * The two-stage stock rocket that reaches the moon in `packages/sim/test/moon-mission.test.ts`
 * (plan 044), top to bottom: pod, two wheels, a medium tank, the lander engine and legs, a
 * decoupler, a medium tank and an engine (the core), and four liquid boosters (LB-1, the sim test's;
 * the BST-1 became a solid motor in plan 210) at half thrust with nose cones and four fins on the
 * core tank. Stage 1 lights the core and the boosters, stage 2 drops the boosters,
 * stage 3 drops the core and lights the lander. The trip planner of the stats strip measures it
 * against the moon (plan 034).
 */
export function moonShot(): VesselDesign {
	const chain = [
		'stock.command-pod',
		'stock.reaction-wheel',
		'stock.reaction-wheel',
		'stock.tank-medium',
		'stock.engine-lv',
		'stock.landing-legs',
		'stock.decoupler',
		'stock.tank-medium',
		'stock.engine-lv'
	];
	const landerEngine = 4;
	const decoupler = 6;
	const coreTank = 7;
	const coreEngine = 8;
	const parts: VesselDesign['parts'] = chain.map((part, index) => ({
		index,
		part: partId(part),
		parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
	}));
	const boosters: number[] = [];
	const decouplers: number[] = [];
	for (let k = 0; k < 4; k++) {
		const angle = (k * Math.PI) / 2;
		parts.push(
			{
				index: 20 + 3 * k,
				part: partId('stock.radial-decoupler'),
				parent: { index: coreTank, parentNode: 'surface', node: 'radial', radial: { angle, y: 0 } },
				symmetry: 1
			},
			{
				index: 21 + 3 * k,
				part: partId('stock.booster-liquid'),
				parent: { index: 20 + 3 * k, parentNode: 'outer', node: 'radial' },
				symmetry: 2,
				// half thrust off the pad: liftoff TWR about 1.4, the boosters burn longer
				settings: { 'stock.engine': { limiter: 0.5 } }
			},
			{
				index: 22 + 3 * k,
				part: partId('stock.nose-cone'),
				parent: { index: 21 + 3 * k, parentNode: 'top', node: 'bottom' },
				symmetry: 3
			},
			{
				index: 40 + k,
				part: partId('stock.fin'),
				parent: {
					index: coreTank,
					parentNode: 'surface',
					node: 'radial',
					radial: { angle: angle + Math.PI / 4, y: -0.7 }
				},
				symmetry: 4
			}
		);
		boosters.push(21 + 3 * k);
		decouplers.push(20 + 3 * k);
	}
	return {
		formatVersion: 3,
		name: 'Moon shot',
		parts,
		stages: [[coreEngine, ...boosters], decouplers, [decoupler, landerEngine]]
	};
}
