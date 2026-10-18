/**
 * The Mission Center's comms planning panel as data (plan 118, ADR 0163 point 6): the choices it
 * offers, the requests it sends and the rows it shows. Pure.
 */
import {
	COMMS_RULES,
	type BodyDefinition,
	type PartDefinition,
	type Snapshot
} from '@orbital/core';
import type { CoverageGrid } from './coverage';
import type { DeploymentPlan } from '@orbital/kepler';
import { formatDeltaV, formatDistance, formatDuration, formatPercent } from '../format';
import { bodyLabel } from '../hud-model';
import { planNodes, planWorld, type PlanNode, type PlanWorld } from './geometry';
import type { ContactTimeline } from './timeline';

export const PLANNING_TABS = [
	{ value: 'timeline', label: 'Timeline' },
	{ value: 'coverage', label: 'Coverage' },
	{ value: 'constellation', label: 'Constellation' }
] as const;
export type PlanningTab = (typeof PLANNING_TABS)[number]['value'];

export const HORIZONS = [
	{ value: 6 * 3600, label: '6 h' },
	{ value: 24 * 3600, label: '24 h' },
	{ value: 72 * 3600, label: '72 h' }
] as const;

export interface Antenna {
	id: string;
	label: string;
	range: number;
}

export interface PlanningScene {
	world: PlanWorld;
	nodes: PlanNode[];
	t: number;
}

/** The world's comms scale rule (1 without one). */
export function commsScaleOf(snapshot: Snapshot): number {
	const v = snapshot.rules?.[COMMS_RULES.scale];
	return typeof v === 'number' && v > 0 ? v : 1;
}

/** The planning world and nodes of a snapshot; null without a network (comms off). */
export function planningScene(
	snapshot: Snapshot | null,
	bodies: readonly BodyDefinition[],
	parts: readonly PartDefinition[],
	antennas: readonly Antenna[]
): PlanningScene | null {
	if (!snapshot?.network || bodies.length === 0) return null;
	const world = planWorld(bodies, commsScaleOf(snapshot));
	const nodes = planNodes(
		world,
		snapshot,
		new Map(parts.map((p) => [String(p.id), p])),
		new Map(antennas.map((a) => [a.id, a]))
	);
	return { world, nodes, t: snapshot.t };
}

/** Vessels the timeline starts from: those with an antenna. */
export const vesselChoices = (nodes: readonly PlanNode[]) =>
	nodes
		.filter((n) => n.kind === 'vessel' && n.range > 0)
		.map((n) => ({ value: n.id, label: n.label }));

/** What a vessel may link with: every station, then the other vessels with an antenna. */
export const peerChoices = (nodes: readonly PlanNode[], from: string) =>
	nodes
		.filter((n) => n.id !== from && n.range > 0)
		.map((n) => ({ value: n.id, label: n.kind === 'station' ? `${n.label} (station)` : n.label }));

/** Bodies a coverage map or a constellation can be planned over (not a star). */
export const bodyChoices = (bodies: readonly BodyDefinition[]) =>
	bodies.filter((b) => !b.star).map((b) => ({ value: b.id, label: bodyLabel(b.id) }));

/** The weakest registered antenna: the receiver a coverage map assumes by default. */
export const defaultReceiver = (antennas: readonly Antenna[]): Antenna | undefined =>
	[...antennas].sort((a, b) => a.range - b.range || (a.id < b.id ? -1 : 1))[0];

export interface WindowRow {
	key: string;
	when: string;
	length: string;
	/** Placement on the horizon bar, 0..100. */
	left: number;
	width: number;
}

/** The timeline's windows as rows, relative to `now`. */
export function windowRows(timeline: ContactTimeline, now: number): WindowRow[] {
	const span = timeline.to - timeline.from;
	return timeline.windows.map((w, i) => ({
		key: `${i}:${w.start}`,
		when: w.start <= now ? 'now' : `in ${formatDuration(w.start - now)}`,
		length: w.open ? `${formatDuration(w.end - w.start)}+` : formatDuration(w.end - w.start),
		left: span > 0 ? ((w.start - timeline.from) / span) * 100 : 0,
		width: span > 0 ? ((w.end - w.start) / span) * 100 : 0
	}));
}

export const linkedSummary = (timeline: ContactTimeline): string =>
	`Linked ${formatPercent(timeline.linkedFraction)} of the next ${formatDuration(timeline.to - timeline.from)}`;

/** RGBA pixels of a coverage grid: transparent where uncovered, brighter with more cover. */
export function coveragePixels(grid: CoverageGrid): Uint8ClampedArray {
	const out = new Uint8ClampedArray(grid.width * grid.height * 4);
	for (let i = 0; i < grid.values.length; i++) {
		const v = grid.values[i]!;
		out[i * 4] = Math.round(40 + 40 * v);
		out[i * 4 + 1] = Math.round(80 + 140 * v);
		out[i * 4 + 2] = Math.round(120 + 135 * v);
		out[i * 4 + 3] = v > 0 ? Math.round(90 + 165 * v) : 40;
	}
	return out;
}

/** The constellation plan as label and value rows (altitudes above the surface). */
export function deploymentRows(
	plan: DeploymentPlan,
	bodyRadius: number
): Array<{ label: string; value: string }> {
	return [
		{
			label: 'Deploy orbit',
			value: `${formatDistance(plan.deploy.periapsis - bodyRadius)} × ${formatDistance(plan.deploy.apoapsis - bodyRadius)}`
		},
		{
			label: 'Period',
			value: `${formatDuration(plan.deploy.period)} (${plan.ratio.numerator}/${plan.ratio.denominator} of the target)`
		},
		{ label: 'Drop at', value: `each ${plan.dropAt}, every ${formatDuration(plan.deploy.period)}` },
		{ label: 'Spacing', value: `${Math.round((plan.spacing * 180) / Math.PI)}°` },
		{ label: 'Carrier insertion', value: formatDeltaV(plan.insertionDv) },
		{ label: 'Each satellite circularises', value: formatDeltaV(plan.circularizeDv) }
	];
}
