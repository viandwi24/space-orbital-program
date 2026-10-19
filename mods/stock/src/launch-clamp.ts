/**
 * Launch clamps (plan 210, ADR 0203; rancangan §15 #16): a tower beside the rocket that holds it on
 * the pad and feeds it electric charge until staged. The sim does the hold (`anchor`); the module
 * measures the tower down to the ground once, at the launch, so one design fits every pad.
 */
import { defineModule, z, type Vec3 } from '@orbital/sdk';
import { ElectricCharge } from './resources.ts';

export const launchClampConfigSchema = z.object({
	/** The node the clamp hangs on: staging cuts it. */
	node: z.string().min(1).default('radial'),
	/** Electric charge fed to the rocket while clamped, u/s. */
	charge: z.number().nonnegative().default(20),
	/** Where the tower starts (part frame, m): the renderer's pivot of the tower (a test pins it). */
	foot: z.tuple([z.number(), z.number(), z.number()]).default([0.1, -0.2, 0]),
	/** Longest tower, m: farther from the ground the clamp holds nothing (it is not on a pad). */
	reach: z.number().positive().default(40)
});
export type LaunchClampConfig = z.output<typeof launchClampConfigSchema>;

export interface LaunchClampState {
	/** Tower length, m, from `foot` to the ground; -1 until measured. */
	height: number;
	/** Staged: the clamp let the rocket go. */
	released: boolean;
}

const footOf = (config: LaunchClampConfig): Vec3 => ({
	x: config.foot[0],
	y: config.foot[1],
	z: config.foot[2]
});

export const ModuleLaunchClamp = defineModule({
	id: 'stock.launch-clamp',
	config: launchClampConfigSchema,
	state: (): LaunchClampState => ({ height: -1, released: false }),
	// it holds whatever it is part of while it stands on the ground within reach
	anchor: (config, state) => state.height >= 0 && state.height <= config.reach,
	describe: (_config, state) => ({
		category: 'structural',
		actions: [
			{
				id: 'release',
				label: 'Release clamp',
				kind: 'trigger',
				enabled: !state.released
			}
		]
	}),
	onStage(ctx) {
		release(ctx);
	},
	update(ctx, dt) {
		const s = ctx.state;
		if (s.height < 0) {
			const h = ctx.vessel.groundClearance?.(footOf(ctx.config));
			if (h !== undefined) s.height = Math.max(0, h);
		}
		if (!s.released && s.height >= 0 && s.height <= ctx.config.reach) {
			ctx.vessel.resources.deposit(ElectricCharge.id, ctx.config.charge * dt);
		}
	},
	actions: {
		release: (ctx) => release(ctx)
	},
	snapshot: (state) => ({ height: Math.max(0, state.height), released: state.released })
});

function release(ctx: {
	config: LaunchClampConfig;
	state: LaunchClampState;
	vessel: { detach(node: string, impulse?: number): void };
}): void {
	if (ctx.state.released) return;
	ctx.state.released = true;
	ctx.vessel.detach(ctx.config.node, 0);
}
