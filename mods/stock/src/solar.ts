/**
 * The stock solar panel (plan 190, ADR 0171): electric charge at a constant rate while deployed, the
 * same in flight (`update`) and on rails (`background`, rate × elapsed time), up to what the
 * vessel's batteries hold. Sun exposure and occlusion by bodies come later (plans 122, 065).
 */
import { defineModule, z } from '@orbital/sdk';
import { ElectricCharge } from './resources.ts';

export const solarPanelConfigSchema = z.object({
	/** Electric charge per second at full sun. */
	rate: z.number().positive().default(0.5),
	deployed: z.boolean().default(false)
});
export interface SolarPanelState {
	deployed: boolean;
}

type SolarContext = {
	config: z.output<typeof solarPanelConfigSchema>;
	state: SolarPanelState;
	vessel: { resources: { deposit(resource: string, amount: number): number } };
};

/** Charge for `dt` seconds; the batteries keep what fits. */
function charge(ctx: SolarContext, dt: number): void {
	if (!ctx.state.deployed || dt <= 0) return;
	ctx.vessel.resources.deposit(ElectricCharge.id, ctx.config.rate * dt);
}

export const ModuleSolarPanel = defineModule({
	id: 'stock.solar-panel',
	config: solarPanelConfigSchema,
	state: (config): SolarPanelState => ({ deployed: config.deployed }),
	describe: (_config, state) => ({
		category: 'other',
		actions: [
			{
				id: 'setDeployed',
				label: 'Solar panel',
				kind: 'toggle',
				value: state.deployed,
				enabled: true,
				group: 'stock.solar',
				icon: 'solar'
			}
		]
	}),
	update: charge,
	background: charge,
	actions: {
		deploy: (ctx) => {
			ctx.state.deployed = true;
		},
		retract: (ctx) => {
			ctx.state.deployed = false;
		},
		/** `(deployed)` (the part action toggle, plan 110). */
		setDeployed: (ctx, ...args) => {
			const [deployed] = z.tuple([z.boolean()]).parse(args);
			ctx.state.deployed = deployed;
		}
	},
	snapshot: (state) => ({ deployed: state.deployed })
});
