/**
 * @orbital/mod-autodock — Auto Dock (plan 310, ADR 0271), written against @orbital/sdk like any
 * third-party mod: one autopilot and one dock panel. Control the vessel from a docking port, target
 * a port of another vessel, press Engage.
 */
import {
	createVesselPilot,
	definePanel,
	definePlugin,
	type PanelInput,
	type VesselPilot
} from '@orbital/sdk';
import { AutoDock, startProblem } from './autodock.ts';

const ID = 'autodock.dock';
const engaged = (i: PanelInput) => (i.vessel?.autopilot?.id === ID ? i.vessel.autopilot : null);
/** A read-only pilot over the panel's snapshot (no commands go anywhere). */
const pilotOf = (i: PanelInput): VesselPilot | null =>
	i.vessel ? createVesselPilot(i.snapshot, i.vessel.id, () => undefined) : null;
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
			}
		]
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
