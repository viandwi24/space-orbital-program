/** Test fixtures: the stock reference vessels and sim construction. */
import { partId, type VesselDesign } from '@orbital/core';
import { createRapierBackend } from '@orbital/physics';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../../src/index.ts';

const stack = (name: string, parts: string[], stages: number[][]): VesselDesign => ({
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
	options: { solverIterations?: number; maxFlightFrames?: number } = {}
): Promise<Sim> {
	return createSim({
		plugins: [Stock],
		backendFactory: rapier(options.solverIterations),
		seed: 1,
		...(options.maxFlightFrames === undefined ? {} : { maxFlightFrames: options.maxFlightFrames })
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
