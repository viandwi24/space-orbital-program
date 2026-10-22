/**
 * Paint (plan 355, owner 2026-10-22: "make Kronos V look like the Apollo stack"): a part's livery
 * chosen in the Hangar. The renderer reads it as the visual parameter `paint` (`visual.paramsFrom`),
 * in the Hangar from the design's settings and in flight from the snapshot. `default` keeps the
 * part's own look.
 */
import { defineModule, z } from '@orbital/sdk';

/** The liveries a barrel can wear (the renderer's `LIVERIES`, plus `default`). */
export const PAINTS = [
	'default',
	'plain',
	'stripe',
	'bands',
	'checker',
	'half-black',
	'steel',
	'roll',
	'top-band',
	'aft-band',
	'service',
	'foil-engines'
] as const;
export type Paint = (typeof PAINTS)[number];

const LABELS: Record<Paint, string> = {
	default: 'As built',
	plain: 'Plain',
	stripe: 'Stripe',
	bands: 'Bands',
	checker: 'Checker',
	'half-black': 'Half black',
	steel: 'Bare steel',
	roll: 'Roll pattern (first stage)',
	'top-band': 'Black top band',
	'aft-band': 'Black aft band',
	service: 'Service module (radiators)',
	'foil-engines': 'Engines in foil blankets'
};

export const paintConfigSchema = z.object({
	paint: z.enum(PAINTS).default('default'),
	/** The paints this part offers (all when absent). */
	offers: z.array(z.enum(PAINTS)).optional()
});
export type PaintConfig = z.output<typeof paintConfigSchema>;
export interface PaintState {
	paint: Paint;
}

export const ModulePaint = defineModule({
	id: 'stock.paint',
	config: paintConfigSchema,
	state: (config): PaintState => ({ paint: config.paint }),
	describe: (config, state) => ({
		category: 'stock.other',
		actions: [
			{
				id: 'setPaint',
				label: 'Paint',
				kind: 'mode',
				value: state.paint,
				options: (config.offers ?? PAINTS).map((value) => ({ value, label: LABELS[value] })),
				enabled: true,
				build: 'paint',
				buildOnly: true
			}
		]
	}),
	actions: {
		setPaint: (ctx, ...args) => {
			const [paint] = z.tuple([z.enum(PAINTS)]).parse(args);
			ctx.state.paint = paint;
		}
	},
	snapshot: (state) => ({ paint: state.paint })
});
