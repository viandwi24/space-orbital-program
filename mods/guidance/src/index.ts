/**
 * @orbital/mod-guidance — the Guidance Computer (plan 321): MechJeb-style autopilots written
 * against @orbital/sdk like any third-party mod, and one panel with a tab per program (plan 332).
 * Each is a program (ADR 0276): the player takes a control back by touching it, Delete stops it.
 * The Landing tab carries the predicted landing path and the landing target (plan 372, ADR 0309):
 * a sim system, an overlay and two stores, the worked example of the World API and overlays.
 */
import { definePlugin } from '@orbital/sdk';
import { Ascent, Circularize, ExecuteNode, Land } from './autopilots.ts';
import { LandingTarget, PATH, PATH_KEYS, PathSettings, Predictor } from './landing-path.ts';
import { GuidancePanel } from './panel.ts';
import { Rendezvous } from './rendezvous.ts';

export const GuidanceMod = definePlugin({
	// 0.1.108: overlays, stores, systems with the World API and map picks (ADR 0296)
	meta: { id: 'guidance', version: '0.2.0', api: '^0.1.108', title: 'Guidance Computer' },
	setup(ctx) {
		for (const autopilot of [ExecuteNode, Circularize, Ascent, Land, Rendezvous])
			ctx.autopilots.register(autopilot);
		ctx.overlays.register(PATH);
		ctx.stores.register(PathSettings);
		ctx.stores.register(LandingTarget);
		for (const k of PATH_KEYS) ctx.keybindings.register(k);
		ctx.systems.register(Predictor);
		ctx.panels.register(GuidancePanel);
	}
});
export default GuidanceMod;

export * from './autopilots.ts';
export * from './orbit.ts';
export * from './rendezvous.ts';
export * from './panel.ts';
export * from './landing-path.ts';
export { latLonOf, pointAt, predict, rotate, surfaceDistance } from './predict.ts';
export type { Prediction, PredictInput } from './predict.ts';
