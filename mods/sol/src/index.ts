/**
 * @orbital/mod-sol — the real solar system (plan 124, ADR 0184), written against @orbital/sdk like
 * any third-party mod: the Sun, the planets and the Moon from JPL and IAU data, in two scale
 * variants with their balance profiles.
 */
import { definePlugin } from '@orbital/sdk';
import { SOL_BODIES } from './bodies.ts';
import { SOL_VARIANTS } from './variants.ts';

export const Sol = definePlugin({
	meta: { id: 'sol', version: '0.1.0', api: '^0.1', title: 'The real solar system' },
	depends: ['stock'],
	setup(ctx) {
		for (const body of SOL_BODIES) ctx.bodies.register(body);
		for (const variant of SOL_VARIANTS) ctx.systemVariants.register(variant);
	}
});
export default Sol;

export * from './bodies.ts';
export * from './variants.ts';
export * from './balance.ts';
export * from './designs.ts';
