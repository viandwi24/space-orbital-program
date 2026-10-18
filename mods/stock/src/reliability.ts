/** Stock failure modes (plan 130, ADR 0156 point 1): what can go wrong with a stock part. */
import { defineFailureMode } from '@orbital/sdk';

export const STOCK_FAILURE_MODES = [
	defineFailureMode({
		id: 'stock.engine-shutdown',
		label: 'Engine shutdown',
		module: 'stock.engine',
		trigger: 'stage',
		chance: 0.08,
		repairable: true,
		description: 'The engine does not light when its stage fires.'
	}),
	defineFailureMode({
		id: 'stock.decoupler-stuck',
		label: 'Decoupler stuck',
		module: 'stock.decoupler',
		trigger: 'stage',
		chance: 0.05,
		repairable: false,
		description: 'The charge does not fire: the stage stays attached.'
	}),
	defineFailureMode({
		id: 'stock.antenna-dead',
		label: 'Antenna dead',
		module: 'stock.antenna',
		trigger: 'launch',
		chance: 0.04,
		repairable: true,
		description: 'The antenna does not come up after launch.'
	})
] as const;
