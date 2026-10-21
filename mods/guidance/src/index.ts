/**
 * @orbital/mod-guidance — the Guidance Computer (plan 321): MechJeb-style autopilots written
 * against @orbital/sdk like any third-party mod, and one panel to engage them. Each is a program
 * (ADR 0276): the player takes a control back by touching it, Delete stops it.
 */
import {
	createVesselPilot,
	definePanel,
	definePlugin,
	type PanelInput,
	type VesselPilot
} from '@orbital/sdk';
import { Ascent, Circularize, ExecuteNode, Land } from './autopilots.ts';
import { Rendezvous, STANDOFF, targetProblem } from './rendezvous.ts';

const OURS = new Set([ExecuteNode.id, Circularize.id, Ascent.id, Land.id, Rendezvous.id]);
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

const RDV = Rendezvous.id;
const rendezvous = (i: PanelInput) => (i.vessel?.autopilot?.id === RDV ? i.vessel.autopilot : null);
/** A read-only pilot over the panel's snapshot (no commands go anywhere). */
const pilotOf = (i: PanelInput): VesselPilot | null =>
	i.vessel ? createVesselPilot(i.snapshot, i.vessel.id, () => undefined) : null;
const rdvSettings = (i: PanelInput): Record<string, unknown> => i.vessel?.autopilotSettings?.[RDV] ?? {};
const rdvSetting = (i: PanelInput, key: string, value: string) =>
	i.vessel
		? { type: 'autopilot-settings' as const, vessel: i.vessel.id, autopilot: RDV, settings: { [key]: value } }
		: null;
/** A rendezvous readout while it flies; distance and speed from the target otherwise. */
const rdvReading = (key: string) => (i: PanelInput) => {
	const a = rendezvous(i);
	if (a && a.readouts[key] !== undefined) return a.readouts[key]!;
	const t = i.vessel?.target;
	if (!t) return null;
	if (key === 'Distance') return Math.round(t.distance * 10) / 10;
	if (key === 'Relative speed') return Math.round(t.relativeSpeed * 100) / 100;
	return null;
};

/**
 * The rendezvous panel (plan 331, ADR 0286): target a vessel or a docking port, press Engage; it
 * stops 100–200 m from the target, at rest, and holds there (or hands over to Auto Dock).
 */
export const RendezvousPanel = definePanel({
	id: 'guidance.rendezvous-panel',
	title: 'Rendezvous',
	icon: 'orbit',
	order: 445,
	contexts: ['flight'],
	view: {
		kind: 'section',
		children: [
			{
				kind: 'readout',
				label: 'Status',
				value: (i) => {
					const a = rendezvous(i);
					if (a) return a.status || a.phase;
					const p = pilotOf(i);
					return p ? (targetProblem(p) ?? 'Ready to engage') : null;
				}
			},
			{ kind: 'readout', label: 'Phase', value: (i) => rendezvous(i)?.phase ?? 'off' },
			{ kind: 'readout', label: 'Distance', unit: 'm', value: rdvReading('Distance') },
			{ kind: 'readout', label: 'Relative speed', unit: 'm/s', value: rdvReading('Relative speed') },
			{ kind: 'readout', label: 'Delta-v used', unit: 'm/s', value: rdvReading('Delta-v used') },
			{ kind: 'readout', label: 'Delta-v estimate', unit: 'm/s', value: rdvReading('Delta-v estimate') },
			{ kind: 'readout', label: 'Delta-v left', unit: 'm/s', value: rdvReading('Delta-v left') },
			{
				kind: 'select',
				label: 'Stop at',
				options: [
					{ value: '100', label: '100 m' },
					{ value: String(STANDOFF), label: `${STANDOFF} m` },
					{ value: '200', label: '200 m' }
				],
				value: (i) => String(rdvSettings(i).standoff ?? STANDOFF),
				command: (i, v) => rdvSetting(i, 'standoff', v)
			},
			{
				kind: 'select',
				label: 'Dock when close',
				options: [
					{ value: 'off', label: 'Off' },
					{ value: 'on', label: 'On' }
				],
				value: (i) => String(rdvSettings(i).dock ?? 'off'),
				command: (i, v) => rdvSetting(i, 'dock', v)
			},
			{
				kind: 'select',
				label: 'Warp through coasts',
				options: [
					{ value: 'on', label: 'On' },
					{ value: 'off', label: 'Off' }
				],
				value: (i) => String(rdvSettings(i).warp ?? 'on'),
				command: (i, v) => rdvSetting(i, 'warp', v)
			},
			{
				kind: 'button',
				label: 'Engage',
				command: (i) =>
					i.vessel && !i.vessel.autopilot ? { type: 'autopilot-engage', vessel: i.vessel.id, autopilot: RDV } : null
			},
			{
				kind: 'button',
				label: 'Abort',
				command: (i) =>
					i.vessel && rendezvous(i) ? { type: 'autopilot-disengage', vessel: i.vessel.id } : null
			},
			{
				kind: 'readout',
				label: 'Last run',
				value: (i) => {
					const last = i.vessel?.autopilotLast;
					return last?.id === RDV ? `${last.outcome}: ${last.reason}` : null;
				}
			},
			{
				kind: 'list',
				label: 'Log',
				items: (i) => {
					const a = rendezvous(i);
					const last = i.vessel?.autopilotLast;
					const lines = a ? a.log : last?.id === RDV ? last.log : [];
					return [...lines].reverse().map((line) => {
						const at = line.indexOf('  ');
						return at > 0 ? { name: line.slice(at + 2), value: line.slice(0, at) } : { name: line };
					});
				}
			}
		]
	}
});

export const GuidanceMod = definePlugin({
	meta: { id: 'guidance', version: '0.1.0', api: '^0.1', title: 'Guidance Computer' },
	setup(ctx) {
		for (const autopilot of [ExecuteNode, Circularize, Ascent, Land, Rendezvous])
			ctx.autopilots.register(autopilot);
		ctx.panels.register(GuidancePanel);
		ctx.panels.register(RendezvousPanel);
	}
});
export default GuidanceMod;

export * from './autopilots.ts';
export * from './orbit.ts';
export * from './rendezvous.ts';
