/**
 * Docking ports (plan 222, ADR 0218): the stock module behind the three port sizes. The sim pulls
 * equal ports together, captures and merges the two vessels, and keeps `docked` here current;
 * Undock detaches the face node with a small push, and the crossfeed switch decides whether
 * stack-flow propellant passes the joint.
 */
import { defineModule, z } from '@orbital/sdk';

/** The push of an undock, N·s: enough to drift apart, not to tumble. */
export const UNDOCK_IMPULSE = 150;

export const dockingPortConfigSchema = z.object({
	/** Face diameter, m: 0.625, 1.25 or 2.5 (ADR 0212 sizes); only equal sizes dock. */
	size: z.number().positive(),
	/** The attach node that is the docking face. */
	node: z.string().min(1).default('top')
});

export interface DockingPortState {
	/** Docked to another port; the sim keeps this current. */
	docked: boolean;
	/** Stack-flow propellant passes the joint while docked. */
	crossfeed: boolean;
}

export const ModuleDockingPort = defineModule({
	id: 'stock.docking-port',
	config: dockingPortConfigSchema,
	controlPoint: true,
	dock: (config) => ({ size: config.size, node: config.node }),
	crossfeed: (_config, state) => state.crossfeed,
	state: (): DockingPortState => ({ docked: false, crossfeed: true }),
	describe: (_config, state) => ({
		category: 'structural',
		actions: [
			{
				id: 'undock',
				label: 'Undock',
				kind: 'trigger',
				enabled: state.docked,
				...(state.docked ? {} : { reason: 'not docked' }),
				group: 'stock.docking',
				icon: 'docking'
			},
			{
				id: 'setCrossfeed',
				label: 'Crossfeed',
				kind: 'toggle',
				value: state.crossfeed,
				enabled: true
			}
		]
	}),
	actions: {
		undock: (ctx) => {
			if (!ctx.state.docked) return;
			ctx.vessel.detach(ctx.config.node, UNDOCK_IMPULSE);
		},
		setCrossfeed: (ctx, ...args) => {
			const [on] = z.tuple([z.boolean()]).parse(args);
			ctx.state.crossfeed = on;
		}
	},
	snapshot: (state) => ({ docked: state.docked, crossfeed: state.crossfeed })
});
