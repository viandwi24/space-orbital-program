/** Test fixtures: the stock reference vessels and sim construction. */
import { partId, type TerrainField, type VesselDesign } from '@orbital/core';
import { createRapierBackend } from '@orbital/physics';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../../src/index.ts';

export const stack = (name: string, parts: string[], stages: number[][]): VesselDesign => ({
	formatVersion: 1,
	name,
	parts: parts.map((part, index) => ({
		index,
		part: partId(part),
		parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
	})),
	stages
});

/**
 * Top to bottom: command pod, reaction wheel, tank, engine, decoupler, tank, engine.
 * Stage 0 lights the lower engine; stage 1 fires the decoupler and lights the upper engine.
 */
export const twoStage = (lowerTank = 'stock.tank-small'): VesselDesign =>
	stack(
		'Two-stage',
		[
			'stock.command-pod',
			'stock.reaction-wheel',
			'stock.tank-small',
			'stock.engine-lv',
			'stock.decoupler',
			lowerTank,
			'stock.engine-lv'
		],
		[[6], [4, 3]]
	);

/** A pod on a tank: no engine. */
export const probe = (): VesselDesign =>
	stack('Probe', ['stock.command-pod', 'stock.reaction-wheel', 'stock.tank-small'], []);

export const rapier =
	(solverIterations = 16) =>
	() =>
		createRapierBackend({ solverIterations });

export function newSim(
	options: { solverIterations?: number; maxFlightFrames?: number; terrain?: TerrainField } = {}
): Promise<Sim> {
	return createSim({
		plugins: [Stock],
		backendFactory: rapier(options.solverIterations),
		seed: 1,
		...(options.maxFlightFrames === undefined ? {} : { maxFlightFrames: options.maxFlightFrames }),
		...(options.terrain === undefined ? {} : { terrain: options.terrain })
	});
}

/**
 * A tall stack of `n` parts: pod, reaction wheel, tanks, (optionally a decoupler at index
 * `decouplerAt`) and an engine at the bottom. Stage 0 lights the engine, stage 1 fires the
 * decoupler.
 */
export function tower(n: number, decouplerAt?: number): VesselDesign {
	const parts = ['stock.command-pod', 'stock.reaction-wheel'];
	while (parts.length < n - 1) parts.push('stock.tank-small');
	parts.push('stock.engine-lv');
	if (decouplerAt !== undefined) parts[decouplerAt] = 'stock.decoupler';
	return stack(
		`Tower ${n}`,
		parts,
		decouplerAt === undefined ? [[n - 1]] : [[n - 1], [decouplerAt]]
	);
}

/**
 * A lander: pod, wheel, two medium tanks, engine and landing legs (7 parts, top to bottom).
 * Stage 0 lights the engine; the legs are deployed with an `action`.
 */
export const lander = (): VesselDesign =>
	stack(
		'Lander',
		[
			'stock.command-pod',
			'stock.reaction-wheel',
			'stock.tank-medium',
			'stock.tank-medium',
			'stock.engine-lv',
			'stock.landing-legs'
		],
		[[4]]
	);

/**
 * Pod, wheel, two tanks and an engine in a stack (indices 0-4, top to bottom) with `n` boosters
 * hung on the lower tank by radial decouplers (ADR 0034): decoupler `10 + 3k`, booster `11 + 3k`,
 * nose cone `12 + 3k`, all in symmetry group 1 at `2 pi k / n`. Stage 0 lights the core engine and
 * the boosters, stage 1 fires the radial decouplers. With `finCount > 0`, that many fins (indices
 * `40 + k`) sit at the foot of the lower tank.
 */
export function boosted(n: number, finCount = 0, fins = { y: -0.7 }): VesselDesign {
	const chain = [
		'stock.command-pod',
		'stock.reaction-wheel',
		'stock.tank-small',
		'stock.tank-small',
		'stock.engine-lv'
	];
	const parts: VesselDesign['parts'] = chain.map((part, index) => ({
		index,
		part: partId(part),
		parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
	}));
	const engines = [4];
	const decouplers: number[] = [];
	for (let k = 0; k < n; k++) {
		const angle = (2 * Math.PI * k) / n;
		parts.push(
			{
				index: 10 + 3 * k,
				part: partId('stock.radial-decoupler'),
				parent: { index: 3, parentNode: 'surface', node: 'radial', radial: { angle, y: 0 } },
				symmetry: 1
			},
			{
				index: 11 + 3 * k,
				part: partId('stock.booster-liquid'),
				parent: { index: 10 + 3 * k, parentNode: 'outer', node: 'radial' },
				symmetry: 2
			},
			{
				index: 12 + 3 * k,
				part: partId('stock.nose-cone'),
				parent: { index: 11 + 3 * k, parentNode: 'top', node: 'bottom' },
				symmetry: 3
			}
		);
		engines.push(11 + 3 * k);
		decouplers.push(10 + 3 * k);
	}
	for (let k = 0; k < finCount; k++) {
		parts.push({
			index: 40 + k,
			part: partId('stock.fin'),
			parent: {
				index: 3,
				parentNode: 'surface',
				node: 'radial',
				// Between the boosters when there are some.
				radial: { angle: (2 * Math.PI * (k + (n > 0 ? 0.5 : 0))) / finCount, y: fins.y }
			},
			symmetry: 4
		});
	}
	return {
		formatVersion: 2,
		name: `Boosted ${n}`,
		parts,
		stages: n > 0 ? [engines, decouplers] : [engines]
	};
}

/**
 * The two-stage vessel with `wheels` reaction wheels under the pod, four boosters (decoupler,
 * booster, cone) and four fins on the lower tank. Stage 0 lights the lower core engine and the
 * boosters, stage 1 fires the radial decouplers, stage 2 the stack decoupler and the upper engine.
 */
export function saturn(wheels = 3): VesselDesign {
	const chain = [
		'stock.command-pod',
		...Array.from({ length: wheels }, () => 'stock.reaction-wheel'),
		'stock.tank-small',
		'stock.engine-lv',
		'stock.decoupler',
		'stock.tank-small',
		'stock.engine-lv'
	];
	const upperEngine = wheels + 2;
	const decoupler = wheels + 3;
	const lowerTank = wheels + 4;
	const lowerEngine = wheels + 5;
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
				index: 10 + 3 * k,
				part: partId('stock.radial-decoupler'),
				parent: {
					index: lowerTank,
					parentNode: 'surface',
					node: 'radial',
					radial: { angle, y: 0 }
				},
				symmetry: 1
			},
			{
				index: 11 + 3 * k,
				part: partId('stock.booster'),
				parent: { index: 10 + 3 * k, parentNode: 'outer', node: 'radial' },
				symmetry: 2
			},
			{
				index: 12 + 3 * k,
				part: partId('stock.nose-cone'),
				parent: { index: 11 + 3 * k, parentNode: 'top', node: 'bottom' },
				symmetry: 3
			},
			{
				index: 30 + k,
				part: partId('stock.fin'),
				parent: {
					index: lowerTank,
					parentNode: 'surface',
					node: 'radial',
					radial: { angle: angle + Math.PI / 4, y: -0.7 }
				},
				symmetry: 4
			}
		);
		boosters.push(11 + 3 * k);
		decouplers.push(10 + 3 * k);
	}
	return {
		formatVersion: 2,
		name: 'Saturn',
		parts,
		stages: [[lowerEngine, ...boosters], decouplers, [decoupler, upperEngine]]
	};
}

/**
 * A two-stage stock rocket for the moon (plan 044), top to bottom: pod, two wheels, a medium tank,
 * the lander engine and legs (the lander, 11.7 t), a decoupler, a medium tank and an engine (the
 * core), and four boosters and four fins on the core tank. One engine per stack and 215 kN limit
 * the mass the core can lift, so the lander is also the transfer and the capture stage. Stage 0
 * lights the core engine and the boosters, stage 1 fires the radial decouplers, stage 2 the
 * decoupler and the lander engine.
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
	// Indices into `chain`.
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
				symmetry: 2
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
		formatVersion: 2,
		name: 'Moon shot',
		parts,
		stages: [[coreEngine, ...boosters], decouplers, [decoupler, landerEngine]]
	};
}

/** The top of `moonShot()`: the lander that also flies the transfer and the capture (pod to legs). */
export const moonLander = (): VesselDesign =>
	stack(
		'Moon lander',
		[
			'stock.command-pod',
			'stock.reaction-wheel',
			'stock.reaction-wheel',
			'stock.tank-medium',
			'stock.engine-lv',
			'stock.landing-legs'
		],
		[[4]]
	);
