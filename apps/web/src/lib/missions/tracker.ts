/**
 * The mission tracker's model (plan 100, ADR 0151 point 3): active missions with their objectives'
 * progress from the snapshot, and the missions on offer (registered, prerequisites done, not active
 * or done). Pure.
 */
import {
	missionText,
	objectiveBody,
	techBodiesOf,
	treeBodies,
	type BodyDefinition,
	type MissionDefinition,
	type Snapshot
} from '@orbital/core';
import { bodyLabel } from '../hud-model';

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

/**
 * The world the missions are read in (system audit D3): `{home}`, `{moon}` and `{air}` in the text
 * become its names, and a mission naming a body it lacks is not offered (the sim refuses it too).
 */
export interface MissionWorld {
	home: string;
	moon?: string | undefined;
	/** The home body's air top, m. */
	air: number;
	label: (bodyId: string) => string;
	has: (bodyId: string) => boolean;
}

/** The mission world of the sim's catalog: its home, the home's first moon, the air top. */
export function missionWorldOf(
	bodies: readonly Pick<BodyDefinition, 'id' | 'parent' | 'star' | 'atmosphere'>[],
	home: string | undefined
): MissionWorld | null {
	const def = bodies.find((b) => b.id === home);
	if (!def) return null;
	const ids = new Set(bodies.map((b) => b.id));
	return {
		home: def.id,
		moon: techBodiesOf(bodies, def.id).moon,
		air: def.atmosphere?.height ?? 0,
		label: bodyLabel,
		has: (id) => ids.has(id)
	};
}

export function trackerView(
	missions: readonly MissionDefinition[],
	objectives: Objectives | undefined,
	labelOf: (objectiveId: string) => string,
	world?: MissionWorld
): TrackerView {
	const text = (t: string): string =>
		world
			? missionText(t, {
					home: world.label(world.home),
					moon: world.moon === undefined ? undefined : world.label(world.moon),
					air: world.air
				})
			: t;
	const flies = (m: MissionDefinition): boolean =>
		!world ||
		!m.objectives ||
		treeBodies(m.objectives).every((b) =>
			world.has(objectiveBody({ home: world.home, moon: world.moon }, b))
		);
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
		.filter(flies)
		.map((m) => ({ id: m.id, title: m.title, briefing: m.briefing ? text(m.briefing) : null }));
	const last = [...missionsOnly].reverse().find((o) => o.status === 'done');
	const lastDef = last ? byId.get(last.source.id) : undefined;
	return {
		active,
		offered,
		lastDone: lastDef?.debriefing
			? { title: lastDef.title, debriefing: text(lastDef.debriefing) }
			: null
	};
}

/**
 * The mission the onboarding hand-off starts (player-journey audit Q8, ADR 0328): the first on offer,
 * only in a world that has never started a mission; null otherwise.
 */
export function firstMission(
	missions: readonly MissionDefinition[],
	objectives: Objectives | undefined,
	world?: MissionWorld
): string | null {
	if ((objectives ?? []).some((o) => o.source.kind === 'mission')) return null;
	return trackerView(missions, objectives, (id) => id, world).offered[0]?.id ?? null;
}
