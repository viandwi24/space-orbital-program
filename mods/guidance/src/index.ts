/**
 * @orbital/mod-guidance — the Guidance Computer (plan 321): MechJeb-style autopilots written
 * against @orbital/sdk like any third-party mod, and one panel to engage them. Each is a program
 * (ADR 0276): the player takes a control back by touching it, Delete stops it.
 */
import { definePanel, definePlugin, type PanelInput } from '@orbital/sdk';
import { Ascent, Circularize, ExecuteNode, Land } from './autopilots.ts';

const OURS = new Set([ExecuteNode.id, Circularize.id, Ascent.id, Land.id]);
const engaged = (i: PanelInput) =>
	i.vessel?.autopilot && OURS.has(i.vessel.autopilot.id) ? i.vessel.autopilot : null;
const reading = (key: string) => (i: PanelInput) => engaged(i)?.readouts[key] ?? null;
/** A button that engages `autopilot` while nothing of ours flies the vessel. */
const engage = (label: string, autopilot: string, params?: Record<string, unknown>) => ({
	kind: 'button' as const,
	label,
	command: (i: PanelInput) =>
		i.vessel && !engaged(i)
			? { type: 'autopilot-engage' as const, vessel: i.vessel.id, autopilot, ...(params ? { params } : {}) }
			: null
});

export const GuidancePanel = definePanel({
	id: 'guidance.panel',
	title: 'Guidance Computer',
	icon: 'target',
	order: 440,
	contexts: ['flight'],
	view: {
		kind: 'section',
		children: [
			{ kind: 'readout', label: 'Program', value: (i) => engaged(i)?.title ?? 'off' },
			{ kind: 'readout', label: 'Status', value: (i) => engaged(i)?.status || engaged(i)?.phase || null },
			{ kind: 'readout', label: 'Delta-v left', unit: 'm/s', value: reading('Delta-v left') },
			{ kind: 'readout', label: 'Burn time', unit: 's', value: reading('Burn time') },
			{ kind: 'readout', label: 'Apoapsis', unit: 'm', value: reading('Apoapsis') },
			{ kind: 'readout', label: 'Height', unit: 'm', value: reading('Height') },
			engage('Execute node', ExecuteNode.id),
			engage('Circularize at apoapsis', Circularize.id, { at: 'apoapsis' }),
			engage('Circularize at periapsis', Circularize.id, { at: 'periapsis' }),
			engage('Ascent to orbit', Ascent.id),
			engage('Land', Land.id),
			{
				kind: 'button',
				label: 'Disengage',
				command: (i) =>
					i.vessel && engaged(i) ? { type: 'autopilot-disengage', vessel: i.vessel.id } : null
			}
		]
	}
});

export const GuidanceMod = definePlugin({
	meta: { id: 'guidance', version: '0.1.0', api: '^0.1', title: 'Guidance Computer' },
	setup(ctx) {
		for (const autopilot of [ExecuteNode, Circularize, Ascent, Land]) ctx.autopilots.register(autopilot);
		ctx.panels.register(GuidancePanel);
	}
});
export default GuidanceMod;

export * from './autopilots.ts';
export * from './orbit.ts';
