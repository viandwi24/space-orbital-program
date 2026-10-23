/**
 * The visual data sample (plan 405, ADR 0345): what a mod can change about the look of the game
 * with data alone. A mod supplies numbers and colours, never a shader; every field is checked where
 * it is registered. Delete what you do not need.
 */
import { definePatch, definePlugin, definePostProfile } from '@orbital/sdk';

/** Green fire: the plasma of a re-entry into Home's air, as a palette (glow, trail, shock, gradient by heating). */
export const GreenFire = definePatch({
	id: 'visual-sample.green-fire',
	target: 'body',
	select: { id: 'stock.home' },
	ops: [
		{
			op: 'set',
			path: 'plasma',
			value: {
				glow: { rgb: [0.1, 0.9, 0.25], intensity: 0.4 },
				glowHot: { rgb: [0.8, 1, 0.9], intensity: 0.9 },
				trail: [
					{ rgb: [0.15, 1, 0.35], intensity: 0.3 },
					{ rgb: [0.1, 0.65, 0.55], intensity: 0 },
					{ rgb: [0.1, 0.25, 0.75], intensity: -0.4 }
				],
				streak: { rgb: [0.7, 1, 0.8], intensity: 0.5 },
				wrap: { rgb: [0.2, 0.8, 0.45], intensity: 0.1 },
				shock: { rgb: [0.4, 0.9, 1], intensity: 0.4 },
				gradient: [
					{ at: 0, rgb: [0, 0.4, 0.1] },
					{ at: 0.3, rgb: [0.1, 0.9, 0.2] },
					{ at: 0.6, rgb: [0.3, 1, 0.7] },
					{ at: 1, rgb: [0.8, 1, 1] }
				],
				multipliers: { strength: 1.2 }
			}
		}
	]
});

/** A plume twice as long on the Lv engine, on the hydrolox base (plan 400's template). */
export const LongPlume = definePatch({
	id: 'visual-sample.long-plume',
	target: 'part',
	select: { id: 'stock.engine-lv' },
	ops: [
		{
			op: 'set',
			path: 'visual.plume.template',
			value: { propellant: 'hydrolox', lengthScale: 2, widthScale: 1.1 }
		}
	]
});

/** Softer bloom and a slightly darker exposure, in every view. */
export const Moody = definePostProfile({
	id: 'visual-sample.moody',
	title: 'Moody',
	bloom: { strength: 0.5, radius: 0.7 },
	exposure: 0.85
});

export default definePlugin({
	meta: {
		id: 'visual-sample',
		version: '1.0.0',
		api: '^0.1.122',
		title: 'Green fire (visual sample)'
	},
	depends: ['stock'],
	setup(ctx) {
		ctx.patches.register(GreenFire);
		ctx.patches.register(LongPlume);
		ctx.postProfiles.register(Moody);
	}
});
