/**
 * The mission tracker's model (plan 100, ADR 0151 point 3): active missions with their objectives'
 * progress from the snapshot, and the missions on offer (registered, prerequisites done, not active
 * or done). Pure.
 */
import type { MissionDefinition, Snapshot } from '@orbital/core';

type Objectives = NonNullable<Snapshot['objectives']>;

export interface TrackedMission {
	id: string;
	title: string;
	progress: number;
	steps: { label: string; status: string; progress: number }[];
}

export interface OfferedMission {
	id: string;
	title: string;
	briefing: string | null;
}

export interface TrackerView {
	active: TrackedMission[];
	offered: OfferedMission[];
	/** The latest done mission's debriefing, if it has one. */
	lastDone: { title: string; debriefing: string } | null;
}

export function trackerView(
	missions: readonly MissionDefinition[],
	objectives: Objectives | undefined,
	labelOf: (objectiveId: string) => string
): TrackerView {
	const list = objectives ?? [];
	const byId = new Map(missions.map((m) => [m.id, m]));
	const missionsOnly = list.filter((o) => o.source.kind === 'mission');
	const active = missionsOnly
		.filter((o) => o.status === 'active')
		.map((o) => ({
			id: o.source.id,
			title: byId.get(o.source.id)?.title ?? o.source.id,
			progress: o.progress,
			steps: o.leaves.map((l) => ({
				label: labelOf(l.objective),
				status: l.status,
				progress: l.progress
			}))
		}));
	const done = new Set(list.filter((o) => o.status === 'done').map((o) => o.source.id));
	const running = new Set(
		missionsOnly.filter((o) => o.status === 'active').map((o) => o.source.id)
	);
	const offered = missions
		.filter((m) => !done.has(m.id) && !running.has(m.id))
		.filter((m) => (m.prerequisites ?? []).every((p) => done.has(p)))
		.map((m) => ({ id: m.id, title: m.title, briefing: m.briefing ?? null }));
	const last = [...missionsOnly].reverse().find((o) => o.status === 'done');
	const lastDef = last ? byId.get(last.source.id) : undefined;
	return {
		active,
		offered,
		lastDone: lastDef?.debriefing ? { title: lastDef.title, debriefing: lastDef.debriefing } : null
	};
}
