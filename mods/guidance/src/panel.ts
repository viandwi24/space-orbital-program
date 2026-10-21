/**
 * The Guidance Computer's panel (plan 332, ADR 0287): a tab per program (Ascent, Orbit, Rendezvous,
 * Landing, Log). Each tab has its settings, live read-outs, a status line and its own Engage and
 * Abort. The engaged program's tab is marked and opens by itself; a program that cannot start says
 * why. Built from the HUD's own panel nodes, so it follows the theme and the keyboard.
 */
import {
	createVesselPilot,
	definePanel,
	type AutopilotSettingValue,
	type Command,
	type PanelInput,
	type PanelNode,
	type PanelTone,
	type VesselPilot
} from '@orbital/sdk';
import { Ascent, Circularize, ExecuteNode, Land, TOUCHDOWN_SPEED } from './autopilots.ts';
import { Rendezvous, STANDOFF, targetProblem } from './rendezvous.ts';

/** Which tab each program lives in. */
const TAB_OF: Record<string, string> = {
	[Ascent.id]: 'ascent',
	[ExecuteNode.id]: 'orbit',
	[Circularize.id]: 'orbit',
	[Rendezvous.id]: 'rendezvous',
	[Land.id]: 'landing'
};

/** The engaged autopilot when it is one of ours. */
const engaged = (i: PanelInput) => {
	const a = i.vessel?.autopilot;
	return a && TAB_OF[a.id] ? a : null;
};
/** The engaged autopilot when it is one of `ids`. */
const flying = (i: PanelInput, ...ids: string[]) => {
	const a = i.vessel?.autopilot;
	return a && ids.includes(a.id) ? a : null;
};
const settingsOf = (i: PanelInput, id: string): Record<string, AutopilotSettingValue> =>
	i.vessel?.autopilotSettings?.[id] ?? {};
const setting = (i: PanelInput, id: string, key: string, value: AutopilotSettingValue): Command | null =>
	i.vessel ? { type: 'autopilot-settings', vessel: i.vessel.id, autopilot: id, settings: { [key]: value } } : null;
const pilotOf = (i: PanelInput): VesselPilot | null =>
	i.vessel ? createVesselPilot(i.snapshot, i.vessel.id, () => undefined) : null;

/** On the ground or the water. */
const grounded = (i: PanelInput): boolean =>
	!!i.vessel && (i.vessel.surface === true || i.vessel.splashed === true || i.vessel.recovery !== undefined);

/** Apsis altitudes from the snapshot's orbit, m (null when none). */
function apsides(i: PanelInput): { apo: number | null; peri: number | null } {
	const v = i.vessel;
	const o = v?.orbit;
	if (!v || !o || i.altitude === null) return { apo: null, peri: null };
	const radius = Math.hypot(v.position.x, v.position.y, v.position.z) - i.altitude;
	const peri = o.a * (1 - o.e) - radius;
	return { apo: o.e < 1 ? o.a * (1 + o.e) - radius : null, peri };
}

/** Why a program cannot start now, or null. */
function blocked(i: PanelInput, id: string): string | null {
	const v = i.vessel;
	if (!v) return 'No vessel to fly.';
	const other = v.autopilot;
	if (other && other.id !== id) return `${other.title} is flying: abort it first.`;
	switch (id) {
		case Ascent.id:
			return grounded(i) || (apsides(i).peri ?? -1) < 0 ? null : 'Already in orbit.';
		case ExecuteNode.id:
			return v.nodes?.length ? null : 'No maneuver node: add one on the map.';
		case Circularize.id:
			if (grounded(i)) return 'On the ground: fly an ascent first.';
			return v.orbit && v.orbit.e < 1 ? null : 'The orbit is open: there is no apoapsis.';
		case Rendezvous.id: {
			if (grounded(i)) return 'On the ground: reach orbit first.';
			const p = pilotOf(i);
			return p ? targetProblem(p) : 'No vessel to fly.';
		}
		case Land.id:
			return grounded(i) ? 'Already on the ground.' : null;
		default:
			return null;
	}
}

/** The sim's refusal of the last engage of `ids`, if that was the last thing that happened. */
const refusal = (i: PanelInput, ...ids: string[]): string | null => {
	const last = i.vessel?.autopilotLast;
	return last && last.outcome === 'refused' && ids.includes(last.id) && !i.vessel?.autopilot
		? `Refused: ${last.reason}`
		: null;
};

/** The tab's status line: the program flying, else why it cannot start, else how it last ended. */
function status(ids: string[], idle: string) {
	return {
		kind: 'notice' as const,
		text: (i: PanelInput): string | null => {
			const a = flying(i, ...ids);
			if (a) return `${a.title} · ${a.phase}${a.status ? ` — ${a.status}` : ''}`;
			const why = refusal(i, ...ids) ?? blocked(i, ids[0]!);
			if (why) return why;
			const last = i.vessel?.autopilotLast;
			if (last && ids.includes(last.id)) return `Last run ${last.outcome}: ${last.reason}`;
			return idle;
		},
		tone: (i: PanelInput): PanelTone =>
			flying(i, ...ids) ? 'active' : refusal(i, ...ids) || blocked(i, ids[0]!) ? 'warn' : 'info'
	};
}

/** A program's read-out while it flies (null otherwise, or with `live` for the idle value). */
const reading =
	(ids: string[], key: string, live?: (i: PanelInput) => number | string | null) =>
	(i: PanelInput): number | string | null => {
		const a = flying(i, ...ids);
		if (a && a.readouts[key] !== undefined) return a.readouts[key]!;
		return live ? live(i) : null;
	};

const km = (m: number | null): number | null => (m === null ? null : Math.round(m / 100) / 10);

function engage(label: string, id: string, params?: Record<string, unknown>): PanelNode {
	return {
		kind: 'button',
		label,
		tone: 'primary',
		command: (i) =>
			i.vessel && !blocked(i, id) && !i.vessel.autopilot
				? { type: 'autopilot-engage', vessel: i.vessel.id, autopilot: id, ...(params ? { params } : {}) }
				: null
	};
}
const abort = (...ids: string[]): PanelNode => ({
	kind: 'button',
	label: 'Abort',
	tone: 'danger',
	command: (i) => (i.vessel && flying(i, ...ids) ? { type: 'autopilot-disengage', vessel: i.vessel.id } : null)
});
const actions = (...nodes: PanelNode[]): PanelNode => ({ kind: 'section', children: nodes });

// ---- the tabs -------------------------------------------------------------------------------

const ascentTab: PanelNode[] = [
	status([Ascent.id], 'On the pad: set the orbit and engage; it stages by itself.'),
	{
		kind: 'progress',
		label: 'Apoapsis',
		value: (i) => {
			const a = flying(i, Ascent.id);
			const apo = Number(a?.readouts.Apoapsis);
			const target = Number(a?.readouts.Target);
			return a && Number.isFinite(apo) && target > 0 ? apo / target : null;
		},
		text: (i) => {
			const a = flying(i, Ascent.id);
			return a ? `${km(Number(a.readouts.Apoapsis) || 0)} of ${km(Number(a.readouts.Target) || 0)} km` : null;
		}
	},
	{
		kind: 'section',
		title: 'Orbit',
		children: [
			{
				kind: 'number',
				label: 'Altitude',
				unit: 'km',
				min: 20,
				max: 2_000,
				step: 5,
				value: (i) => Number(settingsOf(i, Ascent.id).altitude ?? 80_000) / 1000,
				command: (i, v) => setting(i, Ascent.id, 'altitude', v * 1000)
			},
			{
				kind: 'number',
				label: 'Inclination',
				unit: '°',
				min: 0,
				max: 180,
				step: 1,
				value: (i) => Number(settingsOf(i, Ascent.id).inclination ?? 0),
				command: (i, v) => setting(i, Ascent.id, 'inclination', v)
			}
		]
	},
	{
		kind: 'select',
		label: 'Gravity turn',
		options: [
			{ value: '0.35', label: 'Early' },
			{ value: '0.5', label: 'Normal' },
			{ value: '0.8', label: 'Late' }
		],
		value: (i) => String(settingsOf(i, Ascent.id).shape ?? '0.5'),
		command: (i, v) => setting(i, Ascent.id, 'shape', Number(v))
	},
	{
		kind: 'section',
		title: 'Flight',
		children: [
			{ kind: 'readout', label: 'Altitude', unit: 'km', value: reading([Ascent.id], 'Altitude', (i) => km(i.altitude)) },
			{ kind: 'readout', label: 'Apoapsis', unit: 'km', value: (i) => km(Number(reading([Ascent.id], 'Apoapsis', (j) => apsides(j).apo)(i)) || null) },
			{ kind: 'readout', label: 'Periapsis', unit: 'km', value: (i) => {
				const p = reading([Ascent.id], 'Periapsis', (j) => apsides(j).peri)(i);
				return typeof p === 'number' ? km(p) : null;
			} },
			{ kind: 'readout', label: 'Phase', value: (i) => flying(i, Ascent.id)?.phase ?? 'off' }
		]
	},
	actions(engage('Engage ascent', Ascent.id), abort(Ascent.id))
];

const NODE = [ExecuteNode.id, Circularize.id];
const orbitTab: PanelNode[] = [
	status(NODE, 'Burn the next maneuver node, or round the orbit at an apsis.'),
	{
		kind: 'progress',
		label: 'Burn',
		value: (i) => {
			const d = Number(flying(i, ...NODE)?.readouts['Burn done']);
			return Number.isFinite(d) ? d : null;
		},
		text: (i) => {
			const a = flying(i, ...NODE);
			return a && a.readouts['Delta-v left'] !== undefined ? `${a.readouts['Delta-v left']} m/s left` : null;
		}
	},
	{
		kind: 'section',
		title: 'Burn',
		children: [
			{ kind: 'readout', label: 'Delta-v left', unit: 'm/s', value: reading(NODE, 'Delta-v left', (i) => {
				const n = i.vessel?.nodes?.[0];
				return n ? Math.round(n.dv * 10) / 10 : null;
			}) },
			{ kind: 'readout', label: 'Burn time', unit: 's', value: reading(NODE, 'Burn time') },
			{ kind: 'readout', label: 'Pointing error', unit: '°', value: reading(NODE, 'Pointing error') },
			{ kind: 'readout', label: 'Next node', unit: 's', value: (i) => {
				const n = i.vessel?.nodes?.[0];
				return n ? Math.max(0, Math.round(n.time - i.time)) : null;
			} }
		]
	},
	actions(engage('Execute next node', ExecuteNode.id), abort(...NODE)),
	{
		kind: 'section',
		title: 'Circularize',
		columns: 1,
		children: [
			{
				kind: 'select',
				label: 'At',
				options: [
					{ value: 'apoapsis', label: 'Apoapsis' },
					{ value: 'periapsis', label: 'Periapsis' }
				],
				value: (i) => String(settingsOf(i, Circularize.id).at ?? 'apoapsis'),
				command: (i, v) => setting(i, Circularize.id, 'at', v)
			},
			{ kind: 'notice', text: (i) => (flying(i, ...NODE) ? null : blocked(i, Circularize.id)), tone: () => 'warn' },
			engage('Circularize', Circularize.id)
		]
	}
];

const RDV = [Rendezvous.id];
const RDV_STEPS = ['plane', 'transfer', 'match', 'close', 'hold'];
const rdvStep = (phase: string): number =>
	phase === 'phasing' || phase === 'correct' ? 1 : Math.max(0, RDV_STEPS.indexOf(phase));
const rendezvousTab: PanelNode[] = [
	status(RDV, 'Target a vessel or a docking port, then engage: it stops 100–200 m away, at rest.'),
	{
		kind: 'progress',
		label: 'Rendezvous',
		value: (i) => {
			const a = flying(i, ...RDV);
			return a ? (rdvStep(a.phase) + (a.phase === 'hold' ? 1 : 0.5)) / RDV_STEPS.length : null;
		},
		text: (i) => {
			const a = flying(i, ...RDV);
			return a ? `step ${rdvStep(a.phase) + 1} of ${RDV_STEPS.length}: ${a.phase}` : null;
		}
	},
	{
		kind: 'section',
		title: 'Target',
		children: [
			{ kind: 'readout', label: 'Target', value: (i) => i.vessel?.target?.name ?? null },
			{ kind: 'readout', label: 'Distance', unit: 'm', value: reading(RDV, 'Distance', (i) => {
				const t = i.vessel?.target;
				return t ? Math.round(t.distance * 10) / 10 : null;
			}) },
			{ kind: 'readout', label: 'Relative speed', unit: 'm/s', value: reading(RDV, 'Relative speed', (i) => {
				const t = i.vessel?.target;
				return t ? Math.round(t.relativeSpeed * 100) / 100 : null;
			}) },
			{ kind: 'readout', label: 'Phase', value: (i) => flying(i, ...RDV)?.phase ?? 'off' }
		]
	},
	{
		kind: 'section',
		title: 'Delta-v',
		children: [
			{ kind: 'readout', label: 'Delta-v used', unit: 'm/s', value: reading(RDV, 'Delta-v used') },
			{ kind: 'readout', label: 'Delta-v estimate', unit: 'm/s', value: reading(RDV, 'Delta-v estimate') },
			{ kind: 'readout', label: 'Delta-v left', unit: 'm/s', value: reading(RDV, 'Delta-v left') }
		]
	},
	{
		kind: 'select',
		label: 'Stop at',
		options: [
			{ value: '100', label: '100 m' },
			{ value: String(STANDOFF), label: `${STANDOFF} m` },
			{ value: '200', label: '200 m' }
		],
		value: (i) => String(settingsOf(i, Rendezvous.id).standoff ?? STANDOFF),
		command: (i, v) => setting(i, Rendezvous.id, 'standoff', v)
	},
	{
		kind: 'section',
		columns: 1,
		children: [
			{
				kind: 'switch',
				label: 'Dock when close',
				value: (i) => [true, 'on'].includes(settingsOf(i, Rendezvous.id).dock as never),
				command: (i, on) => setting(i, Rendezvous.id, 'dock', on ? 'on' : 'off')
			},
			{
				kind: 'switch',
				label: 'Warp through coasts',
				value: (i) => ![false, 'off'].includes(settingsOf(i, Rendezvous.id).warp as never),
				command: (i, on) => setting(i, Rendezvous.id, 'warp', on ? 'on' : 'off')
			}
		]
	},
	actions(engage('Engage rendezvous', Rendezvous.id), abort(...RDV))
];

const landingTab: PanelNode[] = [
	status([Land.id], 'From orbit or a descent: deorbit, suicide burn, a soft vertical touchdown.'),
	{
		kind: 'section',
		title: 'Descent',
		children: [
			{ kind: 'readout', label: 'Height', unit: 'm', value: reading([Land.id], 'Height', (i) => (i.altitude === null ? null : Math.round(i.altitude))) },
			{ kind: 'readout', label: 'Speed', unit: 'm/s', value: reading([Land.id], 'Speed', (i) => (i.speed === null ? null : Math.round(i.speed * 10) / 10)) },
			{ kind: 'readout', label: 'Vertical speed', unit: 'm/s', value: reading([Land.id], 'Vertical speed') },
			{ kind: 'readout', label: 'Phase', value: (i) => flying(i, Land.id)?.phase ?? 'off' }
		]
	},
	{
		kind: 'number',
		label: 'Touchdown speed',
		unit: 'm/s',
		min: 0.5,
		max: 3,
		step: 0.1,
		value: (i) => Number(settingsOf(i, Land.id).touchdown ?? TOUCHDOWN_SPEED),
		command: (i, v) => setting(i, Land.id, 'touchdown', v)
	},
	{ kind: 'notice', text: () => 'Deploy the landing legs yourself: the computer does not.', tone: () => 'info' },
	actions(engage('Engage landing', Land.id), abort(Land.id))
];

const logTab: PanelNode[] = [
	{
		kind: 'notice',
		text: (i) => {
			const a = engaged(i);
			return a ? `${a.title} · ${a.phase}${a.status ? ` — ${a.status}` : ''}` : 'Nothing engaged.';
		},
		tone: (i) => (engaged(i) ? 'active' : 'info')
	},
	{
		kind: 'readout',
		label: 'Last run',
		value: (i) => {
			const last = i.vessel?.autopilotLast;
			return last && TAB_OF[last.id] ? `${last.title}: ${last.outcome}, ${last.reason}` : null;
		}
	},
	{
		kind: 'list',
		label: 'Log',
		items: (i) => {
			const a = engaged(i);
			const last = i.vessel?.autopilotLast;
			const lines = a ? a.log : last && TAB_OF[last.id] ? last.log : [];
			return [...lines].reverse().map((line) => {
				const at = line.indexOf('  ');
				return at > 0 ? { name: line.slice(at + 2), value: line.slice(0, at) } : { name: line };
			});
		}
	},
	abort(...Object.keys(TAB_OF))
];

const badge = (tab: string) => (i: PanelInput) => {
	const a = engaged(i);
	return a && TAB_OF[a.id] === tab ? 'ON' : null;
};

export const GuidancePanel = definePanel({
	id: 'guidance.panel',
	title: 'Guidance Computer',
	icon: 'target',
	order: 440,
	contexts: ['flight'],
	view: {
		kind: 'tabs',
		label: 'Guidance programs',
		active: (i) => {
			const a = engaged(i);
			return a ? TAB_OF[a.id]! : null;
		},
		tabs: [
			{ id: 'ascent', label: 'Ascent', badge: badge('ascent'), children: ascentTab },
			{ id: 'orbit', label: 'Orbit', badge: badge('orbit'), children: orbitTab },
			{ id: 'rendezvous', label: 'Rendezvous', badge: badge('rendezvous'), children: rendezvousTab },
			{ id: 'landing', label: 'Landing', badge: badge('landing'), children: landingTab },
			{ id: 'log', label: 'Log', children: logTab }
		]
	}
});
