/**
 * @orbital/mod-guidance — the Guidance Computer (plan 321): MechJeb-style autopilots written
 * against @orbital/sdk like any third-party mod, and one panel with a tab per program (plan 332).
 * Each is a program (ADR 0276): the player takes a control back by touching it, Delete stops it.
 */
import { definePlugin } from '@orbital/sdk';
import { Ascent, Circularize, ExecuteNode, Land } from './autopilots.ts';
import { GuidancePanel } from './panel.ts';
import { Rendezvous } from './rendezvous.ts';

export const GuidanceMod = definePlugin({
	meta: { id: 'guidance', version: '0.1.0', api: '^0.1', title: 'Guidance Computer' },
	setup(ctx) {
		for (const autopilot of [ExecuteNode, Circularize, Ascent, Land, Rendezvous])
			ctx.autopilots.register(autopilot);
		ctx.panels.register(GuidancePanel);
	}
});
export default GuidanceMod;

export * from './autopilots.ts';
export * from './orbit.ts';
export * from './rendezvous.ts';
export * from './panel.ts';
