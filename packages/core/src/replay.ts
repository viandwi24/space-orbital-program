/**
 * Replay files (plan 131, ADR 0159): a start save, the commands with the sim time they were
 * dispatched at, and checkpoints of every vessel; compared within ADR 0050's bound (or 1e-6 of the
 * value far from the body's centre).
 */
import * as z from 'zod';
import type { Snapshot } from './protocol.ts';
import { commandSchema } from './protocol-schemas.ts';

export const REPLAY_FORMAT = 'orbital-replay';
export const REPLAY_FORMAT_VERSION = 1;
/** Sim time between checkpoints, s. */
export const CHECKPOINT_EVERY = 10;
/** ADR 0050's bound in the units of each value (m, m/s). */
export const REPLAY_TOLERANCE = 5e-3;
/** Float rounding far from the body's centre: a share of the value, when that is larger. */
export const REPLAY_RELATIVE = 1e-6;

export interface VesselCheckpoint {
	id: number;
	mode: string;
	soi: string;
	position: [number, number, number];
	velocity: [number, number, number];
	parts: number;
}

export interface Checkpoint {
	t: number;
	/** Commands dispatched before this checkpoint was taken (the order at equal times). */
	n: number;
	vessels: VesselCheckpoint[];
}

export interface ReplayFile {
	format: typeof REPLAY_FORMAT;
	formatVersion: number;
	apiVersion: string;
	name: string;
	/** The host ran the sim with terrain heights (the web does; a headless test may not). */
	terrain: boolean;
	/** The `SimSave` the recording started from (validated by `createSim` on resume). */
	start: unknown;
	/** `source`: a program's command keeps who sent it (plan 315, ADR 0273 point 2); absent is the player. */
	commands: Array<{ t: number; command: unknown; source?: 'script' | 'autopilot' }>;
	checkpoints: Checkpoint[];
}

const vec = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

export const replayFileSchema = z.object({
	format: z.literal(REPLAY_FORMAT),
	formatVersion: z.int().min(1),
	apiVersion: z.string().min(1),
	name: z.string(),
	terrain: z.boolean(),
	start: z.unknown(),
	commands: z.array(
		z.object({
			t: z.number().finite().min(0),
			command: commandSchema,
			source: z.enum(['script', 'autopilot']).optional()
		})
	),
	checkpoints: z.array(
		z.object({
			t: z.number().finite().min(0),
			n: z.int().min(0),
			vessels: z.array(
				z.object({
					id: z.int().min(0),
					mode: z.string(),
					soi: z.string(),
					position: vec,
					velocity: vec,
					parts: z.int().min(0)
				})
			)
		})
	)
});

/** Parses a replay file's text; the reason in words when it is not one. */
export function readReplay(
	text: string
): { ok: true; replay: ReplayFile } | { ok: false; reason: string } {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return { ok: false, reason: 'not a replay file (not JSON)' };
	}
	if ((raw as { format?: unknown })?.format !== REPLAY_FORMAT)
		return { ok: false, reason: 'not a replay file' };
	if (((raw as { formatVersion?: number }).formatVersion ?? 0) > REPLAY_FORMAT_VERSION)
		return { ok: false, reason: 'this replay is from a newer version: update the game' };
	const parsed = replayFileSchema.safeParse(raw);
	if (!parsed.success)
		return { ok: false, reason: `damaged replay: ${parsed.error.issues[0]?.path.join('.') ?? ''}` };
	return { ok: true, replay: parsed.data as ReplayFile };
}

const v3 = (v: { x: number; y: number; z: number }): [number, number, number] => [v.x, v.y, v.z];

/** A checkpoint of every vessel in a snapshot, in id order. */
export function checkpointOf(snapshot: Pick<Snapshot, 't' | 'vessels'>, n = 0): Checkpoint {
	return {
		t: snapshot.t,
		n,
		vessels: [...snapshot.vessels]
			.sort((a, b) => Number(a.id) - Number(b.id))
			.map((v) => ({
				id: Number(v.id),
				mode: v.mode,
				soi: v.soi,
				position: v3(v.position),
				velocity: v3(v.velocity),
				parts: v.parts.length
			}))
	};
}

const near = (a: number, b: number): boolean =>
	Math.abs(a - b) <=
	Math.max(REPLAY_TOLERANCE, REPLAY_RELATIVE * Math.max(Math.abs(a), Math.abs(b)));

/** The first difference between a recorded and a re-simulated checkpoint, or undefined. */
export function checkpointProblem(recorded: Checkpoint, actual: Checkpoint): string | undefined {
	const at = `at t = ${recorded.t.toFixed(2)} s`;
	if (recorded.vessels.length !== actual.vessels.length)
		return `${at}: ${recorded.vessels.length} vessels recorded, ${actual.vessels.length} re-simulated`;
	for (let i = 0; i < recorded.vessels.length; i++) {
		const r = recorded.vessels[i]!;
		const a = actual.vessels[i]!;
		const who = `${at}, vessel ${r.id}`;
		if (r.id !== a.id) return `${at}: vessel ${r.id} recorded, ${a.id} re-simulated`;
		for (const k of ['mode', 'soi', 'parts'] as const)
			if (r[k] !== a[k])
				return `${who}: ${k} ${String(r[k])} recorded, ${String(a[k])} re-simulated`;
		for (const k of ['position', 'velocity'] as const)
			for (let j = 0; j < 3; j++)
				if (!near(r[k][j]!, a[k][j]!))
					return `${who}: ${k} ${'xyz'[j]} ${r[k][j]} recorded, ${a[k][j]} re-simulated`;
	}
	return undefined;
}
