/**
 * @orbital/mod-autodock — Auto Dock (plan 310, ADR 0271; plan 330, ADR 0285), written against
 * @orbital/sdk like any third-party mod: one autopilot and one dock panel with options, an
 * alignment display, a log and the last run's result. Control the vessel from a docking port,
 * target a port of another vessel, press Engage.
 */
import {
	createVesselPilot,
	definePanel,
	definePlugin,
	type PanelInput,
	type VesselPilot
} from '@orbital/sdk';
import { AutoDock, startProblem } from './autodock.ts';
import { drawAlignment } from './display.ts';

const ID = 'autodock.dock';
const engaged = (i: PanelInput) => (i.vessel?.autopilot?.id === ID ? i.vessel.autopilot : null);
/** A read-only pilot over the panel's snapshot (no commands go anywhere). */
const pilotOf = (i: PanelInput): VesselPilot | null =>
	i.vessel ? createVesselPilot(i.snapshot, i.vessel.id, () => undefined) : null;
const settings = (i: PanelInput): Record<string, unknown> =>
	i.vessel?.autopilotSettings?.[ID] ?? {};
const setting = (i: PanelInput, key: string, value: string) =>
	i.vessel
		? {
				type: 'autopilot-settings' as const,
				vessel: i.vessel.id,
				autopilot: ID,
				settings: { [key]: value }
			}
		: null;
const reading = (i: PanelInput, key: string): number | null => {
	const a = engaged(i);
	if (a && typeof a.readouts[key] === 'number') return a.readouts[key] as number;
	const al = pilotOf(i)?.alignment();
	if (!al) return null;
	switch (key) {
		case 'distance':
			return Math.round(al.distance * 100) / 100;
		case 'closing':
			return Math.round(al.closing * 1000) / 1000;
		case 'alignment':
			return Math.round(((al.angle * 180) / Math.PI) * 10) / 10;
		case 'lateral':
			return Math.round(al.lateralDistance * 100) / 100;
		default:
			return null;
	}
};

export const AutoDockPanel = definePanel({
	id: 'autodock.panel',
	title: 'Auto Dock',
	icon: 'dock',
	order: 450,
	contexts: ['flight'],
	view: {
		kind: 'section',
		children: [
			{
				kind: 'readout',
				label: 'Status',
				value: (i) => {
					const a = engaged(i);
					if (a) return a.status || a.phase;
					const p = pilotOf(i);
					return p ? (startProblem(p, 'stock.monopropellant') ?? 'Ready to engage') : null;
				}
			},
			{ kind: 'readout', label: 'Phase', value: (i) => engaged(i)?.phase ?? 'off' },
			{ kind: 'readout', label: 'Distance', unit: 'm', value: (i) => reading(i, 'distance') },
			{ kind: 'readout', label: 'Closing speed', unit: 'm/s', value: (i) => reading(i, 'closing') },
			{
				kind: 'readout',
				label: 'Alignment error',
				unit: '°',
				value: (i) => reading(i, 'alignment')
			},
			{ kind: 'readout', label: 'Off axis', unit: 'm', value: (i) => reading(i, 'lateral') },
			{
				kind: 'select',
				label: 'Speed',
				options: [
					{ value: 'careful', label: 'Careful' },
					{ value: 'normal', label: 'Normal' },
					{ value: 'fast', label: 'Fast' }
				],
				value: (i) => String(settings(i).speed ?? 'normal'),
				command: (i, v) => setting(i, 'speed', v)
			},
			{
				kind: 'select',
				label: 'Start the approach at',
				options: [
					{ value: 'auto', label: 'Auto' },
					{ value: '20', label: '20 m' },
					{ value: '50', label: '50 m' },
					{ value: '100', label: '100 m' }
				],
				value: (i) => String(settings(i).start ?? 'auto'),
				command: (i, v) => setting(i, 'start', v)
			},
			{
				kind: 'button',
				label: 'Engage',
				command: (i) =>
					i.vessel && !engaged(i)
						? { type: 'autopilot-engage', vessel: i.vessel.id, autopilot: ID }
						: null
			},
			{
				kind: 'button',
				label: 'Abort',
				command: (i) =>
					i.vessel && engaged(i) ? { type: 'autopilot-disengage', vessel: i.vessel.id } : null
			},
			{
				kind: 'readout',
				label: 'Last run',
				value: (i) => {
					const last = i.vessel?.autopilotLast;
					return last?.id === ID ? `${last.outcome}: ${last.reason}` : null;
				}
			},
			{
				kind: 'list',
				label: 'Log',
				items: (i) => {
					const a = engaged(i);
					const last = i.vessel?.autopilotLast;
					const lines = a ? a.log : last?.id === ID ? last.log : [];
					// newest first
					return [...lines].reverse().map((line) => {
						const at = line.indexOf('  ');
						return at > 0 ? { name: line.slice(at + 2), value: line.slice(0, at) } : { name: line };
					});
				}
			}
		]
	},
	// the alignment display (like KSP's Docking Port Alignment Indicator)
	canvas: {
		height: 220,
		draw: (c, i) => drawAlignment(c, pilotOf(i), engaged(i)?.phase ?? 'off')
	}
});

export const AutoDockMod = definePlugin({
	meta: { id: 'autodock', version: '0.1.0', api: '^0.1', title: 'Auto Dock' },
	setup(ctx) {
		ctx.autopilots.register(AutoDock);
		ctx.panels.register(AutoDockPanel);
	}
});
export default AutoDockMod;

export * from './autodock.ts';
