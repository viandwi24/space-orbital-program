/**
 * Ghosts (plan 131, ADR 0159 point 7): a replay's vessel drawn over the current flight, from its
 * checkpoints, aligned by time since each run began; a page overlay like the Network layer.
 */
import type { ReplayFile, Snapshot, Vec3 } from '@orbital/core';

export interface GhostTrack {
	name: string;
	/** Sim time the replay began at. */
	start: number;
	points: Array<{ t: number; soi: string; position: Vec3 }>;
}

/** The track of the replay's first vessel (its lowest id at the first checkpoint). */
export function ghostTrack(replay: ReplayFile): GhostTrack | null {
	const first = replay.checkpoints.find((c) => c.vessels.length > 0)?.vessels[0];
	if (!first) return null;
	const points: GhostTrack['points'] = [];
	for (const c of replay.checkpoints) {
		const v = c.vessels.find((x) => x.id === first.id);
		if (v)
			points.push({
				t: c.t,
				soi: v.soi,
				position: { x: v.position[0], y: v.position[1], z: v.position[2] }
			});
	}
	const start = (replay.start as { time?: number }).time ?? points[0]?.t ?? 0;
	return points.length > 0 ? { name: replay.name, start, points } : null;
}

/** The ghost at replay time `t`, interpolated between checkpoints in its SOI frame. */
export function ghostAt(track: GhostTrack, t: number): { soi: string; position: Vec3 } | null {
	const p = track.points;
	if (t < p[0]!.t || t > p[p.length - 1]!.t) return null;
	let i = 1;
	while (i < p.length && p[i]!.t < t) i++;
	const a = p[Math.max(0, i - 1)]!;
	const b = p[Math.min(i, p.length - 1)]!;
	if (a.soi !== b.soi || b.t === a.t) return { soi: a.soi, position: a.position };
	const k = (t - a.t) / (b.t - a.t);
	const lerp = (x: number, y: number) => x + (y - x) * k;
	return {
		soi: a.soi,
		position: {
			x: lerp(a.position.x, b.position.x),
			y: lerp(a.position.y, b.position.y),
			z: lerp(a.position.z, b.position.z)
		}
	};
}

export interface ScreenGhost {
	name: string;
	/** The track in map view (empty in the flight view). */
	path: Array<{ x: number; y: number }>;
	at: { x: number; y: number } | null;
}

/**
 * The ghost on screen: its track (map view) and where it is now, `elapsed` seconds after the
 * replay's start, put in the system frame by its SOI body's position now.
 */
export function projectGhost(
	track: GhostTrack,
	snapshot: Pick<Snapshot, 'bodies'>,
	elapsed: number,
	map: boolean,
	project: (system: Vec3) => { x: number; y: number; hidden?: boolean } | null
): ScreenGhost {
	const system = (soi: string, p: Vec3): Vec3 | null => {
		const base = snapshot.bodies.find((b) => b.id === soi)?.position;
		return base ? { x: base.x + p.x, y: base.y + p.y, z: base.z + p.z } : null;
	};
	const path: ScreenGhost['path'] = [];
	if (map)
		for (const p of track.points) {
			const w = system(p.soi, p.position);
			const s = w && project(w);
			if (s && !s.hidden) path.push({ x: Math.round(s.x), y: Math.round(s.y) });
		}
	const now = ghostAt(track, track.start + elapsed);
	const w = now && system(now.soi, now.position);
	const s = w && project(w);
	return {
		name: track.name,
		path,
		at: s && !s.hidden ? { x: Math.round(s.x), y: Math.round(s.y) } : null
	};
}
